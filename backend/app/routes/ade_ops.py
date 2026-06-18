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

from fastapi import APIRouter, HTTPException, Query, Request

from app.auth.platform import require_authenticated_request
from app.observability.logger import emit_log
from app.services import governance
from app.services.ade_ops.models import OpsCommandRequest
from app.services.ade_ops.registry import ops_registry
from app.services.ade_ops.supervisor import run_skill

router = APIRouter(prefix="/api/ade/ops", tags=["ade-ops"])


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
