from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.credit import (
    CreditCaseCreateRequest,
    CreditCaseOut,
    CreditCommitteeDecisionRequest,
    CreditContextOut,
    CreditCovenantCreateRequest,
    CreditFacilityCreateRequest,
    CreditUnderwritingRequest,
    CreditWatchlistCreateRequest,
    CreditWorkoutCreateRequest,
)
from app.services import credit as credit_svc
from app.services import env_context

router = APIRouter(prefix="/api/credit/v1", tags=["credit"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="credit",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


@router.get("/context", response_model=CreditContextOut)
def get_context(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return CreditContextOut(
            env_id=str(resolved_env_id),
            business_id=resolved_business_id,
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit.context.failed")


@router.get("/cases", response_model=list[CreditCaseOut])
def list_cases(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [CreditCaseOut(**row) for row in credit_svc.list_cases(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit.cases.list_failed")


@router.post("/cases", response_model=CreditCaseOut)
def create_case(req: CreditCaseCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = credit_svc.create_case(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return CreditCaseOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit.cases.create_failed")


@router.get("/cases/{case_id}", response_model=CreditCaseOut)
def get_case(case_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = credit_svc.get_case(env_id=resolved_env_id, business_id=resolved_business_id, case_id=case_id)
        return CreditCaseOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit.cases.get_failed")


@router.post("/cases/{case_id}/underwriting")
def create_underwriting(case_id: UUID, req: CreditUnderwritingRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return credit_svc.create_underwriting_version(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            case_id=case_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit.underwriting.create_failed")


@router.post("/cases/{case_id}/committee-decision")
def create_committee_decision(case_id: UUID, req: CreditCommitteeDecisionRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return credit_svc.create_committee_decision(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            case_id=case_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit.committee.create_failed")


@router.post("/cases/{case_id}/facilities")
def create_facility(case_id: UUID, req: CreditFacilityCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return credit_svc.create_facility(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            case_id=case_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit.facility.create_failed")


@router.post("/cases/{case_id}/covenants")
def create_covenant(case_id: UUID, req: CreditCovenantCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return credit_svc.create_covenant(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            case_id=case_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit.covenant.create_failed")


@router.post("/cases/{case_id}/watchlist")
def create_watchlist(case_id: UUID, req: CreditWatchlistCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return credit_svc.create_watchlist_case(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            case_id=case_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit.watchlist.create_failed")


@router.post("/cases/{case_id}/workout")
def create_workout(case_id: UUID, req: CreditWorkoutCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return credit_svc.create_workout_case(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            case_id=case_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit.workout.create_failed")


@router.post("/seed")
def seed_workspace(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return {"ok": True, **credit_svc.seed_demo_workspace(env_id=resolved_env_id, business_id=resolved_business_id)}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="credit.seed.failed")
