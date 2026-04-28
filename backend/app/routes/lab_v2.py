"""v2 environment blueprint endpoints.

Forward-looking only. Does NOT touch /v1/environments or legacy canonical envs.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.db import get_cursor
from app.schemas.lab_v2 import (
    CreateEnvironmentV2Response,
    EnvironmentManifestV2,
    TemplateOut,
)
from app.services import environment_pipeline_v2, environment_templates_v2


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
def verify_environment(env_id: UUID):
    try:
        return environment_pipeline_v2.verify_environment_v2(str(env_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
