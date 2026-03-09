from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.nv_discovery import (
    AccountCreateRequest,
    AccountOut,
    AccountUpdateRequest,
    ContactCreateRequest,
    ContactOut,
    DashboardOut,
    NvContextOut,
    PainPointCreateRequest,
    PainPointOut,
    SessionCreateRequest,
    SessionOut,
    SystemCreateRequest,
    SystemOut,
    SystemUpdateRequest,
    VendorCreateRequest,
    VendorOut,
)
from app.services import env_context
from app.services import nv_discovery as svc

router = APIRouter(prefix="/api/discovery/v1", tags=["discovery"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="discovery",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------

@router.get("/context", response_model=NvContextOut)
def get_context(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return NvContextOut(
            env_id=str(resolved_env_id),
            business_id=resolved_business_id,
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="discovery.context.failed",
        )


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        return svc.get_dashboard(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.dashboard.failed")


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        return svc.list_accounts(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.accounts.list_failed")


@router.post("/accounts", response_model=AccountOut, status_code=201)
def create_account(request: Request, body: AccountCreateRequest):
    try:
        eid, bid, _ = _resolve_context(request, body.env_id, body.business_id)
        payload = body.model_dump(exclude={"env_id", "business_id"})
        return svc.create_account(env_id=eid, business_id=bid, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.accounts.create_failed")


@router.get("/accounts/{account_id}", response_model=AccountOut)
def get_account(request: Request, account_id: UUID, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        row = svc.get_account(env_id=eid, business_id=bid, account_id=account_id)
        if not row:
            return domain_error_response(request=request, status_code=404, code="NOT_FOUND", detail="Account not found", action="discovery.accounts.not_found")
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.accounts.get_failed")


@router.put("/accounts/{account_id}", response_model=AccountOut)
def update_account(request: Request, account_id: UUID, body: AccountUpdateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        payload = body.model_dump(exclude_none=True)
        row = svc.update_account(env_id=eid, business_id=bid, account_id=account_id, payload=payload)
        if not row:
            return domain_error_response(request=request, status_code=404, code="NOT_FOUND", detail="Account not found", action="discovery.accounts.not_found")
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.accounts.update_failed")


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

@router.get("/accounts/{account_id}/contacts", response_model=list[ContactOut])
def list_contacts(request: Request, account_id: UUID, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _resolve_context(request, env_id, business_id)
        return svc.list_contacts(account_id=account_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.contacts.list_failed")


@router.post("/accounts/{account_id}/contacts", response_model=ContactOut, status_code=201)
def create_contact(request: Request, account_id: UUID, body: ContactCreateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        payload = body.model_dump()
        return svc.create_contact(env_id=eid, business_id=bid, account_id=account_id, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.contacts.create_failed")


# ---------------------------------------------------------------------------
# Systems
# ---------------------------------------------------------------------------

@router.get("/accounts/{account_id}/systems", response_model=list[SystemOut])
def list_systems(request: Request, account_id: UUID, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _resolve_context(request, env_id, business_id)
        return svc.list_systems(account_id=account_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.systems.list_failed")


@router.post("/accounts/{account_id}/systems", response_model=SystemOut, status_code=201)
def create_system(request: Request, account_id: UUID, body: SystemCreateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        payload = body.model_dump()
        return svc.create_system(env_id=eid, business_id=bid, account_id=account_id, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.systems.create_failed")


@router.put("/accounts/{account_id}/systems/{system_id}", response_model=SystemOut)
def update_system(request: Request, account_id: UUID, system_id: UUID, body: SystemUpdateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _resolve_context(request, env_id, business_id)
        payload = body.model_dump(exclude_none=True)
        row = svc.update_system(account_id=account_id, system_id=system_id, payload=payload)
        if not row:
            return domain_error_response(request=request, status_code=404, code="NOT_FOUND", detail="System not found", action="discovery.systems.not_found")
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.systems.update_failed")


# ---------------------------------------------------------------------------
# Vendors
# ---------------------------------------------------------------------------

@router.get("/accounts/{account_id}/vendors", response_model=list[VendorOut])
def list_vendors(request: Request, account_id: UUID, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _resolve_context(request, env_id, business_id)
        return svc.list_vendors(account_id=account_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.vendors.list_failed")


@router.post("/accounts/{account_id}/vendors", response_model=VendorOut, status_code=201)
def create_vendor(request: Request, account_id: UUID, body: VendorCreateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        payload = body.model_dump()
        return svc.create_vendor(env_id=eid, business_id=bid, account_id=account_id, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.vendors.create_failed")


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@router.get("/accounts/{account_id}/sessions", response_model=list[SessionOut])
def list_sessions(request: Request, account_id: UUID, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _resolve_context(request, env_id, business_id)
        return svc.list_sessions(account_id=account_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.sessions.list_failed")


@router.post("/accounts/{account_id}/sessions", response_model=SessionOut, status_code=201)
def create_session(request: Request, account_id: UUID, body: SessionCreateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        payload = body.model_dump()
        return svc.create_session(env_id=eid, business_id=bid, account_id=account_id, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.sessions.create_failed")


# ---------------------------------------------------------------------------
# Pain Points
# ---------------------------------------------------------------------------

@router.get("/accounts/{account_id}/pain-points", response_model=list[PainPointOut])
def list_pain_points(request: Request, account_id: UUID, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _resolve_context(request, env_id, business_id)
        return svc.list_pain_points(account_id=account_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.pain_points.list_failed")


@router.post("/accounts/{account_id}/pain-points", response_model=PainPointOut, status_code=201)
def create_pain_point(request: Request, account_id: UUID, body: PainPointCreateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        payload = body.model_dump()
        return svc.create_pain_point(env_id=eid, business_id=bid, account_id=account_id, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="discovery.pain_points.create_failed")
