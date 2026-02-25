from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from app.observability.logger import emit_log
from app.routes.domain_common import classify_domain_error, domain_error_response, get_request_id
from app.schemas.pds import (
    PdsBudgetBaselineRequest,
    PdsBudgetRevisionRequest,
    PdsChangeOrderApproveRequest,
    PdsChangeOrderCreateRequest,
    PdsCommitmentCreateRequest,
    PdsContextOut,
    PdsContractCreateRequest,
    PdsForecastCreateRequest,
    PdsInvoiceCreateRequest,
    PdsPaymentCreateRequest,
    PdsPortfolioOut,
    PdsProjectCreateRequest,
    PdsProjectOut,
    PdsReportPackRunOut,
    PdsReportPackRunRequest,
    PdsRiskCreateRequest,
    PdsScheduleBaselineRequest,
    PdsScheduleUpdateRequest,
    PdsSnapshotRunOut,
    PdsSnapshotRunRequest,
    PdsSurveyResponseCreateRequest,
)
from app.services import env_context
from app.services import pds as pds_svc

router = APIRouter(prefix="/api/pds/v1", tags=["pds"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="pds",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


@router.get("/context", response_model=PdsContextOut)
def get_context(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        _env_id, _business_id, ctx = _resolve_context(request, env_id, business_id)
        return PdsContextOut(
            env_id=str(_env_id),
            business_id=_business_id,
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.context.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/projects", response_model=list[PdsProjectOut])
def list_projects(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        rows = pds_svc.list_projects(env_id=resolved_env_id, business_id=resolved_business_id)
        return [PdsProjectOut(**row) for row in rows]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.projects.list_failed",
            context={"env_id": env_id},
        )


@router.post("/projects", response_model=PdsProjectOut)
def create_project(req: PdsProjectCreateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = pds_svc.create_project(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(exclude={"env_id", "business_id"}),
        )
        return PdsProjectOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.projects.create_failed",
            context={"env_id": req.env_id},
        )


@router.get("/projects/{project_id}", response_model=PdsProjectOut)
def get_project(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.get_project(env_id=resolved_env_id, business_id=resolved_business_id, project_id=project_id)
        return PdsProjectOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.projects.get_failed",
            context={"project_id": str(project_id), "env_id": env_id},
        )


@router.post("/projects/{project_id}/baseline-budget")
def create_baseline_budget(project_id: UUID, req: PdsBudgetBaselineRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.create_budget_baseline(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.budget_baseline.create_failed")


@router.post("/projects/{project_id}/budget-revisions")
def create_budget_revision(project_id: UUID, req: PdsBudgetRevisionRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.create_budget_revision(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.budget_revision.create_failed")


@router.post("/projects/{project_id}/contracts")
def create_contract(project_id: UUID, req: PdsContractCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.create_contract(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.contract.create_failed")


@router.post("/projects/{project_id}/commitments")
def create_commitment(project_id: UUID, req: PdsCommitmentCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.create_commitment(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.commitment.create_failed")


@router.post("/projects/{project_id}/change-orders")
def create_change_order(project_id: UUID, req: PdsChangeOrderCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.create_change_order(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.change_order.create_failed")


@router.post("/change-orders/{change_order_id}/approve")
def approve_change_order(change_order_id: UUID, req: PdsChangeOrderApproveRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.approve_change_order(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            change_order_id=change_order_id,
            approved_by=req.approved_by,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.change_order.approve_failed")


@router.post("/projects/{project_id}/invoices")
def create_invoice(project_id: UUID, req: PdsInvoiceCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.create_invoice(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.invoice.create_failed")


@router.post("/projects/{project_id}/payments")
def create_payment(project_id: UUID, req: PdsPaymentCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.create_payment(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.payment.create_failed")


@router.post("/projects/{project_id}/forecasts")
def create_forecast(project_id: UUID, req: PdsForecastCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.create_forecast(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.forecast.create_failed")


@router.post("/projects/{project_id}/schedule/baseline")
def create_schedule_baseline(project_id: UUID, req: PdsScheduleBaselineRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.create_schedule_baseline(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.schedule_baseline.create_failed")


@router.post("/projects/{project_id}/schedule/update")
def create_schedule_update(project_id: UUID, req: PdsScheduleUpdateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.create_schedule_update(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.schedule_update.create_failed")


@router.get("/projects/{project_id}/risks")
def list_risks(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_risks(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.risks.list_failed")


@router.post("/projects/{project_id}/risks")
def create_risk(project_id: UUID, req: PdsRiskCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.create_risk(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.risks.create_failed")


@router.post("/projects/{project_id}/surveys/responses")
def create_survey_response(project_id: UUID, req: PdsSurveyResponseCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.create_survey_response(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.survey_response.create_failed")


@router.get("/portfolio", response_model=PdsPortfolioOut)
def get_portfolio_kpis(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), period: str | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        use_period = period or f"{date.today().year}-{date.today().month:02d}"
        row = pds_svc.get_portfolio_kpis(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            period=use_period,
        )
        return PdsPortfolioOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.portfolio.get_failed")


@router.post("/snapshot/run", response_model=PdsSnapshotRunOut)
def run_snapshot(req: PdsSnapshotRunRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = pds_svc.run_snapshot(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            period=req.period,
            project_id=req.project_id,
            run_id=req.run_id,
            actor=req.created_by,
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.snapshot.route_success",
            message="PDS snapshot API completed",
            context={
                "request_id": get_request_id(request),
                "run_id": row.get("run_id"),
                "env_id": str(resolved_env_id),
                "business_id": str(resolved_business_id),
                "project_id": row.get("project_id"),
                "period": req.period,
                "snapshot_id": row.get("aggregate_portfolio_snapshot_id") or row.get("portfolio_snapshot_id"),
            },
        )
        return PdsSnapshotRunOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.snapshot.run_failed",
            context={"period": req.period, "project_id": str(req.project_id) if req.project_id else None},
        )


@router.post("/report-pack/run", response_model=PdsReportPackRunOut)
def run_report_pack(req: PdsReportPackRunRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        row = pds_svc.run_report_pack(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            period=req.period,
            run_id=req.run_id,
            actor=req.created_by,
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.report_pack.route_success",
            message="PDS report pack API completed",
            context={
                "request_id": get_request_id(request),
                "run_id": row.get("run_id"),
                "env_id": str(resolved_env_id),
                "business_id": str(resolved_business_id),
                "project_id": None,
                "period": req.period,
                "snapshot_id": row.get("report_run_id"),
            },
        )
        return PdsReportPackRunOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.report_pack.run_failed",
            context={"period": req.period},
        )


@router.post("/seed")
def seed_workspace(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.seed_demo_workspace(env_id=resolved_env_id, business_id=resolved_business_id)
        return JSONResponse(content={"ok": True, **row})
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.seed.failed")
