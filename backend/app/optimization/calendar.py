"""Working-day calendar.

Durations and lags are working days. With `working_days_per_week = n` the
working days are the first n weekdays (5 = Mon-Fri, 6 = Mon-Sat, 7 = every
day). Holidays are not modelled. Day index 0 is the first working day on or
after the project start date.
"""

from __future__ import annotations

from datetime import date, timedelta


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def first_workday(start: date, per_week: int) -> date:
    d = start
    while d.weekday() >= per_week:
        d += timedelta(days=1)
    return d


def workday_date(start: date, index: int, per_week: int) -> date:
    """Calendar date of working day `index` (0-based)."""
    first = first_workday(start, per_week)
    weeks, offset = divmod(first.weekday() + max(index, 0), per_week)
    return _monday(first) + timedelta(days=7 * weeks + offset)


def workdays_through(start: date, until: date, per_week: int) -> int:
    """Number of working days from the start up to and including `until`.

    A task occupying working days [s, e) finishes on or before `until`
    exactly when `e <= workdays_through(start, until)`.
    """
    first = first_workday(start, per_week)
    if until < first:
        return 0
    weeks = (_monday(until) - _monday(first)).days // 7
    return weeks * per_week + min(until.weekday() + 1, per_week) - first.weekday()


def week_index(start: date, d: date) -> int:
    """0-based calendar week of `d`, counting from the week containing the start."""
    return (_monday(d) - _monday(start)).days // 7


def week_workdays(start: date, week_start: date, per_week: int) -> tuple[int, int]:
    """Working-day index range [lo, hi) that falls in the calendar week of `week_start`."""
    monday = _monday(week_start)
    lo = workdays_through(start, monday - timedelta(days=1), per_week)
    hi = workdays_through(start, monday + timedelta(days=6), per_week)
    return lo, hi
