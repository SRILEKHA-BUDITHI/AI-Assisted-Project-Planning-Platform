"""Planning input/output types and the frozen `input_snapshot` format.

The snapshot is what the API freezes into `optimization_runs.input_snapshot`
when a run is queued, so a run is reproducible even if the WBS or team
changes while it is solving. `PlanningInput.to_snapshot()` and
`PlanningInput.from_snapshot()` are exact inverses.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal, cast

SNAPSHOT_VERSION = 1

DependencyType = Literal["FS", "SS", "FF", "SF"]
ConstraintMode = Literal["hard", "soft"]
RunStatus = Literal["optimal", "feasible", "infeasible", "timeout", "failed"]
ResourceKind = Literal["employee", "contractor"]

DEFAULT_HOURS_PER_DAY = 8.0
CONTRACTOR_WEEKLY_HOURS = 40.0
MAX_PROFICIENCY = 5


class SnapshotError(ValueError):
    """The snapshot is malformed (written by an incompatible version or corrupted)."""


# --------------------------------------------------------------------------- input
@dataclass(frozen=True, slots=True)
class SkillRequirement:
    skill_id: str
    skill_name: str
    min_proficiency: int


@dataclass(frozen=True, slots=True)
class Task:
    """A work package (leaf of the WBS) with a positive duration in working days."""

    id: str
    code: str
    name: str
    duration_days: int
    effort_hours: float | None = None
    owner_id: str | None = None
    skills: tuple[SkillRequirement, ...] = ()

    @property
    def label(self) -> str:
        return f"{self.code} {self.name}"

    @property
    def hours(self) -> float:
        """Effort used for cost and load: explicit effort, else 8 h per working day."""
        if self.effort_hours is not None and self.effort_hours > 0:
            return self.effort_hours
        return self.duration_days * DEFAULT_HOURS_PER_DAY


@dataclass(frozen=True, slots=True)
class Employee:
    id: str
    name: str
    weekly_capacity_hours: float = 40.0
    hourly_rate_cents: int | None = None
    is_contractor: bool = False
    skills: Mapping[str, int] = field(default_factory=dict)  # skill_id -> proficiency 1..5


@dataclass(frozen=True, slots=True)
class Dependency:
    predecessor_id: str
    successor_id: str
    type: DependencyType = "FS"
    lag_days: int = 0


@dataclass(frozen=True, slots=True)
class Milestone:
    id: str
    name: str
    due_date: date
    mode: ConstraintMode = "hard"
    task_ids: tuple[str, ...] = ()  # leaf tasks under the milestone's WBS node


@dataclass(frozen=True, slots=True)
class Allocation:
    """Hours an employee is already committed to *other* projects in a week."""

    employee_id: str
    week_start: date  # a Monday
    hours: float


@dataclass(frozen=True, slots=True)
class Constraints:
    budget_total_cents: int | None = None
    labor_cap_cents: int | None = None
    budget_mode: ConstraintMode = "hard"
    budget_penalty: float = 1000.0  # objective cost per $1,000 over budget
    must_finish_by: date | None = None
    deadline_mode: ConstraintMode = "hard"
    deadline_penalty_per_day: float = 500.0  # objective cost per working day late
    working_days_per_week: int = 5
    capacity_mode: ConstraintMode = "soft"
    capacity_penalty: float = 100.0  # objective cost per hour/day of peak over-allocation
    skill_mode: ConstraintMode = "hard"
    allow_contractors: bool = True
    contractor_rate_cents: int | None = None


@dataclass(frozen=True, slots=True)
class PlanningInput:
    project_id: str
    project_name: str
    start_date: date
    tasks: tuple[Task, ...]
    employees: tuple[Employee, ...]
    dependencies: tuple[Dependency, ...] = ()
    constraints: Constraints = field(default_factory=Constraints)
    milestones: tuple[Milestone, ...] = ()
    allocations: tuple[Allocation, ...] = ()

    # ------------------------------------------------------------------ snapshot
    def to_snapshot(self) -> dict[str, Any]:
        c = self.constraints
        return {
            "version": SNAPSHOT_VERSION,
            "project_id": self.project_id,
            "project_name": self.project_name,
            "start_date": self.start_date.isoformat(),
            "tasks": [
                {
                    "id": t.id,
                    "code": t.code,
                    "name": t.name,
                    "duration_days": t.duration_days,
                    "effort_hours": t.effort_hours,
                    "owner_id": t.owner_id,
                    "skills": [
                        {
                            "skill_id": s.skill_id,
                            "skill_name": s.skill_name,
                            "min_proficiency": s.min_proficiency,
                        }
                        for s in t.skills
                    ],
                }
                for t in self.tasks
            ],
            "employees": [
                {
                    "id": e.id,
                    "name": e.name,
                    "weekly_capacity_hours": e.weekly_capacity_hours,
                    "hourly_rate_cents": e.hourly_rate_cents,
                    "is_contractor": e.is_contractor,
                    "skills": dict(e.skills),
                }
                for e in self.employees
            ],
            "dependencies": [
                {
                    "predecessor_id": d.predecessor_id,
                    "successor_id": d.successor_id,
                    "type": d.type,
                    "lag_days": d.lag_days,
                }
                for d in self.dependencies
            ],
            "constraints": {
                "budget_total_cents": c.budget_total_cents,
                "labor_cap_cents": c.labor_cap_cents,
                "budget_mode": c.budget_mode,
                "budget_penalty": c.budget_penalty,
                "must_finish_by": c.must_finish_by.isoformat() if c.must_finish_by else None,
                "deadline_mode": c.deadline_mode,
                "deadline_penalty_per_day": c.deadline_penalty_per_day,
                "working_days_per_week": c.working_days_per_week,
                "capacity_mode": c.capacity_mode,
                "capacity_penalty": c.capacity_penalty,
                "skill_mode": c.skill_mode,
                "allow_contractors": c.allow_contractors,
                "contractor_rate_cents": c.contractor_rate_cents,
            },
            "milestones": [
                {
                    "id": m.id,
                    "name": m.name,
                    "due_date": m.due_date.isoformat(),
                    "mode": m.mode,
                    "task_ids": list(m.task_ids),
                }
                for m in self.milestones
            ],
            "allocations": [
                {
                    "employee_id": a.employee_id,
                    "week_start": a.week_start.isoformat(),
                    "hours": a.hours,
                }
                for a in self.allocations
            ],
        }

    @classmethod
    def from_snapshot(cls, data: Mapping[str, Any]) -> PlanningInput:
        try:
            return _parse_snapshot(data)
        except SnapshotError:
            raise
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            raise SnapshotError(f"Invalid input snapshot: {type(exc).__name__}: {exc}") from exc


def _mode(value: Any) -> ConstraintMode:
    if value not in ("hard", "soft"):
        raise SnapshotError(f"Invalid constraint mode {value!r}")
    return cast(ConstraintMode, value)


def _opt_int(value: Any) -> int | None:
    return None if value is None else int(value)


def _opt_date(value: Any) -> date | None:
    return None if value is None else date.fromisoformat(value)


def _penalty(value: Any, default: float) -> float:
    # The columns are unconstrained `real`s: a negative or NaN weight would turn
    # a penalty into a reward, so fall back to the default.
    number = default if value is None else float(value)
    return number if math.isfinite(number) and number >= 0 else default


def _parse_snapshot(data: Mapping[str, Any]) -> PlanningInput:
    if data.get("version") != SNAPSHOT_VERSION:
        raise SnapshotError(f"Unsupported input snapshot version {data.get('version')!r}")
    c = data.get("constraints") or {}
    wdpw = int(c.get("working_days_per_week", 5))
    if not 1 <= wdpw <= 7:
        raise SnapshotError("working_days_per_week must be between 1 and 7")
    constraints = Constraints(
        budget_total_cents=_opt_int(c.get("budget_total_cents")),
        labor_cap_cents=_opt_int(c.get("labor_cap_cents")),
        budget_mode=_mode(c.get("budget_mode", "hard")),
        budget_penalty=_penalty(c.get("budget_penalty"), 1000.0),
        must_finish_by=_opt_date(c.get("must_finish_by")),
        deadline_mode=_mode(c.get("deadline_mode", "hard")),
        deadline_penalty_per_day=_penalty(c.get("deadline_penalty_per_day"), 500.0),
        working_days_per_week=wdpw,
        capacity_mode=_mode(c.get("capacity_mode", "soft")),
        capacity_penalty=_penalty(c.get("capacity_penalty"), 100.0),
        skill_mode=_mode(c.get("skill_mode", "hard")),
        allow_contractors=bool(c.get("allow_contractors", True)),
        contractor_rate_cents=_opt_int(c.get("contractor_rate_cents")),
    )
    tasks = tuple(
        Task(
            id=str(t["id"]),
            code=str(t["code"]),
            name=str(t["name"]),
            duration_days=int(t["duration_days"]),
            effort_hours=None if t.get("effort_hours") is None else float(t["effort_hours"]),
            owner_id=None if t.get("owner_id") is None else str(t["owner_id"]),
            skills=tuple(
                SkillRequirement(
                    skill_id=str(s["skill_id"]),
                    skill_name=str(s["skill_name"]),
                    min_proficiency=int(s["min_proficiency"]),
                )
                for s in t.get("skills", ())
            ),
        )
        for t in data["tasks"]
    )
    if any(t.duration_days <= 0 for t in tasks):
        raise SnapshotError("Every task needs a positive duration")
    employees = tuple(
        Employee(
            id=str(e["id"]),
            name=str(e["name"]),
            weekly_capacity_hours=float(e["weekly_capacity_hours"]),
            hourly_rate_cents=_opt_int(e.get("hourly_rate_cents")),
            is_contractor=bool(e.get("is_contractor", False)),
            skills={str(k): int(v) for k, v in (e.get("skills") or {}).items()},
        )
        for e in data["employees"]
    )
    dependencies = tuple(
        Dependency(
            predecessor_id=str(d["predecessor_id"]),
            successor_id=str(d["successor_id"]),
            type=cast(DependencyType, d.get("type", "FS")),
            lag_days=int(d.get("lag_days", 0)),
        )
        for d in data.get("dependencies", ())
    )
    if any(d.type not in ("FS", "SS", "FF", "SF") for d in dependencies):
        raise SnapshotError("Invalid dependency type")
    milestones = tuple(
        Milestone(
            id=str(m["id"]),
            name=str(m["name"]),
            due_date=date.fromisoformat(m["due_date"]),
            mode=_mode(m.get("mode", "hard")),
            task_ids=tuple(str(x) for x in m.get("task_ids", ())),
        )
        for m in data.get("milestones", ())
    )
    allocations = tuple(
        Allocation(
            employee_id=str(a["employee_id"]),
            week_start=date.fromisoformat(a["week_start"]),
            hours=float(a["hours"]),
        )
        for a in data.get("allocations", ())
    )
    return PlanningInput(
        project_id=str(data["project_id"]),
        project_name=str(data.get("project_name", "")),
        start_date=date.fromisoformat(data["start_date"]),
        tasks=tasks,
        employees=employees,
        dependencies=dependencies,
        constraints=constraints,
        milestones=milestones,
        allocations=allocations,
    )


# --------------------------------------------------------------------------- resources
@dataclass(frozen=True, slots=True)
class Resource:
    """Something a task can be assigned to: an employee or a generic contractor profile.

    A contractor resource stands for "as many specialists of this profile as
    needed", so it has no capacity limit.
    """

    id: str
    name: str
    kind: ResourceKind
    weekly_capacity_hours: float
    rate_cents: int
    skills: Mapping[str, int]
    employee_id: str | None = None

    def proficiency(self, skill_id: str) -> int:
        return self.skills.get(skill_id, 0)

    def skill_gap(self, task: Task) -> int:
        """Total proficiency levels missing to do `task` (0 = fully qualified)."""
        return sum(max(0, r.min_proficiency - self.proficiency(r.skill_id)) for r in task.skills)


def qualified(resource: Resource, task: Task) -> bool:
    return resource.skill_gap(task) == 0


def _employee_rate(employees: Sequence[Employee]) -> int:
    # Unknown rates are imputed with the team average so they neither look free
    # (and attract all the work) nor block the budget.
    known = [e.hourly_rate_cents for e in employees if e.hourly_rate_cents is not None]
    return round(sum(known) / len(known)) if known else 0


def build_resources(inp: PlanningInput) -> tuple[Resource, ...]:
    """Employees, plus one contractor profile per group of tasks nobody can staff.

    Contractors are added only when `allow_contractors` is on, a contractor
    rate is set, and some task has no fully qualified employee. Tasks are
    grouped by the set of skills they need; each group gets one profile with
    proficiency 5 in those skills.
    """
    default_rate = _employee_rate(inp.employees)
    resources = [
        Resource(
            id=e.id,
            name=e.name,
            kind="employee",
            weekly_capacity_hours=e.weekly_capacity_hours,
            rate_cents=e.hourly_rate_cents if e.hourly_rate_cents is not None else default_rate,
            skills=dict(e.skills),
            employee_id=e.id,
        )
        for e in inp.employees
    ]
    c = inp.constraints
    if not c.allow_contractors or c.contractor_rate_cents is None:
        return tuple(resources)

    groups: dict[tuple[str, ...], dict[str, str]] = {}
    for task in inp.tasks:
        if not task.skills or any(qualified(r, task) for r in resources):
            continue
        key = tuple(sorted(s.skill_id for s in task.skills))
        names = groups.setdefault(key, {})
        for s in task.skills:
            names[s.skill_id] = s.skill_name
    for key, names in groups.items():
        label = " / ".join(names[k] for k in key)
        resources.append(
            Resource(
                id="contractor:" + "+".join(key),
                name=f"Contractor: {label} specialist",
                kind="contractor",
                weekly_capacity_hours=CONTRACTOR_WEEKLY_HOURS,
                rate_cents=c.contractor_rate_cents,
                skills=dict.fromkeys(key, MAX_PROFICIENCY),
            )
        )
    return tuple(resources)


# --------------------------------------------------------------------------- output
@dataclass(frozen=True, slots=True)
class ScheduledTask:
    task_id: str
    start: int  # working-day index from the project start (inclusive)
    end: int  # exclusive
    resource_id: str | None  # None = unassigned (baseline only)


@dataclass(frozen=True, slots=True)
class Conflict:
    """One hard constraint in an infeasible core, in plain English."""

    name: str
    explanation: str


@dataclass(frozen=True, slots=True)
class Plan:
    tasks: Mapping[str, ScheduledTask]

    @property
    def makespan(self) -> int:
        return max((s.end for s in self.tasks.values()), default=0)


@dataclass(frozen=True, slots=True)
class SolveOutcome:
    status: RunStatus
    solver: str  # e.g. "OR-Tools CP-SAT 9.15.6755"
    solver_version: str
    wall_seconds: float
    resources: tuple[Resource, ...]
    baseline: Plan
    plan: Plan | None = None
    objective: float | None = None
    best_bound: float | None = None
    hit_time_limit: bool = False
    conflicts: tuple[Conflict, ...] = ()
    message: str | None = None  # user-readable, for timeout / failed

    @property
    def gap(self) -> float | None:
        if self.objective is None or self.best_bound is None:
            return None
        if self.objective == 0:
            return 0.0
        return max(0.0, abs(self.objective - self.best_bound) / abs(self.objective))
