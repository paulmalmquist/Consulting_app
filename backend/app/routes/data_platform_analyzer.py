"""Data Platform Analyzer API (plan PR 10).

Read-only. Grounds findings in existing DQ/pipeline/audit reads; fails closed with
null_reasons rather than fabricating numbers. Mounted under /api/ade/analyze.

Paths:
    POST /api/ade/analyze/data-platform          run the analyzer, return AnalyzerFinding[]
    GET  /api/ade/analyze/data-platform/summary  compact grounded overview
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.auth.platform import require_environment_access
from app.observability.logger import emit_log
from app.services import data_platform_analyzer as svc
from app.services.analyzer_persist import persist_findings_as_cards

router = APIRouter(prefix="/api/ade/analyze/data-platform", tags=["ade"])


class AnalyzeBody(BaseModel):
    env_id: str
    business_id: UUID
    persist: bool = False  # when true, upsert findings as intel cards (default off: read-only)


@router.post("")
def analyze(body: AnalyzeBody, request: Request):
    require_environment_access(request, env_id=body.env_id)
    try:
        result = svc.analyze(body.env_id, body.business_id)
        cards_upserted = (
            persist_findings_as_cards(body.env_id, body.business_id, result.get("findings", []))
            if body.persist else 0
        )
        return {**result, "cards_upserted": cards_upserted, "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="data_platform_analyzer", action="analyze_failed", message=str(exc), error=exc)
        return {"analyzer_type": "data_platform", "findings": [], "null_reasons": [],
                "latency_ms": None, "null_reason": "data_platform_analyze_unavailable"}


@router.get("/summary")
def summary(request: Request, env_id: str = Query(...), business_id: UUID = Query(...)):
    require_environment_access(request, env_id=env_id)
    try:
        return {**svc.summary(env_id, business_id), "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="data_platform_analyzer", action="summary_failed", message=str(exc), error=exc)
        return {"analyzer_type": "data_platform", "finding_count": 0, "by_severity": {},
                "null_reasons": [], "latency_ms": None, "null_reason": "data_platform_summary_unavailable"}
