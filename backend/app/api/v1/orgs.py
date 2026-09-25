from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import OrgId, Orgs
from app.api.v1.projects import ensure_org_visible
from app.domain.orgs import OrgMember

router = APIRouter(tags=["organizations"])


@router.get(
    "/orgs/{orgId}/members",
    response_model=list[OrgMember],
    summary="Organization roster (e.g. for the PM dropdown)",
)
async def list_members(org_id: OrgId, orgs: Orgs) -> list[OrgMember]:
    await ensure_org_visible(orgs, org_id)
    return await orgs.list_members(org_id)
