"""Receipt review queue — open action items with a next_action string.

Every unresolved parse/match/classification condition produces exactly one
open review item. The UI surfaces these in the 'Needs Attention' queue and
the right-rail intake panel.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.db import get_cursor


def build_review_item(
    *,
    env_id: str,
    business_id: str,
    intake_id: str,
    reason: str,
    next_action: str,
    notes: str | None = None,
) -> str:
    """Insert-or-return: one open item per (intake_id, reason)."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id FROM nv_receipt_review_item
             WHERE intake_id = %s::uuid AND reason = %s AND status = 'open'
             LIMIT 1
            """,
            (intake_id, reason),
        )
        existing = cur.fetchone()
        if existing:
            return str(existing["id"])

        cur.execute(
            """
            INSERT INTO nv_receipt_review_item
              (env_id, business_id, intake_id, reason, next_action, notes, status)
            VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, 'open')
            RETURNING id
            """,
            (env_id, business_id, intake_id, reason, next_action, notes),
        )
        return str(cur.fetchone()["id"])


def list_review_items(
    *, env_id: str, business_id: str, status: str = "open", limit: int = 100,
) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT ri.id, ri.intake_id, ri.reason, ri.next_action, ri.status,
                   ri.created_at, ri.resolved_at,
                   i.original_filename, i.file_hash,
                   p.merchant_raw, p.vendor_normalized, p.billing_platform,
                   p.service_name_guess, p.total, p.currency, p.transaction_date,
                   p.confidence_overall
              FROM nv_receipt_review_item ri
              JOIN nv_receipt_intake i ON i.id = ri.intake_id
         LEFT JOIN LATERAL (
                SELECT * FROM nv_receipt_parse_result
                 WHERE intake_id = ri.intake_id
                 ORDER BY created_at DESC LIMIT 1
              ) p ON true
             WHERE ri.env_id = %s AND ri.business_id = %s::uuid
               AND ri.status = %s
             ORDER BY ri.created_at DESC
             LIMIT %s
            """,
            (env_id, business_id, status, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def resolve_review_item(
    *,
    env_id: str,
    business_id: str,
    item_id: str,
    resolved_by: str | None = None,
    notes: str | None = None,
) -> bool:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE nv_receipt_review_item
               SET status = 'resolved',
                   resolved_at = %s,
                   resolved_by = COALESCE(%s, resolved_by),
                   notes = COALESCE(%s, notes)
             WHERE id = %s::uuid AND env_id = %s AND business_id = %s::uuid
             RETURNING id
            """,
            (datetime.now(timezone.utc), resolved_by, notes, item_id, env_id, business_id),
        )
        return cur.fetchone() is not None


def defer_review_item(*, env_id: str, business_id: str, item_id: str) -> bool:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE nv_receipt_review_item
               SET status = 'deferred'
             WHERE id = %s::uuid AND env_id = %s AND business_id = %s::uuid
             RETURNING id
            """,
            (item_id, env_id, business_id),
        )
        return cur.fetchone() is not None
