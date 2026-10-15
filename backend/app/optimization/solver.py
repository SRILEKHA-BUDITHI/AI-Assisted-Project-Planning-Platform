"""CP-SAT model for resource-constrained scheduling with skill-based assignment.

Formulation (day granularity; plan.md §6.1 has the MILP intent it follows):

* Time: working-day indices 0..H, H = Σ durations + Σ |lags| + the span of
  existing allocations + one week, which always admits a serial schedule.
* Task t: start s_t, fixed duration d_t (working days), end e_t = s_t + d_t.
* Assignment: one boolean x[t,r] per candidate resource, exactly one true.
  Each x[t,r] carries an optional interval [s_t, e_t).
* Capacity: per employee, a cumulative constraint over those intervals with
  daily demand = effort / duration, plus fixed intervals for hours already
  allocated to other projects, against daily capacity = weekly hours /
  working days. Hard mode fixes capacity. Soft mode lets it grow and pays
  `capacity_penalty` per hour/day of *peak* over-allocation (simplification:
  the peak, not the sum over days, and effort is spread evenly over the
  duration). So a full-time task (8 h/day for a 40 h, 5-day person) can't
  overlap another task of the same person. Contractor profiles have no
  capacity limit: they stand for as many specialists as needed.
* Skills: in hard mode only qualified resources are candidates; in soft mode
  everyone is, at a penalty per missing proficiency level.
* Dependencies FS/SS/FF/SF with lag in working days.
* Deadline / milestones: hard -> e_t <= D; soft -> tardiness in working days
  times `deadline_penalty_per_day`. A milestone on a summary node covers its
  leaf tasks; milestones without a WBS node are informational.
* Budget: labor cost = Σ x[t,r] · hours_t · rate_r. `budget_total_cents` and
  `labor_cap_cents` both cap it (infra cost isn't modelled). Hard -> a
  constraint, soft -> `budget_penalty` per $1,000 over.
* Objective, in cents: labor cost + $200 per working day of makespan + soft
  penalties + $500 per task moved off its current owner (keeps
  recommendations few and explainable, plan.md §6.1) + $10 per working day a
  task starts after its baseline start (stops non-critical tasks drifting).

Infeasibility: the model is rebuilt without objective, with every hard
constraint group behind an assumption literal.
`sufficient_assumptions_for_infeasibility()` gives a core, which is shrunk by
deletion (drop a group, re-solve, keep it dropped if still infeasible) within
the time budget. The reported list is then usually minimal: each entry is
needed for the conflict. If the budget runs out it may contain extra groups.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date
from functools import partial
from importlib.metadata import version

from ortools.sat.python import cp_model

from app.optimization import formatting as fmt
from app.optimization.baseline import baseline_plan, dependency_offset, task_dependencies
from app.optimization.calendar import workday_date, workdays_through
from app.optimization.load import Block, allocation_blocks, daily_capacity_tenths, task_daily_tenths
from app.optimization.model import (
    Conflict,
    Dependency,
    Milestone,
    Plan,
    PlanningInput,
    Resource,
    RunStatus,
    ScheduledTask,
    SkillRequirement,
    SolveOutcome,
    Task,
    build_resources,
    qualified,
)

logger = logging.getLogger("app.optimization")

SOLVER_VERSION: str = version("ortools")
SOLVER_NAME = f"OR-Tools CP-SAT {SOLVER_VERSION}"

# Objective weights, in cents.
MAKESPAN_CENTS_PER_DAY = 20_000
SHIFT_CENTS_PER_DAY = 1_000
CHANGE_OWNER_CENTS = 50_000
SKILL_GAP_CENTS_PER_LEVEL = 200_000
BUDGET_UNIT_CENTS = 100_000  # soft budget penalty is per $1,000 over

_KIND_ORDER = ("deadline", "milestone", "budget", "labor", "skill", "capacity", "dependency")

GENERIC_CONFLICT = Conflict(
    "Hard constraints",
    "The hard constraints can't all hold at once. Try making the deadline or budget soft.",
)


@dataclass(frozen=True, slots=True)
class SolveOptions:
    time_limit_s: float = 20.0
    workers: int = 4
    # Extra time allowed for explaining an infeasible model (default: time_limit_s).
    iis_time_limit_s: float | None = None
    random_seed: int = 0


class SolveControl:
    """Lets another thread stop a running solve (used on server shutdown)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._solver: cp_model.CpSolver | None = None
        self._stopped = False

    @property
    def stopped(self) -> bool:
        return self._stopped

    def stop(self) -> None:
        with self._lock:
            self._stopped = True
            if self._solver is not None:
                self._solver.stop_search()

    def attach(self, solver: cp_model.CpSolver) -> None:
        with self._lock:
            self._solver = solver
            if self._stopped:
                solver.stop_search()

    def detach(self) -> None:
        with self._lock:
            self._solver = None


