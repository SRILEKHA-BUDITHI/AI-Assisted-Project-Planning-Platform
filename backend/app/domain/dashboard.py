from __future__ import annotations

from app.domain.common import CamelModel


class DashboardSummary(CamelModel):
    """KPI cards. Counts only projects visible to the caller, excluding archived."""

    total_projects: int
    on_track: int
    at_risk_or_delayed: int
    total_budget_cents: int
    created_this_month: int
