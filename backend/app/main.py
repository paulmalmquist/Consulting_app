import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import (
    ALLOWED_ORIGINS,
    STARGATE_BRIDGE_ENABLED,
    TELEMETRY_KAFKA_CONSUMER_ENABLED,
    TELEMETRY_STREAM_ENABLED,
)
from app.auth.middleware import AuthMiddleware
from app.middleware import RequestLoggingMiddleware
from app.mcp.registry import registry as _tool_registry
from app.mcp.http_transport import router as mcp_http_router
from app.mcp.server import _register_all_tools
from app.observability.logger import emit_log
from app.observability.deploy_state import (
    DeployState,
    set_deploy_state,
    resolve_git_sha,
    resolve_db_fingerprint,
    resolve_python_version,
)
from app.routes import (
    metrics,
    metrics_query,
    health,
    business,
    crm,
    documents,
    executions,
    finance,
    reports,
    tasks,
    nv_tasks,
    work,
    audit,
    lab,
    lab_v2,
    extraction,
    compliance,
    admin_tools,
    underwriting,
    real_estate,
    repe,
    re_valuation,
    re_waterfall,
    re_fund,
    re_scenarios,
    re_surveillance,
    re_montecarlo,
    re_reports,
    re_v1_context,
    re_v1_funds,
    re_v2,
    re_financial_intelligence,
    re_sustainability,
    pds,
    pds_v2,
    pds_executive,
    pds_metrics,
    credit,
    credit_v2,
    doc_completion,
    legal_ops,
    medoffice,
    winston_demo,
    query_engine,
    opportunity_engine,
    psychrag,
)
from app.routes import re_authoritative, re_operator_diagnostics
from app.routes.ai import router as ai_router
from app.routes.ai_audit import router as ai_audit_router
from app.routes.ai_dispatch import router as ai_dispatch_router
from app.routes.admin_prompt_receipts import router as admin_prompt_receipts_router
from app.routes import website_content, website_rankings, website_analytics
from app.routes import consulting
from app.routes import telemetry
from app.routes import telemetry_export
from app.routes import telemetry_copilot
from app.routes import telemetry_control_tower
from app.routes import agent_builder
from app.routes import ade_ops
from app.routes import automated_data_engineering
from app.routes import intelligence_cards
from app.routes import morning_brief
from app.routes import enterprise_memory
from app.routes import events_analytics
from app.routes import workflow_registry
from app.routes import audit_dashboard
from app.routes import analysis_sessions
from app.routes import telemetry_analyzer
from app.routes import relativity_mes
from app.routes import data_platform_analyzer
from app.routes import business_analyzer
from app.routes import agent_personalities
from app.routes import re_uw_reports, re_uw_links, re_pipeline, re_geography, re_intelligence
from app.routes import re_opportunities
from app.routes import (
    nv_discovery, nv_data_studio, nv_workflow_intel, nv_vendor_intel,
    nv_metric_dict, nv_data_chaos, nv_exec_blueprint, nv_pilot_builder,
    nv_impact_estimator, nv_case_factory, nv_ai_copilot, nv_engagement_output,
    nv_receipt_intake, nv_accounting_desk,
)
from app.routes import pitch_forge as pitch_forge_routes
from app.routes import outreach_personalizer as outreach_personalizer_routes
from app.routes import epi as epi_routes
from app.routes import re_query
from app.routes import semantic_catalog, analytics
from app.routes import pds_revenue, pds_utilization, pds_satisfaction, pds_adoption, pds_accounts_v2
from app.routes import pds_query, pds_chat, pds_analytics
from app.routes import cre_work_packages
from app.routes import cre_submission
from app.routes import capital_projects
from app.routes import cp_draws
from app.routes import dev_bridge
from app.routes import resume, resume_chat
from app.routes import tracking
from app.routes import email_integrations
from app.routes import market_regime
from app.routes import market_correlation
from app.routes import market_research_state
from app.routes import rhymes
from app.routes import podcast_intelligence
from app.routes import hr as hr_routes
from app.routes import hr_stream as hr_stream_routes
from app.routes import hr_research as hr_research_routes
from app.routes import hr_morning_book as hr_morning_book_routes
from app.routes import hr_ml_demo as hr_ml_demo_routes
from app.routes import hr_promotion_candidates as hr_promotion_candidates_routes
from app.routes import altered_mind as altered_mind_routes
from app.routes import hha as hha_routes
from app.routes import ncf_grant_friction
from app.routes import trading
from app.routes import trading_analytics
from app.routes import trades
from app.routes import sql_agent as sql_agent_routes
from app.routes import capability as capability_routes
from app.routes import unified_metrics
from app.routes import operator
from app.routes import site_risk
from app.routes import pipeline_integrity
from app.routes.winston_contract_admin import router as winston_contract_admin_router
from app.routes import investment_engine as investment_engine_routes
from app.routes import vultr as vultr_routes
from app.routes import auth_oidc as auth_oidc_routes

