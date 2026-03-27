"""Consulting Revenue OS – Next Action engine.

Every entity (account, contact, opportunity, lead) has a next action.
The system enforces action-driven workflow: no entity should sit without a next step.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.reporting_common import resolve_tenant_id


def create_next_action(
    *,
    env_id: str,
    business_id: UUID,
    entity_type: str,
    entity_id: UUID,
    action_type: str,
    description: str,
    due_date: date,
    owner: str | None = None,
    priority: str = "normal",
    notes: str | None = None,
) -> dict:
    """Create a next action for an entity."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_next_action
              (env_id, business_id, entity_type, entity_id,
               action_type, description, due_date, owner, priority, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (env_id, str(business_id), entity_type, str(entity_id),
             action_type, description, due_date, owner, priority, notes),
        )
        row = cur.fetchone()
    emit_log(level="info", service="backend", action="cro.next_action.created",
             message=f"Next action created for {entity_type} {entity_id}",
             context={"entity_type": entity_type, "entity_id": str(entity_id), "action_type": action_type})
    return row


def list_next_actions(
    *,
    env_id: str,
    business_id: UUID,
    status: str | None = "pending",
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    due_before: date | None = None,
    limit: int = 100,
) -> list[dict]:
    """List next actions with optional filters."""
    clauses = ["na.env_id = %s", "na.business_id = %s"]
    params: list = [env_id, str(business_id)]

    if status:
        clauses.append("na.status = %s")
        params.append(status)
    if entity_type:
        clauses.append("na.entity_type = %s")
        params.append(entity_type)
    if entity_id:
        clauses.append("na.entity_id = %s")
        params.append(str(entity_id))
    if due_before:
        clauses.append("na.due_date <= %s")
        params.append(due_before)

    params.append(limit)
    where = " AND ".join(clauses)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT na.*,
                   CASE
                     WHEN na.entity_type = 'account' THEN a.name
                     WHEN na.entity_type = 'lead' THEN a2.name
                     WHEN na.entity_type = 'contact' THEN c.full_name
                     WHEN na.entity_type = 'opportunity' THEN o.name
                     ELSE NULL
                   END AS entity_name
            FROM cro_next_action na
            LEFT JOIN crm_account a ON na.entity_type = 'account' AND na.entity_id = a.crm_account_id
            LEFT JOIN crm_account a2 ON na.entity_type = 'lead' AND na.entity_id = a2.crm_account_id
            LEFT JOIN crm_contact c ON na.entity_type = 'contact' AND na.entity_id = c.crm_contact_id
            LEFT JOIN crm_opportunity o ON na.entity_type = 'opportunity' AND na.entity_id = o.crm_opportunity_id
            WHERE {where}
            ORDER BY
              CASE na.priority
                WHEN 'urgent' THEN 0
                WHEN 'high' THEN 1
                WHEN 'normal' THEN 2
                WHEN 'low' THEN 3
              END,
              na.due_date ASC
            LIMIT %s
            """,
            params,
        )
        return cur.fetchall()


def get_today_overdue(
    *,
    env_id: str,
    business_id: UUID,
) -> dict:
    """Get today's actions and overdue actions for the command center."""
    today = date.today()
    with get_cursor() as cur:
        # Today's actions
        cur.execute(
            """
            SELECT na.*,
                   CASE
                     WHEN na.entity_type IN ('account','lead') THEN a.name
                     WHEN na.entity_type = 'contact' THEN c.full_name
                     WHEN na.entity_type = 'opportunity' THEN o.name
                     ELSE NULL
                   END AS entity_name
            FROM cro_next_action na
            LEFT JOIN crm_account a ON na.entity_type IN ('account','lead') AND na.entity_id = a.crm_account_id
            LEFT JOIN crm_contact c ON na.entity_type = 'contact' AND na.entity_id = c.crm_contact_id
            LEFT JOIN crm_opportunity o ON na.entity_type = 'opportunity' AND na.entity_id = o.crm_opportunity_id
            WHERE na.env_id = %s AND na.business_id = %s
              AND na.status IN ('pending','in_progress')
              AND na.due_date = %s
            ORDER BY
              CASE na.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
              na.created_at ASC
            """,
            (env_id, str(business_id), today),
        )
        today_actions = cur.fetchall()

        # Overdue actions
        cur.execute(
            """
            SELECT na.*,
                   CASE
                     WHEN na.entity_type IN ('account','lead') THEN a.name
                     WHEN na.entity_type = 'contact' THEN c.full_name
                     WHEN na.entity_type = 'opportunity' THEN o.name
                     ELSE NULL
                   END AS entity_name
            FROM cro_next_action na
            LEFT JOIN crm_account a ON na.entity_type IN ('account','lead') AND na.entity_id = a.crm_account_id
            LEFT JOIN crm_contact c ON na.entity_type = 'contact' AND na.entity_id = c.crm_contact_id
            LEFT JOIN crm_opportunity o ON na.entity_type = 'opportunity' AND na.entity_id = o.crm_opportunity_id
            WHERE na.env_id = %s AND na.business_id = %s
              AND na.status IN ('pending','in_progress')
              AND na.due_date < %s
            ORDER BY na.due_date ASC, na.created_at ASC
            """,
            (env_id, str(business_id), today),
        )
        overdue_actions = cur.fetchall()

    return {
        "today": today_actions,
        "overdue": overdue_actions,
        "today_count": len(today_actions),
        "overdue_count": len(overdue_actions),
    }


def complete_next_action(
    *,
    business_id: UUID,
    action_id: UUID,
    notes: str | None = None,
) -> dict:
    """Mark a next action as completed."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_next_action
            SET status = 'completed', completed_at = %s, notes = COALESCE(%s, notes), updated_at = %s
            WHERE id = %s AND business_id = %s
            RETURNING *
            """,
            (datetime.now(timezone.utc), notes, datetime.now(timezone.utc),
             str(action_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Next action {action_id} not found")
    emit_log(level="info", service="backend", action="cro.next_action.completed",
             message=f"Next action {action_id} completed",
             context={"action_id": str(action_id)})
    return row


def skip_next_action(
    *,
    business_id: UUID,
    action_id: UUID,
    reason: str | None = None,
) -> dict:
    """Skip a next action."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_next_action
            SET status = 'skipped', notes = COALESCE(%s, notes), updated_at = %s
            WHERE id = %s AND business_id = %s
            RETURNING *
            """,
            (reason, datetime.now(timezone.utc), str(action_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Next action {action_id} not found")
    return row
