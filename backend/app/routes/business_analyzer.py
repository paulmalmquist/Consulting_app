"""Business Analyzer API (plan PR 11).

Read-only. Env-type dispatch (consulting / accounting / generic), grounded in existing
reads; fails closed with null_reasons rather than fabricating numbers. Mounted under
/api/ade/analyze.

Paths:
    POST /api/ade/analyze/business          run the analyzer, return AnalyzerFinding[]
    GET  /api/ade/analyze/business/summary  compact grounded overview
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.auth.platform import require_environment_access
from app.observability.logger import emit_log
from app.services import business_analyzer as svc

router = APIRouter(prefix="/api/ade/analyze/business", tags=["ade"])


class AnalyzeBody(BaseModel):
    env_id: str
    business_id: UUID
    env_type: str | None = None  # optional override; otherwise resolved from the env row


@router.post("")
def analyze(body: AnalyzeBody, request: Request):
    require_environment_access(request, env_id=body.env_id)
    try:
        return {**svc.analyze(body.env_id, body.business_id, env_type=body.env_type), "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="business_analyzer", action="analyze_failed", message=str(exc), error=exc)
        return {"analyzer_type": "business", "env_type": None, "findings": [], "null_reasons": [],
                "latency_ms": None, "null_reason": "business_analyze_unavailable"}


@router.get("/summary")
def summary(request: Request, env_id: str = Query(...), business_id: UUID = Query(...),
            env_type: str = Query(None)):
    require_environment_access(request, env_id=env_id)
    try:
        return {**svc.summary(env_id, business_id, env_type=env_type), "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="business_analyzer", action="summary_failed", message=str(exc), error=exc)
        return {"analyzer_type": "business", "env_type": None, "finding_count": 0, "by_severity": {},
                "null_reasons": [], "latency_ms": None, "null_reason": "business_summary_unavailable"}
