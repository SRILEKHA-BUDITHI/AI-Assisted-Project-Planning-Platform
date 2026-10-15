"""Display strings, matching what the Optimization Results screen shows."""

from __future__ import annotations

from datetime import date

EN_DASH = chr(0x2013)


def money(cents: int | float) -> str:
    """`$361,200` (whole dollars, rounded half away from zero)."""
    dollars = int(abs(cents) / 100 + 0.5)
    return f"{'-' if cents < 0 and dollars else ''}${dollars:,}"


def day(d: date) -> str:
    """`Oct 14, 2025` (portable: no platform-specific strftime flags)."""
    return f"{d:%b} {d.day}, {d.year}"


def plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def weeks_label(first_week: int, last_week: int) -> str:
    """`Wk 3-6` (with an en dash, as the UI shows) from 0-based week indices."""
    if first_week == last_week:
        return f"Wk {first_week + 1}"
    return f"Wk {first_week + 1}{EN_DASH}{last_week + 1}"


def shift(days: int, per_week: int) -> str:
    """`+2w`, `-3d`, `+1.5w`, or `—` for no change."""
    if days == 0:
        return "—"
    sign = "+" if days > 0 else "-"
    n = abs(days)
    if n < per_week:
        return f"{sign}{n}d"
    weeks = n / per_week
    text = f"{weeks:.0f}" if n % per_week == 0 else f"{weeks:.1f}"
    return f"{sign}{text}w"
