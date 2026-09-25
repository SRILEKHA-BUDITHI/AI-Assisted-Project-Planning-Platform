from __future__ import annotations

import uuid
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.pagination import Cursor
from app.domain.notifications import Notification
from app.repositories.tables import notifications

_ts = sa.DateTime(timezone=True)
_COLUMNS = (
    notifications.c.id,
    notifications.c.org_id,
    notifications.c.project_id,
    notifications.c.level,
    notifications.c.message,
    notifications.c.read_at,
    notifications.c.created_at,
)


def _to_notification(row: sa.Row[Any]) -> Notification:
    return Notification.model_validate(dict(row._mapping))


class NotificationRepository:
    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def list_page(
        self,
        user_id: uuid.UUID,
        *,
        unread: bool | None,
        limit: int,
        cursor: Cursor | None,
    ) -> tuple[list[Notification], Cursor | None]:
        n = notifications
        # RLS already restricts to the caller; the explicit filter uses the index.
        stmt = sa.select(*_COLUMNS).where(n.c.user_id == user_id)
        if unread is True:
            stmt = stmt.where(n.c.read_at.is_(None))
        elif unread is False:
            stmt = stmt.where(n.c.read_at.is_not(None))
        if cursor is not None:
            stmt = stmt.where(
                sa.tuple_(n.c.created_at, n.c.id)
                < sa.tuple_(sa.literal(cursor.created_at, _ts), sa.literal(cursor.id, n.c.id.type))
            )
        stmt = stmt.order_by(n.c.created_at.desc(), n.c.id.desc()).limit(limit + 1)
        rows = (await self._conn.execute(stmt)).all()
        items = [_to_notification(r) for r in rows[:limit]]
        next_cursor = None
        if len(rows) > limit and items:
            next_cursor = Cursor(created_at=items[-1].created_at, id=items[-1].id)
        return items, next_cursor

    async def get(self, notification_id: uuid.UUID) -> Notification | None:
        stmt = sa.select(*_COLUMNS).where(notifications.c.id == notification_id)
        row = (await self._conn.execute(stmt)).first()
        return _to_notification(row) if row else None

    async def mark_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        n = notifications
        stmt = (
            sa.update(n)
            .where(n.c.id == notification_id, n.c.user_id == user_id)
            .values(read_at=sa.func.coalesce(n.c.read_at, sa.func.now()))
        )
        result = await self._conn.execute(stmt)
        return result.rowcount > 0
