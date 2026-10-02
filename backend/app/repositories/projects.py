from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.pagination import Cursor
from app.domain.common import ProjectStatus
from app.domain.dashboard import DashboardSummary
from app.domain.projects import Project
from app.repositories.tables import profiles, projects

_ts = sa.DateTime(timezone=True)


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _project_select() -> sa.Select[Any]:
    pm = profiles.alias("pm")
    return sa.select(
        *projects.c,
        sa.func.coalesce(pm.c.full_name, pm.c.email).label("pm_name"),
    ).select_from(projects.outerjoin(pm, pm.c.id == projects.c.pm_user_id))


def _to_project(row: sa.Row[Any]) -> Project:
    return Project.model_validate(dict(row._mapping))


class ProjectRepository:
    """Project persistence. Visibility and write permissions come from RLS."""

    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def list_page(
        self,
        org_id: uuid.UUID,
        *,
        statuses: Sequence[ProjectStatus] | None,
        q: str | None,
        limit: int,
        cursor: Cursor | None,
    ) -> tuple[list[Project], Cursor | None]:
        p = projects
        stmt = _project_select().where(p.c.org_id == org_id)
        if statuses:
            stmt = stmt.where(p.c.status.in_(list(statuses)))
        else:
            stmt = stmt.where(p.c.status != ProjectStatus.ARCHIVED)
        if q:
            pattern = f"%{escape_like(q)}%"
            stmt = stmt.where(
                sa.or_(p.c.name.ilike(pattern, escape="\\"), p.c.code.ilike(pattern, escape="\\"))
            )
        if cursor is not None:
            stmt = stmt.where(
                sa.tuple_(p.c.created_at, p.c.id)
                < sa.tuple_(
                    sa.literal(cursor.created_at, _ts),
                    sa.literal(cursor.id, p.c.id.type),
                )
            )
        stmt = stmt.order_by(p.c.created_at.desc(), p.c.id.desc()).limit(limit + 1)

        rows = (await self._conn.execute(stmt)).all()
        items = [_to_project(r) for r in rows[:limit]]
        next_cursor = None
        if len(rows) > limit and items:
            last = items[-1]
            next_cursor = Cursor(created_at=last.created_at, id=last.id)
        return items, next_cursor

    async def get(self, project_id: uuid.UUID) -> Project | None:
        stmt = _project_select().where(projects.c.id == project_id)
        row = (await self._conn.execute(stmt)).first()
        return _to_project(row) if row else None

    async def create(
        self, org_id: uuid.UUID, created_by: uuid.UUID, values: dict[str, Any]
    ) -> uuid.UUID:
        # The id is generated here and the row re-selected afterwards instead of
        # using RETURNING, whose visibility depends on SELECT policies.
        project_id = uuid.uuid4()
        stmt = sa.insert(projects).values(
            id=project_id, org_id=org_id, created_by=created_by, **values
        )
        await self._conn.execute(stmt)
        return project_id

    async def update(self, project_id: uuid.UUID, changes: dict[str, Any]) -> bool:
        """Returns False if no row was updated (missing or not writable under RLS)."""
        values = dict(changes)
        if "status" in values:
            values["archived_at"] = (
                sa.func.coalesce(projects.c.archived_at, sa.func.now())
                if values["status"] == ProjectStatus.ARCHIVED
                else None
            )
        stmt = sa.update(projects).where(projects.c.id == project_id).values(**values)
        result = await self._conn.execute(stmt)
        return result.rowcount > 0

    async def delete(self, project_id: uuid.UUID) -> bool:
        result = await self._conn.execute(sa.delete(projects).where(projects.c.id == project_id))
        return result.rowcount > 0

    async def dashboard(self, org_id: uuid.UUID) -> DashboardSummary:
        p = projects
        month_start = sa.func.timezone(
            "UTC", sa.func.date_trunc("month", sa.func.timezone("UTC", sa.func.now()))
        )
        stmt = sa.select(
            sa.func.count().label("total_projects"),
            sa.func.count().filter(p.c.status == ProjectStatus.ON_TRACK).label("on_track"),
            sa.func.count()
            .filter(p.c.status.in_([ProjectStatus.AT_RISK, ProjectStatus.DELAYED]))
            .label("at_risk_or_delayed"),
            sa.cast(sa.func.coalesce(sa.func.sum(p.c.budget_cents), 0), sa.BigInteger).label(
                "total_budget_cents"
            ),
            sa.func.count().filter(p.c.created_at >= month_start).label("created_this_month"),
        ).where(
            p.c.org_id == org_id,
            p.c.status != ProjectStatus.ARCHIVED,
            p.c.archived_at.is_(None),
        )
        row = (await self._conn.execute(stmt)).one()
        return DashboardSummary.model_validate(dict(row._mapping))