@asynccontextmanager
async def lifespan(app: FastAPI):
    t0 = time.monotonic()
    git_sha = resolve_git_sha()
    db_fp = resolve_db_fingerprint()

    # Background task handles, cancelled on shutdown below. None until a future
    # phase wires their creation; the shutdown loop guards on `is not None`.
    stream_task = None
    stream_etl_task = None
    stargate_autoplay_task = None
    tel_kafka_consumer_task = None

    emit_log(
        level="info", service="backend", action="startup.begin",
        message="Backend starting",
        context={"git_sha": git_sha, "python_version": resolve_python_version()},
    )

    # _BM_SKIP_DB_CHECK is set by app.mcp.server at import time so the MCP
    # stdio entrypoint can list tools without a database.  The web server
    # always has DATABASE_URL, so override the flag here.
    from app.config import DATABASE_URL as _db_url
    skip_db = os.environ.get("_BM_SKIP_DB_CHECK") == "1" and not _db_url
    db_connected = False
    schema_ok = False
    schema_issues: list[str] = []

    if skip_db:
        emit_log(
            level="info", service="backend", action="startup.db_check_skipped",
            message="DB check skipped (_BM_SKIP_DB_CHECK=1)", context={},
        )
    else:
        try:
            from app.db import _get_pool
            _get_pool()
            db_connected = True
            schema_ok = True
            emit_log(
                level="info", service="backend", action="startup.db_connect_ok",
                message="Database pool opened",
                context={"db_fingerprint": db_fp},
            )
        except Exception as exc:
            emit_log(
                level="error", service="backend", action="startup.db_connect_failed",
                message="Database connection failed",
                context={"db_fingerprint": db_fp}, error=exc,
            )


    # ── Unified Metric Registry validation ─────────────────────────
    if db_connected and not skip_db:
        try:
            from app.services.unified_metric_registry import get_registry
            _metric_reg = get_registry(force_reload=True)
            _metric_issues = _metric_reg.validate_schema()
            strict_metrics = os.environ.get("STRICT_METRICS", "0") == "1"
            if _metric_issues:
                emit_log(
                    level="error" if strict_metrics else "warn",
                    service="backend",
                    action="startup.metric_validation",
                    message=f"Metric registry: {len(_metric_issues)} issues",
                    context={"issues": _metric_issues[:10], "strict": strict_metrics},
                )
                if strict_metrics:
                    raise RuntimeError(
                        f"STRICT_METRICS: {len(_metric_issues)} metric validation failures — "
                        f"refusing to start. First issue: {_metric_issues[0]}"
                    )
            else:
                emit_log(
                    level="info", service="backend",
                    action="startup.metric_validation",
                    message=f"Metric registry loaded: {len(_metric_reg.list_all())} metrics, 0 issues",
                    context={"metric_count": len(_metric_reg.list_all())},
                )
        except RuntimeError:
            raise  # Re-raise STRICT_METRICS failure
        except Exception as exc:
            emit_log(
                level="warn", service="backend",
                action="startup.metric_validation",
                message="Metric registry load failed (non-fatal)",
                context={}, error=exc,
            )

    elapsed_ms = int((time.monotonic() - t0) * 1000)
    state = DeployState(
        booted_at=emit_log.__module__,  # placeholder, replaced below
        git_sha=git_sha,
        db_fingerprint=db_fp,
        schema_contract_ok=schema_ok,
        schema_issues=schema_issues,
        db_connected=db_connected,
        startup_duration_ms=elapsed_ms,
        assistant_boot_enabled=False,
    )
    # Use proper ISO timestamp
    from app.observability.logger import _iso_now
    state.booted_at = _iso_now()
    set_deploy_state(state)

    emit_log(
        level="info", service="backend", action="startup.complete",
        message="Backend startup complete",
        context={"ready": db_connected and schema_ok, "duration_ms": elapsed_ms},
    )


    # History Rhymes stream spine: mode-dispatched (off/synthetic/replay/live_kafka).
    # The runner owns task lifecycle and health writes; default mode=off is inert.
    _hr_runner_ctx = None
    try:
        from app.services.hr_stream.runner import hr_stream_lifespan
        _hr_runner_ctx = hr_stream_lifespan()
        await _hr_runner_ctx.__aenter__()
        emit_log(
            level="info", service="backend", action="startup.hr_stream_started",
            message="History Rhymes stream runner started",
            context={},
        )
    except Exception as exc:
        _hr_runner_ctx = None
        emit_log(
            level="warn", service="backend", action="startup.hr_stream_failed",
            message="History Rhymes stream runner failed to start (non-fatal)",
            context={}, error=exc,
        )

    # Stargate bridge: initialize in-process when enabled (the router is mounted
    # below on the same flag). Without this the shared backend mounts /stargate/*
    # but never sets app.state.stargate_bridge, so the stream 503s ("reconnecting"
    # forever). Mirrors create_app's lifespan: preload the capture fixture and run
    # the wall-clock replay so the dashboard is live. Capture mode only ships in
    # this image; broker modes need the laptop tooling venv.
    if STARGATE_BRIDGE_ENABLED:
        try:
            import asyncio as _asyncio
            from app.services.stargate_bridge import (
                BridgeState as _BridgeState,
                initialize as _sg_initialize,
                replay_capture_forever as _sg_replay,
                resolve_autoplay as _sg_autoplay,
                resolve_mode as _sg_mode,
            )
            _sg_state = _BridgeState(_sg_mode())
            app.state.stargate_bridge = _sg_state
            app.state.stargate_capture_lines = None
            app.state.stargate_autoplay_task = None
            _sg_lines = _sg_initialize(_sg_state)
            if _sg_lines is not None:
                app.state.stargate_capture_lines = _sg_lines
                if _sg_autoplay():
                    stargate_autoplay_task = _asyncio.create_task(_sg_replay(_sg_state, _sg_lines))
                    app.state.stargate_autoplay_task = stargate_autoplay_task
            emit_log(
                level="info", service="backend", action="startup.stargate_bridge",
                message=f"Stargate bridge ready (mode={_sg_state.mode})", context={},
            )
        except Exception as exc:
            emit_log(
                level="warn", service="backend", action="startup.stargate_bridge_failed",
                message="Stargate bridge init failed (non-fatal)", context={}, error=exc,
            )

    # RS Demo live telemetry stream: start the ingest worker + ETL loop when
    # enabled. Without this the StreamWorker is never created, no fresh bronze
    # frames land, and Mission Control renders a frozen silver tail (the demo
    # "stream isn't moving" symptom). Gated on TELEMETRY_STREAM_ENABLED; default
    # off keeps the shared backend inert. The shutdown loop below cancels both
    # tasks. Non-fatal: a failed start logs and leaves the DB-tail fallback.
    if db_connected and TELEMETRY_STREAM_ENABLED:
        try:
            import asyncio as _tel_asyncio
            from uuid import UUID as _UUID

            from app.config import (
                TELEMETRY_ETL_INTERVAL_SECONDS,
                TELEMETRY_STREAM_BUSINESS_ID,
                TELEMETRY_STREAM_ENV_ID,
                TELEMETRY_STREAM_SOURCE,
            )
            from app.services.telemetry_stream_etl import run_etl_loop
            from app.services.telemetry_stream_ingest import StreamWorker, set_stream_worker

            _tel_business_id = _UUID(TELEMETRY_STREAM_BUSINESS_ID)
            _tel_worker = StreamWorker(
                env_id=TELEMETRY_STREAM_ENV_ID,
                business_id=TELEMETRY_STREAM_BUSINESS_ID,
                source=TELEMETRY_STREAM_SOURCE,
            )
            set_stream_worker(_tel_worker)
            stream_task = _tel_asyncio.create_task(_tel_worker.run())
            stream_etl_task = _tel_asyncio.create_task(run_etl_loop(
                env_id=TELEMETRY_STREAM_ENV_ID,
                business_id=_tel_business_id,
                interval_seconds=TELEMETRY_ETL_INTERVAL_SECONDS,
            ))
            emit_log(
                level="info", service="backend", action="startup.telemetry_stream",
                message=f"Telemetry stream worker started (source={TELEMETRY_STREAM_SOURCE})",
                context={"env_id": TELEMETRY_STREAM_ENV_ID},
            )
        except Exception as exc:
            emit_log(
                level="warn", service="backend", action="startup.telemetry_stream_failed",
                message="Telemetry stream worker failed to start (non-fatal)", context={}, error=exc,
            )

    # Telemetry durable Kafka serving-slice consumer: persists Stargate + triage
    # topics into the 10034 provenance tables for the lineage drawer. Independent
    # of the in-memory SSE bridge and the StreamWorker above. Default off
    # (TELEMETRY_KAFKA_CONSUMER_ENABLED) keeps the shared backend inert; a failed
    # start is non-fatal, and the consumer itself fails closed when no broker
    # client/creds are present (writes a not_available offset receipt, then idles).
    if db_connected and TELEMETRY_KAFKA_CONSUMER_ENABLED:
        try:
            import asyncio as _telk_asyncio

            from app.config import (
                TELEMETRY_KAFKA_CONSUMER_GROUP,
                TELEMETRY_KAFKA_RAW_SAMPLE_RATE,
                TELEMETRY_STREAM_BUSINESS_ID,
                TELEMETRY_STREAM_ENV_ID,
            )
            from app.services.telemetry_stream_consumer import TelemetryStreamConsumer

            _tel_kafka_consumer = TelemetryStreamConsumer(
                env_id=TELEMETRY_STREAM_ENV_ID,
                business_id=TELEMETRY_STREAM_BUSINESS_ID,
                consumer_group=TELEMETRY_KAFKA_CONSUMER_GROUP,
                sample_rate=TELEMETRY_KAFKA_RAW_SAMPLE_RATE,
            )
            tel_kafka_consumer_task = _telk_asyncio.create_task(_tel_kafka_consumer.run())
            emit_log(
                level="info", service="backend", action="startup.telemetry_kafka_consumer",
                message="Telemetry durable Kafka consumer started",
                context={"group": TELEMETRY_KAFKA_CONSUMER_GROUP},
            )
        except Exception as exc:
            emit_log(
                level="warn", service="backend", action="startup.telemetry_kafka_consumer_failed",
                message="Telemetry Kafka consumer failed to start (non-fatal)", context={}, error=exc,
            )

    yield

    # hr_stream_task (the synthetic loop) was replaced by _hr_runner_ctx in this
    # PR; the stargate replay task may have been replaced by /stargate/replay/cycle,
    # so cancel whatever is current on app.state.
    _sg_task = getattr(app.state, "stargate_autoplay_task", None)
    for _task in (stream_task, stream_etl_task, tel_kafka_consumer_task,
                  _sg_task or stargate_autoplay_task):
        if _task is not None:
            _task.cancel()
            try:
                await _task
            except BaseException:
                pass

    if _hr_runner_ctx is not None:
        try:
            await _hr_runner_ctx.__aexit__(None, None, None)
        except Exception:
            pass

    emit_log(
        level="info", service="backend", action="shutdown.begin",
        message="Backend shutting down", context={},
    )


