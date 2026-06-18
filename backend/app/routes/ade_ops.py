"""ADE Ops Orchestrator routes — read-only governed operations surface (PR 1).

    GET  /api/ade/ops/skills        — the skill catalog (risk tiers, modes, executable)
    GET  /api/ade/ops/skills/{name} — one skill definition
    GET  /api/ade/ops/runs          — recent ade_op receipts (business-scoped, fail-closed)
    POST /api/ade/ops/run           — run a tier 0-1 skill read-only; tier >= 2 -> blocked

Built only on durable primitives (ops registry + ai_decision_audit_log via
governance). No dependency on the ade_connectors product surface. Reads require
authentication (fail closed on auth); empty results are only for storage/read
failure, never for missing auth.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.auth.platform import require_authenticated_request
from app.observability.logger import emit_log
from app.services import governance
from app.services.ade_ops import approval_store, approvals, simulation
from app.services.ade_ops.models import OpsCommandRequest
from app.services.ade_ops.registry import ops_registry
from app.services.ade_ops.supervisor import run_skill

router = APIRouter(prefix="/api/ade/ops", tags=["ade-ops"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _record_approval_receipt(*, business_id: str, env_id: str | None, action: str,
                             req_obj: approvals.ApprovalRequest) -> None:
    """Honest receipt for an approval/preflight event. Swallows write failure the
    same way the supervisor does — never raises, never claims a phantom id."""
    try:
        governance.record_decision(
            business_id=business_id, env_id=env_id, actor="ade_ops_approval",
            decision_type="ade_op", tool_name=f"approval.{action}",
            input_summary={"approval_id": req_obj.approval_id,
                           "recommendation_id": req_obj.recommendation_id},
            output_summary={"state": req_obj.state.value, "executed": req_obj.executed,
                            "null_reason": req_obj.null_reason},
            success=(req_obj.null_reason is None),
            tags=[f"tier{int(req_obj.risk_tier)}", "ade_op", "approval", action])
    except Exception as exc:  # noqa: BLE001 — receipts must never break the flow
        emit_log(level="error", service="ade_ops", action="approval_receipt_failed",
                 message=str(exc), error=exc)


@router.get("/skills")
def list_skills(request: Request):
    require_authenticated_request(request)
    skills = ops_registry.describe_all()
    return {
        "skills": skills,
        "risk_tiers": {
            "0": "inventory (read-only)", "1": "recommendation only",
            "2": "dry-run patch/ticket", "3": "non-prod write",
            "4": "prod write", "5": "rollback/emergency",
        },
        "executable_max_tier": 1,
        "null_reason": None,
    }


@router.get("/skills/{name}")
def get_skill(name: str, request: Request):
    require_authenticated_request(request)
    skill = ops_registry.get(name)
    if skill is None:
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": f"Unknown skill: {name}"})
    return skill.manifest()


@router.get("/runs")
def list_runs(
    request: Request,
    business_id: str = Query(...),
    env_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Recent ade_op receipts. Auth-gated; business-scoped. Empty + null_reason
    only on a read failure, never on missing auth (that is a 401)."""
    require_authenticated_request(request)
    try:
        rows = governance.list_decisions(
            business_id, env_id=env_id, decision_type="ade_op", limit=limit)
        return {"runs": [_serialize(r) for r in rows], "null_reason": None}
    except Exception as exc:  # noqa: BLE001 — fail closed on storage error, not auth
        emit_log(level="error", service="ade_ops", action="runs_failed",
                 message=str(exc), error=exc)
        return {"runs": [], "null_reason": "runs_read_unavailable"}


@router.post("/run")
def run(req: OpsCommandRequest, request: Request):
    """Run one skill read-only. Tier >= 2 returns 200 with status:'blocked'
    (a governed domain outcome, not an HTTP error)."""
    require_authenticated_request(request)
    result = run_skill(req)
    return result.to_dict()


# ── Approval escrow + execution preflight (PR 5A) ─────────────────────────────

class CreateApprovalBody(BaseModel):
    recommendation: dict
    business_id: str
    env_id: str | None = None
    requested_by: str | None = None
    ttl_seconds: int = approvals.DEFAULT_TTL_SECONDS
    rollback_plan: str | None = None
    observation_window: str | None = None


class ApproveBody(BaseModel):
    business_id: str
    env_id: str | None = None
    approver: str
    approval_token: str


class TenantBody(BaseModel):
    business_id: str
    env_id: str | None = None


@router.post("/approvals")
def create_approval(body: CreateApprovalBody, request: Request):
    """Escrow a PR-4 recommendation for human approval. Creates a pending (or
    blocked) request with a token + TTL. No execution capability is granted."""
    require_authenticated_request(request)
    req_obj = approvals.create_approval_request(
        body.recommendation, requested_by=body.requested_by, ttl_seconds=body.ttl_seconds,
        now=_now(), rollback_plan=body.rollback_plan, observation_window=body.observation_window)
    approval_id = approval_store.insert(req_obj, env_id=body.env_id or "", business_id=body.business_id)
    req_obj.approval_id = approval_id
    _record_approval_receipt(business_id=body.business_id, env_id=body.env_id,
                             action="created", req_obj=req_obj)
    # The token is returned once, to the authenticated caller, for the approve step.
    return req_obj.to_dict()


