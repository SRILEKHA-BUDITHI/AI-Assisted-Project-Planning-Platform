"""Baseline ("before optimization") plan, plan.md §6.5.

Forward pass: every task starts as early as its dependencies allow, keeps its
current owner, and capacity is ignored (no levelling). Because it ignores
resources it is also a lower bound on every task's start in any feasible
plan, which the solver relies on.
"""

from __future__ import annotations

from app.optimization.model import Dependency, Plan, PlanningInput, ScheduledTask


def dependency_offset(dep: Dependency, pred_duration: int, succ_duration: int) -> int:
    """`w` such that the dependency means `start(succ) >= start(pred) + w`.

    FS: succ starts after pred finishes; SS: after pred starts; FF: succ
    finishes after pred finishes; SF: succ finishes after pred starts. The
    lag (working days, may be negative) is added in every case.
    """
    match dep.type:
        case "FS":
            return pred_duration + dep.lag_days
        case "SS":
            return dep.lag_days
        case "FF":
            return pred_duration + dep.lag_days - succ_duration
        case "SF":
            return dep.lag_days - succ_duration


def task_dependencies(inp: PlanningInput) -> list[Dependency]:
    """Dependencies whose both ends are tasks in the input (others are ignored)."""
    ids = {t.id for t in inp.tasks}
    return [
        d
        for d in inp.dependencies
        if d.predecessor_id in ids and d.successor_id in ids and d.predecessor_id != d.successor_id
    ]


def earliest_starts(inp: PlanningInput) -> dict[str, int]:
    """Longest-path earliest starts (Bellman-Ford style, so cycles can't hang it)."""
    duration = {t.id: t.duration_days for t in inp.tasks}
    deps = task_dependencies(inp)
    start = dict.fromkeys(duration, 0)
    for _ in range(len(duration)):
        changed = False
        for d in deps:
            w = dependency_offset(d, duration[d.predecessor_id], duration[d.successor_id])
            candidate = start[d.predecessor_id] + w
            if candidate > start[d.successor_id]:
                start[d.successor_id] = candidate
                changed = True
        if not changed:
            break
    return start


def baseline_plan(inp: PlanningInput) -> Plan:
    employees = {e.id for e in inp.employees}
    start = earliest_starts(inp)
    return Plan(
        tasks={
            t.id: ScheduledTask(
                task_id=t.id,
                start=start[t.id],
                end=start[t.id] + t.duration_days,
                resource_id=t.owner_id if t.owner_id in employees else None,
            )
            for t in inp.tasks
        }
    )
