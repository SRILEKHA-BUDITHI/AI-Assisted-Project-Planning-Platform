"""AI intake: pasted notes -> LLM scope extraction.

User-side queries (RLS) and the worker's service-side writes, mirroring
`app.repositories.optimization`.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncConnection

from app.domain.common import DocumentKind, ItemOrigin, JobStatus, ScopeCategory, ScopeStatus
from app.domain.intake import IntakeRun, ScopeItem
from app.repositories.tables import intake_runs, projects, scope_items, source_documents

ACTIVE = (JobStatus.QUEUED, JobStatus.RUNNING)
run_t = intake_runs
item_t = scope_items
doc_t = source_documents

_ITEM_COLUMNS = (
    item_t.c.id,
    item_t.c.project_id,
    item_t.c.category,
    item_t.c.text,
    item_t.c.status,
    item_t.c.origin,
    item_t.c.confidence,
    item_t.c.sort_order,
    item_t.c.created_at,
    item_t.c.updated_at,
)


@dataclass(frozen=True, slots=True)
class ActiveRun:
    id: uuid.UUID
    stale: bool


def _run_select() -> sa.Select[Any]:
    return sa.select(
        run_t.c.id,
        run_t.c.project_id,
        run_t.c.status,
        run_t.c.model,
        run_t.c.items_extracted,
        run_t.c.error,
        run_t.c.created_at,
        run_t.c.started_at,
        run_t.c.finished_at,
    )


def _to_run(row: sa.Row[Any]) -> IntakeRun:
    return IntakeRun.model_validate(dict(row._mapping))


def _to_item(row: sa.Row[Any]) -> ScopeItem:
    return ScopeItem.model_validate(dict(row._mapping))


def _older_than(seconds: int) -> sa.ColumnElement[bool]:
    cutoff = sa.func.now() - sa.func.make_interval(0, 0, 0, 0, 0, 0, seconds)
    return sa.func.coalesce(run_t.c.started_at, run_t.c.created_at) < cutoff


class IntakeRepository:
    """User-facing queries: everything runs under the caller's RLS session."""

    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def project_exists(self, project_id: uuid.UUID) -> bool:
        stmt = sa.select(projects.c.id).where(projects.c.id == project_id)
        return (await self._conn.execute(stmt)).first() is not None

    async def can_write(self, project_id: uuid.UUID) -> bool:
        stmt = sa.select(sa.func.private.can_write_project(project_id))
        return bool((await self._conn.execute(stmt)).scalar())

    async def active_run(self, project_id: uuid.UUID, stale_after_s: int) -> ActiveRun | None:
        stmt = (
            sa.select(run_t.c.id, _older_than(stale_after_s).label("stale"))
            .where(run_t.c.project_id == project_id, run_t.c.status.in_(ACTIVE))
            .limit(1)
        )
        row = (await self._conn.execute(stmt)).first()
        return ActiveRun(id=row.id, stale=bool(row.stale)) if row else None

    async def fail_run(self, run_id: uuid.UUID, error: str) -> None:
        await self._conn.execute(
            sa.update(run_t)
            .where(run_t.c.id == run_id, run_t.c.status.in_(ACTIVE))
            .values(status=JobStatus.FAILED, error=error, finished_at=sa.func.now())
        )

    async def create(self, project_id: uuid.UUID, text: str) -> uuid.UUID:
        await self._conn.execute(
            sa.insert(doc_t).values(
                id=uuid.uuid4(),
                project_id=project_id,
                kind=DocumentKind.TEXT,
                title="Pasted notes",
                content_text=text,
            )
        )
        run_id = uuid.uuid4()
        await self._conn.execute(
            sa.insert(run_t).values(id=run_id, project_id=project_id, status=JobStatus.QUEUED)
        )
        return run_id

    async def get(self, project_id: uuid.UUID, run_id: uuid.UUID) -> IntakeRun | None:
        stmt = _run_select().where(run_t.c.project_id == project_id, run_t.c.id == run_id)
        row = (await self._conn.execute(stmt)).first()
        return _to_run(row) if row else None

    async def latest(self, project_id: uuid.UUID) -> IntakeRun | None:
        stmt = (
            _run_select()
            .where(run_t.c.project_id == project_id)
            .order_by(run_t.c.created_at.desc(), run_t.c.id.desc())
            .limit(1)
        )
        row = (await self._conn.execute(stmt)).first()
        return _to_run(row) if row else None

    async def list_scope_items(self, project_id: uuid.UUID) -> list[ScopeItem]:
        stmt = (
            sa.select(*_ITEM_COLUMNS)
            .where(item_t.c.project_id == project_id, item_t.c.status != ScopeStatus.REMOVED)
            .order_by(item_t.c.category, item_t.c.sort_order)
        )
        return [_to_item(row) for row in (await self._conn.execute(stmt)).all()]

    async def update_item(self, item_id: uuid.UUID, patch: dict[str, Any]) -> ScopeItem | None:
        if patch:
            await self._conn.execute(
                sa.update(item_t)
                .where(item_t.c.id == item_id)
                .values(**patch, updated_at=sa.func.now())
            )
        stmt = sa.select(*_ITEM_COLUMNS).where(item_t.c.id == item_id)
        row = (await self._conn.execute(stmt)).first()
        return _to_item(row) if row else None


