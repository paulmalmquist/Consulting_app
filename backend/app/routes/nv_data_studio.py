from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.nv_data_studio import (
    ArtifactCreateRequest,
    ArtifactOut,
    EntityCreateRequest,
    EntityMappingCreateRequest,
    EntityMappingOut,
    EntityOut,
    FieldMappingCreateRequest,
    FieldMappingOut,
    IngestionJobOut,
    NvContextOut,
)
from app.services import env_context
from app.services import nv_data_studio as svc

router = APIRouter(prefix="/api/data-studio/v1", tags=["data-studio"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="data_studio",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


@router.get("/context", response_model=NvContextOut)
def get_context(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return NvContextOut(
            env_id=str(resolved_env_id),
            business_id=resolved_business_id,
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="data-studio.context.failed",
        )


# ---------------------------------------------------------------------------
# Artifacts
# ---------------------------------------------------------------------------

@router.get("/accounts/{account_id}/artifacts", response_model=list[ArtifactOut])
def list_artifacts(request: Request, account_id: UUID, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _resolve_context(request, env_id, business_id)
        return svc.list_artifacts(account_id=account_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="data-studio.artifacts.list_failed")


@router.post("/artifacts", response_model=ArtifactOut, status_code=201)
def create_artifact(request: Request, body: ArtifactCreateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        payload = body.model_dump()
        return svc.create_artifact(env_id=eid, business_id=bid, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="data-studio.artifacts.create_failed")


# ---------------------------------------------------------------------------
# Ingestion Jobs
# ---------------------------------------------------------------------------

@router.get("/accounts/{account_id}/jobs", response_model=list[IngestionJobOut])
def list_jobs(request: Request, account_id: UUID, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _resolve_context(request, env_id, business_id)
        return svc.list_jobs(account_id=account_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="data-studio.jobs.list_failed")


# ---------------------------------------------------------------------------
# Canonical Entities
# ---------------------------------------------------------------------------

@router.get("/accounts/{account_id}/entities", response_model=list[EntityOut])
def list_entities(request: Request, account_id: UUID, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _resolve_context(request, env_id, business_id)
        return svc.list_entities(account_id=account_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="data-studio.entities.list_failed")


@router.post("/entities", response_model=EntityOut, status_code=201)
def create_entity(request: Request, body: EntityCreateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        payload = body.model_dump()
        return svc.create_entity(env_id=eid, business_id=bid, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="data-studio.entities.create_failed")


# ---------------------------------------------------------------------------
# Entity Mappings
# ---------------------------------------------------------------------------

@router.get("/accounts/{account_id}/entity-mappings", response_model=list[EntityMappingOut])
def list_entity_mappings(request: Request, account_id: UUID, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _resolve_context(request, env_id, business_id)
        return svc.list_entity_mappings(account_id=account_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="data-studio.entity-mappings.list_failed")


@router.post("/entity-mappings", response_model=EntityMappingOut, status_code=201)
def create_entity_mapping(request: Request, body: EntityMappingCreateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        payload = body.model_dump()
        return svc.create_entity_mapping(env_id=eid, business_id=bid, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="data-studio.entity-mappings.create_failed")


# ---------------------------------------------------------------------------
# Field Mappings
# ---------------------------------------------------------------------------

@router.get("/entity-mappings/{mapping_id}/fields", response_model=list[FieldMappingOut])
def list_field_mappings(request: Request, mapping_id: UUID, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _resolve_context(request, env_id, business_id)
        return svc.list_field_mappings(mapping_id=mapping_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="data-studio.field-mappings.list_failed")


@router.post("/field-mappings", response_model=FieldMappingOut, status_code=201)
def create_field_mapping(request: Request, body: FieldMappingCreateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        payload = body.model_dump()
        return svc.create_field_mapping(env_id=eid, business_id=bid, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="data-studio.field-mappings.create_failed")
