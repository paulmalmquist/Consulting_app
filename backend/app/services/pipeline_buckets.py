"""Canonical action-view bucketer for the Pipeline operating surface.

Single source of truth for Today/Overdue/This Week/Waiting/Blocked buckets.
Called by the execution board (to tag cards with `action_view_bucket`) and
by the right-rail aggregations (`today_moves`, `risks_summary`) so board
columns and rail summaries cannot drift.

Rule order (canonical, mirrored client-side in board.tsx as fallback only):

1. `risk_flags` contains 'snoozed' OR `snoozed_until > now()`  -> 'blocked'
2. `momentum_status == 'declining'` OR `risk_flags` contains 'waiting_reply'
     -> 'waiting'
3. `next_action_due IS NULL` AND `risk_flags` contains 'no_next_action'
     -> 'overdue'   (missing action counted as already late)
4. `next_action_due < today` -> 'overdue'
5. `next_action_due == today` -> 'today'
6. `next_action_due <= today + 7` -> 'this_week'
7. else -> 'this_week'
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any


ActionBucket = str  # 'today' | 'overdue' | 'this_week' | 'waiting' | 'blocked'


def _to_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
            except ValueError:
                return None
    return None


def _to_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def bucket_for_action_view(card: dict[str, Any]) -> ActionBucket:
    """Return the canonical action-view bucket for a pipeline card.

    `card` is expected to carry (same shape as cro-api ExecutionCard):
      - risk_flags: list[str]
      - momentum_status: 'increasing' | 'flat' | 'declining'
      - next_action_due: date | datetime | iso-str | None
      - snoozed_until (optional): datetime | iso-str | None
    """
    risk_flags = card.get("risk_flags") or []
    momentum = card.get("momentum_status") or "flat"

    snoozed_until = _to_datetime(card.get("snoozed_until"))
    now = datetime.now(timezone.utc)
    if "snoozed" in risk_flags or (snoozed_until is not None and snoozed_until > now):
        return "blocked"

    if momentum == "declining" or "waiting_reply" in risk_flags:
        return "waiting"

    due = _to_date(card.get("next_action_due"))
    if due is None:
        if "no_next_action" in risk_flags or not card.get("next_action_description"):
            return "overdue"
        return "this_week"

    today = date.today()
    if due < today:
        return "overdue"
    if due == today:
        return "today"
    if (due - today).days <= 7:
        return "this_week"
    return "this_week"


def attach_buckets(columns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Tag each card in-place with `action_view_bucket`. Returns the columns."""
    for col in columns:
        for card in col.get("cards", []):
            card["action_view_bucket"] = bucket_for_action_view(card)
    return columns
