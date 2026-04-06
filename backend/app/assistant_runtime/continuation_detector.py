"""Continuation detector — identifies slot-filling responses to pending queries.

A user message is a continuation if:
  1. A pending query exists for this thread, AND
  2. The message looks like a slot-filling response rather than a new question.

Slot-filling signals:
  - Affirmatives: "yes", "yeah", "ok", "sure", "go ahead", "confirmed", "please"
  - Quarter references: "2026Q1", "Q1 2026", "latest", "most recent", "current"
  - Metric names: "noi", "irr", "tvpi", "dpi", etc.
  - Short numeric inputs: "10", "24", "5"
  - Short phrases (≤ 4 words) that don't start a new question
"""
from __future__ import annotations

import re
from typing import Any

from app.assistant_runtime.pending_query import (
    clear_pending_query,
    get_pending_query,
    set_pending_query,
)

# ── Patterns ─────────────────────────────────────────────────────────

_AFFIRMATIVE_RE = re.compile(
    r"^(yes|yeah|yep|sure|ok|okay|do it|go ahead|confirmed?|please|sounds good|looks good)\b",
    re.IGNORECASE,
)

_NEGATIVE_RE = re.compile(
    r"^(no|nope|cancel|never mind|nevermind|stop|skip)\b",
    re.IGNORECASE,
)

_QUARTER_RE = re.compile(
    r"^(20\d{2}Q[1-4]|Q[1-4]\s*20\d{2}|latest|most recent|current|newest|last quarter|this quarter)\b",
    re.IGNORECASE,
)

_NUMERIC_RE = re.compile(r"^\d+$")

_METRIC_NAMES: frozenset[str] = frozenset({
    "noi", "irr", "tvpi", "dpi", "dscr", "ltv", "nav", "occupancy",
    "gross irr", "net irr", "rvpi", "revenue", "budget", "debt yield",
    "cap rate", "ncf", "occupancy rate", "ttm noi", "trailing noi",
})

_NEW_QUESTION_STARTERS = re.compile(
    r"^(what|which|who|where|when|how|show|list|give|get|find|compare|rank|tell)",
    re.IGNORECASE,
)


# ── Public API ────────────────────────────────────────────────────────

def is_continuation(message: str, thread_id: str) -> bool:
    """Return True if this message should resume a pending query rather than start fresh."""
    pq = get_pending_query(thread_id)
    if pq is None:
        return False

    q = message.strip()
    lower = q.lower()

    # Explicit new question — never treat as continuation
    if _NEW_QUESTION_STARTERS.match(q) and len(q.split()) > 4:
        return False

    # Affirmative/negative slot completion — but only if the message is short.
    # "yes" alone = continuation. "yes breakdown of current holdings" = new intent.
    word_count = len(q.split())
    if _NEGATIVE_RE.match(lower):
        return True
    if _AFFIRMATIVE_RE.match(lower) and word_count <= 3:
        return True

    # Quarter reference
    if _QUARTER_RE.match(lower):
        return True

    # Pure number (e.g. limit, months_ahead)
    if _NUMERIC_RE.match(lower):
        return True

    # Metric name (exact or phrase match, ≤ 4 words)
    if len(q.split()) <= 4:
        if lower in _METRIC_NAMES or any(m in lower for m in _METRIC_NAMES):
            return True

    # Short phrase that doesn't start a new question (≤ 3 words)
    if len(q.split()) <= 3 and not _NEW_QUESTION_STARTERS.match(q):
        return True

    return False


def is_cancellation(message: str) -> bool:
    """Return True if the user wants to cancel the pending query."""
    return bool(_NEGATIVE_RE.match(message.strip().lower()))


def resolve_continuation(message: str, thread_id: str) -> dict[str, Any] | None:
    """Apply a continuation message to the pending query's next missing slot.

    Returns {"template_key": ..., "params": ...} when all slots are filled.
    Returns None if more slots are still needed.
    Clears the pending query on completion or cancellation.
    """
    pq = get_pending_query(thread_id)
    if pq is None:
        return None

    # User cancelled
    if is_cancellation(message):
        clear_pending_query(thread_id)
        return {"cancelled": True, "template_key": pq.template_key}

    if not pq.missing_slots:
        clear_pending_query(thread_id)
        return {"template_key": pq.template_key, "params": pq.params}

    slot = pq.missing_slots[0]
    value = _extract_slot_value(message, slot)
    pq.params[slot] = value
    pq.missing_slots = pq.missing_slots[1:]

    if not pq.missing_slots:
        clear_pending_query(thread_id)
        return {"template_key": pq.template_key, "params": pq.params}

    # More slots needed — persist updated state, return None
    set_pending_query(thread_id, pq)
    return None


# ── Internal helpers ──────────────────────────────────────────────────

def _extract_slot_value(message: str, slot: str) -> Any:
    """Extract a typed value for the given slot from the user message."""
    text = message.strip()
    lower = text.lower()

    if slot == "quarter":
        # Normalize quarter references
        if _QUARTER_RE.match(lower) and "latest" not in lower and "recent" not in lower \
                and "current" not in lower and "quarter" not in lower:
            # Looks like an explicit quarter — normalize casing
            return text.upper().replace(" ", "")
        # "latest" / "most recent" / "current" → None (let SQL use MAX)
        return None

    if slot in ("limit", "months_ahead"):
        try:
            return int(re.search(r"\d+", text).group())
        except (AttributeError, ValueError):
            return None

    if slot == "metric":
        # Return the normalized metric name
        for name in sorted(_METRIC_NAMES, key=len, reverse=True):
            if name in lower:
                return name.replace(" ", "_")
        return lower

    # Generic: return the raw text
    return text
