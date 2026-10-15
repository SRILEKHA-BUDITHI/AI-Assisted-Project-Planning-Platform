"""Result payload: KPIs, reassignments, schedule changes, utilization, DB rows."""

from __future__ import annotations

import dataclasses
from datetime import date

from app.domain.optimization import RunResult
from app.optimization.explain import build_report
from app.optimization.formatting import EN_DASH
from app.optimization.model import (
    Conflict,
    Constraints,
    Dependency,
    Employee,
    Plan,
    ScheduledTask,
    SkillRequirement,
    SolveOutcome,
    Task,
    build_resources,
)
from app.optimization.solver import solve
from tests.test_optimization_solver import FAST, MONDAY, SAP, make_input, with_constraints


def test_skill_reassignment_report() -> None:
    inp = make_input(
        tasks=(
            Task("a", "1.1.1", "Design", 5, owner_id="e1"),
            Task("b", "1.1.2", "Build", 10, owner_id="e1", skills=(SAP,)),
        ),
        constraints=Constraints(budget_total_cents=2_000_000, must_finish_by=date(2026, 10, 30)),
    )
    report = build_report(inp, solve(inp, FAST))
    assert report.status == "optimal"
    assert report.solver.startswith("OR-Tools CP-SAT 9.")
    assert report.expected_cost_cents == 40 * 10_000 + 80 * 12_000
    assert report.completion_date == date(2026, 10, 23)
    assert report.iis is None
    assert report.error is None
    result = report.result
    assert result is not None
    RunResult.model_validate(result)  # shape matches the API schema

    kpis = {k["label"]: k for k in result["kpis"]}
    assert kpis["Budget"] == {"label": "Budget", "value": "$13,600", "sub": "$6,400 under budget"}
    assert kpis["Completion Date"]["value"] == "Oct 23, 2026"
    assert kpis["Completion Date"]["sub"] == "7 days ahead of target"
    assert kpis["Resource Utilization"]["sub"] == "Average across 2 resources"
    assert kpis["Critical Path"] == {
        "label": "Critical Path",
        "value": "3 weeks",
        "sub": "Design → Build chain",
    }
    assert "Solve" not in kpis

    assert result["reassignments"] == [
        {
            "task": "1.1.2 Build",
            "current": "Mark Chen (100% util)",
            "recommended": "Lisa Park (40h/wk)",
            "reason": "Skill gap",
        }
    ]
    assert [c["delta"] for c in result["scheduleChanges"]] == ["—", "—"]
    assert result["scheduleChanges"][1]["original"] == f"Wk 2{EN_DASH}3"
    assert result["scheduleChanges"][0]["reason"] == "No change needed"
    assert result["utilization"] == [
        {"name": "Mark Chen", "before": 100, "after": 33},
        {"name": "Lisa Park", "before": 0, "after": 67},
    ]
    assert report.critical_path == [
        {"id": "a", "code": "1.1.1", "name": "Design"},
        {"id": "b", "code": "1.1.2", "name": "Build"},
    ]

    rows = {a.wbs_node_id: a for a in report.assignments}
    assert rows["b"].employee_id == "e2"
    assert rows["b"].baseline_employee_id == "e1"
    assert (rows["b"].start_week, rows["b"].end_week) == (1, 2)
    assert rows["b"].hours_per_week == 40.0
    assert [r.type for r in report.recommendations] == ["reassignment"]


def test_over_budget_and_late_kpis() -> None:
    inp = with_constraints(
        make_input(),
        budget_total_cents=100_000,
        budget_mode="soft",
        must_finish_by=date(2026, 10, 9),
        deadline_mode="soft",
    )
    result = build_report(inp, solve(inp, FAST)).result
    assert result is not None
    kpis = {k["label"]: k for k in result["kpis"]}
    assert kpis["Budget"]["sub"] == "$11,000 over budget"
    assert kpis["Completion Date"]["sub"] == "14 days over target"


def test_no_budget_no_deadline_kpis() -> None:
    result = build_report(make_input(), solve(make_input(), FAST)).result
    assert result is not None
    kpis = {k["label"]: k["sub"] for k in result["kpis"]}
    assert kpis["Budget"] == "No budget set"
    assert kpis["Completion Date"] == "No deadline set"


def test_resource_conflict_moves_task_and_reassigns() -> None:
    # Both tasks owned by one full-time person; a second person is idle.
    inp = make_input(
        tasks=(
            Task("a", "1.1", "Design", 5, owner_id="e1"),
            Task("b", "1.2", "Backend", 5, owner_id="e1"),
            Task("c", "1.3", "Frontend", 5, owner_id="e1"),
        ),
        employees=(
            Employee("e1", "Mark Chen", hourly_rate_cents=10_000),
            Employee("e2", "Lisa Park", hourly_rate_cents=10_000),
        ),
        dependencies=(Dependency("a", "c"),),
        constraints=Constraints(capacity_mode="hard"),
    )
    report = build_report(inp, solve(inp, FAST))
    result = report.result
    assert result is not None
    (row,) = result["reassignments"]
    assert row["current"] == "Mark Chen (150% util)"
    assert row["reason"] == "Over-allocation"
    assert all(c["delta"] == "—" for c in result["scheduleChanges"])