@router.get("/approvals")
def list_approvals(request: Request, business_id: str = Query(...),
                   env_id: str | None = Query(None), limit: int = Query(50, ge=1, le=200)):
    require_authenticated_request(request)
    try:
        items = approval_store.list_recent(env_id=env_id or "", business_id=business_id, limit=limit)
        now = _now()
        return {"approvals": [approvals.refresh_state(i, now).to_dict() for i in items],
                "null_reason": None}
    except Exception as exc:  # noqa: BLE001 — fail closed on storage error, not auth
        emit_log(level="error", service="ade_ops", action="approvals_read_failed",
                 message=str(exc), error=exc)
        return {"approvals": [], "null_reason": "approvals_read_unavailable"}


@router.get("/approvals/{approval_id}")
def get_approval(approval_id: str, request: Request, business_id: str = Query(...),
                 env_id: str | None = Query(None)):
    require_authenticated_request(request)
    req_obj = approval_store.get(approval_id, env_id=env_id or "", business_id=business_id)
    if req_obj is None:
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": "Unknown approval"})
    return approvals.refresh_state(req_obj, _now()).to_dict()


@router.post("/approvals/{approval_id}/approve")
def approve_approval(approval_id: str, body: ApproveBody, request: Request):
    require_authenticated_request(request)
    req_obj = approval_store.get(approval_id, env_id=body.env_id or "", business_id=body.business_id)
    if req_obj is None:
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": "Unknown approval"})
    approvals.approve(req_obj, approver=body.approver, token=body.approval_token, now=_now())
    approval_store.update_state(req_obj, env_id=body.env_id or "", business_id=body.business_id)
    _record_approval_receipt(business_id=body.business_id, env_id=body.env_id,
                             action="approved", req_obj=req_obj)
    return req_obj.to_dict()


@router.post("/approvals/{approval_id}/preflight")
def preflight_approval(approval_id: str, body: TenantBody, request: Request):
    require_authenticated_request(request)
    req_obj = approval_store.get(approval_id, env_id=body.env_id or "", business_id=body.business_id)
    if req_obj is None:
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": "Unknown approval"})
    approvals.run_preflight(req_obj)
    approval_store.update_state(req_obj, env_id=body.env_id or "", business_id=body.business_id)
    return req_obj.to_dict()


class ExecuteBody(TenantBody):
    # PR 5B: only 'simulation' is executable. Real modes are blocked (PR 5C).
    execution_mode: str = "simulation"


@router.post("/approvals/{approval_id}/execute")
def execute_approval(approval_id: str, body: ExecuteBody, request: Request):
    """PR 5B: runs the SIMULATED execution ceremony when execution_mode=simulation
    (approved + preflight required). A real mode ('nonprod'/'prod') is blocked —
    there is no real executor until PR 5C. No provider write happens here."""
    require_authenticated_request(request)
    req_obj = approval_store.get(approval_id, env_id=body.env_id or "", business_id=body.business_id)
    if req_obj is None:
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": "Unknown approval"})
    outcome = simulation.simulate_execution(req_obj, mode=body.execution_mode, now=_now())
    if outcome.get("executed"):
        approval_store.record_simulated_execution(
            approval_id, env_id=body.env_id or "", business_id=body.business_id,
            executed_at=outcome["executed_at"],
            observation_window_opened_at=outcome["observation_window_opened_at"])
        req_obj = approval_store.get(approval_id, env_id=body.env_id or "", business_id=body.business_id) or req_obj
    _record_approval_receipt(business_id=body.business_id, env_id=body.env_id,
                             action=f"execute.{body.execution_mode}", req_obj=req_obj)
    return {"approval": req_obj.to_dict(), "execution": outcome}


@router.post("/approvals/{approval_id}/rollback")
def rollback_approval(approval_id: str, body: TenantBody, request: Request):
    """PR 5B: records a SIMULATED rollback (requires a rollback plan + a prior
    simulated execution). Touches no provider."""
    require_authenticated_request(request)
    req_obj = approval_store.get(approval_id, env_id=body.env_id or "", business_id=body.business_id)
    if req_obj is None:
        raise HTTPException(404, {"error_code": "NOT_FOUND", "message": "Unknown approval"})
    outcome = simulation.simulate_rollback(req_obj, now=_now())
    if outcome.get("rolled_back"):
        approval_store.record_simulated_rollback(
            approval_id, env_id=body.env_id or "", business_id=body.business_id,
            rolled_back_at=outcome["rolled_back_at"])
    _record_approval_receipt(business_id=body.business_id, env_id=body.env_id,
                             action="rollback.simulation", req_obj=req_obj)
    return {"approval": req_obj.to_dict(), "rollback": outcome}


def _serialize(row: dict) -> dict:
    """Surface receipt metadata only. Redacted summaries were redacted at write
    time by governance.record_decision; we pass them through, never re-expose raw."""
    created = row.get("created_at")
    return {
        "receipt_id": str(row.get("id")) if row.get("id") else None,
        "skill": row.get("tool_name"),
        "actor": row.get("actor"),
        "success": row.get("success"),
        "confidence": float(row["confidence"]) if row.get("confidence") is not None else None,
        "tags": row.get("tags") or [],
        "output_summary": row.get("output_summary"),
        "created_at": created.isoformat() if created is not None else None,
    }
