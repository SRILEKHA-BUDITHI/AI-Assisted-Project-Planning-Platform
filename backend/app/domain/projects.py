from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Any

from pydantic import Field, StringConstraints, model_validator

from app.domain.common import (
    CamelModel,
    InputModel,
    ProjectMethodology,
    ProjectPriority,
    ProjectStatus,
    ProjectStep,
    ProjectType,
    ProjectVisibility,
)

# Largest integer a JavaScript client can represent exactly.
MAX_SAFE_CENTS = 9_007_199_254_740_991

Name = Annotated[str, StringConstraints(min_length=1, max_length=200)]
Description = Annotated[str, StringConstraints(max_length=5000)]
Department = Annotated[str, StringConstraints(max_length=120)]
Sponsor = Annotated[str, StringConstraints(max_length=200)]
Currency = Annotated[str, StringConstraints(pattern=r"^[A-Za-z]{3}$", to_upper=True)]
BudgetCents = Annotated[int, Field(ge=0, le=MAX_SAFE_CENTS)]
ProgressPct = Annotated[int, Field(ge=0, le=100)]


def _check_dates(start: date | None, end: date | None) -> None:
    if start is not None and end is not None and end < start:
        raise ValueError("targetEndDate must be on or after startDate")


class Project(CamelModel):
    id: uuid.UUID
    org_id: uuid.UUID
    code: str
    name: str
    description: str | None
    type: ProjectType
    department: str | None
    sponsor: str | None
    pm_user_id: uuid.UUID | None
    pm_name: str | None
    priority: ProjectPriority
    methodology: ProjectMethodology
    visibility: ProjectVisibility
    start_date: date | None
    target_end_date: date | None
    budget_cents: int | None
    currency: str
    status: ProjectStatus
    current_step: ProjectStep
    progress_pct: int
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class ProjectCreate(InputModel):
    name: Name
    description: Description | None = None
    type: ProjectType = ProjectType.TECHNOLOGY
    department: Department | None = None
    sponsor: Sponsor | None = None
    pm_user_id: uuid.UUID | None = None
    priority: ProjectPriority = ProjectPriority.MEDIUM
    methodology: ProjectMethodology = ProjectMethodology.WATERFALL
    visibility: ProjectVisibility = ProjectVisibility.INTERNAL
    start_date: date | None = None
    target_end_date: date | None = None
    budget_cents: BudgetCents | None = None
    currency: Currency = "USD"

    @model_validator(mode="after")
    def _validate(self) -> ProjectCreate:
        _check_dates(self.start_date, self.target_end_date)
        return self

    def values(self) -> dict[str, Any]:
        data = self.model_dump(by_alias=False)
        for key in ("description", "department", "sponsor"):
            if data[key] == "":
                data[key] = None
        return data


_NON_NULLABLE = frozenset(
    {
        "name",
        "type",
        "priority",
        "methodology",
        "visibility",
        "currency",
        "status",
        "current_step",
        "progress_pct",
    }
)


class ProjectUpdate(InputModel):
    """Partial update: only fields present in the body are changed."""

    name: Name | None = None
    description: Description | None = None
    type: ProjectType | None = None
    department: Department | None = None
    sponsor: Sponsor | None = None
    pm_user_id: uuid.UUID | None = None
    priority: ProjectPriority | None = None
    methodology: ProjectMethodology | None = None
    visibility: ProjectVisibility | None = None
    start_date: date | None = None
    target_end_date: date | None = None
    budget_cents: BudgetCents | None = None
    currency: Currency | None = None
    status: ProjectStatus | None = None
    current_step: ProjectStep | None = None
    progress_pct: ProgressPct | None = None

    @model_validator(mode="after")
    def _validate(self) -> ProjectUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        nulls = sorted(f for f in self.model_fields_set & _NON_NULLABLE if getattr(self, f) is None)
        if nulls:
            raise ValueError(f"Fields cannot be null: {', '.join(nulls)}")
        _check_dates(self.start_date, self.target_end_date)
        return self

    def changes(self) -> dict[str, Any]:
        data = self.model_dump(exclude_unset=True, by_alias=False)
        for key in ("description", "department", "sponsor"):
            if data.get(key) == "":
                data[key] = None
        return data
