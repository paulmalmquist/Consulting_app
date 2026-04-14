from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal
from statistics import median
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

# Fields the PATCH endpoint is allowed to update. Anything else must go through
# the audited record_queue_action path.
_EDITABLE_FIELDS: frozenset[str] = frozenset(
    {
        "assigned_owner",
        "status",
        "due_at",
        "variance",
        "recovery_value",
    }
)

_OPEN_STATUSES: tuple[str, ...] = ("open", "in_review", "deferred")
_CLOSED_STATUSES: tuple[str, ...] = (
    "approved",
    "delegated",
    "escalated",
    "rejected",
    "closed",
)


def _priority_rank(priority: str) -> int:
    return {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(priority, 1)


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def compute_priority_score(row: dict[str, Any], *, now: datetime | None = None) -> float:
    """priority_score = ABS(variance) / GREATEST(days_to_due, 1)

    Computed in service/query layer — never stored, so the formula can evolve
    without a migration and so NOW() dependence stays fresh.
    """
    variance = abs(_to_float(row.get("variance")))
    due_at = row.get("due_at")
    if due_at is None:
        return variance
    if isinstance(due_at, str):
        try:
            due_at = datetime.fromisoformat(due_at.replace("Z", "+00:00"))
        except ValueError:
            return variance
    reference = now or datetime.now(tz=timezone.utc)
    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=timezone.utc)
    days = (due_at - reference).total_seconds() / 86400
    return variance / max(days, 1.0)


