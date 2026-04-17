from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.operator import (
    MunicipalityDetailOut,
    MunicipalityRowOut,
    OrdinanceChangeRowOut,
    SiteDetailOut,
    SiteRowOut,
)
from app.services import env_context
from app.services import site_feasibility as svc

router = APIRouter(prefix="/api/operator/v1/site-risk", tags=["operator-site-risk"])


def _resolve(request: Request, env_id: str, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="operator",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id)


@router.get("/sites", response_model=list[SiteRowOut])
def list_sites(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id = _resolve(request, env_id, business_id)
        return [
            SiteRowOut(**row)
            for row in svc.list_sites(env_id=resolved_env_id, business_id=resolved_business_id)
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.site_risk.sites.failed",
            context={"env_id": env_id},
        )


@router.get("/sites/{site_id}", response_model=SiteDetailOut)
def get_site(
    request: Request,
    site_id: str,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id = _resolve(request, env_id, business_id)
        return SiteDetailOut(
            **svc.get_site_detail(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                site_id=site_id,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.site_risk.site_detail.failed",
            context={"env_id": env_id, "site_id": site_id},
        )


@router.get("/ordinance-changes", response_model=list[OrdinanceChangeRowOut])
def list_ordinance_changes(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    window_days: int | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id = _resolve(request, env_id, business_id)
        return [
            OrdinanceChangeRowOut(**row)
            for row in svc.list_ordinance_changes(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                window_days=window_days,
            )
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.site_risk.ordinance_changes.failed",
            context={"env_id": env_id},
        )


@router.get("/municipalities", response_model=list[MunicipalityRowOut])
def list_municipalities(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id = _resolve(request, env_id, business_id)
        return [
            MunicipalityRowOut(**row)
            for row in svc.list_municipalities(
                env_id=resolved_env_id, business_id=resolved_business_id
            )
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.site_risk.municipalities.failed",
            context={"env_id": env_id},
        )


@router.get("/municipalities/{municipality_id}", response_model=MunicipalityDetailOut)
def get_municipality(
    request: Request,
    municipality_id: str,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id = _resolve(request, env_id, business_id)
        return MunicipalityDetailOut(
            **svc.get_municipality_detail(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                municipality_id=municipality_id,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.site_risk.municipality_detail.failed",
            context={"env_id": env_id, "municipality_id": municipality_id},
        )
