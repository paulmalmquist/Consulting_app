from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import ALLOWED_ORIGINS
from app.middleware import RequestLoggingMiddleware
from app.mcp.registry import registry as _tool_registry
from app.mcp.server import _register_all_tools
from app.observability.logger import emit_log
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
    legal_ops,
    medoffice,
    winston_demo,
    query_engine,
    opportunity_engine,
)
from app.routes.ai import router as ai_router
from app.routes.ai_gateway import router as ai_gateway_router
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

app = FastAPI(title="Business OS API", version="0.1.0")

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
app.include_router(pds.router)
app.include_router(pds_v2.router)
app.include_router(pds_executive.router)
app.include_router(credit.router)
app.include_router(legal_ops.router)
app.include_router(medoffice.router)
app.include_router(winston_demo.router)
app.include_router(query_engine.router)
app.include_router(opportunity_engine.router)
app.include_router(website_content.router)
app.include_router(website_rankings.router)
app.include_router(website_analytics.router)
app.include_router(consulting.router)
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
