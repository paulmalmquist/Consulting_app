"""FastAPI routes for the Test Telemetry Go/No-Go Control Tower (MVP vertical slice).

All paths under /api/telemetry/control-tower/* (rides the existing same-origin proxy). Scope (env_id +
business_id) is passed in the body/query and enforced in the service SQL, matching the other telemetry
routes. The Gemma lifecycle actions additionally require operator role + the lifecycle flag + a
confirmation token, and they are async (return a job id; the UI polls).
"""
from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request

from app.observability.logger import emit_log
from app.schemas.control_tower import (
    GemmaActionRequest,
    ResolveRequest,
    ScopeRequest,
    ScoreAndGateRequest,
)
from app.services import governance
from app.services.control_tower import approval, gemma_tier, runner, signing
from app.services.control_tower.gemma_tier import LifecyclePermissionError

router = APIRouter(prefix="/api/telemetry/control-tower", tags=["telemetry-control-tower"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, LifecyclePermissionError):
        return HTTPException(403, {"error_code": "LIFECYCLE_FORBIDDEN", "message": str(exc)})
    if isinstance(exc, (psycopg.errors.UndefinedTable, psycopg.errors.UndefinedColumn)):
        return HTTPException(503, {"error_code": "SCHEMA_NOT_MIGRATED",
                                   "message": "Control Tower schema not migrated (apply 10016_control_tower.sql)."})
    if isinstance(exc, LookupError):
        return HTTPException(404, {"error_code": "NOT_FOUND", "message": str(exc)})
    if isinstance(exc, ValueError):
        return HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    return HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": str(exc)})


def _actor(request: Request) -> str:
    auth = getattr(request.state, "auth", None)
    return getattr(auth, "actor", "anonymous") if auth else "anonymous"


def _is_operator(request: Request) -> bool:
    auth = getattr(request.state, "auth", None)
    role = getattr(auth, "app_role", None) if auth else None
    return role in ("operator", "finance_admin", "admin")


# ── verdict → triage → gate ──────────────────────────────────────────

@router.post("/score-and-gate")
def score_and_gate(req: ScoreAndGateRequest):
    """Score a telemetry window and open a go/no-go gate when the verdict is REVIEW/NO_GO."""
    try:
        return runner.run_gonogo(
            env_id=req.env_id, business_id=req.business_id, run_key=req.run_key,
            channel_name=req.channel_name, window=req.window, itar_tagged=req.itar_tagged,
            execute_triage=req.execute_triage,
        )
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="control-tower", action="score_and_gate_failed",
                 message=str(exc), error=exc)
        raise _to_http(exc)


@router.get("/decisions")
def list_decisions(
    env_id: str = Query(...), business_id: UUID = Query(...),
    status: str | None = Query(None), limit: int = Query(100, le=500),
):
    try:
        runner.expire_stale()  # opportunistic TTL sweep of abandoned gates
        return {"decisions": runner.list_decisions(
            env_id=env_id, business_id=business_id, status=status, limit=limit)}
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/decisions/{decision_id}")
def get_decision(decision_id: str, env_id: str = Query(...), business_id: UUID = Query(...)):
    try:
        row = runner.get_decision(env_id=env_id, business_id=business_id, decision_id=decision_id)
        if row is None:
            raise LookupError("decision not found")
        return row
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.post("/decisions/{decision_id}/resolve")
def resolve_decision(decision_id: str, req: ResolveRequest, request: Request):
    """Resolve the enforced gate: approve / reject (signs a receipt) / request_more_evidence (holds)."""
    try:
        return approval.resolve(
            env_id=req.env_id, business_id=req.business_id, decision_id=decision_id,
            human_decision=req.human_decision, resolved_by=req.resolved_by or _actor(request),
            rationale=req.rationale, requested_evidence=req.requested_evidence,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


# ── signed receipt verification ──────────────────────────────────────

@router.get("/receipts/{receipt_id}/verify")
def verify_receipt(receipt_id: str, env_id: str = Query(...), business_id: UUID = Query(...)):
    try:
        return signing.verify_receipt(env_id=env_id, business_id=business_id, receipt_id=receipt_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/public-key")
def public_key():
    """The pinned Ed25519 public key (for independent, offline receipt verification)."""
    return {"public_key_hex": signing.public_key_hex(), "public_key_id": signing.public_key_id(),
            "algo": "ed25519"}


# ── Gemma private-tier lifecycle ─────────────────────────────────────

@router.get("/gemma-tier")
def gemma_state(env_id: str = Query(...), business_id: UUID = Query(...)):
    try:
        return gemma_tier.get_state(env_id=env_id, business_id=business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.post("/gemma-tier/probe")
def gemma_probe(req: ScopeRequest):
    """Read-only refresh from Vertex (deployedModels). Always safe — no GPU provisioning."""
    try:
        return gemma_tier.probe(env_id=req.env_id, business_id=req.business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.post("/gemma-tier/verify")
def gemma_verify(req: ScopeRequest):
    """Verify teardown: Vertex deployedModels is the source of truth. Returns the refreshed state."""
    try:
        return gemma_tier.probe(env_id=req.env_id, business_id=req.business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/gemma-tier/jobs")
def gemma_jobs(env_id: str = Query(...), business_id: UUID = Query(...), limit: int = Query(20, le=100)):
    try:
        return {"jobs": gemma_tier.list_jobs(env_id=env_id, business_id=business_id, limit=limit)}
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


def _audit_lifecycle(*, env_id, business_id, actor, action, result):
    governance.record_decision(
        business_id=str(business_id), env_id=env_id, actor=actor,
        decision_type="gemma_tier_lifecycle", tool_name=f"gemma:{action}",
        input_summary={"action": action}, output_summary=result, success=True,
        tags=["control_tower", "gemma_tier_lifecycle", action],
    )


@router.post("/gemma-tier/warm")
def gemma_warm(req: GemmaActionRequest, request: Request, background_tasks: BackgroundTasks):
    """Async, guarded: create a warm job and schedule it. Returns {job_id, status} immediately.

    NOTE: actual GPU provisioning only runs when CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED=true; otherwise
    the scheduled job fails closed."""
    try:
        result = gemma_tier.request_warm(
            env_id=req.env_id, business_id=req.business_id, requested_by=_actor(request),
            is_operator=_is_operator(request), confirm=req.confirm,
        )
        _audit_lifecycle(env_id=req.env_id, business_id=req.business_id, actor=_actor(request),
                         action="warm", result=result)
        background_tasks.add_task(gemma_tier.run_job, result["job_id"])
        return result
    except Exception as exc:  # noqa: BLE001
        emit_log(level="warn", service="control-tower", action="gemma_warm_blocked", message=str(exc))
        raise _to_http(exc)


@router.post("/gemma-tier/teardown")
def gemma_teardown(req: GemmaActionRequest, request: Request, background_tasks: BackgroundTasks):
    """Async, guarded: create a teardown job (undeploy_all; endpoint retained) and schedule it."""
    try:
        result = gemma_tier.request_teardown(
            env_id=req.env_id, business_id=req.business_id, requested_by=_actor(request),
            is_operator=_is_operator(request), confirm=req.confirm,
        )
        _audit_lifecycle(env_id=req.env_id, business_id=req.business_id, actor=_actor(request),
                         action="teardown", result=result)
        background_tasks.add_task(gemma_tier.run_job, result["job_id"])
        return result
    except Exception as exc:  # noqa: BLE001
        emit_log(level="warn", service="control-tower", action="gemma_teardown_blocked", message=str(exc))
        raise _to_http(exc)
