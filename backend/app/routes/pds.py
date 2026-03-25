from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from psycopg.errors import UndefinedTable

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
    PdsContractorClaimCreateRequest,
    PdsForecastCreateRequest,
    PdsInvoiceCreateRequest,
    PdsDocumentCreateRequest,
    PdsPermitCreateRequest,
    PdsPortfolioHealthOut,
    PdsPortfolioOut,
    PdsPaymentCreateRequest,
    PdsProjectCreateRequest,
    PdsProjectOut,
    PdsProjectUpdateRequest,
    PdsRfiCreateRequest,
    PdsRfiUpdateRequest,
    PdsReportPackRunOut,
    PdsReportPackRunRequest,
    PdsRiskCreateRequest,
    PdsScheduleBaselineRequest,
    PdsScheduleUpdateRequest,
    PdsSiteReportCreateRequest,
    PdsSnapshotRunOut,
    PdsSnapshotRunRequest,
    PdsSubmittalCreateRequest,
    PdsSurveyResponseCreateRequest,
    PdsVendorCreateRequest,
    PdsVendorUpdateRequest,
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
def list_projects(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    stage: str | None = Query(default=None),
    status: str | None = Query(default=None),
    project_manager: str | None = Query(default=None),
    offset: int | None = Query(default=None, ge=0),
    limit: int | None = Query(default=None, ge=1, le=200),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        rows = pds_svc.list_projects(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            stage=stage,
            status=status,
            project_manager=project_manager,
            offset=offset,
            limit=limit,
        )
        return [PdsProjectOut(**row) for row in rows]
    except UndefinedTable:
        return []
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
            payload=req.model_dump(exclude={"env_id", "business_id", "baseline_period", "baseline_lines"}),
        )
        if req.baseline_period:
            pds_svc.create_budget_baseline(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                project_id=row["project_id"],
                payload={
                    "period": req.baseline_period,
                    "approved_budget": row["approved_budget"],
                    "lines": [line.model_dump() for line in req.baseline_lines],
                    "created_by": req.created_by,
                },
            )
            row = pds_svc.get_project(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                project_id=row["project_id"],
            )
        emit_log(
            level="info",
            service="backend",
            action="pds.projects.create",
            message="PDS project created",
            context={
                "request_id": get_request_id(request),
                "env_id": str(resolved_env_id),
                "business_id": str(resolved_business_id),
                "project_id": str(row["project_id"]),
            },
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


@router.patch("/projects/{project_id}", response_model=PdsProjectOut)
def update_project(project_id: UUID, req: PdsProjectUpdateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.update_project(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(exclude_unset=True),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.projects.update",
            message="PDS project updated",
            context={
                "request_id": get_request_id(request),
                "env_id": str(resolved_env_id),
                "business_id": str(resolved_business_id),
                "project_id": str(project_id),
            },
        )
        return PdsProjectOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.projects.update_failed",
            context={"project_id": str(project_id), "env_id": env_id},
        )


@router.get("/projects/{project_id}/overview")
def get_project_overview(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.get_project_overview(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.projects.overview_failed")


@router.get("/projects/{project_id}/budget")
def get_project_budget(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.get_project_budget(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.projects.budget_failed")


@router.get("/projects/{project_id}/schedule")
def get_project_schedule(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.get_project_schedule(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.projects.schedule_failed")


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


@router.get("/projects/{project_id}/contracts")
def list_contracts(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_project_contracts(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.contract.list_failed")


@router.post("/projects/{project_id}/contracts")
def create_contract(project_id: UUID, req: PdsContractCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.create_contract(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.contract.create",
            message="PDS contract created",
            context={"request_id": get_request_id(request), "project_id": str(project_id)},
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.contract.create_failed")


@router.get("/projects/{project_id}/commitments")
def list_commitments(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_project_commitments(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.commitment.list_failed")


@router.post("/projects/{project_id}/commitments")
def create_commitment(project_id: UUID, req: PdsCommitmentCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.create_commitment(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.commitment.create",
            message="PDS commitment created",
            context={"request_id": get_request_id(request), "project_id": str(project_id)},
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.commitment.create_failed")


@router.get("/projects/{project_id}/change-orders")
def list_change_orders(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_project_change_orders(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.change_order.list_failed")


@router.post("/projects/{project_id}/change-orders")
def create_change_order(project_id: UUID, req: PdsChangeOrderCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.create_change_order(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.change_order.create",
            message="PDS change order created",
            context={"request_id": get_request_id(request), "project_id": str(project_id)},
        )
        return row
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


@router.get("/projects/{project_id}/forecasts")
def list_forecasts(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_project_forecasts(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.forecast.list_failed")


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


@router.get("/projects/{project_id}/site-reports")
@router.get("/projects/{project_id}/daily-reports")
def list_site_reports(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_project_site_reports(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.site_report.list_failed")


@router.post("/projects/{project_id}/site-reports")
@router.post("/projects/{project_id}/daily-reports")
def create_site_report(project_id: UUID, req: PdsSiteReportCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.create_site_report(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.site_report.create",
            message="PDS site report created",
            context={"request_id": get_request_id(request), "project_id": str(project_id)},
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.site_report.create_failed")


@router.get("/projects/{project_id}/rfis")
def list_rfis(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), status_filter: str | None = Query(default=None, alias="status")):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_rfis(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            status=status_filter,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.rfi.list_failed")


@router.post("/projects/{project_id}/rfis")
def create_rfi(project_id: UUID, req: PdsRfiCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.create_rfi(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.rfi.create",
            message="PDS RFI created",
            context={"request_id": get_request_id(request), "project_id": str(project_id), "rfi_id": str(row["rfi_id"])},
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.rfi.create_failed")


@router.get("/projects/{project_id}/rfis/{rfi_id}")
def get_rfi(project_id: UUID, rfi_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.get_rfi(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            rfi_id=rfi_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.rfi.get_failed")


@router.patch("/projects/{project_id}/rfis/{rfi_id}")
def update_rfi(project_id: UUID, rfi_id: UUID, req: PdsRfiUpdateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.update_rfi(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            rfi_id=rfi_id,
            payload=req.model_dump(exclude_unset=True),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.rfi.update",
            message="PDS RFI updated",
            context={"request_id": get_request_id(request), "project_id": str(project_id), "rfi_id": str(rfi_id)},
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.rfi.update_failed")


@router.get("/projects/{project_id}/submittals")
def list_submittals(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), status_filter: str | None = Query(default=None, alias="status")):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_submittals(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            status=status_filter,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.submittal.list_failed")


@router.post("/projects/{project_id}/submittals")
def create_submittal(project_id: UUID, req: PdsSubmittalCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.create_submittal(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.submittal.create",
            message="PDS submittal created",
            context={"request_id": get_request_id(request), "project_id": str(project_id), "submittal_id": str(row["submittal_id"])},
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.submittal.create_failed")


@router.get("/projects/{project_id}/documents")
def list_documents(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), document_type: str | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_documents(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            document_type=document_type,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.document.list_failed")


@router.post("/projects/{project_id}/documents")
def create_document(project_id: UUID, req: PdsDocumentCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.create_document(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.document.create",
            message="PDS project document created",
            context={"request_id": get_request_id(request), "project_id": str(project_id), "pds_document_id": str(row["pds_document_id"])},
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.document.create_failed")


@router.get("/projects/{project_id}/permits")
def list_permits(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), status_filter: str | None = Query(default=None, alias="status")):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_project_permits(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            status=status_filter,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.permit.list_failed")


@router.post("/projects/{project_id}/permits")
def create_permit(project_id: UUID, req: PdsPermitCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.create_permit(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.permit.create",
            message="PDS permit created",
            context={"request_id": get_request_id(request), "project_id": str(project_id), "permit_id": str(row["permit_id"])},
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.permit.create_failed")


@router.get("/projects/{project_id}/contractor-claims")
def list_contractor_claims(project_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), status_filter: str | None = Query(default=None, alias="status")):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_project_contractor_claims(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            status=status_filter,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.contractor_claim.list_failed")


@router.post("/projects/{project_id}/contractor-claims")
def create_contractor_claim(project_id: UUID, req: PdsContractorClaimCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.create_contractor_claim(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            project_id=project_id,
            payload=req.model_dump(),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.contractor_claim.create",
            message="PDS contractor claim created",
            context={
                "request_id": get_request_id(request),
                "project_id": str(project_id),
                "contractor_claim_id": str(row["contractor_claim_id"]),
            },
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.contractor_claim.create_failed")


@router.get("/vendors")
@router.get("/subcontractors")
def list_vendors(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), status_filter: str | None = Query(default=None, alias="status")):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.list_vendors(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            status=status_filter,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.vendor.list_failed")


@router.post("/vendors")
@router.post("/subcontractors")
def create_vendor(req: PdsVendorCreateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.create_vendor(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            payload=req.model_dump(),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.vendor.create",
            message="PDS vendor created",
            context={"request_id": get_request_id(request), "vendor_id": str(row["vendor_id"])},
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.vendor.create_failed")


@router.get("/vendors/{vendor_id}")
@router.get("/subcontractors/{vendor_id}")
def get_vendor(vendor_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return pds_svc.get_vendor(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            vendor_id=vendor_id,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.vendor.get_failed")


@router.patch("/vendors/{vendor_id}")
@router.patch("/subcontractors/{vendor_id}")
def update_vendor(vendor_id: UUID, req: PdsVendorUpdateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        row = pds_svc.update_vendor(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            vendor_id=vendor_id,
            payload=req.model_dump(exclude_unset=True),
        )
        emit_log(
            level="info",
            service="backend",
            action="pds.vendor.update",
            message="PDS vendor updated",
            context={"request_id": get_request_id(request), "vendor_id": str(vendor_id)},
        )
        return row
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.vendor.update_failed")


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


@router.get("/portfolio/health", response_model=PdsPortfolioHealthOut)
def get_portfolio_health(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    period: str | None = Query(default=None),
    lookahead_days: int = Query(default=7, ge=1, le=30),
    milestone_window_days: int = Query(default=14, ge=1, le=45),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        use_period = period or f"{date.today().year}-{date.today().month:02d}"
        row = pds_svc.get_portfolio_health(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            period=use_period,
            lookahead_days=lookahead_days,
            milestone_window_days=milestone_window_days,
        )
        return PdsPortfolioHealthOut(**row)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.portfolio.health_failed",
        )


@router.get("/portfolio/dashboard")
def get_portfolio_dashboard(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), period: str | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        use_period = period or f"{date.today().year}-{date.today().month:02d}"
        return pds_svc.get_portfolio_dashboard(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            period=use_period,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.portfolio.dashboard_failed")


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
