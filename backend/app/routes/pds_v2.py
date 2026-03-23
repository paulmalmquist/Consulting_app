from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.pds_v2 import (
    PdsHorizon,
    PdsLens,
    PdsRolePreset,
    PdsV2BriefingOut,
    PdsV2BusinessLineOut,
    PdsV2CloseoutItemOut,
    PdsV2CommandCenterOut,
    PdsV2ContextOut,
    PdsV2DeliveryRiskItemOut,
    PdsV2ForecastPointOut,
    PdsV2LeaderCoverageOut,
    PdsV2PerformanceTableOut,
    PdsV2PipelineSummaryOut,
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


@router.get("/pipeline", response_model=PdsV2PipelineSummaryOut)
def get_pipeline(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return PdsV2PipelineSummaryOut(
            **enterprise_svc.get_pipeline_summary(
                env_id=resolved_env_id,
                business_id=resolved_business_id,
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.pipeline.failed",
            context={"env_id": env_id},
        )


@router.get("/business-lines", response_model=list[PdsV2BusinessLineOut])
def get_business_lines(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        enterprise_svc._ensure_workspace_lazy(env_id=resolved_env_id, business_id=resolved_business_id)  # noqa: SLF001
        from app.db import get_cursor

        with get_cursor() as cur:
            cur.execute(
                "SELECT * FROM pds_business_lines WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY sort_order",
                (str(resolved_env_id), str(resolved_business_id)),
            )
            return [PdsV2BusinessLineOut(**row) for row in cur.fetchall()]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="pds.v2.business_lines.failed", context={"env_id": env_id},
        )


@router.get("/leader-coverage", response_model=list[PdsV2LeaderCoverageOut])
def get_leader_coverage(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    market_id: UUID | None = Query(default=None),
    business_line_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        enterprise_svc._ensure_workspace_lazy(env_id=resolved_env_id, business_id=resolved_business_id)  # noqa: SLF001
        from app.db import get_cursor

        sql = """
            SELECT lc.*, r.full_name AS resource_name, m.market_name, bl.line_name AS business_line_name
            FROM pds_leader_coverage lc
            JOIN pds_resources r ON r.resource_id = lc.resource_id
            JOIN pds_markets m ON m.market_id = lc.market_id
            JOIN pds_business_lines bl ON bl.business_line_id = lc.business_line_id
            WHERE lc.env_id = %s::uuid AND lc.business_id = %s::uuid AND lc.effective_to IS NULL
        """
        params: list = [str(resolved_env_id), str(resolved_business_id)]
        if market_id:
            sql += " AND lc.market_id = %s::uuid"
            params.append(str(market_id))
        if business_line_id:
            sql += " AND lc.business_line_id = %s::uuid"
            params.append(str(business_line_id))
        sql += " ORDER BY bl.sort_order, m.market_name"

        with get_cursor() as cur:
            cur.execute(sql, tuple(params))
            return [PdsV2LeaderCoverageOut(**row) for row in cur.fetchall()]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code, detail=str(exc),
            action="pds.v2.leader_coverage.failed", context={"env_id": env_id},
        )


@router.post("/seed-analytics")
def seed_analytics(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    """Seed PDS analytics tables with synthetic demo data."""
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)

        from app.services.pds_analytics_seed import seed_pds_analytics

        counts = seed_pds_analytics(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
        )
        return {"status": "ok", "counts": counts}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.seed_analytics.failed",
            context={"env_id": env_id},
        )


@router.get("/diagnostics")
def get_diagnostics(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    """Return row counts for all PDS fact and snapshot tables — enables quick verification."""
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        from app.db import get_cursor

        fact_tables = [
            "pds_fee_revenue_plan", "pds_fee_revenue_actual",
            "pds_gaap_revenue_plan", "pds_gaap_revenue_actual",
            "pds_ci_plan", "pds_ci_actual",
            "pds_backlog_fact", "pds_billing_fact",
            "pds_collection_fact", "pds_writeoff_fact",
        ]
        snapshot_tables = [
            "pds_market_performance_snapshot", "pds_account_performance_snapshot",
            "pds_project_health_snapshot", "pds_resource_utilization_snapshot",
            "pds_timecard_health_snapshot", "pds_forecast_snapshot",
            "pds_client_satisfaction_snapshot", "pds_closeout_snapshot",
        ]
        entity_tables = [
            "pds_regions", "pds_markets", "pds_clients", "pds_accounts",
            "pds_resources", "pds_projects", "pds_pipeline_deals",
        ]

        counts: dict[str, int] = {}
        with get_cursor() as cur:
            for table in fact_tables + snapshot_tables + entity_tables:
                try:
                    cur.execute(
                        f"SELECT COUNT(*) AS cnt FROM {table} WHERE env_id = %s::uuid AND business_id = %s::uuid",
                        (str(resolved_env_id), str(resolved_business_id)),
                    )
                    counts[table] = int((cur.fetchone() or {}).get("cnt") or 0)
                except Exception:
                    counts[table] = -1  # table may not exist

        all_zero_snapshots = [
            t for t in snapshot_tables if counts.get(t, 0) == 0
        ]

        return {
            "env_id": str(resolved_env_id),
            "business_id": str(resolved_business_id),
            "fact_tables": {t: counts.get(t, 0) for t in fact_tables},
            "snapshot_tables": {t: counts.get(t, 0) for t in snapshot_tables},
            "entity_tables": {t: counts.get(t, 0) for t in entity_tables},
            "all_zero_snapshots": all_zero_snapshots,
            "healthy": len(all_zero_snapshots) == 0 and all(counts.get(t, 0) > 0 for t in fact_tables),
        }
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.diagnostics.failed",
            context={"env_id": env_id},
        )
