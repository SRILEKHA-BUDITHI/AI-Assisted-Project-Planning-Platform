from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.domain.common import CamelModel, SolverStatus


class RunKpi(CamelModel):
    label: str
    value: str
    # `sub?: string` on the client: omitted rather than null when absent.
    sub: str | None = Field(default=None, exclude_if=lambda v: v is None)


class Reassignment(CamelModel):
    task: str
    current: str
    recommended: str
    reason: str


class ScheduleChange(CamelModel):
    wbs: str
    name: str
    original: str
    optimized: str
    delta: str
    reason: str


class Utilization(CamelModel):
    name: str
    before: int
    after: int


class RunResult(CamelModel):
    kpis: list[RunKpi]
    reassignments: list[Reassignment]
    schedule_changes: list[ScheduleChange]
    utilization: list[Utilization]


class Conflict(CamelModel):
    name: str
    explanation: str


class OptimizationRun(CamelModel):
    id: uuid.UUID
    project_id: uuid.UUID
    status: SolverStatus
    solver: str | None
    solve_seconds: float | None
    error: str | None
    iis: list[Conflict] | None
    result: RunResult | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
