"""RLS session setup and engine configuration (no live database needed)."""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace
from typing import Any

import pytest

from app.core import db as db_module
from app.core.config import Settings
from app.core.db import apply_rls_context, create_engine, get_service_db, get_user_db
from app.core.errors import ServiceUnavailableError
from app.core.security import Principal


class RecordingConn:
    def __init__(self, log: list[str]) -> None:
        self.log = log
        self.statements: list[tuple[str, dict[str, Any] | None]] = []

    async def execute(self, stmt: Any, params: dict[str, Any] | None = None) -> None:
        self.statements.append((str(stmt), params))
        self.log.append("execute")

    def begin(self) -> RecordingConn:
        return self

    async def __aenter__(self) -> RecordingConn:
        self.log.append("enter")
        return self

    async def __aexit__(self, exc_type: Any, *args: Any) -> None:
        self.log.append("rollback" if exc_type else "exit")


class RecordingEngine:
    def __init__(self) -> None:
        self.log: list[str] = []
        self.conn = RecordingConn(self.log)

    def connect(self) -> RecordingConn:
        return self.conn


def principal() -> Principal:
    uid = uuid.uuid4()
    return Principal(user_id=uid, email="a@b.c", claims={"sub": str(uid), "role": "authenticated"})


async def test_apply_rls_context_sets_claims_then_role() -> None:
    conn = RecordingConn([])
    p = principal()
    await apply_rls_context(conn, p, 5000)  # type: ignore[arg-type]
    (claims_sql, params), (role_sql, _) = conn.statements
    assert "set_config('request.jwt.claims', :claims, true)" in claims_sql
    assert "set_config('request.jwt.claim.sub', :sub, true)" in claims_sql
    assert params is not None
    assert json.loads(params["claims"]) == p.claims
    assert params["sub"] == str(p.user_id)
    assert params["statement_timeout"] == "5000"
    assert role_sql == "set local role authenticated"


def _request(engine: Any) -> Any:
    return SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(engine=engine, settings=Settings(_env_file=None)))  # type: ignore[call-arg]
    )


async def test_get_user_db_runs_in_transaction_as_user() -> None:
    engine = RecordingEngine()
    gen = get_user_db(_request(engine), principal())
    conn = await gen.__anext__()
    assert conn is engine.conn
    assert engine.log == ["enter", "enter", "execute", "execute"]
    with pytest.raises(StopAsyncIteration):
        await gen.__anext__()
    assert engine.log[-2:] == ["exit", "exit"]


async def test_get_user_db_rolls_back_on_error() -> None:
    engine = RecordingEngine()
    gen = get_user_db(_request(engine), principal())
    await gen.__anext__()
    with pytest.raises(RuntimeError):
        await gen.athrow(RuntimeError("fail"))
    assert "rollback" in engine.log


async def test_get_service_db_does_not_switch_role() -> None:
    engine = RecordingEngine()
    gen = get_service_db(_request(engine))
    await gen.__anext__()
    assert engine.conn.statements == []
    await gen.aclose()


async def test_missing_engine_is_503() -> None:
    gen = get_user_db(_request(None), principal())
    with pytest.raises(ServiceUnavailableError):
        await gen.__anext__()


def test_engine_is_pooler_safe(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_create(url: Any, **kwargs: Any) -> str:
        captured["url"] = url
        captured.update(kwargs)
        return "engine"

    monkeypatch.setattr(db_module, "create_async_engine", fake_create)
    s = Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="postgresql://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
    )
    assert create_engine(s) == "engine"
    assert captured["url"].drivername == "postgresql+asyncpg"
    assert captured["pool_size"] == 5
    assert captured["max_overflow"] == 5
    assert captured["pool_pre_ping"] is True
    args = captured["connect_args"]
    assert args["statement_cache_size"] == 0
    assert args["prepared_statement_cache_size"] == 0
    name_func = args["prepared_statement_name_func"]
    assert name_func() != name_func()


def test_no_engine_without_url() -> None:
    assert create_engine(Settings(_env_file=None)) is None  # type: ignore[call-arg]
