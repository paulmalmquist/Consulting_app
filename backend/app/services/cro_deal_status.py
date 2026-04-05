"""Revenue Execution OS – Deal Status Engine.

Computes execution status for every open deal using a single SQL query
with LATERAL subqueries. Status is computed at read time, never stored.

Statuses:
  NeedsAttention – no next action, or overdue action, or stale (>5d no activity)
  ReadyToAct     – next action due within 24 hours
  Waiting        – last activity was outbound with no inbound response
  OnTrack        – everything else
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor

# ──────────────────────────────────────────────────────────────────────────────
# Core query: deals with computed status
# ──────────────────────────────────────────────────────────────────────────────

_DEALS_SQL = """
SELECT
  o.crm_opportunity_id,
  o.name,
  COALESCE(o.amount, 0)                   AS amount,
  o.status                                AS opp_status,
  o.thesis,
  o.pain,
  o.winston_angle,
  o.expected_close_date,
  o.created_at,
  o.updated_at,
  a.crm_account_id,
  a.name                                  AS account_name,
  a.industry,
  s.key                                   AS stage_key,
  s.label                                 AS stage_label,
  s.stage_order,
  -- Lateral: most recent activity
  la.activity_at                          AS last_activity_at,
  la.direction                            AS last_activity_direction,
  la.activity_type                        AS last_activity_type,
  -- Lateral: next pending action
  na.id                                   AS next_action_id,
  na.due_date                             AS next_action_due,
  na.description                          AS next_action_description,
  na.action_type                          AS next_action_type,
  na.status                               AS next_action_status,
  -- Computed deal execution status
  CASE
    WHEN o.status IN ('won', 'lost', 'on_hold')
      THEN 'Closed'
    WHEN na.id IS NULL
      THEN 'NeedsAttention'
    WHEN na.due_date < CURRENT_DATE AND na.status = 'pending'
      THEN 'NeedsAttention'
    WHEN la.activity_at IS NOT NULL
      AND la.activity_at < now() - interval '5 days'
      AND (na.id IS NULL OR na.due_date > CURRENT_DATE + interval '1 day')
      THEN 'NeedsAttention'
    WHEN na.due_date <= CURRENT_DATE + interval '1 day'
      AND na.status = 'pending'
      THEN 'ReadyToAct'
    WHEN la.direction = 'outbound'
      AND NOT EXISTS (
        SELECT 1 FROM crm_activity ia
        WHERE ia.crm_opportunity_id = o.crm_opportunity_id
          AND ia.direction = 'inbound'
          AND ia.activity_at > la.activity_at
          AND ia.env_id = o.env_id
      )
      THEN 'Waiting'
    ELSE 'OnTrack'
  END AS computed_status
FROM crm_opportunity o
LEFT JOIN crm_account a
  ON a.crm_account_id = o.crm_account_id
LEFT JOIN crm_pipeline_stage s
  ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
LEFT JOIN LATERAL (
  SELECT activity_at, direction, activity_type
  FROM crm_activity
  WHERE crm_opportunity_id = o.crm_opportunity_id
    AND env_id = o.env_id
  ORDER BY activity_at DESC
  LIMIT 1
) la ON true
LEFT JOIN LATERAL (
  SELECT id, due_date, description, action_type, status
  FROM cro_next_action
  WHERE entity_type = 'opportunity'
    AND entity_id = o.crm_opportunity_id
    AND env_id = o.env_id
    AND status IN ('pending', 'in_progress')
  ORDER BY due_date ASC
  LIMIT 1
) na ON true
WHERE o.env_id = %s
  AND o.business_id = %s
