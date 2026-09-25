"""Repository SQL, compiled for PostgreSQL and run against a recording connection."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from types import SimpleNamespace
from typing import Any

from sqlalchemy.dialects import postgresql

from app.core.pagination import Cursor
from app.domain.common import ProjectStatus
from app.repositories.me import ProfileRepository
from app.repositories.notifications import NotificationRepository
from app.repositories.orgs import OrgRepository
from app.repositories.projects import ProjectRepository, escape_like

NOW = datetime(2026, 9, 24, 12, 0, tzinfo=UTC)


class Result:
    def __init__(self, rows: list[dict[str, Any]], rowcount: int = 1) -> None:
        self._rows = [SimpleNamespace(_mapping=r) for r in rows]
        self.rowcount = rowcount

    def all(self) -> list[Any]:
        return self._rows

    def first(self) -> Any:
        return self._rows[0] if self._rows else None

    def one(self) -> Any:
        assert len(self._rows) == 1
        return self._rows[0]


class Conn:
    def __init__(self, *results: Result) -> None:
        self.results = list(results)
        self.sql: list[str] = []
        self.params: list[dict[str, Any]] = []

    async def execute(self, stmt: Any) -> Result:
        compiled = stmt.compile(dialect=postgresql.dialect())
        self.sql.append(str(compiled))
        self.params.append(dict(compiled.params))
        return self.results.pop(0) if self.results else Result([])


def project_row(**overrides: Any) -> dict[str, Any]:
    row = {
        "id": uuid.uuid4(),
        "org_id": uuid.uuid4(),
        "code": "P-001",
        "name": "CRM",
        "description": None,
        "type": "technology",
        "department": None,
        "sponsor": None,
        "pm_user_id": None,
        "pm_name": None,
        "priority": "medium",
        "methodology": "waterfall",
        "visibility": "internal",
        "start_date": date(2026, 10, 1),
        "target_end_date": None,
        "budget_cents": 100,
        "currency": "USD",
        "status": "draft",
        "current_step": "create",
        "progress_pct": 0,
        "created_by": None,
        "created_at": NOW,
        "updated_at": NOW,
        "archived_at": None,
    }
    row.update(overrides)
    return row


def test_escape_like() -> None:
    assert escape_like(r"50%_off\x") == r"50\%\_off\\x"


async def test_project_list_sql() -> None:
    rows = [project_row(), project_row(), project_row()]
    conn = Conn(Result(rows))
    repo = ProjectRepository(conn)  # type: ignore[arg-type]
    cursor = Cursor(NOW, uuid.uuid4())
    items, nxt = await repo.list_page(uuid.uuid4(), statuses=None, q="100%", limit=2, cursor=cursor)
    sql = conn.sql[0]
    assert "LEFT OUTER JOIN public.profiles AS pm" in sql
    assert "public.projects.status != " in sql
    assert "ILIKE" in sql
    assert "(public.projects.created_at, public.projects.id) < " in sql
    assert "ORDER BY public.projects.created_at DESC, public.projects.id DESC" in sql
    assert "LIMIT" in sql
    assert conn.params[0]["param_1"] == 3 or 3 in conn.params[0].values()
    assert "%100\\%%" in conn.params[0].values()
    assert len(items) == 2
    assert nxt == Cursor(items[1].created_at, items[1].id)


async def test_project_list_status_filter() -> None:
    conn = Conn(Result([project_row()]))
    repo = ProjectRepository(conn)  # type: ignore[arg-type]
    items, nxt = await repo.list_page(
        uuid.uuid4(), statuses=[ProjectStatus.ARCHIVED], q=None, limit=5, cursor=None
    )
    assert "public.projects.status IN" in conn.sql[0]
    assert nxt is None
    assert len(items) == 1


async def test_project_create_generates_id_without_returning() -> None:
    conn = Conn(Result([]))
    repo = ProjectRepository(conn)  # type: ignore[arg-type]
    creator = uuid.uuid4()
    pid = await repo.create(uuid.uuid4(), creator, {"name": "X", "currency": "USD"})
    assert isinstance(pid, uuid.UUID)
    assert conn.sql[0].startswith("INSERT INTO public.projects")
    assert "RETURNING" not in conn.sql[0]
    assert conn.params[0]["id"] == pid
    assert conn.params[0]["created_by"] == creator


async def test_project_update_archives() -> None:
    conn = Conn(Result([], rowcount=1), Result([], rowcount=0), Result([], rowcount=1))
    repo = ProjectRepository(conn)  # type: ignore[arg-type]
    assert await repo.update(uuid.uuid4(), {"status": ProjectStatus.ARCHIVED}) is True
    assert "archived_at=coalesce(public.projects.archived_at, now())" in conn.sql[0]
    assert await repo.update(uuid.uuid4(), {"status": ProjectStatus.ON_TRACK}) is False
    assert "archived_at=" in conn.sql[1]
    assert await repo.update(uuid.uuid4(), {"name": "N"}) is True
    assert "archived_at" not in conn.sql[2]


async def test_project_get_and_delete() -> None:
    row = project_row()
    conn = Conn(Result([row]), Result([], rowcount=1), Result([]))
    repo = ProjectRepository(conn)  # type: ignore[arg-type]
    project = await repo.get(row["id"])
    assert project is not None
    assert project.id == row["id"]
    assert await repo.delete(row["id"]) is True
    assert conn.sql[1].startswith("DELETE FROM public.projects")
    assert await repo.get(uuid.uuid4()) is None


async def test_dashboard_sql() -> None:
    conn = Conn(
        Result(
            [
                {
                    "total_projects": 3,
                    "on_track": 1,
                    "at_risk_or_delayed": 1,
                    "total_budget_cents": 500,
                    "created_this_month": 2,
                }
            ]
        )
    )
    summary = await ProjectRepository(conn).dashboard(uuid.uuid4())  # type: ignore[arg-type]
    sql = conn.sql[0]
    assert "count(*) FILTER (WHERE" in sql
    assert "public.projects.archived_at IS NULL" in sql
    assert "date_trunc" in sql
    assert summary.total_budget_cents == 500


async def test_org_repository() -> None:
    uid, oid = uuid.uuid4(), uuid.uuid4()
    conn = Conn(
        Result([{"one": 1}]),
        Result([]),
        Result(
            [
                {
                    "user_id": uid,
                    "role": "owner",
                    "joined_at": NOW,
                    "email": "a@b.c",
                    "full_name": "A",
                    "avatar_url": None,
                    "job_title": None,
                }
            ]
        ),
        Result([{"id": oid, "name": "Acme", "slug": "acme", "role": "admin"}]),
    )
    repo = OrgRepository(conn)  # type: ignore[arg-type]
    assert await repo.is_visible(oid) is True
    assert await repo.is_member(oid, uid) is False
    members = await repo.list_members(oid)
    assert members[0].full_name == "A"
    assert "LEFT OUTER JOIN public.profiles" in conn.sql[2]
    orgs = await repo.memberships_for(uid)
    assert orgs[0].role == "admin"


async def test_profile_repository() -> None:
    uid = uuid.uuid4()
    conn = Conn(
        Result(
            [
                {
                    "id": uid,
                    "email": "a@b.c",
                    "full_name": None,
                    "avatar_url": None,
                    "job_title": None,
                }
            ]
        ),
        Result([], rowcount=1),
    )
    repo = ProfileRepository(conn)  # type: ignore[arg-type]
    profile = await repo.get(uid)
    assert profile is not None
    assert profile.email == "a@b.c"
    assert await repo.update(uid, {"full_name": "B"}) is True
    assert conn.sql[1].startswith("UPDATE public.profiles SET full_name=")


async def test_notification_repository() -> None:
    uid = uuid.uuid4()
    row = {
        "id": uuid.uuid4(),
        "org_id": uuid.uuid4(),
        "project_id": None,
        "level": "info",
        "message": "hi",
        "read_at": None,
        "created_at": NOW,
    }
    conn = Conn(Result([row, row]), Result([], rowcount=1), Result([row]), Result([]))
    repo = NotificationRepository(conn)  # type: ignore[arg-type]
    items, nxt = await repo.list_page(uid, unread=True, limit=1, cursor=Cursor(NOW, uuid.uuid4()))
    assert "read_at IS NULL" in conn.sql[0]
    assert "public.notifications.user_id = " in conn.sql[0]
    assert len(items) == 1
    assert nxt is not None
    assert await repo.mark_read(row["id"], uid) is True
    assert "read_at=coalesce(public.notifications.read_at, now())" in conn.sql[1]
    assert await repo.get(row["id"]) is not None
    _, _ = await repo.list_page(uid, unread=False, limit=10, cursor=None)
    assert "read_at IS NOT NULL" in conn.sql[3]
