"""Daily load arithmetic shared by the solver and the explanations.

Load is measured in tenths of an hour per working day so CP-SAT can work
with integers: a task spreads its effort evenly over its duration, and a
person's daily capacity is their weekly capacity divided by the working days
per week.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

from app.optimization.calendar import week_workdays
from app.optimization.model import PlanningInput, Task

TENTHS = 10


def task_daily_tenths(task: Task) -> int:
    return math.ceil(task.hours * TENTHS / task.duration_days)


def daily_capacity_tenths(weekly_hours: float, per_week: int) -> int:
    return round(weekly_hours * TENTHS / per_week)


@dataclass(frozen=True, slots=True)
class Block:
    """Existing commitment: `tenths` per day on working days [lo, hi)."""

    lo: int
    hi: int
    tenths: int


def allocation_blocks(inp: PlanningInput) -> dict[str, list[Block]]:
    """Other-project allocations as per-day load blocks, per employee.

    Weeks before the project start are dropped. A week's hours are spread
    evenly over its working days. The load is capped at the person's daily
    capacity: over-commitment elsewhere is not this project's to fix, and
    would otherwise make a hard capacity constraint unsatisfiable on its own.
    """
    per_week = inp.constraints.working_days_per_week
    capacity = {
        e.id: daily_capacity_tenths(e.weekly_capacity_hours, per_week) for e in inp.employees
    }
    weekly: dict[str, dict[tuple[int, int], float]] = defaultdict(lambda: defaultdict(float))
    for a in inp.allocations:
        if a.employee_id not in capacity or a.hours <= 0:
            continue
        lo, hi = week_workdays(inp.start_date, a.week_start, per_week)
        if hi > lo:
            weekly[a.employee_id][(lo, hi)] += a.hours
    blocks: dict[str, list[Block]] = {}
    for emp, weeks in weekly.items():
        out = []
        for (lo, hi), hours in sorted(weeks.items()):
            tenths = min(math.ceil(hours * TENTHS / per_week), capacity[emp])
            if tenths > 0:
                out.append(Block(lo, hi, tenths))
        if out:
            blocks[emp] = out
    return blocks
