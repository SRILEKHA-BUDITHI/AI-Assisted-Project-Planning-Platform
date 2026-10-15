"""Pure optimizer: calendar, baseline, CP-SAT model, infeasibility explanations."""

from __future__ import annotations

import dataclasses
from datetime import date
from typing import Any

import pytest
from ortools.sat.python import cp_model

from app.optimization import formatting as fmt
from app.optimization.baseline import baseline_plan, dependency_offset
from app.optimization.calendar import (
    first_workday,
    week_index,
    week_workdays,
    workday_date,
    workdays_through,
)
from app.optimization.load import allocation_blocks, daily_capacity_tenths, task_daily_tenths
from app.optimization.model import (
    Allocation,
    Constraints,
    Dependency,
    Employee,
    Milestone,
    PlanningInput,
    SkillRequirement,
    SnapshotError,
    Task,
    build_resources,
)
from app.optimization.solver import (
    SOLVER_NAME,
    SolveControl,
    SolveOptions,
    map_status,
    solve,
)

MONDAY = date(2026, 10, 5)
FAST = SolveOptions(time_limit_s=10, workers=2)
SAP = SkillRequirement("sap", "SAP", 4)


def make_input(**overrides: Any) -> PlanningInput:
    """2 tasks, 1 FS dependency, 2 employees."""
    base: dict[str, Any] = {
        "project_id": "p1",
        "project_name": "CRM",
        "start_date": MONDAY,
        "tasks": (
            Task("a", "1.1.1", "Design", 5, owner_id="e1"),
            Task("b", "1.1.2", "Build", 10, owner_id="e1"),
        ),
        "employees": (
            Employee("e1", "Mark Chen", hourly_rate_cents=10_000),
            Employee("e2", "Lisa Park", hourly_rate_cents=12_000, skills={"sap": 5}),
        ),
        "dependencies": (Dependency("a", "b"),),
        "constraints": Constraints(),
    }
    base.update(overrides)
    return PlanningInput(**base)


def with_constraints(inp: PlanningInput, **changes: Any) -> PlanningInput:
    return dataclasses.replace(inp, constraints=dataclasses.replace(inp.constraints, **changes))


# --------------------------------------------------------------------------- calendar / format
def test_calendar_working_days() -> None:
    saturday = date(2026, 10, 10)
    assert first_workday(saturday, 5) == date(2026, 10, 12)
    assert first_workday(saturday, 6) == saturday
    assert workday_date(MONDAY, 0, 5) == MONDAY
    assert workday_date(MONDAY, 5, 5) == date(2026, 10, 12)
    assert workday_date(date(2026, 10, 7), 3, 5) == date(2026, 10, 12)  # Wed + 3 -> Mon
    assert workdays_through(MONDAY, date(2026, 10, 9), 5) == 5
    assert workdays_through(MONDAY, date(2026, 10, 11), 5) == 5
    assert workdays_through(MONDAY, date(2026, 10, 12), 5) == 6
    assert workdays_through(MONDAY, date(2026, 10, 1), 5) == 0
    assert week_index(MONDAY, date(2026, 10, 19)) == 2
    assert week_workdays(MONDAY, date(2026, 10, 12), 5) == (5, 10)
    assert week_workdays(MONDAY, date(2026, 9, 28), 5) == (0, 0)


def test_formatting() -> None:
    assert fmt.money(36_120_000) == "$361,200"
    assert fmt.money(-150) == "-$2"
    assert fmt.day(date(2025, 10, 14)) == "Oct 14, 2025"
    assert fmt.weeks_label(2, 5) == f"Wk 3{fmt.EN_DASH}6"
    assert fmt.weeks_label(0, 0) == "Wk 1"
    assert fmt.shift(0, 5) == "—"
    assert fmt.shift(10, 5) == "+2w"
    assert fmt.shift(-3, 5) == "-3d"
    assert fmt.shift(7, 5) == "+1.4w"
    assert fmt.plural(1, "week") == "1 week"
    assert fmt.plural(3, "week") == "3 weeks"


