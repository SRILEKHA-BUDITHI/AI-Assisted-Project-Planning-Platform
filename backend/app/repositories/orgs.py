from __future__ import annotations

import uuid

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncConnection

from app.domain.me import OrganizationMembership
from app.domain.orgs import OrgMember
from app.repositories.tables import organization_members, organizations, profiles


class OrgRepository:
    """Organization and membership queries. All run under the caller's RLS context."""

    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def is_visible(self, org_id: uuid.UUID) -> bool:
        """True if the caller is a member (RLS hides other organizations)."""
        stmt = (
            sa.select(sa.literal(1)).select_from(organizations).where(organizations.c.id == org_id)
        )
        return (await self._conn.execute(stmt)).first() is not None

    async def is_member(self, org_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        stmt = sa.select(sa.literal(1)).where(
            organization_members.c.org_id == org_id,
            organization_members.c.user_id == user_id,
        )
        return (await self._conn.execute(stmt)).first() is not None

    async def list_members(self, org_id: uuid.UUID) -> list[OrgMember]:
        m, p = organization_members, profiles
        stmt = (
            sa.select(
                m.c.user_id,
                m.c.role,
                m.c.created_at.label("joined_at"),
                p.c.email,
                p.c.full_name,
                p.c.avatar_url,
                p.c.job_title,
            )
            .select_from(m.outerjoin(p, p.c.id == m.c.user_id))
            .where(m.c.org_id == org_id)
            .order_by(sa.func.lower(sa.func.coalesce(p.c.full_name, p.c.email)), m.c.user_id)
        )
        rows = (await self._conn.execute(stmt)).all()
        return [OrgMember.model_validate(dict(r._mapping)) for r in rows]

    async def memberships_for(self, user_id: uuid.UUID) -> list[OrganizationMembership]:
        o, m = organizations, organization_members
        stmt = (
            sa.select(o.c.id, o.c.name, o.c.slug, m.c.role)
            .select_from(o.join(m, m.c.org_id == o.c.id))
            .where(m.c.user_id == user_id)
            .order_by(o.c.name, o.c.id)
        )
        rows = (await self._conn.execute(stmt)).all()
        return [OrganizationMembership.model_validate(dict(r._mapping)) for r in rows]
