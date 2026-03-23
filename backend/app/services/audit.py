"""Audit service — single source of truth for audit event persistence."""

import json
import re
from uuid import uuid4
from uuid import UUID

from app.db import get_cursor

# Keys that must always be redacted in audit logs
_REDACT_KEYS_PATTERN = re.compile(
    r"(token|secret|password|apikey|authorization|service_role|signed.*url)",
    re.IGNORECASE,
)

_MAX_STRING_LENGTH = 500
_MAX_ARRAY_LENGTH = 10


def _redact_value(key: str, value: object) -> object:
    """Redact sensitive values."""
    if _REDACT_KEYS_PATTERN.search(key):
        return "***REDACTED***"
    if isinstance(value, str):
        # Strip query strings from URL-like values
        if value.startswith(("http://", "https://")):
            idx = value.find("?")
            if idx != -1:
                return value[:idx] + "?***"
        if len(value) > _MAX_STRING_LENGTH:
            return value[:_MAX_STRING_LENGTH] + "...[truncated]"
    return value


def redact_dict(data: dict) -> dict:
    """Redact sensitive keys and truncate large values."""
    if not isinstance(data, dict):
        return {}
    result = {}
    for k, v in data.items():
        if isinstance(v, dict):
            result[k] = redact_dict(v)
        elif isinstance(v, list):
            result[k] = v[:_MAX_ARRAY_LENGTH] if len(v) > _MAX_ARRAY_LENGTH else v
        else:
            result[k] = _redact_value(k, v)
    return result


def record_event(
    actor: str,
    action: str,
    tool_name: str,
    success: bool,
    latency_ms: int,
    tenant_id: UUID | None = None,
    business_id: UUID | None = None,
    object_type: str | None = None,
    object_id: UUID | None = None,
    input_data: dict | None = None,
    output_data: dict | None = None,
    error_message: str | None = None,
) -> UUID:
    """Persist an audit event. Returns the audit_event_id."""
    input_redacted = redact_dict(input_data or {})
    output_redacted = redact_dict(output_data or {})

    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.audit_events
               (tenant_id, business_id, actor, action, tool_name,
                object_type, object_id, success, latency_ms,
                input_redacted, output_redacted, error_message)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING audit_event_id""",
            (
                str(tenant_id) if tenant_id else None,
                str(business_id) if business_id else None,
                actor, action, tool_name,
                object_type,
                str(object_id) if object_id else None,
                success, latency_ms,
                json.dumps(input_redacted),
                json.dumps(output_redacted),
                error_message,
            ),
        )
        row = cur.fetchone()
        if row and row.get("audit_event_id"):
            return row["audit_event_id"]
        return uuid4()


def list_events(
    business_id: UUID | None = None,
    tool_name: str | None = None,
    success: bool | None = None,
    limit: int = 50,
    cursor_after: str | None = None,
) -> list[dict]:
    conditions: list[str] = []
    params: list = []

    if business_id:
        conditions.append("ae.business_id = %s")
        params.append(str(business_id))
    if tool_name:
        conditions.append("ae.tool_name = %s")
        params.append(tool_name)
    if success is not None:
        conditions.append("ae.success = %s")
        params.append(success)
    if cursor_after:
        conditions.append("ae.created_at < %s")
        params.append(cursor_after)

    where = " AND ".join(conditions) if conditions else "TRUE"
    params.append(limit)

    with get_cursor() as cur:
        cur.execute(
            f"""SELECT ae.audit_event_id, ae.business_id, ae.actor, ae.action,
                       ae.tool_name, ae.object_type, ae.object_id,
                       ae.success, ae.latency_ms,
                       ae.input_redacted, ae.output_redacted,
                       ae.error_message, ae.created_at
                FROM app.audit_events ae
                WHERE {where}
                ORDER BY ae.created_at DESC
                LIMIT %s""",
            params,
        )
        return cur.fetchall()
