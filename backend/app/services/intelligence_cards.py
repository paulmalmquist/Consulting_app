"""Intelligence Card System service — the living-feed data model (plan PR 4, Phase 2).

A card represents a unit of the executive intelligence feed (dashboard, report, story,
investigation, forecast, finding, or alert). PR 4 is the data model + CRUD only: no
home-page wiring, no agents/investigations/analyzers producing cards yet.

Operational state only: priority_score + anomaly_flag order the feed. Engagement
analytics are a future BigQuery concern, not more Postgres columns.

RLS: every statement issues `SET LOCAL app.env_id` (via set_config) so the
nv_intel_cards tenant policy passes. Reads and writes are env-scoped.
"""
from __future__ import annotations

import hashlib
import json
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log

CARD_TYPES = {"dashboard", "report", "story", "investigation", "forecast", "finding", "alert"}
CREATED_BY_PATTERN_HINT = "'system' | 'user' | 'agent:<type>' | 'autopilot'"


def _source_ref_key(source_ref: dict | None) -> str:
    """Deterministic key for idempotent upsert. Stable across dict key ordering."""
    canonical = json.dumps(source_ref or {}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _set_tenant(cur, env_id: str) -> None:
    cur.execute("SELECT set_config('app.env_id', %s, true)", (env_id,))


def _row_to_dict(r: dict) -> dict:
    return {
        "id": str(r["id"]),
        "card_type": r["card_type"],
        "title": r["title"],
        "summary": r["summary"],
        "source_ref": r["source_ref"],
        "priority_score": r["priority_score"],
        "anomaly_flag": r["anomaly_flag"],
        "created_by": r["created_by"],
        "is_dismissed": r["is_dismissed"],
        "last_updated_at": r["last_updated_at"].isoformat() if r.get("last_updated_at") else None,
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
    }


def upsert_card(
    env_id: str,
    business_id: str | UUID,
    *,
    card_type: str,
    title: str,
    summary: str | None = None,
    source_ref: dict | None = None,
    priority_score: float = 0.0,
    anomaly_flag: bool = False,
    created_by: str | None = "system",
) -> dict:
    """Create or update a card, idempotent by (env_id, source_ref).

    A second call with the same env_id + source_ref updates the existing row
    (title/summary/priority/anomaly/last_updated_at) rather than inserting a duplicate.
    """
    if card_type not in CARD_TYPES:
        raise ValueError(f"Unknown card_type: {card_type}")
    if not title or not title.strip():
        raise ValueError("title is required")
    key = _source_ref_key(source_ref)
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            """INSERT INTO nv_intel_cards
                   (env_id, business_id, card_type, title, summary, source_ref, source_ref_key,
                    priority_score, anomaly_flag, created_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (env_id, source_ref_key) DO UPDATE SET
                   card_type = EXCLUDED.card_type,
                   title = EXCLUDED.title,
                   summary = EXCLUDED.summary,
                   priority_score = EXCLUDED.priority_score,
                   anomaly_flag = EXCLUDED.anomaly_flag,
                   last_updated_at = now()
               RETURNING id, card_type, title, summary, source_ref, priority_score,
                         anomaly_flag, created_by, is_dismissed, last_updated_at, created_at""",
            (
                env_id, str(business_id), card_type, title.strip(), summary,
                json.dumps(source_ref or {}), key, priority_score, anomaly_flag, created_by,
            ),
        )
        return _row_to_dict(cur.fetchone())


def list_cards(
    env_id: str,
    business_id: str | UUID,
    *,
    limit: int = 50,
    include_dismissed: bool = False,
    card_type: str | None = None,
) -> list[dict]:
    """List cards for an env, anomaly + highest priority + most recent first."""
    conditions = ["env_id = %s"]
    params: list = [env_id]
    if not include_dismissed:
        conditions.append("is_dismissed = false")
    if card_type:
        if card_type not in CARD_TYPES:
            raise ValueError(f"Unknown card_type: {card_type}")
        conditions.append("card_type = %s")
        params.append(card_type)
    where = " AND ".join(conditions)
    params.append(limit)
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            f"""SELECT id, card_type, title, summary, source_ref, priority_score,
                       anomaly_flag, created_by, is_dismissed, last_updated_at, created_at
                FROM nv_intel_cards
                WHERE {where}
                ORDER BY anomaly_flag DESC, priority_score DESC, last_updated_at DESC
                LIMIT %s""",
            params,
        )
        return [_row_to_dict(r) for r in cur.fetchall()]


def dismiss_card(env_id: str, business_id: str | UUID, card_id: str | UUID) -> dict | None:
    """Soft-dismiss a card so it drops out of the default feed. Returns updated row or None."""
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            """UPDATE nv_intel_cards
               SET is_dismissed = true, last_updated_at = now()
               WHERE env_id = %s AND id = %s
               RETURNING id, card_type, title, summary, source_ref, priority_score,
                         anomaly_flag, created_by, is_dismissed, last_updated_at, created_at""",
            (env_id, str(card_id)),
        )
        row = cur.fetchone()
        return _row_to_dict(row) if row else None


def bump_priority(env_id: str, business_id: str | UUID, card_id: str | UUID, delta: float) -> dict | None:
    """Adjust a card's priority (float-up when an anomaly fires). Clamped to [0, 1].

    Event-triggered mechanism only — PR 4 ships the lever, not the callers.
    """
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            """UPDATE nv_intel_cards
               SET priority_score = LEAST(1.0, GREATEST(0.0, priority_score + %s)),
                   last_updated_at = now()
               WHERE env_id = %s AND id = %s
               RETURNING id, card_type, title, summary, source_ref, priority_score,
                         anomaly_flag, created_by, is_dismissed, last_updated_at, created_at""",
            (delta, env_id, str(card_id)),
        )
        row = cur.fetchone()
        if not row:
            emit_log(level="warning", service="intelligence_cards", action="bump_missing",
                     message=f"card {card_id} not found for env {env_id}")
        return _row_to_dict(row) if row else None
