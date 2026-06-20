"""Healthcare Subscription Analytics (hha) — read-only API.

SYNTHETIC / NO-PHI. Serves the exec overview KPI strip and a health probe. Scoped by
env_id query param (globally unique per environment). No write endpoints, no medical
endpoints. Slice 1 ships /health and /overview; funnel/cohorts/operations are reserved
for a later phase.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.hha import HhaCohorts, HhaFunnel, HhaHealth, HhaOperations, HhaOverview
from app.services import hha as svc

router = APIRouter(prefix="/api/hha/v1", tags=["hha"])


@router.get("/health", response_model=HhaHealth)
def health(request: Request, env_id: str = Query(...)):
    try:
        return svc.get_health(env_id=env_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="hha.health.failed", context={"env_id": env_id},
        )


@router.get("/overview", response_model=HhaOverview)
def overview(request: Request, env_id: str = Query(...)):
    try:
        return svc.get_overview(env_id=env_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="hha.overview.failed", context={"env_id": env_id},
        )


@router.get("/funnel", response_model=HhaFunnel)
def funnel(request: Request, env_id: str = Query(...)):
    try:
        return svc.get_funnel(env_id=env_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="hha.funnel.failed", context={"env_id": env_id},
        )


@router.get("/cohorts", response_model=HhaCohorts)
def cohorts(request: Request, env_id: str = Query(...)):
    try:
        return svc.get_cohorts(env_id=env_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="hha.cohorts.failed", context={"env_id": env_id},
        )


@router.get("/operations", response_model=HhaOperations)
def operations(request: Request, env_id: str = Query(...)):
    try:
        return svc.get_operations(env_id=env_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="hha.operations.failed", context={"env_id": env_id},
        )
