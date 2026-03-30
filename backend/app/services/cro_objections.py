"""Consulting Revenue OS – Objection tracking service.

CRUD for product feedback and sales objections.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor


def list_objections(
    *,
    env_id: str,
    business_id: UUID,
    outcome_filter: str | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        sql = """
            SELECT o.id, o.env_id, o.business_id, o.crm_account_id,
                   o.crm_opportunity_id, o.objection_type, o.summary,
                   o.source_conversation, o.response_strategy, o.confidence,
                   o.outcome, o.linked_feature_gap, o.linked_offer_type,
                   o.detected_at, o.resolved_at, o.created_at,
                   a.name AS account_name
              FROM cro_objection o
              LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
             WHERE o.env_id = %s AND o.business_id = %s
        """
        params: list = [env_id, str(business_id)]
        if outcome_filter:
            sql += " AND o.outcome = %s"
            params.append(outcome_filter)
        sql += " ORDER BY o.detected_at DESC"
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def create_objection(
    *,
    env_id: str,
    business_id: UUID,
    objection_type: str,
    summary: str,
    crm_account_id: UUID | None = None,
    crm_opportunity_id: UUID | None = None,
    source_conversation: str | None = None,
    response_strategy: str | None = None,
    confidence: int | None = None,
    linked_feature_gap: str | None = None,
    linked_offer_type: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_objection
              (env_id, business_id, crm_account_id, crm_opportunity_id,
               objection_type, summary, source_conversation, response_strategy,
               confidence, linked_feature_gap, linked_offer_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, env_id, business_id, crm_account_id, crm_opportunity_id,
                      objection_type, summary, source_conversation, response_strategy,
                      confidence, outcome, linked_feature_gap, linked_offer_type,
                      detected_at, resolved_at, created_at
            """,
            (
                env_id, str(business_id),
                str(crm_account_id) if crm_account_id else None,
                str(crm_opportunity_id) if crm_opportunity_id else None,
                objection_type, summary, source_conversation,
                response_strategy, confidence,
                linked_feature_gap, linked_offer_type,
            ),
        )
        return dict(cur.fetchone())


def update_objection(
    *,
    objection_id: UUID,
    outcome: str | None = None,
    response_strategy: str | None = None,
    confidence: int | None = None,
) -> dict | None:
    sets: list[str] = []
    params: list = []
    if outcome is not None:
        sets.append("outcome = %s")
        params.append(outcome)
        if outcome in ("overcome", "lost"):
            sets.append("resolved_at = %s")
            params.append(datetime.now(timezone.utc))
    if response_strategy is not None:
        sets.append("response_strategy = %s")
        params.append(response_strategy)
    if confidence is not None:
        sets.append("confidence = %s")
        params.append(confidence)

    if not sets:
        return None

    params.append(str(objection_id))
    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE cro_objection
               SET {', '.join(sets)}
             WHERE id = %s
            RETURNING id, env_id, business_id, crm_account_id, crm_opportunity_id,
                      objection_type, summary, source_conversation, response_strategy,
                      confidence, outcome, linked_feature_gap, linked_offer_type,
                      detected_at, resolved_at, created_at
            """,
            params,
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_top_objections(
    *,
    env_id: str,
    business_id: UUID,
    limit: int = 5,
) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT objection_type, COUNT(*)::int AS freq,
                   array_agg(DISTINCT summary) AS examples
              FROM cro_objection
             WHERE env_id = %s AND business_id = %s
               AND outcome = 'pending'
             GROUP BY objection_type
             ORDER BY freq DESC
             LIMIT %s
            """,
            (env_id, str(business_id), limit),
        )
        return [dict(r) for r in cur.fetchall()]