app = FastAPI(title="Business OS API", version="0.1.0", lifespan=lifespan)

# Register MCP tools for the standalone MCP server and command workflows.
_register_all_tools()

# Validate prompt/registry coherence at startup
_write_tools = [t.name for t in _tool_registry.list_all() if t.permission == "write" and t.handler is not None]
if _write_tools:
    emit_log(level="info", service="backend", action="startup.write_tools_registered",
             message=f"Write tools registered: {_write_tools}", context={"tools": _write_tools})
else:
    emit_log(level="warn", service="backend", action="startup.no_write_tools",
             message="No write tools registered", context={})

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(AuthMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Keep validation logs concise and safe: no raw payloads.
    errors = []
    for item in exc.errors()[:8]:
        errors.append(
            {
                "loc": item.get("loc"),
                "msg": item.get("msg"),
                "type": item.get("type"),
            }
        )
    emit_log(
        level="warn",
        service="backend",
        action="repe.validation_failed",
        message="Request validation failed",
        context={"path": request.url.path, "errors": errors},
    )
    # Return the sanitized errors (loc/msg/type). Never return raw exc.errors() — for a body-parse
    # failure Pydantic v2 puts the raw request bytes in each error's `input`, which JSONResponse cannot
    # serialize (TypeError: Object of type bytes is not JSON serializable) and the outer handler then
    # turns into a 500. The sanitized list is bytes-free and leaks no raw payload.
    return JSONResponse(status_code=422, content={"detail": errors})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    emit_log(
        level="error",
        service="backend",
        action="request_failed",
        message="Unhandled application exception",
        context={"path": request.url.path},
        error=exc,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

app.include_router(health.router)
app.include_router(business.router)
app.include_router(documents.router)
app.include_router(executions.router)
app.include_router(finance.router)
app.include_router(tasks.router)
app.include_router(metrics.router)
app.include_router(metrics_query.router)
app.include_router(reports.router)
app.include_router(crm.router)
app.include_router(nv_tasks.router)
app.include_router(work.router)
app.include_router(audit.router)
app.include_router(lab.router)
app.include_router(lab_v2.router)
app.include_router(ai_router)
if STARGATE_BRIDGE_ENABLED:
    from app.routes.stargate_bridge import router as stargate_bridge_router  # noqa: E402
    app.include_router(stargate_bridge_router)
app.include_router(ai_audit_router)
app.include_router(ai_dispatch_router)
app.include_router(extraction.router)
app.include_router(compliance.router)
app.include_router(admin_tools.router)
app.include_router(admin_prompt_receipts_router)
from app.routes.winston_eval_admin import router as winston_eval_admin_router  # noqa: E402
app.include_router(winston_eval_admin_router)
app.include_router(winston_contract_admin_router)
app.include_router(underwriting.router)
app.include_router(real_estate.router)
app.include_router(repe.router)
app.include_router(re_valuation.router)
app.include_router(re_waterfall.router)
app.include_router(re_fund.router)
app.include_router(re_scenarios.router)
app.include_router(re_surveillance.router)
app.include_router(re_montecarlo.router)
app.include_router(re_reports.router)
app.include_router(re_v1_context.router)
app.include_router(re_v1_funds.router)
app.include_router(re_v2.router)
app.include_router(re_authoritative.router)
app.include_router(re_operator_diagnostics.router)
app.include_router(re_query.router)
app.include_router(re_financial_intelligence.router)
app.include_router(re_sustainability.router)
app.include_router(re_uw_reports.router)
app.include_router(re_uw_links.router)
app.include_router(re_pipeline.router)
app.include_router(re_opportunities.router)
app.include_router(re_geography.router)
app.include_router(re_intelligence.router)
app.include_router(cre_work_packages.router)
app.include_router(cre_submission.router)
app.include_router(pds.router)
app.include_router(pds_v2.router)
app.include_router(pds_executive.router)
app.include_router(pds_metrics.router)
app.include_router(pds_revenue.router)
app.include_router(pds_utilization.router)
app.include_router(pds_satisfaction.router)
app.include_router(pds_adoption.router)
app.include_router(pds_accounts_v2.router)
app.include_router(pds_query.router)
app.include_router(pds_chat.router)
app.include_router(pds_analytics.router)
app.include_router(capital_projects.router)
app.include_router(cp_draws.router)
app.include_router(dev_bridge.router)
app.include_router(resume.router)
app.include_router(resume_chat.router)
app.include_router(market_regime.router)
app.include_router(market_correlation.router)
app.include_router(market_research_state.router)
app.include_router(rhymes.router)
app.include_router(podcast_intelligence.router)
app.include_router(hr_routes.router)
app.include_router(hr_stream_routes.router)
app.include_router(hr_research_routes.router)
app.include_router(hr_morning_book_routes.router)
app.include_router(hr_ml_demo_routes.router)
app.include_router(hr_promotion_candidates_routes.router)
app.include_router(altered_mind_routes.router)
app.include_router(hha_routes.router)
app.include_router(ncf_grant_friction.router)
app.include_router(trading.router)
app.include_router(trading_analytics.router)
app.include_router(trades.router)
app.include_router(operator.router)
app.include_router(site_risk.router)
app.include_router(pipeline_integrity.router)
app.include_router(credit.router)
app.include_router(credit_v2.router)
app.include_router(doc_completion.router)
app.include_router(legal_ops.router)
app.include_router(medoffice.router)
app.include_router(winston_demo.router)
app.include_router(query_engine.router)
app.include_router(opportunity_engine.router)
app.include_router(psychrag.router)
app.include_router(website_content.router)
app.include_router(website_rankings.router)
app.include_router(website_analytics.router)
app.include_router(consulting.router)
app.include_router(telemetry.router)
app.include_router(telemetry_export.router)
app.include_router(telemetry_copilot.router)
app.include_router(telemetry_control_tower.router)
app.include_router(agent_builder.router)
app.include_router(automated_data_engineering.router)
app.include_router(ade_ops.router)
app.include_router(intelligence_cards.router)
app.include_router(morning_brief.router)
app.include_router(enterprise_memory.router)
app.include_router(events_analytics.router)
app.include_router(workflow_registry.router)
app.include_router(audit_dashboard.router)
app.include_router(analysis_sessions.router)
app.include_router(telemetry_analyzer.router)
app.include_router(relativity_mes.router)
app.include_router(data_platform_analyzer.router)
app.include_router(business_analyzer.router)
app.include_router(agent_personalities.router)
app.include_router(tracking.router)
app.include_router(email_integrations.router)
app.include_router(nv_discovery.router)
app.include_router(nv_data_studio.router)
app.include_router(nv_workflow_intel.router)
app.include_router(nv_vendor_intel.router)
app.include_router(nv_metric_dict.router)
app.include_router(nv_data_chaos.router)
app.include_router(nv_exec_blueprint.router)
app.include_router(nv_pilot_builder.router)
app.include_router(nv_impact_estimator.router)
app.include_router(nv_case_factory.router)
app.include_router(nv_ai_copilot.router)
app.include_router(nv_engagement_output.router)
app.include_router(nv_receipt_intake.router)
app.include_router(nv_accounting_desk.router)
app.include_router(epi_routes.router)
app.include_router(pitch_forge_routes.router)
app.include_router(outreach_personalizer_routes.router)
app.include_router(semantic_catalog.router)
app.include_router(unified_metrics.router)
app.include_router(analytics.router)
app.include_router(sql_agent_routes.router)
app.include_router(capability_routes.router)
app.include_router(investment_engine_routes.router)
app.include_router(vultr_routes.router)
app.include_router(auth_oidc_routes.router)
app.include_router(mcp_http_router)