def test_dependency_offsets() -> None:
    assert dependency_offset(Dependency("a", "b", "FS", 2), 5, 3) == 7
    assert dependency_offset(Dependency("a", "b", "SS", 1), 5, 3) == 1
    assert dependency_offset(Dependency("a", "b", "FF", 0), 5, 3) == 2
    assert dependency_offset(Dependency("a", "b", "SF", 0), 5, 3) == -3


def test_baseline_forward_pass_keeps_owners() -> None:
    inp = make_input()
    plan = baseline_plan(inp)
    assert (plan.tasks["a"].start, plan.tasks["b"].start) == (0, 5)
    assert plan.makespan == 15
    assert {s.resource_id for s in plan.tasks.values()} == {"e1"}
    gone = make_input(employees=(Employee("e2", "Lisa"),))
    assert baseline_plan(gone).tasks["a"].resource_id is None


def test_load_arithmetic() -> None:
    assert task_daily_tenths(Task("a", "1", "A", 10, effort_hours=40)) == 40
    assert task_daily_tenths(Task("a", "1", "A", 5)) == 80  # 8h/day default
    assert daily_capacity_tenths(40, 5) == 80
    inp = make_input(
        allocations=(
            Allocation("e1", date(2026, 10, 12), 100),  # capped at capacity
            Allocation("e1", date(2026, 9, 28), 10),  # before start: dropped
            Allocation("nobody", date(2026, 10, 12), 10),
        )
    )
    blocks = allocation_blocks(inp)
    assert list(blocks) == ["e1"]
    (b,) = blocks["e1"]
    assert (b.lo, b.hi, b.tenths) == (5, 10, 80)


# --------------------------------------------------------------------------- snapshot
def test_snapshot_round_trip() -> None:
    inp = make_input(
        tasks=(Task("a", "1.1", "A", 3, effort_hours=12.5, skills=(SAP,)),),
        milestones=(Milestone("m", "Go-live", date(2026, 11, 2), "soft", ("a",)),),
        allocations=(Allocation("e1", date(2026, 10, 12), 8),),
        constraints=Constraints(must_finish_by=date(2026, 12, 1), contractor_rate_cents=9000),
    )
    assert PlanningInput.from_snapshot(inp.to_snapshot()) == inp


@pytest.mark.parametrize(
    "mutate",
    [
        lambda s: s.update(version=99),
        lambda s: s.pop("tasks"),
        lambda s: s["tasks"][0].update(duration_days=0),
        lambda s: s["constraints"].update(budget_mode="maybe"),
        lambda s: s["constraints"].update(working_days_per_week=9),
        lambda s: s["dependencies"][0].update(type="XX"),
        lambda s: s.update(start_date="not-a-date"),
    ],
)
def test_snapshot_rejects_bad_data(mutate: Any) -> None:
    snap = make_input().to_snapshot()
    mutate(snap)
    with pytest.raises(SnapshotError):
        PlanningInput.from_snapshot(snap)


def test_snapshot_sanitises_penalties() -> None:
    snap = make_input().to_snapshot()
    snap["constraints"].update(deadline_penalty_per_day=-5, budget_penalty=float("nan"))
    c = PlanningInput.from_snapshot(snap).constraints
    assert (c.deadline_penalty_per_day, c.budget_penalty) == (500.0, 1000.0)


# --------------------------------------------------------------------------- resources
def test_contractors_only_for_unstaffable_skills() -> None:
    task = Task("x", "1.2", "SAP Integration", 5, skills=(SkillRequirement("abap", "ABAP", 3),))
    inp = make_input(tasks=(task,))
    assert len(build_resources(inp)) == 2  # no contractor rate
    inp = with_constraints(inp, contractor_rate_cents=20_000)
    contractor = build_resources(inp)[-1]
    assert contractor.kind == "contractor"
    assert contractor.name == "Contractor: ABAP specialist"
    assert contractor.rate_cents == 20_000
    assert len(build_resources(with_constraints(inp, allow_contractors=False))) == 2


def test_unknown_rate_uses_team_average() -> None:
    inp = make_input(
        employees=(
            Employee("e1", "A", hourly_rate_cents=10_000),
            Employee("e2", "B", hourly_rate_cents=None),
        )
    )
    assert [r.rate_cents for r in build_resources(inp)] == [10_000, 10_000]