# --------------------------------------------------------------------------- worker side
class IntakeJobStore:
    """Writes made by the background worker on a service connection (bypasses RLS)."""

    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def claim(self, run_id: uuid.UUID) -> tuple[uuid.UUID, str] | None:
        """Move a queued run to running; returns (project_id, pasted text), or None."""
        stmt = (
            sa.update(run_t)
            .where(run_t.c.id == run_id, run_t.c.status == JobStatus.QUEUED)
            .values(status=JobStatus.RUNNING, started_at=sa.func.now())
            .returning(run_t.c.project_id)
        )
        row = (await self._conn.execute(stmt)).first()
        if row is None:
            return None
        project_id = row.project_id
        doc_row = (
            await self._conn.execute(
                sa.select(doc_t.c.content_text)
                .where(doc_t.c.project_id == project_id, doc_t.c.kind == DocumentKind.TEXT)
                .order_by(doc_t.c.created_at.desc())
                .limit(1)
            )
        ).first()
        return project_id, (doc_row.content_text if doc_row and doc_row.content_text else "")

    async def finish(
        self,
        run_id: uuid.UUID,
        project_id: uuid.UUID,
        model: str,
        items: list[dict[str, Any]],
        input_tokens: int,
        output_tokens: int,
    ) -> None:
        if items:
            counters: dict[str, int] = {}
            rows = []
            for it in items:
                category = str(it["category"])
                sort_order = counters.get(category, 0)
                counters[category] = sort_order + 1
                rows.append(
                    {
                        "id": uuid.uuid4(),
                        "project_id": project_id,
                        "intake_run_id": run_id,
                        "category": ScopeCategory(category),
                        "text": str(it["text"])[:2000],
                        "confidence": it.get("confidence"),
                        "status": ScopeStatus.PENDING,
                        "origin": ItemOrigin.AI,
                        "sort_order": sort_order,
                    }
                )
            await self._conn.execute(sa.insert(item_t), rows)
        await self._conn.execute(
            sa.update(run_t)
            .where(run_t.c.id == run_id)
            .values(
                status=JobStatus.SUCCEEDED,
                model=model,
                items_extracted=len(items),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                finished_at=sa.func.now(),
            )
        )

    async def fail(self, run_id: uuid.UUID, error: str) -> None:
        await self._conn.execute(
            sa.update(run_t)
            .where(run_t.c.id == run_id, run_t.c.status.in_(ACTIVE))
            .values(status=JobStatus.FAILED, error=error, finished_at=sa.func.now())
        )

    async def fail_stale(self, older_than_s: int, error: str) -> int:
        result = await self._conn.execute(
            sa.update(run_t)
            .where(run_t.c.status.in_(ACTIVE), _older_than(older_than_s))
            .values(status=JobStatus.FAILED, error=error, finished_at=sa.func.now())
        )
        return int(result.rowcount)
