"""Executive Autopilot API (plan PR 16a) — deterministic morning brief, NO LLM.

On-demand only (no cron in 16a). Env-scoped, fail-closed. The generated brief lands as a
story card in the existing feed (created_by='autopilot').

Paths:
    POST /api/ade/intel/morning-brief/generate   build/refresh today's brief (idempotent)
    GET  /api/ade/intel/morning-brief            today's brief, or honest null
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.auth.platform import require_environment_access
from app.observability.logger import emit_log
from app.services import morning_brief as svc

router = APIRouter(prefix="/api/ade/intel/morning-brief", tags=["ade"])


class GenerateBody(BaseModel):
    env_id: str
    business_id: UUID
    brief_date: str | None = None  # optional override; defaults to server today


@router.post("/generate")
def generate(body: GenerateBody, request: Request):
    require_environment_access(request, env_id=body.env_id)
    try:
        return svc.generate(body.env_id, body.business_id, brief_date=body.brief_date)
    except Exception as exc:  # noqa: BLE001 — never 500 with fabricated content
        emit_log(level="error", service="morning_brief", action="generate_route_failed", message=str(exc), error=exc)
        return {"brief": None, "card_id": None, "null_reason": "morning_brief_unavailable"}


@router.get("")
def get(request: Request, env_id: str = Query(...), business_id: UUID = Query(...),
        brief_date: str = Query(None)):
    require_environment_access(request, env_id=env_id)
    try:
        return svc.get_brief(env_id, business_id, brief_date=brief_date)
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="morning_brief", action="get_route_failed", message=str(exc), error=exc)
        return {"brief": None, "card_id": None, "null_reason": "morning_brief_unavailable"}
