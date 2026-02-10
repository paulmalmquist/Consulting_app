"""Lab service — environments, metrics, queue, audit for the Demo Lab UI."""

import json
from uuid import UUID

from app.db import get_cursor


# ── Environments ──────────────────────────────────────────────────────

def list_environments() -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT env_id, client_name, industry, schema_name, is_active
               FROM app.environments
               ORDER BY created_at DESC"""
        )
        return cur.fetchall()


def create_environment(client_name: str, industry: str, notes: str | None = None) -> dict:
    schema_name = f"env_{client_name.lower().replace(' ', '_').replace('-', '_')[:30]}"
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.environments (client_name, industry, schema_name, notes)
               VALUES (%s, %s, %s, %s)
               RETURNING env_id, client_name, industry, schema_name""",
            (client_name, industry, schema_name, notes),
        )
        return cur.fetchone()


def reset_environment(env_id: UUID) -> None:
    """Reset an environment's associated data. Currently a no-op placeholder
    that could later truncate environment-scoped tables."""
    with get_cursor() as cur:
        cur.execute(
            "UPDATE app.environments SET updated_at = now() WHERE env_id = %s",
            (str(env_id),),
        )


# ── Queue (HITL work items) ──────────────────────────────────────────

def list_queue_items(env_id: str | None = None) -> list[dict]:
    """Return open/in_progress work items as HITL queue entries."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT wi.work_item_id as id,
                      wi.created_at,
                      wi.status::text as status,
                      CASE
                        WHEN wi.priority <= 2 THEN 'high'
                        WHEN wi.priority <= 3 THEN 'medium'
                        ELSE 'low'
                      END as risk_level,
                      json_build_object(
                        'type', wi.type::text,
                        'title', wi.title,
                        'description', wi.description,
                        'owner', wi.owner,
                        'priority', wi.priority
                      ) as requested_action
               FROM app.work_items wi
               WHERE wi.status IN ('open', 'in_progress', 'waiting')
               ORDER BY wi.priority ASC, wi.created_at ASC
               LIMIT 50"""
        )
        return cur.fetchall()


def decide_queue_item(work_item_id: UUID, decision: str, reason: str | None = None) -> None:
    """Approve or deny a queue item by updating work_item status."""
    new_status = "resolved" if decision == "approve" else "closed"
    with get_cursor() as cur:
        cur.execute(
            """UPDATE app.work_items
               SET status = %s::app.work_item_status, updated_by = %s
               WHERE work_item_id = %s""",
            (new_status, reason or "lab_reviewer", str(work_item_id)),
        )


# ── Audit ─────────────────────────────────────────────────────────────

def list_audit_items(env_id: str | None = None) -> list[dict]:
    """Return audit events formatted for the Lab UI."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT audit_event_id as id,
                      created_at as at,
                      actor,
                      action,
                      COALESCE(object_type, 'system') as entity_type,
                      COALESCE(object_id::text, '') as entity_id,
                      COALESCE(input_redacted, '{}'::jsonb) as details
               FROM app.audit_events
               ORDER BY created_at DESC
               LIMIT 100"""
        )
        return cur.fetchall()


# ── Metrics ───────────────────────────────────────────────────────────

def get_metrics(env_id: str | None = None) -> dict:
    """Compute real aggregate metrics from the database."""
    with get_cursor() as cur:
        cur.execute("SELECT COUNT(*) as cnt FROM app.document_versions WHERE state = 'available'")
        uploads_count = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM app.work_items")
        tickets_count = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM app.work_items WHERE status IN ('open', 'waiting')")
        pending_approvals = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM app.work_items WHERE status = 'resolved'")
        resolved = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM app.work_items WHERE status = 'closed'")
        denied = cur.fetchone()["cnt"]

        total_decided = resolved + denied
        approval_rate = resolved / total_decided if total_decided > 0 else 0.0
        override_rate = 0.0  # Would require tracking overrides

        avg_time = 0.0
        if total_decided > 0:
            cur.execute(
                """SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_sec
                   FROM app.work_items
                   WHERE status IN ('resolved', 'closed')"""
            )
            row = cur.fetchone()
            avg_time = float(row["avg_sec"] or 0)

        return {
            "uploads_count": uploads_count,
            "tickets_count": tickets_count,
            "pending_approvals": pending_approvals,
            "approval_rate": round(approval_rate, 3),
            "override_rate": override_rate,
            "avg_time_to_decision_sec": round(avg_time, 1),
        }
