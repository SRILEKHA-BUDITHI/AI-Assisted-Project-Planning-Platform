from __future__ import annotations

import uuid

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncConnection

from app.domain.me import Profile
from app.repositories.tables import profiles


class ProfileRepository:
    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def get(self, user_id: uuid.UUID) -> Profile | None:
        p = profiles
        stmt = sa.select(p.c.id, p.c.email, p.c.full_name, p.c.avatar_url, p.c.job_title).where(
            p.c.id == user_id
        )
        row = (await self._conn.execute(stmt)).first()
        return Profile.model_validate(dict(row._mapping)) if row else None

    async def update(self, user_id: uuid.UUID, changes: dict[str, str | None]) -> bool:
        stmt = sa.update(profiles).where(profiles.c.id == user_id).values(**changes)
        result = await self._conn.execute(stmt)
        return result.rowcount > 0