# --------------------------------------------------------------------------- solving
def test_tiny_instance_known_optimum() -> None:
    out = solve(make_input(), FAST)
    assert out.status == "optimal"
    assert out.solver == SOLVER_NAME
    assert out.plan is not None
    a, b = out.plan.tasks["a"], out.plan.tasks["b"]
    assert (a.start, a.end, b.start, b.end) == (0, 5, 5, 15)
    # The owner is kept (cheaper and no change penalty).
    assert a.resource_id == b.resource_id == "e1"
    # 15 days x $200 + (40h + 80h) x $100.
    assert out.objective == 15 * 20_000 + 120 * 10_000
    assert out.gap == 0
    assert not out.hit_time_limit


def test_skill_requirement_forces_reassignment() -> None:
    inp = make_input(
        tasks=(
            Task("a", "1.1.1", "Design", 5, owner_id="e1"),
            Task("b", "1.1.2", "Build", 10, owner_id="e1", skills=(SAP,)),
        )
    )
    out = solve(inp, FAST)
    assert out.status == "optimal"
    assert out.plan is not None
    assert out.plan.tasks["b"].resource_id == "e2"
    assert out.plan.tasks["a"].resource_id == "e1"


def test_capacity_serialises_full_time_tasks() -> None:
    inp = make_input(
        tasks=(
            Task("a", "1.1", "A", 5, owner_id="e1"),
            Task("b", "1.2", "B", 5, owner_id="e1"),
        ),
        employees=(Employee("e1", "Solo", hourly_rate_cents=1),),
        dependencies=(),
        constraints=Constraints(capacity_mode="hard"),
    )
    out = solve(inp, FAST)
    assert out.plan is not None
    assert out.plan.makespan == 10


def test_allocations_reduce_capacity() -> None:
    inp = make_input(
        tasks=(Task("a", "1.1", "A", 5, owner_id="e1"),),
        employees=(Employee("e1", "Busy", hourly_rate_cents=1),),
        dependencies=(),
        allocations=(Allocation("e1", MONDAY, 40),),
        constraints=Constraints(capacity_mode="hard"),
    )
    out = solve(inp, FAST)
    assert out.plan is not None
    assert out.plan.tasks["a"].start == 5  # first week is fully booked elsewhere


def test_hard_deadline_impossible_is_infeasible_with_iis() -> None:
    # Each task fits in 10 working days on its own; only the FS chain (15) doesn't.
    inp = with_constraints(make_input(), must_finish_by=date(2026, 10, 16))
    out = solve(inp, FAST)
    assert out.status == "infeasible"
    assert out.plan is None
    names = [c.name for c in out.conflicts]
    assert names == [
        "Deadline: must finish by Oct 16, 2026",
        "Dependency: 1.1.1 Design → 1.1.2 Build",
    ]
    assert out.conflicts[1].explanation == "Build can't start until Design finishes."
    deadline = next(c for c in out.conflicts if c.name.startswith("Deadline"))
    assert "Oct 23, 2026" in deadline.explanation


def test_soft_deadline_is_feasible_with_tardiness() -> None:
    inp = with_constraints(make_input(), must_finish_by=date(2026, 10, 9), deadline_mode="soft")
    out = solve(inp, FAST)
    assert out.status == "optimal"
    assert out.plan is not None
    assert out.plan.makespan == 15
    late_days = 15 - 5
    assert out.objective == 15 * 20_000 + 120 * 10_000 + late_days * 500 * 100


def test_hard_budget_cap_infeasible_names_budget() -> None:
    inp = with_constraints(make_input(), budget_total_cents=50_000)
    out = solve(inp, FAST)
    assert out.status == "infeasible"
    assert [c.name for c in out.conflicts] == ["Budget cap: $500"]
    assert "$12,000" in out.conflicts[0].explanation


def test_soft_budget_is_penalised_not_infeasible() -> None:
    inp = with_constraints(make_input(), budget_total_cents=50_000, budget_mode="soft")
    out = solve(inp, FAST)
    assert out.status == "optimal"