def test_dependency_cascade_and_waits_reasons() -> None:
    # One person, hard capacity. Delaying Beta+Gamma by 3 days beats delaying
    # Alpha by 10, so Beta waits for Alpha and Gamma cascades from Beta.
    inp = make_input(
        tasks=(
            Task("a", "1.1", "Alpha", 3, owner_id="e1"),
            Task("b", "1.2", "Beta", 5, owner_id="e1"),
            Task("c", "1.3", "Gamma", 5, owner_id="e1"),
        ),
        employees=(Employee("e1", "Solo", hourly_rate_cents=1),),
        dependencies=(Dependency("b", "c"),),
        constraints=Constraints(capacity_mode="hard"),
    )
    result = build_report(inp, solve(inp, FAST)).result
    assert result is not None
    assert [(c["name"], c["delta"], c["reason"]) for c in result["scheduleChanges"]] == [
        ("Alpha", "—", "No change needed"),
        ("Beta", "+3d", "Waits for Solo to finish Alpha"),
        ("Gamma", "+3d", "Dependency cascade from Beta"),
    ]
    assert result["reassignments"] == []


def test_contractor_hire_recommendation() -> None:
    inp = make_input(
        tasks=(
            Task("b", "1.2", "SAP Integration", 5, skills=(SkillRequirement("sap", "SAP", 5),)),
        ),
        employees=(Employee("e1", "Mark Chen", hourly_rate_cents=10_000),),
        dependencies=(),
        constraints=Constraints(contractor_rate_cents=15_000),
    )
    report = build_report(inp, solve(inp, FAST))
    result = report.result
    assert result is not None
    assert result["reassignments"][0]["current"] == "Unassigned"
    assert result["reassignments"][0]["recommended"].startswith("Contractor: SAP specialist")
    assert result["reassignments"][0]["reason"] == "Skill gap"
    util = {u["name"]: u for u in result["utilization"]}
    assert util["Contractor: SAP specialist"]["before"] == 0
    hire = [r for r in report.recommendations if r.type == "hire"]
    assert hire[0].after_value == "Contractor: SAP specialist"
    assert "$6,000" in hire[0].reason
    row = report.assignments[0]
    assert row.employee_id is None
    assert row.contractor_label == "Contractor: SAP specialist"


def test_infeasible_report_has_iis_and_no_result() -> None:
    inp = with_constraints(make_input(), budget_total_cents=1)
    report = build_report(inp, solve(inp, FAST))
    assert report.status == "infeasible"
    assert report.result is None
    assert report.iis is not None
    assert report.iis[0]["name"] == "Budget cap: $0"
    assert report.assignments == []


def _outcome(inp: object, **kw: object) -> SolveOutcome:
    from app.optimization.baseline import baseline_plan
    from app.optimization.model import PlanningInput

    assert isinstance(inp, PlanningInput)
    base: dict[str, object] = {
        "status": "timeout",
        "solver": "OR-Tools CP-SAT x",
        "solver_version": "x",
        "wall_seconds": 20.0,
        "resources": build_resources(inp),
        "baseline": baseline_plan(inp),
    }
    base.update(kw)
    return SolveOutcome(**base)  # type: ignore[arg-type]


def test_timeout_and_time_limited_feasible() -> None:
    inp = make_input()
    report = build_report(inp, _outcome(inp, message="No feasible plan was found."))
    assert (report.status, report.result, report.iis) == ("timeout", None, None)
    assert report.error == "No feasible plan was found."
    assert report.runtime_ms == 20_000

    plan = Plan({"a": ScheduledTask("a", 0, 5, "e1"), "b": ScheduledTask("b", 5, 15, "e1")})
    feasible = _outcome(
        inp, status="feasible", plan=plan, objective=110.0, best_bound=100.0, hit_time_limit=True
    )
    report = build_report(inp, feasible)
    assert report.mip_gap is not None
    assert abs(report.mip_gap - 1 / 11) < 1e-9
    assert report.result is not None
    solve_kpi = report.result["kpis"][-1]
    assert solve_kpi["label"] == "Solve"
    assert solve_kpi["sub"] == "Best plan found, within 9.1% of optimal"


def test_conflict_dataclass_is_plain() -> None:
    assert dataclasses.asdict(Conflict("a", "b")) == {"name": "a", "explanation": "b"}
    assert MONDAY.weekday() == 0
