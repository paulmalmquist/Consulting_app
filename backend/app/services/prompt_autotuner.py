"""Prompt policy autotuner — Layer 5 (feedback loop, actionable path).

v1: scans ``v_ai_prompt_health`` for the last 24h and writes policy-change
proposals into ``ai_prompt_policy_proposals`` for human review. Humans read
the proposals via ``/api/admin/ai/prompt-policy-proposals``, decide, and
manually update ``backend/app/services/lane_policy.py``.

v2 (future, not implemented): optionally auto-apply approved proposals via
a DB-backed override table that ``lane_policy.get_policy`` reads from.

Feature-gated by ``WINSTON_AUTOTUNER_ENABLED`` (default false). The schema is
created in migration 10000 so v2 can write to the same table without another
migration.

Call ``evaluate_and_propose()`` on a cron (or manually). Never raises.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from app.db import get_cursor
from app.services.lane_policy import get_policy

logger = logging.getLogger(__name__)


def is_enabled() -> bool:
    return os.getenv("WINSTON_AUTOTUNER_ENABLED", "false").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


# Thresholds are intentionally conservative in v1. If humans find the
# autotuner is under-reacting, tune these up; if it's noisy, tune them down.
_MIN_TURNS = 20
_RAG_OVERUSE_SHARE = 0.3
_HISTORY_STARVATION_SHARE = 0.3
_CONTEXT_BLOAT_SHARE = 0.2


def evaluate_and_propose(*, window_hours: int = 24) -> list[dict[str, Any]]:
    """Scan recent health metrics and write proposals to the review queue.

    Returns the list of proposals written. Returns an empty list when the
    autotuner is disabled or when no signal was strong enough to act on.
    """
    if not is_enabled():
        return []
    try:
        with get_cursor() as cur:
            cur.execute(
                """SELECT env_id, composition_profile,
                          SUM(turns)                     AS turns,
                          SUM(rag_overuse_count)         AS rag_overuse,
                          SUM(history_starvation_count)  AS history_starvation,
                          SUM(context_bloat_count)       AS context_bloat,
                          SUM(crowd_out_count)           AS crowd_out,
                          SUM(hard_overflow_count)       AS hard_overflow
                     FROM v_ai_prompt_health
                    WHERE bucket >= now() - (%s::text || ' hours')::interval
                    GROUP BY env_id, composition_profile""",
                (str(int(window_hours)),),
            )
            rows = cur.fetchall() or []
    except Exception:
        logger.exception("autotuner failed to read health view")
        return []

    proposals: list[dict[str, Any]] = []
    for row in rows:
        turns = int(row.get("turns") or 0) if isinstance(row, dict) else int(row[2] or 0)
        if turns < _MIN_TURNS:
            continue
        env_id = row.get("env_id") if isinstance(row, dict) else row[0]
        profile = row.get("composition_profile") if isinstance(row, dict) else row[1]
        # Profiles map to lanes via their force_lane; use the profile name
        # as the knob owner. For v1 we propose changes to the lane the
        # profile forces, as read from LANE_POLICY.
        lane = _profile_to_lane(profile)
        if not lane:
            continue
        current = get_policy(lane).to_dict()

        def _metric(name: str) -> int:
            if isinstance(row, dict):
                return int(row.get(name) or 0)
            return 0

        rag_overuse = _metric("rag_overuse")
        history_starvation = _metric("history_starvation")
        context_bloat = _metric("context_bloat")
        hard_overflow = _metric("hard_overflow")

        if turns and rag_overuse / turns > _RAG_OVERUSE_SHARE and current["max_rag_chunks"] > 1:
            proposed = dict(current)
            proposed["max_rag_chunks"] = max(1, current["max_rag_chunks"] - 1)
            proposals.append(
                _write_proposal(
                    env_id=env_id,
                    reason=f"rag_overuse: {rag_overuse}/{turns} turns on {profile}/{lane}",
                    metrics={"turns": turns, "rag_overuse": rag_overuse},
                    current=current,
                    proposed=proposed,
                    window_hours=window_hours,
                )
            )

        if turns and history_starvation / turns > _HISTORY_STARVATION_SHARE:
            proposed = dict(current)
            proposed["max_history_turns"] = current["max_history_turns"] + 2
            proposals.append(
                _write_proposal(
                    env_id=env_id,
                    reason=f"history_starvation: {history_starvation}/{turns} turns on {profile}/{lane}",
                    metrics={"turns": turns, "history_starvation": history_starvation},
                    current=current,
                    proposed=proposed,
                    window_hours=window_hours,
                )
            )

        if turns and context_bloat / turns > _CONTEXT_BLOAT_SHARE:
            proposals.append(
                _write_proposal(
                    env_id=env_id,
                    reason=f"context_bloat: {context_bloat}/{turns} turns on {profile}/{lane}",
                    metrics={"turns": turns, "context_bloat": context_bloat},
                    current=current,
                    proposed=current,  # no numeric proposal; this is an alert, not a tune
                    window_hours=window_hours,
                )
            )

        if hard_overflow > 0:
            proposed = dict(current)
            proposed["total_budget"] = int(current["total_budget"] * 1.2)
            proposals.append(
                _write_proposal(
                    env_id=env_id,
                    reason=f"hard_overflow: {hard_overflow} on {profile}/{lane}",
                    metrics={"turns": turns, "hard_overflow": hard_overflow},
                    current=current,
                    proposed=proposed,
                    window_hours=window_hours,
                )
            )

    return [p for p in proposals if p]


def _profile_to_lane(profile: str | None) -> str | None:
    """Map composition_profile → LANE_POLICY key. Best-effort."""
    if not profile:
        return None
    mapping = {
        "simple_lookup": "A",
        "entity_question": "B",
        "analysis": "C",
        "lp_summary": "C",
        "create_entity": "C",
        "deep_reasoning": "D",
        "default": "B",
    }
    return mapping.get(profile)


def _write_proposal(
    *,
    env_id: Any,
    reason: str,
    metrics: dict[str, Any],
    current: dict[str, Any],
    proposed: dict[str, Any],
    window_hours: int,
) -> dict[str, Any] | None:
    try:
        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO ai_prompt_policy_proposals (
                        proposed_by, reason, signal_window, signal_metrics,
                        current_policy, proposed_policy, status
                    ) VALUES (%s, %s, %s, %s, %s, %s, 'pending')
                    RETURNING id""",
                (
                    "autotuner",
                    reason,
                    f"last_{int(window_hours)}h",
                    json.dumps({"env_id": str(env_id) if env_id else None, **metrics}),
                    json.dumps(current),
                    json.dumps(proposed),
                ),
            )
            row = cur.fetchone()
            proposal_id = (
                str(row.get("id")) if isinstance(row, dict) and row else (str(row[0]) if row else None)
            )
        return {
            "id": proposal_id,
            "reason": reason,
            "metrics": metrics,
            "current_policy": current,
            "proposed_policy": proposed,
        }
    except Exception:
        logger.exception("failed to write policy proposal")
        return None
