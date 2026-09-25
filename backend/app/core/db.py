"""Database engine and request-scoped connections.

Security model: authorization lives in Postgres RLS. For every user request we
open a transaction, publish the verified JWT claims the way PostgREST does and
switch to the `authenticated` role, so `auth.uid()` and every policy behave
exactly as they do for that user through the Supabase API.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.security import CurrentPrincipal, Principal

logger = logging.getLogger("app.db")

_SET_CLAIMS = text(
    "select set_config('request.jwt.claims', :claims, true),"
    " set_config('request.jwt.claim.sub', :sub, true),"
    " set_config('request.jwt.claim.role', 'authenticated', true),"
    " set_config('statement_timeout', :statement_timeout, true)"
)
_SET_ROLE = text("set local role authenticated")


def _statement_name() -> str:
    # Unique names keep prepared statements safe behind Supavisor transaction mode.
    return f"__asyncpg_{uuid.uuid4().hex}__"


def create_engine(settings: Settings) -> AsyncEngine | None:
    resolved = settings.sqlalchemy_database_url()
    if resolved is None:
        return None
    url, ssl = resolved
    return create_async_engine(
        url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout_s,
        pool_recycle=settings.db_pool_recycle_s,
        pool_pre_ping=True,
        connect_args={
            # Works with both the session (5432) and transaction (6543) pooler.
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": _statement_name,
            "ssl": ssl,
            "timeout": 10,
            "server_settings": {"application_name": "planning-api"},
        },
    )


def get_engine(request: Request) -> AsyncEngine:
    engine: AsyncEngine | None = getattr(request.app.state, "engine", None)
    if engine is None:
        raise ServiceUnavailableError("Database is not configured")
    return engine


async def apply_rls_context(
    conn: AsyncConnection, principal: Principal, statement_timeout_ms: int
) -> None:
    """Make the current transaction run as `principal` under RLS.

    All settings are transaction-local (`is_local = true` / `set local`), so
    nothing leaks to the next user of the pooled connection.
    """
    await conn.execute(
        _SET_CLAIMS,
        {
            "claims": json.dumps(principal.claims, separators=(",", ":")),
            "sub": str(principal.user_id),
            "statement_timeout": str(statement_timeout_ms),
        },
    )
    await conn.execute(_SET_ROLE)


async def get_user_db(
    request: Request, principal: CurrentPrincipal
) -> AsyncIterator[AsyncConnection]:
    """Transaction running as the calling user (RLS enforced). Commits on success."""
    engine = get_engine(request)
    settings: Settings = request.app.state.settings
    async with engine.connect() as conn, conn.begin():
        await apply_rls_context(conn, principal, settings.db_statement_timeout_ms)
        yield conn


async def get_service_db(request: Request) -> AsyncIterator[AsyncConnection]:
    """Transaction as the connection owner (bypasses RLS).

    For trusted system jobs and infrastructure checks only — never use from a
    user-facing endpoint.
    """
    engine = get_engine(request)
    async with engine.connect() as conn, conn.begin():
        yield conn


# `scope="function"` closes (commits) the transaction before the response is
# sent, so commit errors surface as proper problem responses and clients never
# observe a 2xx for data that isn't durable yet.
UserDB = Annotated[AsyncConnection, Depends(get_user_db, scope="function")]
ServiceDB = Annotated[AsyncConnection, Depends(get_service_db, scope="function")]
