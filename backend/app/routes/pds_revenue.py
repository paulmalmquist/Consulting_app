"""PDS Fee Revenue analytics endpoints.

Covers time-series revenue, variance analysis, pipeline funnel,
dedicated portfolio, revenue waterfall, and variable/dedicated mix.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.services import pds_revenue_analytics as svc

router = APIRouter(prefix="/api/pds/v2/revenue", tags=["pds-v2-analytics"])


@router.get("/time-series")
def revenue_time_series(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    governance_track: str | None = Query(default=None),
    version: list[str] | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    service_line: str | None = Query(default=None),
    region: str | None = Query(default=None),
    account_id: UUID | None = Query(default=None),
):
    try:
        return svc.get_revenue_time_series(
            env_id=env_id, business_id=str(business_id),
            governance_track=governance_track, versions=version,
            date_from=date_from, date_to=date_to,
            service_line=service_line, region=region,
            account_id=str(account_id) if account_id else None,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.revenue.time_series.failed", context={})


@router.get("/variance")
def revenue_variance(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    comparison: str = Query(default="budget_vs_actual"),
    period_grain: str = Query(default="month"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
):
    try:
        return svc.get_revenue_variance(
            env_id=env_id, business_id=str(business_id),
            comparison=comparison, period_grain=period_grain,
            date_from=date_from, date_to=date_to,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.revenue.variance.failed", context={})


@router.get("/pipeline")
def revenue_pipeline(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_pipeline(env_id=env_id, business_id=str(business_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.revenue.pipeline.failed", context={})


@router.get("/portfolio")
def revenue_portfolio(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_dedicated_portfolio(env_id=env_id, business_id=str(business_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.revenue.portfolio.failed", context={})


@router.get("/waterfall")
def revenue_waterfall(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    period_grain: str = Query(default="month"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
):
    try:
        return svc.get_revenue_waterfall(
            env_id=env_id, business_id=str(business_id),
            period_grain=period_grain, date_from=date_from, date_to=date_to,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.revenue.waterfall.failed", context={})


@router.get("/mix")
def revenue_mix(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
):
    try:
        return svc.get_revenue_mix(
            env_id=env_id, business_id=str(business_id),
            date_from=date_from, date_to=date_to,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.revenue.mix.failed", context={})
