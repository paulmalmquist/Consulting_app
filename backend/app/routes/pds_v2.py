from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.pds_v2 import (
    PdsHorizon,
    PdsLens,
    PdsRolePreset,
    PdsV2BriefingOut,
    PdsV2CloseoutItemOut,
    PdsV2CommandCenterOut,
    PdsV2ContextOut,
    PdsV2DeliveryRiskItemOut,
    PdsV2ForecastPointOut,
    PdsV2PerformanceTableOut,
    PdsV2ReportPacketOut,
    PdsV2ReportPacketRequest,
    PdsV2ResourceHealthItemOut,
    PdsV2SatisfactionItemOut,
    PdsV2TimecardHealthItemOut,
)
from app.services import env_context
from app.services import pds_enterprise as enterprise_svc

router = APIRouter(prefix="/api/pds/v2", tags=["pds-v2"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="pds",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


@router.get("/context", response_model=PdsV2ContextOut)
def get_context(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        environment = enterprise_svc._fetch_environment(resolved_env_id) or {}  # noqa: SLF001
        return PdsV2ContextOut(
            env_id=str(resolved_env_id),
            business_id=resolved_business_id,
            workspace_template_key=enterprise_svc.resolve_pds_workspace_template(environment),
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
            action="pds.v2.context.failed",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.get("/command-center", response_model=PdsV2CommandCenterOut)
def get_command_center(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    lens: PdsLens = Query(default="market"),
    horizon: PdsHorizon = Query(default="YTD"),
    role_preset: PdsRolePreset = Query(default="executive"),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return PdsV2CommandCenterOut(
            **enterprise_svc.get_command_center(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                lens=lens,
                horizon=horizon,
                role_preset=role_preset,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.command_center.failed",
            context={"env_id": env_id, "lens": lens, "horizon": horizon},
        )


@router.get("/performance-table", response_model=PdsV2PerformanceTableOut)
def get_performance_table(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    lens: PdsLens = Query(default="market"),
    horizon: PdsHorizon = Query(default="YTD"),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return PdsV2PerformanceTableOut(
            **enterprise_svc.get_performance_table(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                lens=lens,
                horizon=horizon,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.performance_table.failed",
            context={"env_id": env_id, "lens": lens, "horizon": horizon},
        )


@router.get("/delivery-risk", response_model=list[PdsV2DeliveryRiskItemOut])
def get_delivery_risk(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    horizon: PdsHorizon = Query(default="YTD"),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            PdsV2DeliveryRiskItemOut(**row)
            for row in enterprise_svc.get_delivery_risk(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                horizon=horizon,
            )
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.delivery_risk.failed",
            context={"env_id": env_id, "horizon": horizon},
        )


@router.get("/resources/health", response_model=list[PdsV2ResourceHealthItemOut])
def get_resource_health(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    horizon: PdsHorizon = Query(default="YTD"),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            PdsV2ResourceHealthItemOut(**row)
            for row in enterprise_svc.get_resource_health(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                horizon=horizon,
            )
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.resource_health.failed",
            context={"env_id": env_id, "horizon": horizon},
        )


@router.get("/timecards/health", response_model=list[PdsV2TimecardHealthItemOut])
def get_timecard_health(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    horizon: PdsHorizon = Query(default="YTD"),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            PdsV2TimecardHealthItemOut(**row)
            for row in enterprise_svc.get_timecard_health(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                horizon=horizon,
            )
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.timecard_health.failed",
            context={"env_id": env_id, "horizon": horizon},
        )


@router.get("/forecast", response_model=list[PdsV2ForecastPointOut])
def get_forecast(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    lens: PdsLens = Query(default="market"),
    horizon: PdsHorizon = Query(default="Forecast"),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            PdsV2ForecastPointOut(**row)
            for row in enterprise_svc.get_forecast(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                horizon=horizon,
                lens=lens,
            )
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.forecast.failed",
            context={"env_id": env_id, "lens": lens, "horizon": horizon},
        )


@router.get("/satisfaction", response_model=list[PdsV2SatisfactionItemOut])
def get_satisfaction(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    horizon: PdsHorizon = Query(default="YTD"),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            PdsV2SatisfactionItemOut(**row)
            for row in enterprise_svc.get_satisfaction(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                horizon=horizon,
            )
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.satisfaction.failed",
            context={"env_id": env_id, "horizon": horizon},
        )


@router.get("/closeout", response_model=list[PdsV2CloseoutItemOut])
def get_closeout(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    horizon: PdsHorizon = Query(default="YTD"),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return [
            PdsV2CloseoutItemOut(**row)
            for row in enterprise_svc.get_closeout(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                horizon=horizon,
            )
        ]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.closeout.failed",
            context={"env_id": env_id, "horizon": horizon},
        )


@router.get("/briefings/executive", response_model=PdsV2BriefingOut)
def get_executive_briefing(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    lens: PdsLens = Query(default="market"),
    horizon: PdsHorizon = Query(default="YTD"),
    role_preset: PdsRolePreset = Query(default="executive"),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return PdsV2BriefingOut(
            **enterprise_svc.get_executive_briefing(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                lens=lens,
                horizon=horizon,
                role_preset=role_preset,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.briefing.failed",
            context={"env_id": env_id, "lens": lens, "horizon": horizon},
        )


@router.post("/reports/packet", response_model=PdsV2ReportPacketOut)
def build_report_packet(req: PdsV2ReportPacketRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, req.env_id, req.business_id)
        return PdsV2ReportPacketOut(
            **enterprise_svc.build_report_packet(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
                packet_type=req.packet_type,
                lens=req.lens,
                horizon=req.horizon,
                role_preset=req.role_preset,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.report_packet.failed",
            context={"env_id": req.env_id, "packet_type": req.packet_type},
        )
