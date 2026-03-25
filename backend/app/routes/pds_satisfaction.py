"""PDS Client Satisfaction analytics endpoints.

Covers NPS summary, key driver analysis, per-account satisfaction,
verbatim comments, and at-risk account identification.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.services import pds_satisfaction_analytics as svc

router = APIRouter(prefix="/api/pds/v2/satisfaction", tags=["pds-v2-analytics"])


@router.get("/nps-summary")
def nps_summary(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    account_id: UUID | None = Query(default=None),
    region: str | None = Query(default=None),
    governance_track: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
):
    try:
        return svc.get_nps_summary(
            env_id=env_id, business_id=str(business_id),
            account_id=str(account_id) if account_id else None,
            region=region, governance_track=governance_track,
            date_from=date_from, date_to=date_to,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.satisfaction.nps_summary.failed", context={})


@router.get("/drivers")
def satisfaction_drivers(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    account_id: UUID | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
):
    try:
        return svc.get_drivers(
            env_id=env_id, business_id=str(business_id),
            account_id=str(account_id) if account_id else None,
            date_from=date_from, date_to=date_to,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.satisfaction.drivers.failed", context={})


@router.get("/by-account")
def satisfaction_by_account(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    region: str | None = Query(default=None),
):
    try:
        return svc.get_by_account(
            env_id=env_id, business_id=str(business_id),
            region=region,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.satisfaction.by_account.failed", context={})


@router.get("/verbatims")
def verbatims(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    account_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
):
    try:
        return svc.get_verbatims(
            env_id=env_id, business_id=str(business_id),
            account_id=str(account_id) if account_id else None,
            search=search, date_from=date_from, date_to=date_to,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.satisfaction.verbatims.failed", context={})


@router.get("/at-risk")
def at_risk(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_at_risk(env_id=env_id, business_id=str(business_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.satisfaction.at_risk.failed", context={})
