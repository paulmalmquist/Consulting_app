"""Investigation Session API (plan PR 6).

Streaming, pausable, deterministic-first analysis sessions under the ADE governed
fabric. Mounted at /api/ade/analytics/sessions to keep ADE path naming consistent.

Security: every route requires environment access (platform-session mismatch -> 403);
reads/control are tenant-scoped and 404 when the row is not visible (cross-env probe
gets 404, not a 200-with-null). Read-only tools only — no write tools in PR 6.

Paths:
    POST /api/ade/analytics/sessions                  create (returns session_id fast)
    GET  /api/ade/analytics/sessions                  list for env
    GET  /api/ade/analytics/sessions/{id}             reconnect state (events + sections)
    GET  /api/ade/analytics/sessions/{id}/stream      SSE lifecycle stream
    POST /api/ade/analytics/sessions/{id}/pause
    POST /api/ade/analytics/sessions/{id}/resume
    POST /api/ade/analytics/sessions/{id}/steer       {instruction}
    POST /api/ade/analytics/sessions/{id}/fork        {title?}
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.auth.platform import require_environment_access
from app.observability.logger import emit_log
from app.services import analysis_sessions as svc

router = APIRouter(prefix="/api/ade/analytics/sessions", tags=["ade"])


class CreateSessionBody(BaseModel):
    env_id: str
    business_id: UUID
    title: str
    objective: str | None = None
    source_ref: dict = Field(default_factory=dict)


class SteerBody(BaseModel):
    env_id: str
    business_id: UUID
    instruction: str


class ForkBody(BaseModel):
    env_id: str
    business_id: UUID
    title: str | None = None


class ControlBody(BaseModel):
    env_id: str
    business_id: UUID


def _actor(request: Request, env_id: str) -> str:
    auth = require_environment_access(request, env_id=env_id)
    return getattr(auth, "actor", None) or "winston"


@router.post("")
def create_session(body: CreateSessionBody, request: Request):
    actor = _actor(request, body.env_id)
    try:
        session = svc.create_session(
            body.env_id, body.business_id, title=body.title, objective=body.objective,
            source_ref=body.source_ref, created_by=actor,
        )
        return {"session_id": session["id"], "status": session["status"], "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="analysis_sessions", action="create_failed", message=str(exc), error=exc)
        raise HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": "session_create_failed"})


@router.get("")
def list_sessions(request: Request, env_id: str = Query(...), business_id: UUID = Query(...),
                  limit: int = Query(50, ge=1, le=200)):
    require_environment_access(request, env_id=env_id)
    try:
        return {"sessions": svc.list_sessions(env_id, business_id, limit=limit), "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="analysis_sessions", action="list_failed", message=str(exc), error=exc)
        return {"sessions": [], "null_reason": "sessions_unavailable"}


@router.get("/{session_id}")
def get_session(session_id: UUID, request: Request, env_id: str = Query(...),
                business_id: UUID = Query(...)):
    require_environment_access(request, env_id=env_id)
    state = svc.get_session_state(env_id, business_id, session_id)
    if state is None:
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": f"Unknown session: {session_id}"})
    return {**state, "null_reason": None}


@router.get("/{session_id}/stream")
async def stream_session(session_id: UUID, request: Request, env_id: str = Query(...),
                         business_id: UUID = Query(...)):
    actor = _actor(request, env_id)
    # 404 (not 200) on a cross-env / unknown id before opening the stream.
    if svc.get_session_state(env_id, business_id, session_id) is None:
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": f"Unknown session: {session_id}"})
    return StreamingResponse(
        svc.session_stream(env_id, business_id, session_id, actor=actor),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
                 "Connection": "keep-alive"},
    )


@router.post("/{session_id}/pause")
def pause(session_id: UUID, body: ControlBody, request: Request):
    actor = _actor(request, body.env_id)
    result = svc.pause_session(body.env_id, body.business_id, session_id, actor=actor)
    if result.get("status") == "not_found":
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": f"Unknown session: {session_id}"})
    return {**result, "null_reason": None}


@router.post("/{session_id}/resume")
def resume(session_id: UUID, body: ControlBody, request: Request):
    require_environment_access(request, env_id=body.env_id)
    result = svc.resume_session(body.env_id, body.business_id, session_id)
    if result.get("status") == "not_found":
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": f"Unknown session: {session_id}"})
    return {**result, "null_reason": None}


@router.post("/{session_id}/steer")
def steer(session_id: UUID, body: SteerBody, request: Request):
    actor = _actor(request, body.env_id)
    result = svc.steer_session(body.env_id, body.business_id, session_id, body.instruction, actor=actor)
    if result.get("status") == "not_found":
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": f"Unknown session: {session_id}"})
    return {**result, "null_reason": None}


@router.post("/{session_id}/fork")
def fork(session_id: UUID, body: ForkBody, request: Request):
    actor = _actor(request, body.env_id)
    result = svc.fork_session(body.env_id, body.business_id, session_id, title=body.title, created_by=actor)
    if result.get("status") == "not_found":
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": f"Unknown session: {session_id}"})
    return {**result, "null_reason": None}
