"""PDS Utilization analytics endpoints.

Covers utilization summary, heatmap, capacity-demand, bench analysis,
and utilization distribution histogram.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.services import pds_utilization_analytics as svc

router = APIRouter(prefix="/api/pds/v2/utilization", tags=["pds-v2-analytics"])


@router.get("/summary")
def utilization_summary(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    region: str | None = Query(default=None),
    role_level: str | None = Query(default=None),
    governance_track: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
):
    try:
        return svc.get_utilization_summary(
            env_id=env_id, business_id=str(business_id),
            region=region, role_level=role_level,
            governance_track=governance_track,
            date_from=date_from, date_to=date_to,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.utilization.summary.failed", context={})


@router.get("/heatmap")
def utilization_heatmap(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    region: str | None = Query(default=None),
    role_level: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
):
    try:
        return svc.get_utilization_heatmap(
            env_id=env_id, business_id=str(business_id),
            region=region, role_level=role_level,
            date_from=date_from, date_to=date_to,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.utilization.heatmap.failed", context={})


@router.get("/capacity-demand")
def capacity_demand(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    region: str | None = Query(default=None),
    months_ahead: int = Query(default=6),
):
    try:
        return svc.get_capacity_demand(
            env_id=env_id, business_id=str(business_id),
            region=region, months_ahead=months_ahead,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.utilization.capacity_demand.failed", context={})


@router.get("/bench")
def bench(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    region: str | None = Query(default=None),
    role_level: str | None = Query(default=None),
):
    try:
        return svc.get_bench(
            env_id=env_id, business_id=str(business_id),
            region=region, role_level=role_level,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.utilization.bench.failed", context={})


@router.get("/distribution")
def utilization_distribution(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    region: str | None = Query(default=None),
    role_level: str | None = Query(default=None),
):
    try:
        return svc.get_utilization_distribution(
            env_id=env_id, business_id=str(business_id),
            region=region, role_level=role_level,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.utilization.distribution.failed", context={})