# --------------------------------------------------------------------------- problem data
@dataclass(slots=True)
class Problem:
    """Pre-computed numbers shared by the main and the explanation model."""

    inp: PlanningInput
    resources: tuple[Resource, ...]
    baseline: Plan
    tasks: dict[str, Task]
    deps: list[Dependency]
    horizon: int
    demand: dict[str, int]  # task id -> tenths of an hour per working day
    capacity: dict[str, int]  # employee id -> tenths of an hour per working day
    blocks: dict[str, list[Block]]
    candidates: dict[str, list[Resource]]  # everyone who may ever take the task
    cost: dict[tuple[str, str], int]  # (task id, resource id) -> cents
    deadline: int | None  # max exclusive end index
    milestone_ends: dict[str, int] = field(default_factory=dict)

    def finish_date(self, end: int) -> date:
        return workday_date(
            self.inp.start_date, max(end - 1, 0), self.inp.constraints.working_days_per_week
        )


def prepare(inp: PlanningInput) -> Problem:
    c = inp.constraints
    per_week = c.working_days_per_week
    resources = build_resources(inp)
    blocks = allocation_blocks(inp)
    deps = task_dependencies(inp)
    candidates = {
        t.id: [r for r in resources if r.kind == "employee" or qualified(r, t)] for t in inp.tasks
    }
    tasks = {t.id: t for t in inp.tasks}
    return Problem(
        inp=inp,
        resources=resources,
        baseline=baseline_plan(inp),
        tasks=tasks,
        deps=deps,
        horizon=(
            sum(t.duration_days for t in inp.tasks)
            + sum(abs(d.lag_days) for d in deps)
            + max((b.hi for bs in blocks.values() for b in bs), default=0)
            + per_week
        ),
        demand={t.id: task_daily_tenths(t) for t in inp.tasks},
        capacity={
            r.id: daily_capacity_tenths(r.weekly_capacity_hours, per_week)
            for r in resources
            if r.kind == "employee"
        },
        blocks=blocks,
        candidates=candidates,
        cost={
            (t.id, r.id): round(t.hours * r.rate_cents) for t in inp.tasks for r in candidates[t.id]
        },
        deadline=(
            workdays_through(inp.start_date, c.must_finish_by, per_week)
            if c.must_finish_by is not None
            else None
        ),
        milestone_ends={
            m.id: workdays_through(inp.start_date, m.due_date, per_week)
            for m in inp.milestones
            if any(tid in tasks for tid in m.task_ids)
        },
    )


# --------------------------------------------------------------------------- model
@dataclass(slots=True)
class _Vars:
    start: dict[str, cp_model.IntVar]
    assign: dict[str, dict[str, cp_model.IntVar]]  # task id -> resource id -> x


