from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.domain.common import (
    CamelModel,
    InputModel,
    ItemOrigin,
    JobStatus,
    ScopeCategory,
    ScopeStatus,
)


class ScopeItem(CamelModel):
    id: uuid.UUID
    project_id: uuid.UUID
    category: ScopeCategory
    text: str
    status: ScopeStatus
    origin: ItemOrigin
    confidence: float | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class IntakeRun(CamelModel):
    id: uuid.UUID
    project_id: uuid.UUID
    status: JobStatus
    model: str | None
    items_extracted: int | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class IntakeRunCreate(InputModel):
    text: str = Field(min_length=1, max_length=50_000)


class ScopeItemUpdate(InputModel):
    text: str | None = Field(default=None, min_length=1, max_length=2000)
    status: ScopeStatus | None = None
