"""Audit Dashboard API for the ADE governed fabric (plan PR 3).

Read-only audit visibility over existing tables (ai_decision_audit_log, app.audit_events).
Mounted under /api/ade/audit to reuse the committed ADE proxy and keep path naming
consistent with the rest of the surface.

Paths:
    GET /api/ade/audit/summary                aggregate strip + calls-per-day + est cost
    GET /api/ade/audit/decisions              AI decision log (optional ?tool_name=)
    GET /api/ade/audit/decisions/{id}         single decision, full redacted receipt
    GET /api/ade/audit/lineage/{tool_name}    all decisions for one tool

All reads fail closed with a null_reason rather than erroring open.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.observability.logger import emit_log
from app.services import audit_dashboard as svc
from app.services import governance as governance_svc

router = APIRouter(prefix="/api/ade/audit", tags=["ade"])

_EMPTY_SUMMARY = {
    "window_days": svc.HOT_WINDOW_DAYS, "total_decisions": 0, "successful": 0, "failed": 0,
    "success_rate": None, "avg_latency_ms": None, "avg_grounding_score": None,
    "high_grounding": 0, "mixed_grounding": 0, "low_grounding": 0, "top_tools": [],
    "calls_per_day": [], "estimated_cost_usd": None, "cost_is_estimate": True,
}


@router.get("/summary")
def summary(business_id: UUID = Query(...), env_id: str = Query(None)):
    try:
        data = svc.summary(business_id, env_id=env_id)
        return {**data, "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="audit_dashboard", action="summary_failed", message=str(exc), error=exc)
        return {**_EMPTY_SUMMARY, "null_reason": "audit_summary_unavailable"}


@router.get("/decisions")
def decisions(
    business_id: UUID = Query(...),
    env_id: str = Query(None),
    tool_name: str = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    try:
        rows = svc.decisions(business_id, env_id=env_id, tool_name=tool_name, limit=limit, offset=offset)
        return {"decisions": rows, "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="audit_dashboard", action="decisions_failed", message=str(exc), error=exc)
        return {"decisions": [], "null_reason": "audit_decisions_unavailable"}


@router.get("/decisions/{decision_id}")
def decision_detail(decision_id: UUID):
    """Full redacted receipt for one decision. Redaction happened at write time."""
    try:
        row = governance_svc.get_decision(decision_id)
        if row is None:
            raise HTTPException(404, {"error_code": "NOT_FOUND", "message": f"Unknown decision: {decision_id}"})
        # Serialize datetimes/UUIDs to strings; input/output_summary are already redacted.
        out = {}
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                out[k] = v.isoformat()
            elif isinstance(v, UUID):
                out[k] = str(v)
            else:
                out[k] = v
        return {**out, "null_reason": None}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="audit_dashboard", action="decision_detail_failed", message=str(exc), error=exc)
        raise HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": "audit_decision_unavailable"})


@router.get("/lineage/{tool_name}")
def lineage(tool_name: str, business_id: UUID = Query(...), env_id: str = Query(None)):
    try:
        rows = svc.lineage(business_id, tool_name, env_id=env_id)
        return {"tool_name": tool_name, "decisions": rows, "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="audit_dashboard", action="lineage_failed", message=str(exc), error=exc)
        return {"tool_name": tool_name, "decisions": [], "null_reason": "audit_lineage_unavailable"}
