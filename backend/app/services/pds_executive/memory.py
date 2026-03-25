from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor


def list_memory(*, env_id: UUID, business_id: UUID, limit: int = 100) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              q.queue_item_id,
              q.decision_code,
              q.title,
              q.summary,
              q.priority,
              q.status,
              q.project_id,
              q.recommended_action,
              q.ai_analysis_json,
              q.input_snapshot_json,
              q.context_json,
              q.outcome_json,
              q.created_at,
              q.updated_at,
              o.outcome_status,
              o.observed_at,
              o.kpi_impact_json,
              o.notes,
              a.action_type,
              a.actor,
              a.rationale,
              a.delegate_to,
              a.created_at AS action_created_at
            FROM pds_exec_queue_item q
            LEFT JOIN pds_exec_outcome o ON o.queue_item_id = q.queue_item_id
            LEFT JOIN LATERAL (
              SELECT action_type, actor, rationale, delegate_to, created_at
              FROM pds_exec_queue_action qa
              WHERE qa.queue_item_id = q.queue_item_id
              ORDER BY qa.created_at DESC
              LIMIT 1
            ) a ON true
            WHERE q.env_id = %s::uuid
              AND q.business_id = %s::uuid
            ORDER BY q.updated_at DESC
            LIMIT %s
            """,
            (str(env_id), str(business_id), max(1, min(limit, 250))),
        )
        return cur.fetchall()


def record_outcome(
    *,
    env_id: UUID,
    business_id: UUID,
    queue_item_id: UUID,
    decision_code: str,
    outcome_status: str,
    kpi_impact_json: dict | None = None,
    notes: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_exec_outcome
            (queue_item_id, env_id, business_id, decision_code, outcome_status, observed_at, kpi_impact_json, notes)
            VALUES
            (%s::uuid, %s::uuid, %s::uuid, %s, %s, now(), %s::jsonb, %s)
            ON CONFLICT (queue_item_id) DO UPDATE
              SET outcome_status = EXCLUDED.outcome_status,
                  observed_at = EXCLUDED.observed_at,
                  kpi_impact_json = EXCLUDED.kpi_impact_json,
                  notes = EXCLUDED.notes
            RETURNING *
            """,
            (
                str(queue_item_id),
                str(env_id),
                str(business_id),
                decision_code,
                outcome_status,
                json.dumps(kpi_impact_json or {}),
                notes,
            ),
        )
        row = cur.fetchone()

        cur.execute(
            """
            UPDATE pds_exec_queue_item
            SET outcome_json = %s::jsonb,
                updated_at = now()
            WHERE queue_item_id = %s::uuid
            """,
            (
                json.dumps(
                    {
                        "outcome_status": outcome_status,
                        "observed_at": datetime.now(timezone.utc).isoformat(),
                        "kpi_impact": (kpi_impact_json or {}),
                        "notes": notes,
                    }
                ),
                str(queue_item_id),
            ),
        )

        return row
