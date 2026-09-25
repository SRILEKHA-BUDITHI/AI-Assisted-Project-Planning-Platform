from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError, OperationalError

from app.core.errors import (
    AppError,
    ConflictError,
    ForbiddenError,
    ServiceUnavailableError,
    UnprocessableError,
    map_db_error,
    pg_error_info,
)


def db_error(
    sqlstate: str | None,
    message: str = "boom",
    constraint: str | None = None,
    cls: type[DBAPIError] = DBAPIError,
) -> DBAPIError:
    class _AsyncpgError(Exception):
        pass

    cause = _AsyncpgError(message)
    cause.sqlstate = sqlstate  # type: ignore[attr-defined]
    cause.message = message  # type: ignore[attr-defined]
    cause.constraint_name = constraint  # type: ignore[attr-defined]

    class _AdaptedError(Exception):
        pgcode = sqlstate

    orig = _AdaptedError(f"<class 'asyncpg...'>: {message}")
    orig.__cause__ = cause
    return cls("select 1", {}, orig)


@pytest.mark.parametrize(
    ("sqlstate", "expected", "status"),
    [
        ("42501", ForbiddenError, 403),
        ("P0001", UnprocessableError, 422),
        ("23505", ConflictError, 409),
        ("23514", UnprocessableError, 422),
        ("23503", UnprocessableError, 422),
        ("22001", UnprocessableError, 422),
        ("40001", ConflictError, 409),
        ("57014", ServiceUnavailableError, 503),
        ("08006", ServiceUnavailableError, 503),
        ("XX000", AppError, 500),
    ],
)
def test_map_db_error(sqlstate: str, expected: type[AppError], status: int) -> None:
    mapped = map_db_error(db_error(sqlstate))
    assert type(mapped) is expected
    assert mapped.status == status


def test_trigger_message_is_surfaced() -> None:
    mapped = map_db_error(db_error("P0001", "projects.org_id is immutable"))
    assert mapped.detail == "projects.org_id is immutable"


def test_operational_error_without_sqlstate_is_503() -> None:
    assert map_db_error(db_error(None, cls=OperationalError)).status == 503


def test_pg_error_info_extracts_constraint() -> None:
    info = pg_error_info(db_error("23514", constraint="projects_check"))
    assert info.sqlstate == "23514"
    assert info.constraint == "projects_check"


def test_db_errors_render_as_problem(app: FastAPI) -> None:
    @app.get("/raise/{code}")
    async def _raise(code: str) -> None:
        raise db_error(code, "WBS parent belongs to a different project", "c1")

    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/raise/P0001")
        assert r.status_code == 422
        assert r.json()["detail"] == "WBS parent belongs to a different project"
        r = c.get("/raise/23505")
        assert r.status_code == 409
        assert r.json()["constraint"] == "c1"
        r = c.get("/raise/42501")
        assert r.status_code == 403
        r = c.get("/raise/XX000")
        assert r.status_code == 500
        assert "WBS parent" not in r.text


def test_pool_timeout_is_503(app: FastAPI) -> None:
    from sqlalchemy.exc import TimeoutError as PoolTimeout

    @app.get("/pool")
    async def _pool() -> None:
        raise PoolTimeout("QueuePool limit reached")

    with TestClient(app, raise_server_exceptions=False) as c:
        assert c.get("/pool").status_code == 503
