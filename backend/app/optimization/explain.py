"""Turn a solve outcome into what the API stores and the UI shows (plan.md §6.4).

Reasons are rule-based, from the diff between the baseline and the optimized
plan; nothing here invents facts:

* moved later and a predecessor moved too   -> "Dependency cascade from {pred}"
* moved later behind the same assignee      -> "Waits for {name} to finish {task}"
* moved later, person busy on other projects-> "{name} is committed to other projects"
* taken off a person over 100% in baseline  -> "Over-allocation"
* given to someone with the required skill  -> "Skill gap"
* unchanged                                 -> omitted from reassignments, "—" delta
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.optimization import formatting as fmt
from app.optimization.baseline import dependency_offset, task_dependencies
from app.optimization.calendar import week_index, workday_date
from app.optimization.load import (
    TENTHS,
    allocation_blocks,
    daily_capacity_tenths,
    task_daily_tenths,
)
from app.optimization.model import (
    Plan,
    PlanningInput,
    Resource,
    RunStatus,
    SolveOutcome,
    Task,
    qualified,
)


@dataclass(frozen=True, slots=True)
class AssignmentRow:
    """One `planned_assignments` row (weeks are 0-based calendar weeks)."""

    wbs_node_id: str
    employee_id: str | None
    contractor_label: str | None
    start_week: int
    end_week: int
    hours_per_week: float
    baseline_start_week: int
    baseline_end_week: int
    baseline_employee_id: str | None


@dataclass(frozen=True, slots=True)
class RecommendationRow:
    type: str  # recommendation_type: reassignment | schedule_change | hire | note
    wbs_node_id: str | None
    before_value: str | None
    after_value: str | None
    reason: str
    sort_order: int


@dataclass(frozen=True, slots=True)
class Report:
    status: RunStatus
    solver: str
    solver_version: str
    runtime_ms: int
    objective_value: float | None = None
    mip_gap: float | None = None
    expected_cost_cents: int | None = None
    completion_date: date | None = None
    avg_utilization: float | None = None
    critical_path: list[dict[str, str]] | None = None
    result: dict[str, Any] | None = None
    iis: list[dict[str, str]] | None = None
    error: str | None = None
    assignments: list[AssignmentRow] = field(default_factory=list)
    recommendations: list[RecommendationRow] = field(default_factory=list)


# --------------------------------------------------------------------------- helpers
class _Ctx:
    def __init__(self, inp: PlanningInput, outcome: SolveOutcome, plan: Plan) -> None:
        self.inp = inp
        self.plan = plan
        self.baseline = outcome.baseline
        self.per_week = inp.constraints.working_days_per_week
        self.tasks = {t.id: t for t in inp.tasks}
        self.resources = {r.id: r for r in outcome.resources}
        self.blocks = allocation_blocks(inp)
        self.deps = task_dependencies(inp)

    def date_of(self, index: int) -> date:
        return workday_date(self.inp.start_date, index, self.per_week)

    def week_of(self, index: int) -> int:
        return week_index(self.inp.start_date, self.date_of(index))

    def weeks(self, start: int, end: int) -> tuple[int, int]:
        return self.week_of(start), self.week_of(max(end - 1, start))

    def hours(self, plan: Plan, resource_id: str) -> float:
        return sum(
            self.tasks[s.task_id].hours for s in plan.tasks.values() if s.resource_id == resource_id
        )

    def other_hours(self, resource_id: str, span: int) -> float:
        """Hours committed to other projects inside working days [0, span)."""
        total = 0.0
        for b in self.blocks.get(resource_id, []):
            days = max(0, min(b.hi, span) - b.lo)
            total += days * b.tenths / TENTHS
        return total

    def utilization(self, plan: Plan, res: Resource) -> int:
        span = plan.makespan
        if span <= 0:
            return 0
        available = res.weekly_capacity_hours * span / self.per_week
        if available <= 0:
            return 0
        used = self.hours(plan, res.id) + self.other_hours(res.id, span)
        pct = round(100 * used / available)
        return min(pct, 100) if res.kind == "contractor" else pct

    def over_allocated(self, plan: Plan, resource_id: str) -> bool:
        res = self.resources.get(resource_id)
        if res is None or res.kind != "employee":
            return False
        cap = daily_capacity_tenths(res.weekly_capacity_hours, self.per_week)
        span = plan.makespan
        load = [0] * span
        for b in self.blocks.get(resource_id, []):
            for d in range(b.lo, min(b.hi, span)):
                load[d] += b.tenths
        for s in plan.tasks.values():
            if s.resource_id == resource_id:
                demand = task_daily_tenths(self.tasks[s.task_id])
                for d in range(s.start, s.end):
                    load[d] += demand
        return any(x > cap for x in load)

    def name(self, resource_id: str | None) -> str:
        if resource_id is None:
            return "Unassigned"
        res = self.resources.get(resource_id)
        return res.name if res else "Unassigned"

    def cost(self, plan: Plan) -> int:
        return sum(
            round(self.tasks[s.task_id].hours * self.resources[s.resource_id].rate_cents)
            for s in plan.tasks.values()
            if s.resource_id is not None and s.resource_id in self.resources
        )

    def tight_predecessors(self, plan: Plan, task_id: str) -> list[str]:
        out = []
        for d in self.deps:
            if d.successor_id != task_id:
                continue
            pred, succ = self.tasks[d.predecessor_id], self.tasks[d.successor_id]
            w = dependency_offset(d, pred.duration_days, succ.duration_days)
            if plan.tasks[succ.id].start == plan.tasks[pred.id].start + w:
                out.append(pred.id)
        return out


def critical_chain(ctx: _Ctx, plan: Plan) -> list[Task]:
    """Walk back from the last task through binding dependencies or the same assignee."""
    if not plan.tasks:
        return []
    current = max(plan.tasks.values(), key=lambda s: (s.end, -s.start)).task_id
    chain = [current]
    seen = {current}
    while True:
        s = plan.tasks[current]
        preds = [p for p in ctx.tight_predecessors(plan, current) if p not in seen]
        if not preds:
            preds = [
                o.task_id
                for o in plan.tasks.values()
                if o.task_id not in seen
                and o.resource_id is not None
                and o.resource_id == s.resource_id
                and o.end == s.start
            ]
        if not preds or s.start == 0:
            break
        current = preds[0]
        chain.append(current)
        seen.add(current)
    return [ctx.tasks[t] for t in reversed(chain)]


def _chain_label(chain: list[Task]) -> str:
    names = [t.name for t in chain]
    if len(names) > 4:
        names = [*names[:2], "…", names[-1]]
    return " → ".join(names) + (" chain" if len(chain) > 1 else "")


# --------------------------------------------------------------------------- reasons
def _reassignment_reason(ctx: _Ctx, task: Task, before: str | None, after: str) -> str:
    reasons = []
    old = ctx.resources.get(before) if before else None
    new = ctx.resources[after]
    if task.skills and (old is None or not qualified(old, task)) and qualified(new, task):
        reasons.append("Skill gap")
    if before is not None and ctx.over_allocated(ctx.baseline, before):
        reasons.append("Over-allocation")
    if reasons:
        first, *rest = reasons
        return " + ".join([first, *(r.lower() for r in rest)])
    if before is None:
        return "No owner assigned"
    saved = round(task.hours * (old.rate_cents if old else 0)) - round(task.hours * new.rate_cents)
    if saved > 0:
        return f"Lower cost (saves {fmt.money(saved)})"
    return "Balances workload"


def _schedule_reason(ctx: _Ctx, task_id: str, shift: int) -> str:
    if shift == 0:
        return "No change needed"
    if shift < 0:
        return "Starts earlier"
    plan, base = ctx.plan, ctx.baseline
    for pred in ctx.tight_predecessors(plan, task_id):
        if plan.tasks[pred].start > base.tasks[pred].start:
            return f"Dependency cascade from {ctx.tasks[pred].name}"
    s = plan.tasks[task_id]
    blocker = next(
        (
            o
            for o in plan.tasks.values()
            if o.task_id != task_id and o.resource_id == s.resource_id and o.end == s.start
        ),
        None,
    )
    if blocker is not None:
        return f"Waits for {ctx.name(s.resource_id)} to finish {ctx.tasks[blocker.task_id].name}"
    if s.resource_id in ctx.blocks:
        return f"{ctx.name(s.resource_id)} is committed to other projects"
    return "Resolves a resource conflict"


# --------------------------------------------------------------------------- report
def _kpis(
    ctx: _Ctx, outcome: SolveOutcome, cost: int, finish: date, util: int, n: int, chain: list[Task]
) -> list[dict[str, str]]:
    c = ctx.inp.constraints
    budget = c.budget_total_cents if c.budget_total_cents is not None else c.labor_cap_cents
    if budget is None:
        budget_sub = "No budget set"
    elif cost <= budget:
        budget_sub = f"{fmt.money(budget - cost)} under budget"
    else:
        budget_sub = f"{fmt.money(cost - budget)} over budget"
    if c.must_finish_by is None:
        finish_sub = "No deadline set"
    elif finish == c.must_finish_by:
        finish_sub = "Meets target date"
    elif finish < c.must_finish_by:
        finish_sub = f"{fmt.plural((c.must_finish_by - finish).days, 'day')} ahead of target"
    else:
        finish_sub = f"{fmt.plural((finish - c.must_finish_by).days, 'day')} over target"
    chain_days = ctx.plan.tasks[chain[-1].id].end - ctx.plan.tasks[chain[0].id].start
    chain_weeks = max(1, math.ceil(chain_days / ctx.per_week))
    kpis = [
        {"label": "Budget", "value": fmt.money(cost), "sub": budget_sub},
        {"label": "Completion Date", "value": fmt.day(finish), "sub": finish_sub},
        {
            "label": "Resource Utilization",
            "value": f"{util}%",
            "sub": f"Average across {fmt.plural(n, 'resource')}",
        },
        {
            "label": "Critical Path",
            "value": fmt.plural(chain_weeks, "week"),
            "sub": _chain_label(chain),
        },
    ]
    if outcome.hit_time_limit:
        gap = outcome.gap
        kpis.append(
            {
                "label": "Solve",
                "value": "Time limit reached",
                "sub": "Best plan found"
                + (f", within {gap:.1%} of optimal" if gap is not None else ""),
            }
        )
    return kpis


def build_report(inp: PlanningInput, outcome: SolveOutcome) -> Report:
    runtime_ms = round(outcome.wall_seconds * 1000)
    common: dict[str, Any] = {
        "status": outcome.status,
        "solver": outcome.solver,
        "solver_version": outcome.solver_version,
        "runtime_ms": runtime_ms,
    }
    if outcome.plan is None:
        iis = (
            [{"name": c.name, "explanation": c.explanation} for c in outcome.conflicts]
            if outcome.status == "infeasible"
            else None
        )
        return Report(**common, iis=iis, error=outcome.message)

    plan, base = outcome.plan, outcome.baseline
    ctx = _Ctx(inp, outcome, plan)
    ordered = sorted(
        inp.tasks, key=lambda t: [int(x) if x.isdigit() else 0 for x in t.code.split(".")]
    )

    assignments: list[AssignmentRow] = []
    reassignments: list[dict[str, str]] = []
    schedule: list[dict[str, str]] = []
    recs: list[RecommendationRow] = []
    for t in ordered:
        s, b = plan.tasks[t.id], base.tasks[t.id]
        res = ctx.resources[s.resource_id] if s.resource_id else None
        sw, ew = ctx.weeks(s.start, s.end)
        bsw, bew = ctx.weeks(b.start, b.end)
        hours_per_week = min(round(t.hours / t.duration_days * ctx.per_week, 1), 168.0)
        assignments.append(
            AssignmentRow(
                wbs_node_id=t.id,
                employee_id=res.employee_id if res else None,
                contractor_label=res.name if res and res.kind == "contractor" else None,
                start_week=sw,
                end_week=ew,
                hours_per_week=hours_per_week,
                baseline_start_week=bsw,
                baseline_end_week=bew,
                baseline_employee_id=b.resource_id,
            )
        )
        if s.resource_id != b.resource_id and s.resource_id is not None:
            current = ctx.name(b.resource_id)
            if b.resource_id is not None:
                current += f" ({ctx.utilization(base, ctx.resources[b.resource_id])}% util)"
            row = {
                "task": t.label,
                "current": current,
                "recommended": f"{ctx.name(s.resource_id)} ({hours_per_week:g}h/wk)",
                "reason": _reassignment_reason(ctx, t, b.resource_id, s.resource_id),
            }
            reassignments.append(row)
            recs.append(
                RecommendationRow(
                    "reassignment",
                    t.id,
                    row["current"],
                    row["recommended"],
                    row["reason"],
                    len(recs),
                )
            )
        shift = s.start - b.start
        change = {
            "wbs": t.code,
            "name": t.name,
            "original": fmt.weeks_label(bsw, bew),
            "optimized": fmt.weeks_label(sw, ew),
            "delta": fmt.shift(shift, ctx.per_week),
            "reason": _schedule_reason(ctx, t.id, shift),
        }
        schedule.append(change)
        if shift:
            recs.append(
                RecommendationRow(
                    "schedule_change",
                    t.id,
                    change["original"],
                    change["optimized"],
                    change["reason"],
                    len(recs),
                )
            )

    used = {s.resource_id for s in plan.tasks.values()}
    before_used = {s.resource_id for s in base.tasks.values()}
    utilization: list[dict[str, Any]] = []
    for r in outcome.resources:
        if r.id not in used and r.id not in before_used:
            continue
        before = ctx.utilization(base, r) if r.kind == "employee" else 0
        utilization.append({"name": r.name, "before": before, "after": ctx.utilization(plan, r)})
        if r.kind == "contractor" and r.id in used:
            hours = ctx.hours(plan, r.id)
            recs.append(
                RecommendationRow(
                    "hire",
                    None,
                    None,
                    r.name,
                    f"Skill gap: about {hours:g} hours, est. "
                    f"{fmt.money(round(hours * r.rate_cents))}",
                    len(recs),
                )
            )
    after = [u["after"] for u in utilization if u["after"] > 0]
    avg = round(sum(after) / len(after)) if after else 0

    cost = ctx.cost(plan)
    finish = ctx.date_of(max(plan.makespan - 1, 0))
    chain = critical_chain(ctx, plan)
    result = {
        "kpis": _kpis(ctx, outcome, cost, finish, avg, len(after), chain),
        "reassignments": reassignments,
        "scheduleChanges": schedule,
        "utilization": utilization,
    }
    return Report(
        **common,
        objective_value=outcome.objective,
        mip_gap=outcome.gap,
        expected_cost_cents=cost,
        completion_date=finish,
        avg_utilization=avg / 100,
        critical_path=[{"id": t.id, "code": t.code, "name": t.name} for t in chain],
        result=result,
        error=None,
        assignments=assignments,
        recommendations=recs,
    )
