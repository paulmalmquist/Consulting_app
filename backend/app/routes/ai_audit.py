"""AI Audit routes — trigger nightly audit, query findings, manage pending actions.

Provides:
  - POST /api/ai/audit/run          — trigger a full audit run
  - GET  /api/ai/audit/findings     — query audit findings
  - GET  /api/ai/audit/pending      — list pending actions
  - POST /api/ai/audit/pending/{id}/resolve — manually resolve a pending action
  - GET  /api/ai/audit/skills       — list skill candidates
  - POST /api/ai/audit/ui-event     — record a UI telemetry event
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth.platform import require_authenticated_request

router = APIRouter(prefix="/api/ai/audit", tags=["ai-audit"])
logger = logging.getLogger(__name__)


# ── Schemas ─────────────────────────────────────────────────────────

class AuditRunRequest(BaseModel):
    lookback_hours: int = 24


class PendingActionResolveRequest(BaseModel):
    status: str  # confirmed, cancelled
    resolution_message: str | None = None


class UiEventRequest(BaseModel):
    conversation_id: str | None = None
    business_id: str
    env_id: str | None = None
    event_type: str
    event_data: dict[str, Any] = {}
    surface: str | None = None
    lane: str | None = None


# ── Audit Run ──────────────────────────────────────────────────────

@router.post("/run")
def trigger_audit(payload: AuditRunRequest, request: Request):
    """Trigger a full nightly audit run.  Returns summary of findings."""
    require_authenticated_request(request)
    from app.services.ai_audit import run_nightly_audit
    result = run_nightly_audit(lookback_hours=payload.lookback_hours)
    return result


# ── Audit Findings ────────────────────────────────────────────────

@router.get("/findings")
def list_findings(
    request: Request,
    finding_type: str | None = None,
    severity: str | None = None,
    audit_run_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """Query audit findings with optional filters."""
    require_authenticated_request(request)
    from app.db import get_cursor

    clauses: list[str] = []
    params: list[Any] = []

    if finding_type:
        clauses.append("finding_type = %s")
        params.append(finding_type)
    if severity:
        clauses.append("severity = %s")
        params.append(severity)
    if audit_run_id:
        clauses.append("audit_run_id = %s")
        params.append(audit_run_id)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    with get_cursor() as cur:
        cur.execute(
            f"""SELECT * FROM ai_audit_findings {where}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s""",
            params + [min(limit, 200), offset],
        )
        rows = cur.fetchall()

    return {
        "findings": [_serialize_finding(r) for r in rows],
        "count": len(rows),
    }


# ── Pending Actions ──────────────────────────────────────────────

@router.get("/pending")
def list_pending(
    request: Request,
    business_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
):
    """List pending actions with optional filters."""
    require_authenticated_request(request)
    from app.db import get_cursor

    clauses: list[str] = []
    params: list[Any] = []

    if business_id:
        clauses.append("business_id = %s")
        params.append(business_id)
    if status:
        clauses.append("status = %s")
        params.append(status)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    with get_cursor() as cur:
        cur.execute(
            f"""SELECT * FROM ai_pending_actions {where}
                ORDER BY created_at DESC
                LIMIT %s""",
            params + [min(limit, 200)],
        )
        rows = cur.fetchall()

    return {
        "pending_actions": [_serialize_pending_action(r) for r in rows],
        "count": len(rows),
    }


@router.post("/pending/{pending_action_id}/resolve")
def resolve_pending(
    pending_action_id: str,
    payload: PendingActionResolveRequest,
    request: Request,
):
    """Manually resolve a pending action."""
    require_authenticated_request(request)
    from app.services.pending_action_manager import resolve_pending_action

    if payload.status not in ("confirmed", "cancelled", "superseded"):
        raise HTTPException(status_code=400, detail="Invalid status. Must be confirmed, cancelled, or superseded.")

    result = resolve_pending_action(
        pending_action_id,
        new_status=payload.status,
        resolution_message=payload.resolution_message,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Pending action not found")
    return _serialize_pending_action(result)


# ── Skill Candidates ────────────────────────────────────────────

@router.get("/skills")
def list_skill_candidates(
    request: Request,
    pattern_type: str | None = None,
    promoted: bool | None = None,
    limit: int = 50,
):
    """List discovered skill candidates."""
    require_authenticated_request(request)
    from app.db import get_cursor

    clauses: list[str] = []
    params: list[Any] = []

    if pattern_type:
        clauses.append("pattern_type = %s")
        params.append(pattern_type)
    if promoted is not None:
        clauses.append("promoted = %s")
        params.append(promoted)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    with get_cursor() as cur:
        cur.execute(
            f"""SELECT * FROM ai_skill_candidates {where}
                ORDER BY occurrence_count DESC, last_seen_at DESC
                LIMIT %s""",
            params + [min(limit, 200)],
        )
        rows = cur.fetchall()

    return {
        "skill_candidates": [_serialize_skill_candidate(r) for r in rows],
        "count": len(rows),
    }


# ── UI Events ────────────────────────────────────────────────────

@router.post("/ui-event")
def record_ui_event(payload: UiEventRequest, request: Request):
    """Record a frontend UI telemetry event."""
    require_authenticated_request(request)
    actor = request.headers.get("x-bm-actor", "anonymous")

    from app.db import get_cursor
    try:
        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO ai_ui_events (
                     conversation_id, business_id, env_id, actor,
                     event_type, event_data, surface, lane
                   ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (
                    payload.conversation_id,
                    payload.business_id,
                    payload.env_id,
                    actor,
                    payload.event_type,
                    json.dumps(payload.event_data),
                    payload.surface,
                    payload.lane,
                ),
            )
            row = cur.fetchone()
            return {"id": str(row["id"]) if row else None, "recorded": True}
    except Exception as e:
        logger.exception("Failed to record UI event")
        raise HTTPException(status_code=500, detail=str(e))


# ── Serializers ──────────────────────────────────────────────────

def _serialize_finding(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "audit_run_id": str(row["audit_run_id"]),
        "finding_type": row["finding_type"],
        "severity": row["severity"],
        "title": row["title"],
        "detail": row.get("detail"),
        "conversation_id": str(row["conversation_id"]) if row.get("conversation_id") else None,
        "pending_action_id": str(row["pending_action_id"]) if row.get("pending_action_id") else None,
        "tool_name": row.get("tool_name"),
        "lane": row.get("lane"),
        "count": row.get("count"),
        "p50_ms": row.get("p50_ms"),
        "p95_ms": row.get("p95_ms"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


def _serialize_pending_action(row: dict) -> dict:
    return {
        "pending_action_id": str(row["pending_action_id"]),
        "conversation_id": str(row["conversation_id"]),
        "business_id": str(row["business_id"]),
        "env_id": str(row["env_id"]) if row.get("env_id") else None,
        "actor": row.get("actor"),
        "skill_id": row.get("skill_id"),
        "action_type": row.get("action_type"),
        "params_json": row.get("params_json"),
        "missing_fields": row.get("missing_fields"),
        "status": row.get("status"),
        "resolution_message": row.get("resolution_message"),
        "scope_type": row.get("scope_type"),
        "scope_id": row.get("scope_id"),
        "scope_label": row.get("scope_label"),
        "expires_at": row["expires_at"].isoformat() if row.get("expires_at") else None,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "resolved_at": row["resolved_at"].isoformat() if row.get("resolved_at") else None,
    }


def _serialize_skill_candidate(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "pattern_type": row["pattern_type"],
        "pattern_signature": row["pattern_signature"],
        "sample_prompts": row.get("sample_prompts"),
        "sample_tool_chains": row.get("sample_tool_chains"),
        "occurrence_count": row.get("occurrence_count"),
        "promoted": row.get("promoted", False),
        "promoted_skill_id": row.get("promoted_skill_id"),
        "notes": row.get("notes"),
        "first_seen_at": row["first_seen_at"].isoformat() if row.get("first_seen_at") else None,
        "last_seen_at": row["last_seen_at"].isoformat() if row.get("last_seen_at") else None,
    }
