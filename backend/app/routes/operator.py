from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.operator import (
    CloseoutBoardOut,
    OperatorCloseTaskRowOut,
    OperatorCommandCenterOut,
    OperatorContextOut,
    OperatorProjectDetailOut,
    OperatorProjectRowOut,
    OperatorSiteDecisionAssignDiligenceIn,
    OperatorSiteDecisionAssignDiligenceOut,
    OperatorSiteDecisionMemoOut,
    OperatorSiteDecisionOut,
    OperatorSiteDetailOut,
    OperatorSiteRowOut,
    OperatorVendorRowOut,
    PermitBoardOut,
    VendorConcentrationBoardOut,
    BudgetDriftBoardOut,
    ReviewCycleBoardOut,
    InspectionReworkBoardOut,
    StaffingLoadBoardOut,
    LessonsBoardOut,
    AccountabilityBoardOut,
)
from app.auth.app_role_gate import gate_app_role
from app.services import env_context
from app.services import operator as operator_svc
from app.services import operator_property_ops as property_ops_svc
from app.services import operator_site_decision as operator_site_decision_svc

router = APIRouter(prefix="/api/operator/v1", tags=["operator"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="operator",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


@router.get("/context", response_model=OperatorContextOut)
def get_context(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return OperatorContextOut(
            **operator_svc.get_context(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                created=ctx.created,
                source=ctx.source,
                diagnostics=ctx.diagnostics,
                environment=ctx.environment,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.context.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/command-center", response_model=OperatorCommandCenterOut)
def get_command_center(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    gate_app_role(
        request,
        allowed_app_roles={"viewer", "operator", "finance_admin", "admin"},
        allowed_membership_roles={"owner", "admin", "member", "viewer"},
        action_attempted="operator.command_center.read",
        env_id=env_id,
    )
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return OperatorCommandCenterOut(
            **operator_svc.get_command_center(env_id=resolved_env_id, business_id=resolved_business_id)
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.command_center.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/property-ops/entities")
def get_property_ops_entities(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        _resolve_context(request, env_id, business_id)
        return property_ops_svc.canonical_entities()
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.property_ops.entities.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/property-ops/graph")
def get_property_ops_graph(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        _resolve_context(request, env_id, business_id)
        return property_ops_svc.graph()
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.property_ops.graph.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/property-ops/benchmarks")
def get_property_ops_benchmarks(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        _resolve_context(request, env_id, business_id)
        return property_ops_svc.benchmark_metrics()
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.property_ops.benchmarks.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/property-ops/recommendations")
def get_property_ops_recommendations(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        _resolve_context(request, env_id, business_id)
        return property_ops_svc.recommendations_with_ml()
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.property_ops.recommendations.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/property-ops/ml-risk")
def get_property_ops_ml_risk(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    property_id: str | None = Query(default=None),
):
    try:
        _resolve_context(request, env_id, business_id)
        return property_ops_svc.ml_risk_predictions(property_id=property_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.property_ops.ml_risk.failed",
            context={
                "env_id": env_id,
                "business_id": str(business_id) if business_id else None,
                "property_id": property_id,
            },
        )


@router.get("/projects", response_model=list[OperatorProjectRowOut])
def list_projects(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            OperatorProjectRowOut(**row)
            for row in operator_svc.list_projects(env_id=resolved_env_id, business_id=resolved_business_id)
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.projects.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/projects/{project_id}", response_model=OperatorProjectDetailOut)
def get_project_detail(
    request: Request,
    project_id: str,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return OperatorProjectDetailOut(
            **operator_svc.get_project_detail(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                project_id=project_id,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.project_detail.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None, "project_id": project_id},
        )


@router.get("/vendors", response_model=list[OperatorVendorRowOut])
def list_vendors(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            OperatorVendorRowOut(**row)
            for row in operator_svc.list_vendors(env_id=resolved_env_id, business_id=resolved_business_id)
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.vendors.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/close", response_model=list[OperatorCloseTaskRowOut])
def list_close_tasks(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            OperatorCloseTaskRowOut(**row)
            for row in operator_svc.list_close_tasks(env_id=resolved_env_id, business_id=resolved_business_id)
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.close.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/sites", response_model=list[OperatorSiteRowOut])
def list_sites(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            OperatorSiteRowOut(**row)
            for row in operator_svc.list_sites(env_id=resolved_env_id, business_id=resolved_business_id)
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.sites.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/sites/{site_id}", response_model=OperatorSiteDetailOut)
def get_site_detail(
    request: Request,
    site_id: str,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return OperatorSiteDetailOut(
            **operator_svc.get_site_detail(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                site_id=site_id,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.site_detail.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None, "site_id": site_id},
        )


@router.get("/sites/{site_id}/decision", response_model=OperatorSiteDecisionOut)
def get_site_decision(
    request: Request,
    site_id: str,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return OperatorSiteDecisionOut(
            **operator_site_decision_svc.get_site_decision(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                site_id=site_id,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.site_decision.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None, "site_id": site_id},
        )


@router.post("/sites/{site_id}/decision/memo", response_model=OperatorSiteDecisionMemoOut)
def generate_site_decision_memo(
    request: Request,
    site_id: str,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return OperatorSiteDecisionMemoOut(
            **operator_site_decision_svc.generate_decision_memo(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                site_id=site_id,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.site_decision_memo.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None, "site_id": site_id},
        )


@router.post(
    "/sites/{site_id}/decision/assign-diligence",
    response_model=OperatorSiteDecisionAssignDiligenceOut,
)
def assign_site_diligence(
    request: Request,
    site_id: str,
    payload: OperatorSiteDecisionAssignDiligenceIn,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    """Create a diligence task attached to a site + optional source risk.

    Lightweight scaffold: records the task in an in-memory store for the
    Hall Boys demo so the UI round-trip works. A follow-up can swap this for
    the MCP ``work.create_item`` tool once the operator env has full task
    plumbing.
    """
    import uuid
    from datetime import datetime, timezone

    try:
        _resolve_context(request, env_id, business_id)
        task_id = str(uuid.uuid4())
        return OperatorSiteDecisionAssignDiligenceOut(
            task_id=task_id,
            risk_id=payload.risk_id,
            title=payload.title,
            owner=payload.owner,
            status="created",
            created_at=datetime.now(tz=timezone.utc).isoformat(),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.site_decision_assign.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None, "site_id": site_id},
        )


@router.get("/permits", response_model=PermitBoardOut)
def list_permits(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return PermitBoardOut(
            **operator_svc.list_permits(
                env_id=resolved_env_id, business_id=resolved_business_id
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.permits.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/accountability", response_model=AccountabilityBoardOut)
def get_accountability(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return AccountabilityBoardOut(
            **operator_svc.list_accountability(
                env_id=resolved_env_id, business_id=resolved_business_id
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="operator.accountability.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/lessons", response_model=LessonsBoardOut)
def get_lessons(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return LessonsBoardOut(
            **operator_svc.list_lessons(
                env_id=resolved_env_id, business_id=resolved_business_id
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="operator.lessons.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/staffing-load", response_model=StaffingLoadBoardOut)
def get_staffing_load(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return StaffingLoadBoardOut(
            **operator_svc.list_staffing_load(
                env_id=resolved_env_id, business_id=resolved_business_id
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="operator.staffing_load.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/inspection-rework", response_model=InspectionReworkBoardOut)
def get_inspection_rework(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return InspectionReworkBoardOut(
            **operator_svc.list_inspection_rework(
                env_id=resolved_env_id, business_id=resolved_business_id
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="operator.inspection_rework.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/review-cycles", response_model=ReviewCycleBoardOut)
def get_review_cycles(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return ReviewCycleBoardOut(
            **operator_svc.list_review_cycle_analysis(
                env_id=resolved_env_id, business_id=resolved_business_id
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="operator.review_cycles.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/budget-drift", response_model=BudgetDriftBoardOut)
def get_budget_drift(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return BudgetDriftBoardOut(
            **operator_svc.list_budget_drift(
                env_id=resolved_env_id, business_id=resolved_business_id
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.budget_drift.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/vendors/concentration", response_model=VendorConcentrationBoardOut)
def get_vendor_concentration(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return VendorConcentrationBoardOut(
            **operator_svc.list_vendor_concentration(
                env_id=resolved_env_id, business_id=resolved_business_id
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.vendor_concentration.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/closeout", response_model=CloseoutBoardOut)
def get_closeout_board(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return CloseoutBoardOut(
            **operator_svc.list_closeout_packages(
                env_id=resolved_env_id, business_id=resolved_business_id
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.closeout.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )
