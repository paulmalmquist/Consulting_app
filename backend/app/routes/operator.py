from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.operator import (
    OperatorCloseTaskRowOut,
    OperatorCommandCenterOut,
    OperatorContextOut,
    OperatorProjectDetailOut,
    OperatorProjectRowOut,
    OperatorSiteDetailOut,
    OperatorSiteRowOut,
    OperatorVendorRowOut,
)
from app.services import env_context
from app.services import operator as operator_svc

router = APIRouter(prefix="/api/operator/v1", tags=["operator"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="operator",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


@router.get("/context", response_model=OperatorContextOut)
def get_context(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return OperatorContextOut(
            **operator_svc.get_context(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                created=ctx.created,
                source=ctx.source,
                diagnostics=ctx.diagnostics,
                environment=ctx.environment,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.context.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/command-center", response_model=OperatorCommandCenterOut)
def get_command_center(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return OperatorCommandCenterOut(
            **operator_svc.get_command_center(env_id=resolved_env_id, business_id=resolved_business_id)
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.command_center.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/projects", response_model=list[OperatorProjectRowOut])
def list_projects(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            OperatorProjectRowOut(**row)
            for row in operator_svc.list_projects(env_id=resolved_env_id, business_id=resolved_business_id)
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.projects.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/projects/{project_id}", response_model=OperatorProjectDetailOut)
def get_project_detail(
    request: Request,
    project_id: str,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return OperatorProjectDetailOut(
            **operator_svc.get_project_detail(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                project_id=project_id,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.project_detail.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None, "project_id": project_id},
        )


@router.get("/vendors", response_model=list[OperatorVendorRowOut])
def list_vendors(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            OperatorVendorRowOut(**row)
            for row in operator_svc.list_vendors(env_id=resolved_env_id, business_id=resolved_business_id)
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.vendors.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/close", response_model=list[OperatorCloseTaskRowOut])
def list_close_tasks(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            OperatorCloseTaskRowOut(**row)
            for row in operator_svc.list_close_tasks(env_id=resolved_env_id, business_id=resolved_business_id)
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.close.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/sites", response_model=list[OperatorSiteRowOut])
def list_sites(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            OperatorSiteRowOut(**row)
            for row in operator_svc.list_sites(env_id=resolved_env_id, business_id=resolved_business_id)
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.sites.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/sites/{site_id}", response_model=OperatorSiteDetailOut)
def get_site_detail(
    request: Request,
    site_id: str,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return OperatorSiteDetailOut(
            **operator_svc.get_site_detail(
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
            action="operator.site_detail.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None, "site_id": site_id},
        )
