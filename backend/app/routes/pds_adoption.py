"""PDS Technology Adoption analytics endpoints.

Covers tool adoption overview, per-account adoption health,
composite health scores, and adoption trends.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.services import pds_adoption_analytics as svc

router = APIRouter(prefix="/api/pds/v2/adoption", tags=["pds-v2-analytics"])


@router.get("/overview")
def adoption_overview(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    account_id: UUID | None = Query(default=None),
    tool_name: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
):
    try:
        return svc.get_overview(
            env_id=env_id, business_id=str(business_id),
            account_id=str(account_id) if account_id else None,
            tool_name=tool_name,
            date_from=date_from, date_to=date_to,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.adoption.overview.failed", context={})


@router.get("/by-account")
def adoption_by_account(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    account_id: UUID | None = Query(default=None),
):
    try:
        return svc.get_by_account(
            env_id=env_id, business_id=str(business_id),
            account_id=str(account_id) if account_id else None,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.adoption.by_account.failed", context={})


@router.get("/health-score")
def health_score(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    account_id: UUID | None = Query(default=None),
):
    try:
        return svc.get_health_score(
            env_id=env_id, business_id=str(business_id),
            account_id=str(account_id) if account_id else None,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.adoption.health_score.failed", context={})


@router.get("/trends")
def adoption_trends(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    tool_name: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
):
    try:
        return svc.get_trends(
            env_id=env_id, business_id=str(business_id),
            tool_name=tool_name,
            date_from=date_from, date_to=date_to,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.adoption.trends.failed", context={})
