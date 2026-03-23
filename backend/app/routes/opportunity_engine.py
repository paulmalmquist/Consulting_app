from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.opportunity_engine import (
    OpportunityDashboardOut,
    OpportunityEngineContextOut,
    OpportunityModelRunOut,
    OpportunityRecommendationDetailOut,
    OpportunityRecommendationOut,
    OpportunityRunCreateRequest,
    OpportunitySignalOut,
)
from app.services import env_context
from app.services import opportunity_engine as svc

router = APIRouter(prefix="/api/opportunity-engine/v1", tags=["opportunity-engine"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="opportunity_engine",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


@router.get("/context", response_model=OpportunityEngineContextOut)
def get_context(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return OpportunityEngineContextOut(
            env_id=str(resolved_env_id),
            business_id=resolved_business_id,
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="opportunity-engine.context.failed",
        )


@router.get("/dashboard", response_model=OpportunityDashboardOut)
def get_dashboard(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    business_line: str | None = Query(default=None),
    sector: str | None = Query(default=None),
    geography: str | None = Query(default=None),
    as_of_date: date | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return svc.get_dashboard(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            business_line=business_line,
            sector=sector,
            geography=geography,
            as_of_date=as_of_date,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="opportunity-engine.dashboard.failed",
        )


@router.get("/recommendations", response_model=list[OpportunityRecommendationOut])
def list_recommendations(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    business_line: str | None = Query(default=None),
    sector: str | None = Query(default=None),
    geography: str | None = Query(default=None),
    as_of_date: date | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return svc.list_recommendations(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            business_line=business_line,
            sector=sector,
            geography=geography,
            as_of_date=as_of_date,
            limit=limit,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="opportunity-engine.recommendations.failed",
        )


@router.get("/recommendations/{recommendation_id}", response_model=OpportunityRecommendationDetailOut)
def get_recommendation_detail(
    recommendation_id: UUID,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return svc.get_recommendation_detail(
            recommendation_id=recommendation_id,
            env_id=resolved_env_id,
            business_id=resolved_business_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="opportunity-engine.recommendations.detail.failed",
        )


@router.get("/signals", response_model=list[OpportunitySignalOut])
def list_signals(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    canonical_topic: str | None = Query(default=None),
    geography: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return svc.list_signals(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            canonical_topic=canonical_topic,
            geography=geography,
            limit=limit,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="opportunity-engine.signals.failed",
        )


@router.get("/runs", response_model=list[OpportunityModelRunOut])
def list_runs(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return svc.list_runs(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            status=status,
            limit=limit,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="opportunity-engine.runs.failed",
        )


@router.post("/runs", response_model=OpportunityModelRunOut, status_code=201)
def create_run(request: Request, body: OpportunityRunCreateRequest):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, str(body.env_id), body.business_id)
        return svc.create_run(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            mode=body.mode,
            run_type=body.run_type,
            business_lines=list(body.business_lines),
            triggered_by=body.triggered_by,
            as_of_date=body.as_of_date,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="opportunity-engine.run.create.failed",
        )
