"""v2 environment blueprint endpoints.

Forward-looking only. Does NOT touch /v1/environments or legacy canonical envs.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.db import get_cursor
from app.schemas.lab_v2 import (
    ContractVerificationReport,
    CreateEnvironmentV2Response,
    EnvironmentContractOut,
    EnvironmentManifestV2,
    PromoteRequest,
    QuarantineRequest,
    TemplateOut,
)
from app.services import (
    environment_contract_v2,
    environment_pipeline_v2,
    environment_templates_v2,
)


router = APIRouter(prefix="/v2")


@router.get("/environments/templates", response_model=list[TemplateOut])
def list_templates(refresh: int = 0):
    rows = environment_templates_v2.list_templates(force_refresh=bool(refresh))
    return [TemplateOut(**r) for r in rows]


@router.get("/environments/health")
def v2_environments_health():
    """Integrity check: every active env with a template_key has its template row.

    Returns 200 with counts when clean. Returns 503 with the list of dangling
    references when an env points at a template_key/version pair that no longer
    exists or is no longer active. This is what catches "someone deleted the
    supply_chain row" before downstream provisioning logic drifts silently.

    This endpoint is intentionally separate from /health so a vertical-scoped
    drift does not fail global liveness.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT env_id, slug, template_key, template_version
              FROM app.environments
             WHERE template_key IS NOT NULL
               AND is_active = true
            """
        )
        envs = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT template_key, version
              FROM app.environment_templates
             WHERE is_active = true
            """
        )
        active_templates = {(r["template_key"], r["version"]) for r in cur.fetchall()}

    missing = [
        {
            "env_id": str(e["env_id"]),
            "slug": e["slug"],
            "template_key": e["template_key"],
            "template_version": e["template_version"],
        }
        for e in envs
        if (e["template_key"], e["template_version"]) not in active_templates
    ]
    payload = {
        "active_templates_count": len(active_templates),
        "envs_with_template_key": len(envs),
        "missing_template_refs": missing,
    }
    if missing:
        return JSONResponse(status_code=503, content={"ok": False, **payload})
    return {"ok": True, **payload}


@router.get("/environments/templates/{template_key}", response_model=TemplateOut)
def get_template(template_key: str, version: int | None = None):
    try:
        row = environment_templates_v2.get_template(template_key, version)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return TemplateOut(**row)


@router.post(
    "/environments",
    response_model=CreateEnvironmentV2Response,
    status_code=201,
)
def create_environment_v2(manifest: EnvironmentManifestV2):
    try:
        return environment_pipeline_v2.create_environment_v2(manifest)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/environments/{env_id}/verify")
def verify_environment(env_id: UUID, strict: int = 0):
    """Fail-closed EnvironmentContract verification.

    Returns a structured ContractVerificationReport. `health_ok` is preserved for
    backward compatibility with callers of the old thin verify stub.

    Default: HTTP 200 with the report body even when not eligible (so the operator
    UI can render the failing checks). With `?strict=1`, returns HTTP 503 when
    `eligible_for_promotion` is False — this lets CI / promotion tooling fail closed
    on a non-2xx, mirroring the /v2/environments/health 503 idiom.
    """
    try:
        report: ContractVerificationReport = (
            environment_contract_v2.verify_environment_contract(str(env_id))
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if strict and not report.eligible_for_promotion:
        return JSONResponse(status_code=503, content=report.model_dump())
    return report


@router.get(
    "/environments/{env_id}/contract", response_model=EnvironmentContractOut
)
def get_environment_contract(env_id: UUID):
    """The declarative governance contract for a v2 environment.

    Derives + persists a draft contract on first read. Never promotes. 404 if the
    env is unknown or is not a v2 contract-governed environment.
    """
    try:
        return environment_contract_v2.get_or_derive_contract(str(env_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post(
    "/environments/{env_id}/promote",
    response_model=ContractVerificationReport,
)
def promote_environment(env_id: UUID, body: PromoteRequest):
    """Transition an environment's promotion_state through the fail-closed gate.

    The gate re-verifies fresh and refuses staging/released unless the env is
    structurally healthy and verification passes. On refusal nothing is written
    (no transition, no event row) and a 409 with the blocking reasons is returned.
    Returns the verification report the decision was made on.
    """
    try:
        return environment_contract_v2.promote_environment(
            str(env_id),
            target=body.target,
            actor=body.actor,
            reason=body.reason,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post(
    "/environments/{env_id}/quarantine",
    response_model=ContractVerificationReport,
)
def quarantine_environment(env_id: UUID, body: QuarantineRequest):
    """Fail-closed operator action. Always records an audit event with the reason.
    A released contract is terminal and cannot be quarantined (gate enforces)."""
    try:
        return environment_contract_v2.quarantine_environment(
            str(env_id), actor=body.actor, reason=body.reason
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/environments/promotion-drift")
def promotion_drift():
    """Drift guard: 503 when any released/staging env no longer verifies.

    Mirrors the /v2/environments/health 503 idiom so CI / monitoring fails closed
    on a non-2xx. Read-only — does not mutate promotion_state or last_verification.
    """
    result = environment_contract_v2.check_promotion_drift()
    if not result["ok"]:
        return JSONResponse(status_code=503, content=result)
    return result
