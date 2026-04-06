"""Pending query state — tracks incomplete read intents awaiting parameter completion.

Separate from ai_pending_actions (write confirmations). Handles slot-filling for:
- "Which quarter?" → "2026Q1"
- "Which metric?" → "NOI"
- "Want me to pull that?" → "yes"

The store is in-process per worker. For multi-worker deployments the state naturally
re-prompts on the next turn — acceptable for read queries.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PendingQuery:
    template_key: str              # e.g. "repe.irr_ranked"
    params: dict[str, Any]         # already-resolved params
    missing_slots: list[str]       # params still needed, in order
    prompt: str                    # the original user prompt
    clarification_asked: str       # what Winston asked ("Which quarter?")

    # Per-slot prompts shown to user, keyed by slot name
    slot_prompts: dict[str, str] = field(default_factory=dict)


# ── In-memory store keyed by thread_id ───────────────────────────────

_store: dict[str, PendingQuery] = {}


def set_pending_query(thread_id: str, pq: PendingQuery) -> None:
    """Store a pending query for a thread."""
    _store[thread_id] = pq


def get_pending_query(thread_id: str) -> PendingQuery | None:
    """Return the pending query for a thread, or None."""
    return _store.get(thread_id)


def clear_pending_query(thread_id: str) -> None:
    """Remove any pending query for a thread."""
    _store.pop(thread_id, None)


# ── Slot prompt defaults ─────────────────────────────────────────────

SLOT_PROMPTS: dict[str, str] = {
    "quarter": "Which quarter? (e.g. 2026Q1, or say 'latest')",
    "metric": "Which metric? (e.g. NOI, occupancy, DSCR, LTV, IRR)",
    "limit": "How many results? (default: 10)",
    "months_ahead": "How many months ahead? (default: 24)",
    "asset_id": "Which asset?",
    "fund_id": "Which fund?",
}


def clarification_for_slot(slot: str) -> str:
    return SLOT_PROMPTS.get(slot, f"Please provide a value for '{slot}'.")