def test_labor_cap_and_skill_conflicts() -> None:
    inp = with_constraints(make_input(), labor_cap_cents=10)
    assert [c.name for c in solve(inp, FAST).conflicts] == ["Labor cap: $0"]

    inp = make_input(
        tasks=(Task("b", "1.2", "Build", 5, skills=(SAP,)),),
        employees=(Employee("e1", "Mark Chen"),),
        dependencies=(),
        constraints=Constraints(allow_contractors=False),
    )
    out = solve(inp, FAST)
    assert out.status == "infeasible"
    (conflict,) = out.conflicts
    assert conflict.name == "Skill: 1.2 Build requires SAP ≥ 4"
    assert "contractors are turned off" in conflict.explanation


def test_contractor_fills_skill_gap() -> None:
    inp = make_input(
        tasks=(Task("b", "1.2", "Build", 5, skills=(SAP,)),),
        employees=(Employee("e1", "Mark Chen"),),
        dependencies=(),
        constraints=Constraints(contractor_rate_cents=15_000),
    )
    out = solve(inp, FAST)
    assert out.plan is not None
    assert out.plan.tasks["b"].resource_id == "contractor:sap"


def test_soft_skill_mode_allows_unqualified() -> None:
    inp = make_input(
        tasks=(Task("b", "1.2", "Build", 5, skills=(SAP,)),),
        employees=(Employee("e1", "Mark Chen"),),
        dependencies=(),
        constraints=Constraints(skill_mode="soft", allow_contractors=False),
    )
    out = solve(inp, FAST)
    assert out.status == "optimal"


def test_milestones_hard_and_soft() -> None:
    hard = make_input(
        milestones=(Milestone("m", "Design done", date(2026, 10, 6), "hard", ("a",)),)
    )
    out = solve(hard, FAST)
    assert out.status == "infeasible"
    assert out.conflicts[0].name == "Milestone: Design done by Oct 6, 2026"
    soft = make_input(
        milestones=(Milestone("m", "Design done", date(2026, 10, 6), "soft", ("a",)),)
    )
    assert solve(soft, FAST).status == "optimal"


def test_hard_capacity_conflict_is_explained() -> None:
    inp = make_input(
        tasks=(
            Task("a", "1.1", "A", 5),
            Task("b", "1.2", "B", 5),
        ),
        employees=(Employee("e1", "Solo"),),
        dependencies=(),
        constraints=Constraints(capacity_mode="hard", must_finish_by=date(2026, 10, 9)),
    )
    out = solve(inp, FAST)
    assert out.status == "infeasible"
    names = {c.name for c in out.conflicts}
    assert names == {"Deadline: must finish by Oct 9, 2026", "Capacity: Solo (40h/week)"}
    deadline = next(c for c in out.conflicts if c.name.startswith("Deadline"))
    assert "capacity" in deadline.explanation


def test_time_limit_path() -> None:
    tasks = tuple(
        Task(f"t{i}", f"1.{i}", f"Task {i}", 3 + (i * 7) % 11, owner_id=f"e{i % 3}")
        for i in range(60)
    )
    deps = tuple(Dependency(f"t{i}", f"t{i + 7}") for i in range(0, 50, 3))
    team = tuple(
        Employee(f"e{i}", f"Person {i}", hourly_rate_cents=5000 + 700 * i) for i in range(8)
    )
    inp = make_input(tasks=tasks, employees=team, dependencies=deps)
    out = solve(inp, SolveOptions(time_limit_s=0.05, workers=1))
    assert out.status in ("feasible", "timeout")
    assert out.hit_time_limit
    if out.status == "timeout":
        assert out.message is not None
        assert "No feasible plan" in out.message
    else:
        assert out.plan is not None


def test_status_mapping() -> None:
    assert map_status(cp_model.OPTIMAL) == "optimal"
    assert map_status(cp_model.FEASIBLE) == "feasible"
    assert map_status(cp_model.INFEASIBLE) == "infeasible"
    assert map_status(cp_model.UNKNOWN) == "timeout"
    assert map_status(cp_model.MODEL_INVALID) == "failed"


def test_stopped_solve_returns_quickly() -> None:
    control = SolveControl()
    control.stop()
    assert control.stopped
    out = solve(make_input(), SolveOptions(time_limit_s=30), control)
    assert out.wall_seconds < 5
