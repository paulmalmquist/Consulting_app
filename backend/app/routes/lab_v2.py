"""v2 environment blueprint endpoints.

Forward-looking only. Does NOT touch /v1/environments or legacy canonical envs.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.lab_v2 import (
    CreateEnvironmentV2Response,
    EnvironmentManifestV2,
    TemplateOut,
)
from app.services import environment_pipeline_v2, environment_templates_v2


router = APIRouter(prefix="/v2")


@router.get("/environments/templates", response_model=list[TemplateOut])
def list_templates():
    rows = environment_templates_v2.list_templates()
    return [TemplateOut(**r) for r in rows]


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
