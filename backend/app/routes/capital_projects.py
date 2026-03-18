"""Capital Projects API — unified construction project OS endpoints.

Delegates to pds_svc for existing PDS entities and cp_svc for new cp_* tables.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from app.observability.logger import emit_log
from app.routes.domain_common import classify_domain_error, domain_error_response, get_request_id
from app.schemas.capital_projects import (
    CpDailyLogCreate,
    CpDrawingCreate,
    CpMeetingCreate,
    CpPayAppCreate,
)
from app.services import env_context
from app.services import capital_projects as cp_svc
from app.services import pds as pds_svc

router = APIRouter(prefix="/api/capital-projects/v1", tags=["capital-projects"])


def _resolve(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="cp",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id)


# ── Portfolio ──────────────────────────────────────────────────────

@router.get("/portfolio")
def get_portfolio(request: Request, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return cp_svc.get_portfolio_summary(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.portfolio")


# ── Projects (delegated to PDS) ────────────────────────────────────

@router.get("/projects")
def list_projects(
    request: Request,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return pds_svc.list_projects(env_id=eid, business_id=bid, limit=limit, offset=offset)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.projects.list")


@router.get("/projects/{project_id}")
def get_project(request: Request, project_id: UUID, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return pds_svc.get_project(project_id=project_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.projects.get")


@router.get("/projects/{project_id}/dashboard")
def get_project_dashboard(request: Request, project_id: UUID, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return cp_svc.get_project_dashboard(project_id=project_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.projects.dashboard")


# ── Budget (delegated to PDS) ──────────────────────────────────────

@router.get("/projects/{project_id}/budget")
def get_budget(request: Request, project_id: UUID, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return pds_svc.get_project_budget(project_id=project_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.budget")


# ── Commitments / Contracts (delegated to PDS) ─────────────────────

@router.get("/projects/{project_id}/commitments")
def list_commitments(request: Request, project_id: UUID, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return pds_svc.list_project_contracts(project_id=project_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.commitments")


# ── Change Orders (delegated to PDS) ──────────────────────────────

@router.get("/projects/{project_id}/change-orders")
def list_change_orders(request: Request, project_id: UUID, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return pds_svc.list_project_change_orders(project_id=project_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.change_orders")


# ── Milestones (delegated to PDS) ─────────────────────────────────

@router.get("/projects/{project_id}/milestones")
def list_milestones(request: Request, project_id: UUID, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return pds_svc.list_project_milestones(project_id=project_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.milestones")


# ── Risks (delegated to PDS) ──────────────────────────────────────

@router.get("/projects/{project_id}/risks")
def list_risks(request: Request, project_id: UUID, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return pds_svc.list_project_risks(project_id=project_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.risks")


# ── RFIs (delegated to PDS) ───────────────────────────────────────

@router.get("/projects/{project_id}/rfis")
def list_rfis(request: Request, project_id: UUID, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return pds_svc.list_project_rfis(project_id=project_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.rfis")


# ── Submittals (delegated to PDS) ─────────────────────────────────

@router.get("/projects/{project_id}/submittals")
def list_submittals(request: Request, project_id: UUID, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return pds_svc.list_project_submittals(project_id=project_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.submittals")


# ── Punch Items (delegated to PDS) ────────────────────────────────

@router.get("/projects/{project_id}/punch-items")
def list_punch_items(request: Request, project_id: UUID, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return pds_svc.list_project_punch_items(project_id=project_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.punch_items")


# ── Daily Logs ─────────────────────────────────────────────────────

@router.get("/projects/{project_id}/daily-logs")
def list_daily_logs(
    request: Request,
    project_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return cp_svc.list_daily_logs(project_id=project_id, env_id=eid, business_id=bid, limit=limit, offset=offset)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.daily_logs.list")


@router.post("/projects/{project_id}/daily-logs", status_code=201)
def create_daily_log(request: Request, project_id: UUID, body: CpDailyLogCreate, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return cp_svc.create_daily_log(project_id=project_id, env_id=eid, business_id=bid, payload=body.model_dump())
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.daily_logs.create")


# ── Meetings ───────────────────────────────────────────────────────

@router.get("/projects/{project_id}/meetings")
def list_meetings(
    request: Request,
    project_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return cp_svc.list_meetings(project_id=project_id, env_id=eid, business_id=bid, limit=limit, offset=offset)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.meetings.list")


@router.post("/projects/{project_id}/meetings", status_code=201)
def create_meeting(request: Request, project_id: UUID, body: CpMeetingCreate, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        payload = body.model_dump()
        payload["items"] = [item.model_dump() for item in body.items] if body.items else []
        return cp_svc.create_meeting(project_id=project_id, env_id=eid, business_id=bid, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.meetings.create")


# ── Drawings ───────────────────────────────────────────────────────

@router.get("/projects/{project_id}/drawings")
def list_drawings(
    request: Request,
    project_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return cp_svc.list_drawings(project_id=project_id, env_id=eid, business_id=bid, limit=limit, offset=offset)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.drawings.list")


@router.post("/projects/{project_id}/drawings", status_code=201)
def create_drawing(request: Request, project_id: UUID, body: CpDrawingCreate, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return cp_svc.create_drawing(project_id=project_id, env_id=eid, business_id=bid, payload=body.model_dump())
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.drawings.create")


# ── Pay Applications ───────────────────────────────────────────────

@router.get("/projects/{project_id}/pay-apps")
def list_pay_apps(
    request: Request,
    project_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return cp_svc.list_pay_apps(project_id=project_id, env_id=eid, business_id=bid, limit=limit, offset=offset)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.pay_apps.list")


@router.post("/projects/{project_id}/pay-apps", status_code=201)
def create_pay_app(request: Request, project_id: UUID, body: CpPayAppCreate, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return cp_svc.create_pay_app(project_id=project_id, env_id=eid, business_id=bid, payload=body.model_dump())
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.pay_apps.create")


@router.post("/projects/{project_id}/pay-apps/{pay_app_id}/approve")
def approve_pay_app(request: Request, project_id: UUID, pay_app_id: UUID, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return cp_svc.approve_pay_app(pay_app_id=pay_app_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.pay_apps.approve")
