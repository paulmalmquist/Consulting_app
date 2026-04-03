"""Skill Candidate Miner — discovers emerging skill patterns from user behavior.

Analyzes recent conversations for:
  * Repeated prompt patterns (similar user messages)
  * Repeated toolchains (same sequence of tool calls)
  * Repeated failures (same tool failing the same way)
  * Confirmation patterns (actions users frequently confirm)

Writes discovered patterns to ``ai_skill_candidates`` for review.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from app.db import get_cursor

logger = logging.getLogger(__name__)


def mine_candidates(*, lookback_hours: int = 24) -> int:
    """Run all mining passes and return the number of new candidates found."""
    total = 0
    total += _mine_repeated_toolchains(lookback_hours)
    total += _mine_repeated_failures(lookback_hours)
    total += _mine_confirmation_patterns(lookback_hours)
    return total


def _mine_repeated_toolchains(hours: int) -> int:
    """Find tool sequences that appear in multiple conversations."""
    count = 0
    try:
        with get_cursor() as cur:
            # Get tool call sequences per gateway request
            cur.execute(
                """SELECT conversation_id,
                          tool_calls_json
                   FROM ai_gateway_logs
                   WHERE created_at > now() - interval '%s hours'
                     AND tool_call_count >= 2
                     AND tool_calls_json IS NOT NULL
                   ORDER BY created_at DESC
                   LIMIT 500""",
                (hours,),
            )
            rows = cur.fetchall()

            # Extract tool name sequences and count occurrences
            chain_counts: dict[str, dict[str, Any]] = {}
            for row in rows:
                tcs = row.get("tool_calls_json")
                if not tcs:
                    continue
                if isinstance(tcs, str):
                    try:
                        tcs = json.loads(tcs)
                    except Exception:
                        continue
                if not isinstance(tcs, list) or len(tcs) < 2:
                    continue

                names = [tc.get("name", "") for tc in tcs if isinstance(tc, dict)]
                chain_key = " -> ".join(names)
                sig = hashlib.md5(chain_key.encode()).hexdigest()

                if sig not in chain_counts:
                    chain_counts[sig] = {
                        "chain": chain_key,
                        "names": names,
                        "count": 0,
                        "conversations": [],
                    }
                chain_counts[sig]["count"] += 1
                chain_counts[sig]["conversations"].append(str(row["conversation_id"]))

            # Upsert candidates for chains appearing 3+ times
            for sig, data in chain_counts.items():
                if data["count"] < 3:
                    continue
                count += _upsert_candidate(
                    pattern_type="repeated_toolchain",
                    pattern_signature=sig,
                    sample_prompts=[],
                    sample_tool_chains=[data["chain"]],
                    occurrence_count=data["count"],
                )
    except Exception:
        logger.exception("Failed to mine repeated toolchains")
    return count


def _mine_repeated_failures(hours: int) -> int:
    """Find tools that fail the same way repeatedly."""
    count = 0
    try:
        with get_cursor() as cur:
            cur.execute(
                """SELECT tool_name,
                          error_message,
                          count(*) AS fail_count
                   FROM ai_tool_calls
                   WHERE created_at > now() - interval '%s hours'
                     AND success = false
                     AND error_message IS NOT NULL
                   GROUP BY tool_name, error_message
                   HAVING count(*) >= 3
                   ORDER BY count(*) DESC
                   LIMIT 20""",
                (hours,),
            )
            rows = cur.fetchall()
            for row in rows:
                sig = hashlib.md5(
                    f"{row['tool_name']}:{row['error_message'][:200]}".encode()
                ).hexdigest()
                count += _upsert_candidate(
                    pattern_type="repeated_failure",
                    pattern_signature=sig,
                    sample_prompts=[],
                    sample_tool_chains=[row["tool_name"]],
                    occurrence_count=row["fail_count"],
                    notes=row["error_message"][:500],
                )
    except Exception:
        logger.exception("Failed to mine repeated failures")
    return count


def _mine_confirmation_patterns(hours: int) -> int:
    """Find actions that users frequently confirm — these are good skill candidates."""
    count = 0
    try:
        with get_cursor() as cur:
            cur.execute(
                """SELECT action_type,
                          count(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
                          count(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
                          count(*) AS total_count
                   FROM ai_pending_actions
                   WHERE created_at > now() - interval '%s hours'
                   GROUP BY action_type
                   HAVING count(*) >= 3
                   ORDER BY count(*) DESC
                   LIMIT 20""",
                (hours,),
            )
            rows = cur.fetchall()
            for row in rows:
                sig = hashlib.md5(f"confirm:{row['action_type']}".encode()).hexdigest()
                count += _upsert_candidate(
                    pattern_type="confirmation_pattern",
                    pattern_signature=sig,
                    sample_prompts=[],
                    sample_tool_chains=[row["action_type"]],
                    occurrence_count=row["total_count"],
                    notes=f"confirmed={row['confirmed_count']} cancelled={row['cancelled_count']}",
                )
    except Exception:
        logger.exception("Failed to mine confirmation patterns")
    return count


def _upsert_candidate(
    *,
    pattern_type: str,
    pattern_signature: str,
    sample_prompts: list[str],
    sample_tool_chains: list[str],
    occurrence_count: int,
    notes: str | None = None,
) -> int:
    """Upsert a skill candidate.  Returns 1 if new, 0 if updated."""
    try:
        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO ai_skill_candidates (
                     pattern_type, pattern_signature,
                     sample_prompts, sample_tool_chains,
                     occurrence_count, notes, last_seen_at
                   ) VALUES (%s, %s, %s, %s, %s, %s, now())
                   ON CONFLICT (pattern_signature) DO UPDATE
                   SET occurrence_count = ai_skill_candidates.occurrence_count + EXCLUDED.occurrence_count,
                       last_seen_at = now(),
                       notes = COALESCE(EXCLUDED.notes, ai_skill_candidates.notes)
                   RETURNING (xmax = 0) AS is_insert""",
                (
                    pattern_type,
                    pattern_signature,
                    json.dumps(sample_prompts),
                    json.dumps(sample_tool_chains),
                    occurrence_count,
                    notes,
                ),
            )
            row = cur.fetchone()
            return 1 if row and row.get("is_insert") else 0
    except Exception:
        logger.exception("Failed to upsert skill candidate")
        return 0
