"""Centralized audit logging for draw management.

All draw operations log to cp_draw_audit_log. This table is append-only:
PostgreSQL triggers prevent UPDATE and DELETE (see 404_cp_draw_audit_log.sql).
"""
from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def log_draw_event(
    *,
    env_id: UUID,
    business_id: UUID,
    project_id: UUID,
    draw_request_id: UUID | None = None,
    invoice_id: UUID | None = None,
    entity_type: str,
    entity_id: UUID,
    action: str,
    previous_state: dict[str, Any] | None = None,
    new_state: dict[str, Any] | None = None,
    actor: str,
    hitl_approval: bool = False,
    ip_address: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Insert a single audit record. Never UPDATE or DELETE from this table."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cp_draw_audit_log (
              env_id, business_id, project_id, draw_request_id, invoice_id,
              entity_type, entity_id, action,
              previous_state, new_state,
              actor, hitl_approval, ip_address, metadata_json
            ) VALUES (
              %s::uuid, %s::uuid, %s::uuid, %s, %s,
              %s, %s::uuid, %s,
              %s::jsonb, %s::jsonb,
              %s, %s, %s, %s::jsonb
            )
            """,
            (
                str(env_id), str(business_id), str(project_id),
                str(draw_request_id) if draw_request_id else None,
                str(invoice_id) if invoice_id else None,
                entity_type, str(entity_id), action,
                json.dumps(previous_state) if previous_state else None,
                json.dumps(new_state) if new_state else None,
                actor, hitl_approval, ip_address,
                json.dumps(metadata or {}),
            ),
        )

    emit_log(
        level="info",
        service="backend",
        action=f"draw_audit.{action}",
        message=f"Draw audit: {action} on {entity_type} {entity_id}",
        context={
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "action": action,
            "actor": actor,
            "hitl_approval": hitl_approval,
            "draw_request_id": str(draw_request_id) if draw_request_id else None,
        },
    )


def query_draw_audit(
    *,
    project_id: UUID,
    env_id: UUID,
    business_id: UUID,
    draw_request_id: UUID | None = None,
    entity_type: str | None = None,
    actor: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Read-only query of the draw audit log."""
    conditions: list[str] = [
        "project_id = %s::uuid",
        "env_id = %s::uuid",
        "business_id = %s::uuid",
    ]
    params: list[Any] = [str(project_id), str(env_id), str(business_id)]

    if draw_request_id:
        conditions.append("draw_request_id = %s::uuid")
        params.append(str(draw_request_id))
    if entity_type:
        conditions.append("entity_type = %s")
        params.append(entity_type)
    if actor:
        conditions.append("actor = %s")
        params.append(actor)

    where = " AND ".join(conditions)
    params.extend([max(1, min(limit, 200)), max(0, offset)])

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT audit_id, entity_type, entity_id, action,
                   previous_state, new_state, actor, hitl_approval,
                   ip_address, metadata_json, created_at
            FROM cp_draw_audit_log
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
            """,
            params,
        )
        return cur.fetchall()