class _Builder:
    """Builds the main model (objective, hard constraints) or the explanation
    model (no objective, every hard group behind an assumption literal)."""

    def __init__(self, p: Problem, *, explain: bool) -> None:
        self.p = p
        self.c = p.inp.constraints
        self.explain = explain
        self.m = cp_model.CpModel()
        self.groups: list[tuple[cp_model.IntVar, Conflict]] = []
        self.kinds: dict[int, str] = {}  # literal index -> group kind
        self._lits: dict[tuple[str, ...], cp_model.IntVar] = {}
        self._terms: list[cp_model.LinearExprT] = []

    def _guard(
        self, ct: cp_model.Constraint, key: tuple[str, ...], conflict: Callable[[], Conflict]
    ) -> None:
        """In explanation mode, make `ct` conditional on its group's literal."""
        if not self.explain:
            return
        lit = self._lits.get(key)
        if lit is None:
            lit = self.m.new_bool_var("|".join(key))
            self._lits[key] = lit
            self.groups.append((lit, conflict()))
            self.kinds[lit.index] = key[0]
        ct.only_enforce_if(lit)

    def _penalize(self, term: cp_model.LinearExprT) -> None:
        if not self.explain:
            self._terms.append(term)

    def build(self) -> _Vars:
        p, m = self.p, self.m
        start: dict[str, cp_model.IntVar] = {}
        assign: dict[str, dict[str, cp_model.IntVar]] = {}
        loads: dict[str, list[tuple[cp_model.IntervalVar, int]]] = {}

        for t in p.tasks.values():
            s = m.new_int_var(0, p.horizon - t.duration_days, f"s[{t.id}]")
            start[t.id] = s
            assign[t.id] = {}
            for r in p.candidates[t.id]:
                gap = r.skill_gap(t)
                if gap and self.c.skill_mode == "hard" and not self.explain:
                    continue  # unqualified: not a candidate
                x = m.new_bool_var(f"x[{t.id},{r.id}]")
                assign[t.id][r.id] = x
                if r.kind == "employee":
                    iv = m.new_optional_interval_var(
                        s, t.duration_days, s + t.duration_days, x, f"iv[{t.id},{r.id}]"
                    )
                    loads.setdefault(r.id, []).append((iv, p.demand[t.id]))
                if gap and self.c.skill_mode == "hard":
                    for req in t.skills:
                        if r.proficiency(req.skill_id) < req.min_proficiency:
                            self._guard(
                                m.add(x == 0),
                                ("skill", t.id, req.skill_id),
                                partial(self._skill_conflict, t, req),
                            )
                elif gap:
                    self._penalize(x * (gap * SKILL_GAP_CENTS_PER_LEVEL))
            m.add_exactly_one(assign[t.id].values())
            self._baseline_terms(t, s, assign[t.id])

        self._capacity(loads)
        self._dependencies(start)
        makespan = m.new_int_var(0, p.horizon, "makespan")
        for t in p.tasks.values():
            m.add(makespan >= start[t.id] + t.duration_days)
        self._penalize(makespan * MAKESPAN_CENTS_PER_DAY)
        self._deadlines(start, makespan)
        self._budget(assign)
        if not self.explain:
            m.minimize(cp_model.LinearExpr.sum(self._terms))
        return _Vars(start=start, assign=assign)

    def _baseline_terms(
        self, t: Task, s: cp_model.IntVar, options: dict[str, cp_model.IntVar]
    ) -> None:
        if self.explain:
            return
        base = self.p.baseline.tasks[t.id]
        self.m.add_hint(s, base.start)
        self._penalize((s - base.start) * SHIFT_CENTS_PER_DAY)
        owner = options.get(base.resource_id) if base.resource_id else None
        if owner is not None:
            self.m.add_hint(owner, 1)
            self._penalize(CHANGE_OWNER_CENTS - owner * CHANGE_OWNER_CENTS)

    def _capacity(self, loads: dict[str, list[tuple[cp_model.IntervalVar, int]]]) -> None:
        p, m = self.p, self.m
        per_tenth = round(self.c.capacity_penalty * 10)  # $ per hour -> cents per tenth-hour
        for res in p.resources:
            items = loads.get(res.id)
            if not items:
                continue
            cap = p.capacity[res.id]
            items = items + [
                (
                    m.new_fixed_size_interval_var(b.lo, b.hi - b.lo, f"alloc[{res.id},{b.lo}]"),
                    b.tenths,
                )
                for b in p.blocks.get(res.id, [])
                if b.lo < p.horizon
            ]
            demands = [d for _, d in items]
            capacity: cp_model.LinearExprT
            if self.c.capacity_mode == "hard" and not self.explain:
                capacity = cap
            else:
                var = m.new_int_var(cap, cap + sum(demands), f"cap[{res.id}]")
                capacity = var
                if self.c.capacity_mode == "soft":
                    self._penalize((var - cap) * per_tenth)
                else:
                    self._guard(
                        m.add(var == cap),
                        ("capacity", res.id),
                        partial(self._capacity_conflict, res),
                    )
            m.add_cumulative([iv for iv, _ in items], demands, capacity)

    def _dependencies(self, start: dict[str, cp_model.IntVar]) -> None:
        p = self.p
        for d in p.deps:
            pred, succ = p.tasks[d.predecessor_id], p.tasks[d.successor_id]
            w = dependency_offset(d, pred.duration_days, succ.duration_days)
            self._guard(
                self.m.add(start[succ.id] >= start[pred.id] + w),
                ("dependency", pred.id, succ.id),
                partial(dependency_conflict, d, pred, succ),
            )

    def _deadlines(self, start: dict[str, cp_model.IntVar], makespan: cp_model.IntVar) -> None:
        p, m = self.p, self.m
        per_day = round(self.c.deadline_penalty_per_day * 100)
        if p.deadline is not None:
            if self.c.deadline_mode == "hard":
                self._guard(m.add(makespan <= p.deadline), ("deadline",), self._deadline_conflict)
            elif not self.explain:
                late = m.new_int_var(0, p.horizon, "late")
                m.add(late >= makespan - p.deadline)
                self._penalize(late * per_day)
        for ms in p.inp.milestones:
            due = p.milestone_ends.get(ms.id)
            if due is None:
                continue
            tasks = [p.tasks[tid] for tid in ms.task_ids if tid in p.tasks]
            if ms.mode == "hard":
                for t in tasks:
                    self._guard(
                        m.add(start[t.id] + t.duration_days <= due),
                        ("milestone", ms.id),
                        partial(self._milestone_conflict, ms, tasks),
                    )
            elif not self.explain:
                late = m.new_int_var(0, p.horizon, f"late[{ms.id}]")
                for t in tasks:
                    m.add(late >= start[t.id] + t.duration_days - due)
                self._penalize(late * per_day)

    def _budget(self, assign: dict[str, dict[str, cp_model.IntVar]]) -> None:
        p, m = self.p, self.m
        pairs = [(x, p.cost[tid, rid]) for tid, xs in assign.items() for rid, x in xs.items()]
        cost = cp_model.LinearExpr.weighted_sum([x for x, _ in pairs], [k for _, k in pairs])
        self._penalize(cost)
        worst = sum(max((p.cost[t, r.id] for r in rs), default=0) for t, rs in p.candidates.items())
        for key, label, cap in (
            ("budget", "Budget cap", self.c.budget_total_cents),
            ("labor", "Labor cap", self.c.labor_cap_cents),
        ):
            if cap is None:
                continue
            if self.c.budget_mode == "hard":
                self._guard(m.add(cost <= cap), (key,), partial(self._budget_conflict, label, cap))
            elif not self.explain:
                over = m.new_int_var(0, worst // BUDGET_UNIT_CENTS + 1, f"over[{key}]")
                m.add(over * BUDGET_UNIT_CENTS >= cost - cap)
                self._penalize(over * round(self.c.budget_penalty * 100))

    # -------------------------------------------------------------- explanations
    def _deadline_conflict(self) -> Conflict:
        p = self.p
        due = self.c.must_finish_by
        name = f"Deadline: must finish by {fmt.day(due)}" if due else "Deadline"
        if p.deadline is not None and p.baseline.makespan > p.deadline:
            critical = fmt.day(p.finish_date(p.baseline.makespan))
            return Conflict(
                name,
                f"The dependency chain alone runs until {critical}, even with unlimited people.",
            )
        return Conflict(
            name,
            "There isn't enough qualified capacity to finish all work by then "
            "together with the other constraints listed here.",
        )

    def _milestone_conflict(self, ms: Milestone, tasks: Sequence[Task]) -> Conflict:
        p = self.p
        name = f"Milestone: {ms.name} by {fmt.day(ms.due_date)}"
        earliest = max((p.baseline.tasks[t.id].end for t in tasks), default=0)
        if earliest > p.milestone_ends[ms.id]:
            return Conflict(
                name,
                f"Its work can't finish before {fmt.day(p.finish_date(earliest))} "
                "because of dependencies.",
            )
        return Conflict(
            name,
            "Its work can't be staffed in time together with the other constraints listed here.",
        )

    def _budget_conflict(self, label: str, cap: int) -> Conflict:
        p = self.p
        hard_skills = self.c.skill_mode == "hard"
        cheapest = sum(
            min(
                (
                    p.cost[t.id, r.id]
                    for r in p.candidates[t.id]
                    if not hard_skills or qualified(r, t)
                ),
                default=0,
            )
            for t in p.tasks.values()
        )
        name = f"{label}: {fmt.money(cap)}"
        if cheapest > cap:
            return Conflict(
                name,
                f"Even the cheapest qualified staffing costs about {fmt.money(cheapest)}, "
                f"{fmt.money(cheapest - cap)} more than the cap.",
            )
        return Conflict(
            name,
            f"Staying within {fmt.money(cap)} needs cheaper people than the other "
            "constraints listed here allow.",
        )

    def _skill_conflict(self, task: Task, req: SkillRequirement) -> Conflict:
        name = f"Skill: {task.label} requires {req.skill_name} ≥ {req.min_proficiency}"
        able = [
            r.name
            for r in self.p.resources
            if r.kind == "employee" and r.proficiency(req.skill_id) >= req.min_proficiency
        ]
        if able:
            return Conflict(
                name,
                f"Only {_names(able)} qualify, and they can't take it on without breaking "
                "another constraint listed here.",
            )
        if not self.c.allow_contractors:
            tail = "and contractors are turned off."
        elif self.c.contractor_rate_cents is None:
            tail = "and no contractor rate is set."
        else:
            tail = "and no single contractor profile covers all of the task's skills."
        return Conflict(
            name,
            f"No one on the team has {req.skill_name} at level {req.min_proficiency} "
            f"or higher, {tail}",
        )

    def _capacity_conflict(self, res: Resource) -> Conflict:
        hours = f"{res.weekly_capacity_hours:g}h/week"
        tail = " on top of their commitments to other projects" if self.p.blocks.get(res.id) else ""
        return Conflict(
            f"Capacity: {res.name} ({hours})",
            f"{res.name} can't take on the work they're needed for within {hours}{tail}.",
        )


def _names(names: Sequence[str]) -> str:
    if len(names) <= 2:
        return " and ".join(names)
    return f"{', '.join(names[:2])} and {fmt.plural(len(names) - 2, 'other')}"


def dependency_conflict(d: Dependency, pred: Task, succ: Task) -> Conflict:
    what = {
        "FS": f"{succ.name} can't start until {pred.name} finishes",
        "SS": f"{succ.name} can't start until {pred.name} starts",
        "FF": f"{succ.name} can't finish until {pred.name} finishes",
        "SF": f"{succ.name} can't finish until {pred.name} starts",
    }[d.type]
    if d.lag_days > 0:
        what += f", plus {fmt.plural(d.lag_days, 'working day')}"
    elif d.lag_days < 0:
        what += f", minus {fmt.plural(-d.lag_days, 'working day')}"
    return Conflict(f"Dependency: {pred.label} → {succ.label}", what + ".")


# --------------------------------------------------------------------------- solving
def _solver(time_limit_s: float, workers: int, seed: int) -> cp_model.CpSolver:
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(time_limit_s, 0.01)
    solver.parameters.num_workers = max(workers, 1)
    solver.parameters.random_seed = seed
    solver.parameters.log_search_progress = False
    return solver


def _run(
    model: cp_model.CpModel, solver: cp_model.CpSolver, control: SolveControl | None
) -> cp_model.CpSolverStatus:
    if control is not None:
        control.attach(solver)
    try:
        return solver.solve(model)
    finally:
        if control is not None:
            control.detach()


def map_status(status: cp_model.CpSolverStatus) -> RunStatus:
    """CP-SAT status -> `solver_status`. UNKNOWN means the time limit hit first."""
    if status == cp_model.OPTIMAL:
        return "optimal"
    if status == cp_model.FEASIBLE:
        return "feasible"
    if status == cp_model.INFEASIBLE:
        return "infeasible"
    if status == cp_model.UNKNOWN:
        return "timeout"
    return "failed"


def explain_infeasibility(
    p: Problem, options: SolveOptions, control: SolveControl | None = None
) -> tuple[Conflict, ...]:
    builder = _Builder(p, explain=True)
    builder.build()
    model = builder.m
    if not builder.groups:
        return (GENERIC_CONFLICT,)
    lits = {lit.index: lit for lit, _ in builder.groups}
    conflicts = {lit.index: conflict for lit, conflict in builder.groups}
    # Report the headline constraints (deadline, budget, ...) before the details.
    order = {
        lit.index: (_KIND_ORDER.index(builder.kinds[lit.index]), i)
        for i, (lit, _) in enumerate(builder.groups)
    }
    budget = options.iis_time_limit_s or options.time_limit_s
    deadline = time.monotonic() + budget

    def infeasible(indices: set[int], limit: float) -> set[int] | None:
        """The (sub)core if the model is infeasible under these assumptions, else None."""
        model.clear_assumptions()
        model.add_assumptions([lits[i] for i in sorted(indices)])
        solver = _solver(limit, options.workers, options.random_seed)
        if _run(model, solver, control) != cp_model.INFEASIBLE:
            return None
        return (set(solver.sufficient_assumptions_for_infeasibility()) & indices) or indices

    core = infeasible(set(lits), budget / 2)
    if core is None:
        return (GENERIC_CONFLICT,)
    for idx in sorted(core, key=order.__getitem__):
        remaining = deadline - time.monotonic()
        if remaining <= 0 or (control is not None and control.stopped):
            break
        if idx not in core or len(core) == 1:
            continue
        smaller = infeasible(core - {idx}, min(remaining, max(budget / 8, 0.05)))
        if smaller is not None:
            core = smaller
    return tuple(conflicts[i] for i in sorted(core, key=order.__getitem__))


def solve(
    inp: PlanningInput, options: SolveOptions | None = None, control: SolveControl | None = None
) -> SolveOutcome:
    """Solve the planning problem. CPU-bound: call it off the event loop."""
    options = options or SolveOptions()
    began = time.perf_counter()
    p = prepare(inp)

    def outcome(status: RunStatus, **kwargs: object) -> SolveOutcome:
        return SolveOutcome(
            status=status,
            solver=SOLVER_NAME,
            solver_version=SOLVER_VERSION,
            wall_seconds=time.perf_counter() - began,
            resources=p.resources,
            baseline=p.baseline,
            **kwargs,  # type: ignore[arg-type]
        )

    builder = _Builder(p, explain=False)
    v = builder.build()
    solver = _solver(options.time_limit_s, options.workers, options.random_seed)
    mapped = map_status(_run(builder.m, solver, control))

    if mapped in ("optimal", "feasible"):
        plan: dict[str, ScheduledTask] = {}
        for t in p.tasks.values():
            begin = solver.value(v.start[t.id])
            chosen = next(rid for rid, x in v.assign[t.id].items() if solver.boolean_value(x))
            plan[t.id] = ScheduledTask(t.id, begin, begin + t.duration_days, chosen)
        return outcome(
            mapped,
            plan=Plan(plan),
            objective=solver.objective_value,
            best_bound=solver.best_objective_bound,
            hit_time_limit=mapped == "feasible",
        )
    if mapped == "infeasible":
        return outcome("infeasible", conflicts=explain_infeasibility(p, options, control))
    if mapped == "timeout":
        return outcome(
            "timeout",
            hit_time_limit=True,
            message=(
                f"No feasible plan was found within "
                f"{fmt.plural(round(options.time_limit_s), 'second')}. "
                "Try again, or relax some hard constraints."
            ),
        )
    logger.error("cp-sat model invalid", extra={"validation": builder.m.validate()[:500]})
    return outcome("failed", message="The optimizer couldn't build a valid model for this project.")
