"""PDS Accounts V2 analytics endpoints.

Covers executive overview (L0), regional rollup (L1), account 360 (L2),
account projects (L3), scatter quadrants, and RAG summary.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.services import pds_account_analytics as svc

router = APIRouter(prefix="/api/pds/v2/accounts", tags=["pds-v2-analytics"])


@router.get("/executive-overview")
def executive_overview(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_executive_overview(env_id=env_id, business_id=str(business_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.accounts.executive_overview.failed", context={})


@router.get("/regional")
def regional(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_regional(env_id=env_id, business_id=str(business_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.accounts.regional.failed", context={})


@router.get("/quadrant/{quadrant_type}")
def quadrant(
    request: Request,
    quadrant_type: str,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_quadrant(
            env_id=env_id, business_id=str(business_id),
            quadrant_type=quadrant_type,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.accounts.quadrant.failed", context={})


@router.get("/rag-summary")
def rag_summary(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_rag_summary(env_id=env_id, business_id=str(business_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.accounts.rag_summary.failed", context={})


@router.get("/{account_id}/360")
def account_360(
    request: Request,
    account_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_account_360(
            env_id=env_id, business_id=str(business_id),
            account_id=str(account_id),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.accounts.360.failed", context={})


@router.get("/{account_id}/projects")
def account_projects(
    request: Request,
    account_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_account_projects(
            env_id=env_id, business_id=str(business_id),
            account_id=str(account_id),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.accounts.projects.failed", context={})