"""


def get_deals_with_status(
    *,
    env_id: str,
    business_id: UUID,
    industry: str | None = None,
    stage_key: str | None = None,
    computed_status: str | None = None,
    min_value: Decimal | None = None,
    max_value: Decimal | None = None,
    last_activity_days: int | None = None,
    include_closed: bool = False,
    limit: int = 200,
) -> list[dict]:
    """Return deals with inline-computed execution status.

    All filtering (including computed_status) is done in a wrapping CTE
    so Postgres can still push down the lateral joins efficiently.
    """
    with get_cursor() as cur:
        params: list = [env_id, str(business_id)]

        # Build the base query; closed deals excluded by default
        base = _DEALS_SQL
        if not include_closed:
            base += "  AND o.status = 'open'\n"

        # Wrap in CTE so we can filter on computed columns
        parts = [f"WITH deal_cte AS (\n{base})\nSELECT * FROM deal_cte WHERE true\n"]

        if industry:
            parts.append("  AND industry = %s\n")
            params.append(industry)

        if stage_key:
            parts.append("  AND stage_key = %s\n")
            params.append(stage_key)

        if computed_status:
            parts.append("  AND computed_status = %s\n")
            params.append(computed_status)

        if min_value is not None:
            parts.append("  AND amount >= %s\n")
            params.append(min_value)

        if max_value is not None:
            parts.append("  AND amount <= %s\n")
            params.append(max_value)

        if last_activity_days is not None:
            parts.append("  AND (last_activity_at >= now() - interval '%s days' OR last_activity_at IS NULL)\n")
            params.append(last_activity_days)

        parts.append("ORDER BY\n")
        parts.append("  CASE computed_status\n")
        parts.append("    WHEN 'NeedsAttention' THEN 1\n")
        parts.append("    WHEN 'ReadyToAct'     THEN 2\n")
        parts.append("    WHEN 'Waiting'        THEN 3\n")
        parts.append("    WHEN 'OnTrack'        THEN 4\n")
        parts.append("    ELSE 5\n")
        parts.append("  END,\n")
        parts.append("  COALESCE(next_action_due, '2099-01-01') ASC,\n")
        parts.append("  amount DESC\n")
        parts.append("LIMIT %s\n")
        params.append(limit)

        sql = "".join(parts)
        cur.execute(sql, tuple(params))
        return cur.fetchall()


# ──────────────────────────────────────────────────────────────────────────────
# Summary endpoint: pipeline strip + industry breakdown + stuck money + outreach
# ──────────────────────────────────────────────────────────────────────────────

def get_deal_summary(*, env_id: str, business_id: UUID) -> dict:
    """Return aggregated deal summary for the command center.

    Single round-trip with multiple queries executed sequentially on one cursor.
    """
    with get_cursor() as cur:
        bid = str(business_id)

        # 1. Pipeline strip: stage → count, total, stale
        cur.execute(
            """
            SELECT
              s.key            AS stage_key,
              s.label          AS stage_label,
              s.stage_order,
              COUNT(*)         AS deal_count,
              COALESCE(SUM(o.amount), 0) AS total_value,
              COUNT(*) FILTER (
                WHERE NOT EXISTS (
                  SELECT 1 FROM crm_activity ca
                  WHERE ca.crm_opportunity_id = o.crm_opportunity_id
                    AND ca.activity_at > now() - interval '14 days'
                )
              ) AS stale_count
            FROM crm_opportunity o
            JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            WHERE o.env_id = %s AND o.business_id = %s AND o.status = 'open'
            GROUP BY s.key, s.label, s.stage_order
            ORDER BY s.stage_order
            """,
            (env_id, bid),
        )
        pipeline_strip = cur.fetchall()

        # 2. Industry breakdown: industry → count, total, needs_attention_count
        cur.execute(
            """
            WITH deal_status AS (
              SELECT
                a.industry,
                o.amount,
                CASE
                  WHEN na.id IS NULL THEN true
                  WHEN na.due_date < CURRENT_DATE AND na.status = 'pending' THEN true
                  ELSE false
                END AS needs_attention
              FROM crm_opportunity o
              LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
              LEFT JOIN LATERAL (
                SELECT id, due_date, status FROM cro_next_action
                WHERE entity_type = 'opportunity' AND entity_id = o.crm_opportunity_id
                  AND env_id = o.env_id AND status IN ('pending', 'in_progress')
                ORDER BY due_date ASC LIMIT 1
              ) na ON true
              WHERE o.env_id = %s AND o.business_id = %s AND o.status = 'open'
            )
            SELECT
              COALESCE(industry, 'Unknown') AS industry,
              COUNT(*)                      AS deal_count,
              COALESCE(SUM(amount), 0)      AS total_value,
              COUNT(*) FILTER (WHERE needs_attention) AS needs_attention_count
            FROM deal_status
            GROUP BY COALESCE(industry, 'Unknown')
            ORDER BY total_value DESC
            """,
            (env_id, bid),
        )
        industry_breakdown = cur.fetchall()

        # 3. Stuck money: NeedsAttention deals sorted by value desc (top 10)
        cur.execute(
            """
            SELECT
              o.crm_opportunity_id,
              o.name,
              COALESCE(o.amount, 0) AS amount,
              a.name                AS account_name,
              a.industry,
              s.label               AS stage_label,
              na.due_date           AS next_action_due,
              na.description        AS next_action_description
            FROM crm_opportunity o
            LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
            LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            LEFT JOIN LATERAL (
              SELECT id, due_date, description, status FROM cro_next_action
              WHERE entity_type = 'opportunity' AND entity_id = o.crm_opportunity_id
                AND env_id = o.env_id AND status IN ('pending', 'in_progress')
              ORDER BY due_date ASC LIMIT 1
            ) na ON true
            WHERE o.env_id = %s AND o.business_id = %s AND o.status = 'open'
              AND o.amount > 0
              AND (na.id IS NULL OR (na.due_date < CURRENT_DATE AND na.status = 'pending'))
            ORDER BY o.amount DESC
            LIMIT 10
            """,
            (env_id, bid),
        )
        stuck_money = cur.fetchall()

        # 4. Outreach snapshot (7 days)
        cur.execute(
            """
            SELECT
              COUNT(*)                                        AS sent_7d,
              COUNT(*) FILTER (WHERE replied_at IS NOT NULL)  AS replies_7d,
              COUNT(*) FILTER (WHERE meeting_booked = true)   AS meetings_7d,
              CASE
                WHEN COUNT(*) > 0
                THEN ROUND(
                  COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::numeric
                  / COUNT(*)::numeric, 4
                )
                ELSE 0
              END AS reply_rate_7d
            FROM cro_outreach_log
            WHERE env_id = %s AND business_id = %s
              AND sent_at >= now() - interval '7 days'
            """,
            (env_id, bid),
        )
        outreach_row = cur.fetchone()

        return {
            "pipeline_strip": pipeline_strip,
            "industry_breakdown": industry_breakdown,
            "stuck_money": stuck_money,
            "outreach_7d": outreach_row or {
                "sent_7d": 0,
                "replies_7d": 0,
                "meetings_7d": 0,
                "reply_rate_7d": 0,
            },
        }
