from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import OrgId, Orgs, Projects
from app.api.v1.projects import ensure_org_visible
from app.domain.dashboard import DashboardSummary

router = APIRouter(tags=["dashboard"])


@router.get(
    "/orgs/{orgId}/dashboard",
    response_model=DashboardSummary,
    summary="Dashboard KPI summary (excludes archived projects)",
)
async def get_dashboard(org_id: OrgId, orgs: Orgs, projects: Projects) -> DashboardSummary:
    await ensure_org_visible(orgs, org_id)
    return await projects.dashboard(org_id)
