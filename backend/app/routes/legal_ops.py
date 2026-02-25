from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.legal_ops import (
    LegalApprovalCreateRequest,
    LegalContractCreateRequest,
    LegalDeadlineCreateRequest,
    LegalMatterCreateRequest,
    LegalMatterOut,
    LegalOpsContextOut,
    LegalSpendEntryCreateRequest,
)
from app.services import env_context
from app.services import legal_ops as legal_ops_svc

router = APIRouter(prefix="/api/legalops/v1", tags=["legal-ops"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="legal",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


@router.get("/context", response_model=LegalOpsContextOut)
def get_context(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return LegalOpsContextOut(
            env_id=str(resolved_env_id),
            business_id=resolved_business_id,
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.context.failed")


@router.get("/matters", response_model=list[LegalMatterOut])
def list_matters(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [LegalMatterOut(**row) for row in legal_ops_svc.list_matters(env_id=resolved_env_id, business_id=resolved_business_id)]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.matters.list_failed")


@router.post("/matters", response_model=LegalMatterOut)
def create_matter(req: LegalMatterCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = legal_ops_svc.create_matter(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return LegalMatterOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.matters.create_failed")


@router.get("/matters/{matter_id}", response_model=LegalMatterOut)
def get_matter(matter_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return LegalMatterOut(**legal_ops_svc.get_matter(env_id=resolved_env_id, business_id=resolved_business_id, matter_id=matter_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.matters.get_failed")


@router.post("/matters/{matter_id}/contracts")
def create_contract(matter_id: UUID, req: LegalContractCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return legal_ops_svc.create_contract(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            matter_id=matter_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.contract.create_failed")


@router.post("/matters/{matter_id}/deadlines")
def create_deadline(matter_id: UUID, req: LegalDeadlineCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return legal_ops_svc.create_deadline(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            matter_id=matter_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.deadline.create_failed")


@router.post("/matters/{matter_id}/approvals")
def create_approval(matter_id: UUID, req: LegalApprovalCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return legal_ops_svc.create_approval(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            matter_id=matter_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.approval.create_failed")


@router.post("/matters/{matter_id}/spend")
def create_spend_entry(matter_id: UUID, req: LegalSpendEntryCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return legal_ops_svc.create_spend_entry(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            matter_id=matter_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.spend.create_failed")


@router.post("/seed")
def seed_workspace(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return {"ok": True, **legal_ops_svc.seed_demo_workspace(env_id=resolved_env_id, business_id=resolved_business_id)}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="legalops.seed.failed")
