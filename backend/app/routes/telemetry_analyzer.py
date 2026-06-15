"""Telemetry Analyzer API (plan PR 9).

Read-only. Grounds findings in the existing telemetry serving reads; fails closed with
null_reasons rather than fabricating numbers. Mounted under /api/ade/analyze to keep the
governed-fabric path naming consistent.

Paths:
    POST /api/ade/analyze/telemetry            run the analyzer, return AnalyzerFinding[]
    GET  /api/ade/analyze/telemetry/summary    compact grounded overview
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.auth.platform import require_environment_access
from app.observability.logger import emit_log
from app.services import telemetry_analyzer as svc

router = APIRouter(prefix="/api/ade/analyze/telemetry", tags=["ade"])


class AnalyzeBody(BaseModel):
    env_id: str
    business_id: UUID


@router.post("")
def analyze(body: AnalyzeBody, request: Request):
    require_environment_access(request, env_id=body.env_id)
    try:
        return {**svc.analyze(body.env_id, body.business_id), "null_reason": None}
    except Exception as exc:  # noqa: BLE001 — fail closed, never 500 with fabricated data
        emit_log(level="error", service="telemetry_analyzer", action="analyze_failed", message=str(exc), error=exc)
        return {"analyzer_type": "telemetry", "findings": [], "null_reasons": [],
                "latency_ms": None, "null_reason": "telemetry_analyze_unavailable"}


@router.get("/summary")
def summary(request: Request, env_id: str = Query(...), business_id: UUID = Query(...)):
    require_environment_access(request, env_id=env_id)
    try:
        return {**svc.summary(env_id, business_id), "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="telemetry_analyzer", action="summary_failed", message=str(exc), error=exc)
        return {"analyzer_type": "telemetry", "finding_count": 0, "by_severity": {},
                "null_reasons": [], "latency_ms": None, "null_reason": "telemetry_summary_unavailable"}
