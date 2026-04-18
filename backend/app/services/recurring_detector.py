"""Detect recurring cadence + amount shifts across subscription occurrences."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any


def _parse_date(iso: str) -> date | None:
    try:
        return datetime.fromisoformat(iso).date()
    except (TypeError, ValueError):
        return None


def _cadence_from_deltas(days: list[int]) -> str:
    if not days:
        return "unknown"
    avg = sum(days) / len(days)
    if 25 <= avg <= 35:
        return "monthly"
    if 350 <= avg <= 380:
        return "annual"
    if avg < 25:
        return "usage"
    return "unknown"


def detect_cadence(occurrences: list[dict[str, Any]]) -> str:
    dates = sorted(d for d in (_parse_date(o.get("billing_date", "")) for o in occurrences) if d)
    if len(dates) < 2:
        return "unknown"
    deltas = [(b - a).days for a, b in zip(dates, dates[1:])]
    return _cadence_from_deltas(deltas)


def amount_shift_pct(occurrences: list[dict[str, Any]]) -> float | None:
    if len(occurrences) < 2:
        return None
    by_date = sorted(occurrences, key=lambda o: o.get("billing_date", ""))
    prev = float(by_date[-2].get("amount") or 0) or 1.0
    latest = float(by_date[-1].get("amount") or 0)
    return round((latest - prev) / prev * 100, 2)


def next_projected(occurrences: list[dict[str, Any]], cadence: str) -> str | None:
    if not occurrences:
        return None
    latest = max((_parse_date(o["billing_date"]) for o in occurrences if _parse_date(o.get("billing_date", ""))), default=None)
    if not latest:
        return None
    if cadence == "monthly":
        # Naive: next month same day, clamped to 28
        month = latest.month + 1
        year = latest.year + (1 if month > 12 else 0)
        month = month if month <= 12 else 1
        day = min(latest.day, 28)
        return f"{year:04d}-{month:02d}-{day:02d}"
    if cadence == "annual":
        return f"{latest.year + 1:04d}-{latest.month:02d}-{latest.day:02d}"
    return None
