from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from app.db import get_cursor

_STATUS_BY_ACTION = {
    "approve": "approved",
    "delegate": "delegated",
    "escalate": "escalated",
    "defer": "deferred",
    "reject": "rejected",
    "close": "closed",
}


def _priority_rank(priority: str) -> int:
    return {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(priority, 1)


def list_queue_items(
    *,
    env_id: UUID,
    business_id: UUID,
    status: str | None = None,
    limit: int = 100,
) -> list[dict]:
    where = ["env_id = %s::uuid", "business_id = %s::uuid"]
    params: list[Any] = [str(env_id), str(business_id)]
    if status:
        where.append("status = %s")
        params.append(status)
    params.append(max(1, min(int(limit), 250)))

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM pds_exec_queue_item
            WHERE {' AND '.join(where)}
            ORDER BY
              CASE priority
                WHEN 'critical' THEN 4
                WHEN 'high' THEN 3
                WHEN 'medium' THEN 2
                ELSE 1
              END DESC,
              COALESCE(due_at, created_at) ASC,
              created_at DESC
            LIMIT %s
            """,
            tuple(params),
        )
        return cur.fetchall()


def upsert_queue_item(
    *,
    env_id: UUID,
    business_id: UUID,
    decision_code: str,
    title: str,
    summary: str,
    priority: str,
    recommended_action: str,
    recommended_owner: str | None,
    due_at,
    risk_score,
    project_id: UUID | None,
    signal_event_id: UUID | None,
    context_json: dict,
    ai_analysis_json: dict,
    input_snapshot_json: dict,
    correlation_key: str | None = None,
    actor: str | None = None,
) -> dict:
    existing: dict | None = None

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_exec_queue_item
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND decision_code = %s
              AND status IN ('open', 'in_review', 'deferred')
              AND (
                (
                  %s::uuid IS NOT NULL
                  AND project_id = %s::uuid
                )
                OR (
                  %s::uuid IS NULL
                  AND project_id IS NULL
                  AND (
                    %s::text IS NULL
                    OR COALESCE(context_json->>'correlation_key', '') = %s::text
                  )
                )
              )
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (
                str(env_id),
                str(business_id),
                decision_code,
                str(project_id) if project_id else None,
                str(project_id) if project_id else None,
                str(project_id) if project_id else None,
                correlation_key,
                correlation_key,
            ),
        )
        existing = cur.fetchone()

        if existing:
            # Preserve the higher urgency between current and incoming priority.
            merged_priority = priority
            if _priority_rank(str(existing.get("priority") or "low")) > _priority_rank(priority):
                merged_priority = str(existing.get("priority") or "low")

            cur.execute(
                """
                UPDATE pds_exec_queue_item
                SET title = %s,
                    summary = %s,
                    priority = %s,
                    recommended_action = %s,
                    recommended_owner = %s,
                    due_at = COALESCE(%s, due_at),
                    risk_score = %s,
                    signal_event_id = COALESCE(%s::uuid, signal_event_id),
                    context_json = %s::jsonb,
                    ai_analysis_json = %s::jsonb,
                    input_snapshot_json = %s::jsonb,
                    updated_by = %s,
                    updated_at = now()
                WHERE queue_item_id = %s::uuid
                RETURNING *
                """,
                (
                    title,
                    summary,
                    merged_priority,
                    recommended_action,
                    recommended_owner,
                    due_at,
                    risk_score,
                    str(signal_event_id) if signal_event_id else None,
                    json.dumps(context_json),
                    json.dumps(ai_analysis_json),
                    json.dumps(input_snapshot_json),
                    actor,
                    str(existing["queue_item_id"]),
                ),
            )
            return cur.fetchone() or existing

        cur.execute(
            """
            INSERT INTO pds_exec_queue_item
            (env_id, business_id, decision_code, title, summary, priority, status,
             project_id, signal_event_id, recommended_action, recommended_owner,
             due_at, risk_score, context_json, ai_analysis_json, input_snapshot_json,
             created_by, updated_by)
            VALUES
            (%s::uuid, %s::uuid, %s, %s, %s, %s, 'open',
             %s::uuid, %s::uuid, %s, %s,
             %s, %s, %s::jsonb, %s::jsonb, %s::jsonb,
             %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                decision_code,
                title,
                summary,
                priority,
                str(project_id) if project_id else None,
                str(signal_event_id) if signal_event_id else None,
                recommended_action,
                recommended_owner,
                due_at,
                risk_score,
                json.dumps(context_json),
                json.dumps(ai_analysis_json),
                json.dumps(input_snapshot_json),
                actor,
                actor,
            ),
        )
        return cur.fetchone()


def record_queue_action(
    *,
    env_id: UUID,
    business_id: UUID,
    queue_item_id: UUID,
    action_type: str,
    actor: str | None,
    rationale: str | None = None,
    delegate_to: str | None = None,
    action_payload_json: dict | None = None,
) -> dict:
    action = action_type.strip().lower()
    if action not in _STATUS_BY_ACTION:
        raise ValueError("Unsupported queue action")

    next_status = _STATUS_BY_ACTION[action]

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_exec_queue_item
            WHERE queue_item_id = %s::uuid
              AND env_id = %s::uuid
              AND business_id = %s::uuid
            """,
            (str(queue_item_id), str(env_id), str(business_id)),
        )
        queue_item = cur.fetchone()
        if not queue_item:
            raise LookupError("Queue item not found")

        cur.execute(
            """
            INSERT INTO pds_exec_queue_action
            (queue_item_id, env_id, business_id, action_type, actor, rationale, delegate_to, action_payload_json)
            VALUES
            (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s::jsonb)
            RETURNING *
            """,
            (
                str(queue_item_id),
                str(env_id),
                str(business_id),
                action,
                actor,
                rationale,
                delegate_to,
                json.dumps(action_payload_json or {}),
            ),
        )
        action_row = cur.fetchone()

        cur.execute(
            """
            UPDATE pds_exec_queue_item
            SET status = %s,
                updated_by = %s,
                updated_at = now(),
                outcome_json = jsonb_set(
                  COALESCE(outcome_json, '{}'::jsonb),
                  '{last_action}',
                  %s::jsonb,
                  true
                )
            WHERE queue_item_id = %s::uuid
            RETURNING *
            """,
            (
                next_status,
                actor,
                json.dumps(
                    {
                        "action": action,
                        "actor": actor,
                        "rationale": rationale,
                        "delegate_to": delegate_to,
                    }
                ),
                str(queue_item_id),
            ),
        )
        updated = cur.fetchone() or queue_item

    return {"queue_item": updated, "action": action_row}
