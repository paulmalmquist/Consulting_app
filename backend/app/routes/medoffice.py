from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.medoffice import (
    MedComplianceCreateRequest,
    MedLeaseCreateRequest,
    MedOfficeContextOut,
    MedPropertyCreateRequest,
    MedPropertyOut,
    MedTenantCreateRequest,
    MedWorkOrderCreateRequest,
)
from app.services import env_context
from app.services import medoffice as medoffice_svc

router = APIRouter(prefix="/api/medoffice/v1", tags=["medoffice"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="medical",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


@router.get("/context", response_model=MedOfficeContextOut)
def get_context(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return MedOfficeContextOut(
            env_id=str(resolved_env_id),
            business_id=resolved_business_id,
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="medoffice.context.failed")


@router.get("/properties", response_model=list[MedPropertyOut])
def list_properties(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [MedPropertyOut(**row) for row in medoffice_svc.list_properties(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="medoffice.properties.list_failed")


@router.post("/properties", response_model=MedPropertyOut)
def create_property(req: MedPropertyCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = medoffice_svc.create_property(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return MedPropertyOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="medoffice.properties.create_failed")


@router.get("/properties/{property_id}", response_model=MedPropertyOut)
def get_property(property_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return MedPropertyOut(**medoffice_svc.get_property(env_id=resolved_env_id, business_id=resolved_business_id, property_id=property_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="medoffice.properties.get_failed")


@router.post("/properties/{property_id}/tenants")
def create_tenant(property_id: UUID, req: MedTenantCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return medoffice_svc.create_tenant(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            property_id=property_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="medoffice.tenants.create_failed")


@router.post("/properties/{property_id}/leases")
def create_lease(property_id: UUID, req: MedLeaseCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return medoffice_svc.create_lease(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            property_id=property_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="medoffice.leases.create_failed")


@router.post("/properties/{property_id}/compliance")
def create_compliance_item(property_id: UUID, req: MedComplianceCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return medoffice_svc.create_compliance_item(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            property_id=property_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="medoffice.compliance.create_failed")


@router.post("/properties/{property_id}/work-orders")
def create_work_order(property_id: UUID, req: MedWorkOrderCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return medoffice_svc.create_work_order(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            property_id=property_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="medoffice.work_orders.create_failed")


@router.post("/seed")
def seed_workspace(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return {"ok": True, **medoffice_svc.seed_demo_workspace(env_id=resolved_env_id, business_id=resolved_business_id)}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="medoffice.seed.failed")
