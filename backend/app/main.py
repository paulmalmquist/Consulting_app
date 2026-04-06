import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import ALLOWED_ORIGINS, AI_GATEWAY_ENABLED
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
    work,
    audit,
    lab,
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
from app.routes.ai import router as ai_router
from app.routes.ai_gateway import router as ai_gateway_router
from app.routes.ai_audit import router as ai_audit_router
from app.routes import website_content, website_rankings, website_analytics
from app.routes import consulting
from app.routes import re_uw_reports, re_uw_links, re_pipeline, re_geography, re_intelligence
from app.routes import (
    nv_discovery, nv_data_studio, nv_workflow_intel, nv_vendor_intel,
    nv_metric_dict, nv_data_chaos, nv_exec_blueprint, nv_pilot_builder,
    nv_impact_estimator, nv_case_factory, nv_ai_copilot, nv_engagement_output,
)
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
from app.routes import market_regime
from app.routes import market_correlation
from app.routes import trading
from app.routes import trades
from app.routes import sql_agent as sql_agent_routes
from app.routes import capability as capability_routes

@asynccontextmanager
async def lifespan(app: FastAPI):
    t0 = time.monotonic()
    git_sha = resolve_git_sha()
    db_fp = resolve_db_fingerprint()

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

        if db_connected:
            try:
                from app.services.winston_readiness import get_winston_readiness
                readiness = get_winston_readiness()
                schema_ok = readiness.ok
                schema_issues = readiness.issues
                if schema_ok:
                    emit_log(
                        level="info", service="backend", action="startup.schema_contract_passed",
                        message="Winston schema contract passed",
                        context={
                            "marker": readiness.schema_version_marker,
                            "surfaces": len(readiness.supported_launch_surface_ids),
                        },
                    )
                else:
                    emit_log(
                        level="warn", service="backend", action="startup.schema_contract_failed",
                        message="Winston schema contract failed",
                        context={
                            "issues": readiness.issues,
                            "missing_columns": readiness.missing_columns,
                            "missing_indexes": readiness.missing_indexes,
                        },
                    )
            except Exception as exc:
                schema_issues = [f"Schema contract check error: {exc}"]
                emit_log(
                    level="error", service="backend", action="startup.schema_contract_failed",
                    message="Schema contract check raised an exception",
                    context={}, error=exc,
                )

    emit_log(
        level="info", service="backend", action="startup.assistant_boot_enabled",
        message=f"AI gateway enabled: {AI_GATEWAY_ENABLED}",
        context={"ai_gateway_enabled": AI_GATEWAY_ENABLED},
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
        assistant_boot_enabled=AI_GATEWAY_ENABLED,
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

    yield

    emit_log(
        level="info", service="backend", action="shutdown.begin",
        message="Backend shutting down", context={},
    )


app = FastAPI(title="Business OS API", version="0.1.0", lifespan=lifespan)

# Register all MCP tools so the AI gateway can expose them to OpenAI tool-calling.
# Without this, _build_openai_tools() returns an empty list and Winston has zero tools.
_register_all_tools()

# Validate prompt/registry coherence at startup
_write_tools = [t.name for t in _tool_registry.list_all() if t.permission == "write" and t.handler is not None]
if _write_tools:
    emit_log(level="info", service="backend", action="startup.write_tools_registered",
             message=f"Write tools registered: {_write_tools}", context={"tools": _write_tools})
else:
    emit_log(level="warn", service="backend", action="startup.no_write_tools",
             message="No write tools registered — Winston operates in read-only mode", context={})

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
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


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
app.include_router(work.router)
app.include_router(audit.router)
app.include_router(lab.router)
app.include_router(ai_router)
app.include_router(ai_gateway_router)
app.include_router(ai_audit_router)
app.include_router(extraction.router)
app.include_router(compliance.router)
app.include_router(admin_tools.router)
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
app.include_router(re_query.router)
app.include_router(re_financial_intelligence.router)
app.include_router(re_sustainability.router)
app.include_router(re_uw_reports.router)
app.include_router(re_uw_links.router)
app.include_router(re_pipeline.router)
app.include_router(re_geography.router)
app.include_router(re_intelligence.router)
app.include_router(cre_work_packages.router)
app.include_router(cre_submission.router)
app.include_router(pds.router)
app.include_router(pds_v2.router)
app.include_router(pds_executive.router)
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
app.include_router(trading.router)
app.include_router(trades.router)
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
app.include_router(tracking.router)
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
app.include_router(epi_routes.router)
app.include_router(semantic_catalog.router)
app.include_router(analytics.router)
app.include_router(sql_agent_routes.router)
app.include_router(capability_routes.router)
app.include_router(mcp_http_router)
