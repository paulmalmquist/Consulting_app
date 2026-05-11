"""
nv_tasks service — personal/operational task management via nv_task table.
Separate from the project/sprint task management in services/tasks.py.
"""
from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from app.db import get_cursor

# Fixed Novendor identifiers — re-verified 2026-05-11
NOVENDOR_BUSINESS_ID = "225f52ca-cdf4-4af9-a973-d1d310ddcba1"
NOVENDOR_ENV_ID = "62cfd59c-a171-4224-ad1e-fffc35bd1ef4"


def list_tasks(
    *,
    business_id: UUID,
    env_id: str,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
) -> list[dict]:
    with get_cursor() as cur:
        filters = ["business_id = %s", "env_id = %s"]
        params: list = [str(business_id), env_id]

        if status:
            filters.append("status = %s")
            params.append(status)
        if priority:
            filters.append("priority = %s")
            params.append(priority)
        if category:
            filters.append("related_entity_type = %s")
            params.append(category)

        where = " AND ".join(filters)
        cur.execute(
            f"""
            SELECT
                id,
                task_name,
                status,
                priority,
                due_date,
                related_entity_type AS category,
                related_entity_id,
                assigned_to,
                mobile_quick_action_flag,
                notes,
                created_at,
                updated_at
            FROM nv_task
            WHERE {where}
            ORDER BY
                CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                due_date ASC NULLS LAST,
                created_at DESC
            """,
            params,
        )
        return cur.fetchall()


def create_task(
    *,
    business_id: UUID,
    env_id: str,
    task_name: str,
    priority: str = "medium",
    due_date: Optional[date] = None,
    category: Optional[str] = None,
    related_entity_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    notes: Optional[str] = None,
    mobile_quick_action_flag: bool = False,
) -> dict:
    if priority not in ("high", "medium", "low"):
        raise ValueError(f"Invalid priority: {priority}")

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO nv_task (
                business_id, env_id, task_name, priority,
                due_date, related_entity_type, related_entity_id,
                assigned_to, notes, mobile_quick_action_flag, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'open')
            RETURNING
                id, task_name, status, priority, due_date,
                related_entity_type AS category, related_entity_id,
                assigned_to, mobile_quick_action_flag, notes,
                created_at, updated_at
            """,
            [
                str(business_id), env_id, task_name, priority,
                due_date, category, related_entity_id,
                assigned_to, notes, mobile_quick_action_flag,
            ],
        )
        return cur.fetchone()


def update_task(
    *,
    task_id: UUID,
    business_id: UUID,
    env_id: str,
    updates: dict,
) -> dict:
    allowed = {"task_name", "status", "priority", "due_date",
               "related_entity_type", "related_entity_id",
               "assigned_to", "notes", "mobile_quick_action_flag"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        raise ValueError("No valid fields to update")

    set_clause = ", ".join(f"{k} = %s" for k in filtered)
    params = list(filtered.values()) + [str(task_id), str(business_id), env_id]

    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE nv_task
            SET {set_clause}, updated_at = now()
            WHERE id = %s AND business_id = %s AND env_id = %s
            RETURNING
                id, task_name, status, priority, due_date,
                related_entity_type AS category, related_entity_id,
                assigned_to, mobile_quick_action_flag, notes,
                created_at, updated_at
            """,
            params,
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Task {task_id} not found")
        return row


def get_todays_tasks(*, business_id: UUID, env_id: str) -> list[dict]:
    """Tasks due today or overdue and still open — for the Command Center widget."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                id,
                task_name,
                status,
                priority,
                due_date,
                related_entity_type AS category,
                notes
            FROM nv_task
            WHERE business_id = %s
              AND env_id = %s
              AND status IN ('open', 'in_progress')
              AND (due_date IS NULL OR due_date <= CURRENT_DATE)
            ORDER BY
                CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                due_date ASC NULLS LAST
            LIMIT 10
            """,
            [str(business_id), env_id],
        )
        return cur.fetchall()