_SELECT_COLUMNS = (
    "queue_item_id, env_id, business_id, decision_code, title, summary, priority, "
    "status, project_id, signal_event_id, recommended_action, recommended_owner, "
    "assigned_owner, due_at, risk_score, variance, starting_variance, "
    "recovery_value, resolved_at, context_json, ai_analysis_json, "
    "input_snapshot_json, outcome_json, created_by, updated_by, created_at, "
    "updated_at"
)


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
            SELECT {_SELECT_COLUMNS}
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
        rows = cur.fetchall() or []

    for row in rows:
        row["priority_score"] = compute_priority_score(row)
    rows.sort(key=lambda r: r.get("priority_score", 0.0), reverse=True)
    return rows


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
            SELECT queue_item_id, env_id, business_id, decision_code, title, summary,
                   priority, status, project_id, signal_event_id, recommended_action,
                   recommended_owner, assigned_owner, due_at, risk_score, variance,
                   starting_variance, recovery_value, resolved_at, context_json,
                   ai_analysis_json, input_snapshot_json, outcome_json, created_by,
                   updated_by, created_at, updated_at
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
                RETURNING queue_item_id, env_id, business_id, decision_code, title,
                          summary, priority, status, project_id, signal_event_id,
                          recommended_action, recommended_owner, assigned_owner,
                          due_at, risk_score, variance, starting_variance,
                          recovery_value, resolved_at, context_json, ai_analysis_json,
                          input_snapshot_json, outcome_json, created_by, updated_by,
                          created_at, updated_at
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
            RETURNING queue_item_id, env_id, business_id, decision_code, title, summary,
                      priority, status, project_id, signal_event_id, recommended_action,
                      recommended_owner, assigned_owner, due_at, risk_score, variance,
                      starting_variance, recovery_value, resolved_at, context_json,
                      ai_analysis_json, input_snapshot_json, outcome_json, created_by,
                      updated_by, created_at, updated_at
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
            SELECT queue_item_id, env_id, business_id, decision_code, title, summary,
                   priority, status, project_id, signal_event_id, recommended_action,
                   recommended_owner, assigned_owner, due_at, risk_score, variance,
                   starting_variance, recovery_value, resolved_at, context_json,
                   ai_analysis_json, input_snapshot_json, outcome_json, created_by,
                   updated_by, created_at, updated_at
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
            RETURNING queue_action_id, queue_item_id, env_id, business_id, action_type,
                      actor, rationale, delegate_to, action_payload_json, created_at
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

        close_loop_json: dict[str, Any] | None = None
        if next_status in _CLOSED_STATUSES:
            starting = _to_float(queue_item.get("starting_variance"))
            current = _to_float(queue_item.get("variance"))
            delta = starting - current
            created_at = queue_item.get("created_at")
            time_to_resolution_hours: float | None = None
            if created_at:
                if isinstance(created_at, str):
                    try:
                        created_at = datetime.fromisoformat(
                            created_at.replace("Z", "+00:00")
                        )
                    except ValueError:
                        created_at = None
                if created_at:
                    if created_at.tzinfo is None:
                        created_at = created_at.replace(tzinfo=timezone.utc)
                    time_to_resolution_hours = (
                        datetime.now(tz=timezone.utc) - created_at
                    ).total_seconds() / 3600
            close_loop_json = {
                "delta": delta,
                "time_to_resolution_hours": time_to_resolution_hours,
                "starting_variance": starting,
                "current_variance": current,
                "recovery_value": _to_float(queue_item.get("recovery_value")),
            }

        cur.execute(
            """
            UPDATE pds_exec_queue_item
            SET status = %s,
                updated_by = %s,
                updated_at = now(),
                resolved_at = CASE WHEN %s THEN now() ELSE resolved_at END,
                outcome_json = CASE
                    WHEN %s::jsonb IS NOT NULL THEN
                        jsonb_set(
                            jsonb_set(
                                COALESCE(outcome_json, '{}'::jsonb),
                                '{last_action}',
                                %s::jsonb,
                                true
                            ),
                            '{close_loop}',
                            %s::jsonb,
                            true
                        )
                    ELSE
                        jsonb_set(
                            COALESCE(outcome_json, '{}'::jsonb),
                            '{last_action}',
                            %s::jsonb,
                            true
                        )
                END
            WHERE queue_item_id = %s::uuid
            RETURNING queue_item_id, env_id, business_id, decision_code, title, summary,
                      priority, status, project_id, signal_event_id, recommended_action,
                      recommended_owner, assigned_owner, due_at, risk_score, variance,
                      starting_variance, recovery_value, resolved_at, context_json,
                      ai_analysis_json, input_snapshot_json, outcome_json, created_by,
                      updated_by, created_at, updated_at
            """,
            (
                next_status,
                actor,
                next_status in _CLOSED_STATUSES,
                json.dumps(close_loop_json) if close_loop_json else None,
                json.dumps(
                    {
                        "action": action,
                        "actor": actor,
                        "rationale": rationale,
                        "delegate_to": delegate_to,
                    }
                ),
                json.dumps(close_loop_json) if close_loop_json else None,
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


_STATUS_VOCAB: tuple[str, ...] = _OPEN_STATUSES + _CLOSED_STATUSES


def update_queue_item(
    *,
    env_id: UUID,
    business_id: UUID,
    queue_item_id: UUID,
    patch: dict[str, Any],
    actor: str | None = None,
) -> dict:
    """PATCH a queue row with editable workflow fields.

    Only fields in _EDITABLE_FIELDS may be updated. Status transitions to a
    closed state stamp resolved_at and append a close-the-loop outcome block
    so downstream metrics can reconcile the delta.
    """
    sanitized = {k: v for k, v in patch.items() if k in _EDITABLE_FIELDS}
    if not sanitized:
        raise ValueError("No editable fields supplied")

    status = sanitized.get("status")
    if status is not None and status not in _STATUS_VOCAB:
        raise ValueError(f"Unsupported status: {status}")

    set_clauses = [f"{col} = %s" for col in sanitized]
    params: list[Any] = list(sanitized.values())

    resolving = status in _CLOSED_STATUSES
    if resolving:
        set_clauses.append("resolved_at = now()")

    set_clauses.extend(["updated_by = %s", "updated_at = now()"])
    params.append(actor)

    params.extend([str(queue_item_id), str(env_id), str(business_id)])

    sql = (
        "UPDATE pds_exec_queue_item SET "
        + ", ".join(set_clauses)
        + " WHERE queue_item_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid"
        " RETURNING " + _SELECT_COLUMNS
    )

    with get_cursor() as cur:
        cur.execute(sql, tuple(params))
        row = cur.fetchone()
        if not row:
            raise LookupError("Queue item not found")

        if resolving:
            starting = _to_float(row.get("starting_variance"))
            current = _to_float(row.get("variance"))
            delta = starting - current
            created_at = row.get("created_at")
            hours: float | None = None
            if created_at:
                if isinstance(created_at, str):
                    try:
                        created_at = datetime.fromisoformat(
                            created_at.replace("Z", "+00:00")
                        )
                    except ValueError:
                        created_at = None
                if created_at:
                    if created_at.tzinfo is None:
                        created_at = created_at.replace(tzinfo=timezone.utc)
                    hours = (
                        datetime.now(tz=timezone.utc) - created_at
                    ).total_seconds() / 3600
            close_loop = {
                "delta": delta,
                "time_to_resolution_hours": hours,
                "starting_variance": starting,
                "current_variance": current,
                "recovery_value": _to_float(row.get("recovery_value")),
            }
            cur.execute(
                """
                UPDATE pds_exec_queue_item
                   SET outcome_json = jsonb_set(
                         COALESCE(outcome_json, '{}'::jsonb),
                         '{close_loop}',
                         %s::jsonb,
                         true
                       )
                 WHERE queue_item_id = %s::uuid
                 RETURNING """ + _SELECT_COLUMNS,
                (json.dumps(close_loop), str(queue_item_id)),
            )
            row = cur.fetchone() or row

    row["priority_score"] = compute_priority_score(row)
    return row


def get_queue_metrics(*, env_id: UUID, business_id: UUID) -> dict:
    """Close-the-loop + exposure summary plus the top-5 highest-priority items."""
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT {_SELECT_COLUMNS}
              FROM pds_exec_queue_item
             WHERE env_id = %s::uuid
               AND business_id = %s::uuid
            """,
            (str(env_id), str(business_id)),
        )
        rows = cur.fetchall() or []

    total_recovered = 0.0
    time_to_fix_hours: list[float] = []
    open_exposure = 0.0

    for row in rows:
        status = row.get("status")
        if status in _OPEN_STATUSES:
            open_exposure += abs(_to_float(row.get("variance")))
        if status in _CLOSED_STATUSES:
            total_recovered += _to_float(row.get("recovery_value"))
            resolved_at = row.get("resolved_at")
            created_at = row.get("created_at")
            if resolved_at and created_at:
                if isinstance(resolved_at, str):
                    try:
                        resolved_at = datetime.fromisoformat(
                            resolved_at.replace("Z", "+00:00")
                        )
                    except ValueError:
                        resolved_at = None
                if isinstance(created_at, str):
                    try:
                        created_at = datetime.fromisoformat(
                            created_at.replace("Z", "+00:00")
                        )
                    except ValueError:
                        created_at = None
                if resolved_at and created_at:
                    if resolved_at.tzinfo is None:
                        resolved_at = resolved_at.replace(tzinfo=timezone.utc)
                    if created_at.tzinfo is None:
                        created_at = created_at.replace(tzinfo=timezone.utc)
                    time_to_fix_hours.append(
                        (resolved_at - created_at).total_seconds() / 3600
                    )
        row["priority_score"] = compute_priority_score(row)

    open_rows = [r for r in rows if r.get("status") in _OPEN_STATUSES]
    open_rows.sort(key=lambda r: r.get("priority_score", 0.0), reverse=True)
    top_five = open_rows[:5]

    return {
        "total_recovered_value": total_recovered,
        "median_time_to_fix_hours": median(time_to_fix_hours) if time_to_fix_hours else None,
        "open_variance_exposure": open_exposure,
        "top_five_actions": top_five,
    }
