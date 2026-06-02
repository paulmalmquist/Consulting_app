"""FastAPI routes for the Test Intelligence Copilot (Phase 6).

Three endpoints under /api/telemetry/copilot/* (rides the existing same-origin proxy):
    POST /api/telemetry/copilot/explain-verdict   (flagship — pins the why_no_go intent)
    POST /api/telemetry/copilot/ask               (free-form; classified deterministically, refuses
                                                    anything outside the supported intent menu)
    GET  /api/telemetry/copilot/governance        (real aggregates over the audit log)

The router is async (the LLM compose call is awaited), but the serving tools it calls are sync DB
reads. Heavy ML stays out of the backend — this only orchestrates reads + one LLM completion.
"""
from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query

from app.observability.logger import emit_log
from app.schemas.telemetry_copilot import (
    AskRequest, CopilotAnswerResponse, ExplainVerdictRequest,
)
from app.services import telemetry_copilot as svc

router = APIRouter(prefix="/api/telemetry/copilot", tags=["telemetry-copilot"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, (psycopg.errors.UndefinedTable, psycopg.errors.UndefinedColumn)):
        return HTTPException(503, {"error_code": "SCHEMA_NOT_MIGRATED",
                                   "message": "Telemetry copilot schema not migrated."})
    if isinstance(exc, LookupError):
        return HTTPException(404, {"error_code": "NOT_FOUND", "message": str(exc)})
    if isinstance(exc, ValueError):
        return HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    return HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": str(exc)})


@router.post("/explain-verdict", response_model=CopilotAnswerResponse)
async def explain_verdict(req: ExplainVerdictRequest):
    """Flagship: explain a NO-GO verdict for a run at the fire tick. Pins the why_no_go intent."""
    try:
        result = await svc.answer(
            env_id=req.env_id, business_id=req.business_id, pinned_intent="why_no_go",
            question=f"Why did {req.run_key} flip to {req.verdict} at t={req.fire_tick}?",
            context={"run_key": req.run_key, "fire_tick": req.fire_tick, "channel": req.channel})
        return CopilotAnswerResponse(**result)
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="telemetry_copilot", action="explain_verdict_failed",
                 message=str(exc), error=exc)
        raise _to_http(exc)


@router.post("/ask", response_model=CopilotAnswerResponse)
async def ask(req: AskRequest):
    """Free-form question — classified deterministically; unmatched intents are refused (not a chatbot)."""
    try:
        result = await svc.answer(
            env_id=req.env_id, business_id=req.business_id,
            question=req.question, context=req.context)
        return CopilotAnswerResponse(**result)
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="telemetry_copilot", action="ask_failed",
                 message=str(exc), error=exc)
        raise _to_http(exc)


@router.get("/governance")
def governance(env_id: str = Query(...), business_id: UUID = Query(...)):
    """Real aggregates over the copilot audit log + the active policy version (no hardcoded numbers)."""
    try:
        return svc.governance_summary(env_id=env_id, business_id=business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)
