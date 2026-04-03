"""REST routes for the SQL Agent.

Provides HTTP endpoints for the frontend Genie-style experience:
  POST /api/sql-agent/query    — full pipeline: classify → generate → execute → chart
  POST /api/sql-agent/explain  — explain how a question would be processed
  GET  /api/sql-agent/templates — list available query templates
  POST /api/sql-agent/templates/run — execute a template by key
  GET  /api/sql-agent/schema   — describe domain schema
  POST /api/sql-agent/validate — validate SQL safety
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sql-agent", tags=["sql-agent"])


# ── Request models ───────────────────────────────────────────────────


class QueryRequest(BaseModel):
    question: str = Field(..., description="Natural language question")
    business_id: str = Field(..., description="Business UUID")
    env_id: str | None = Field(default=None, description="Environment UUID")
    quarter: str | None = Field(default=None, description="Quarter context")
    tenant_id: str | None = Field(default=None, description="Tenant ID")
    entity_id: str | None = Field(default=None, description="Entity scope")
    row_limit: int = Field(default=500, ge=1, le=5000)
    capture_explain: bool = Field(default=False)


class ExplainRequest(BaseModel):
    question: str = Field(..., description="Question to analyze")


class RunTemplateRequest(BaseModel):
    template_key: str = Field(..., description="Template key")
    business_id: str = Field(..., description="Business UUID")
    env_id: str | None = Field(default=None)
    quarter: str | None = Field(default=None)
    tenant_id: str | None = Field(default=None)
    row_limit: int = Field(default=500, ge=1, le=5000)


class ValidateRequest(BaseModel):
    sql: str = Field(..., description="SQL to validate")
    business_id: str = Field(..., description="Business UUID")


# ── Routes ───────────────────────────────────────────────────────────


@router.post("/query")
async def query(req: QueryRequest) -> dict[str, Any]:
    """Full SQL agent pipeline: classify → generate → validate → execute → chart."""
    from app.sql_agent.engine import run_query

    result = await run_query(
        req.question,
        business_id=req.business_id,
        env_id=req.env_id,
        quarter=req.quarter,
        tenant_id=req.tenant_id,
        entity_id=req.entity_id,
        row_limit=req.row_limit,
        capture_explain=req.capture_explain,
    )
    return result.to_dict()


@router.post("/explain")
async def explain(req: ExplainRequest) -> dict[str, Any]:
    """Explain how a question would be processed without executing."""
    from app.sql_agent.engine import explain_question

    return explain_question(req.question)


@router.get("/templates")
async def templates(domain: str | None = None) -> dict[str, Any]:
    """List available query templates."""
    from app.sql_agent.engine import list_available_templates

    result = list_available_templates(domain)
    return {"templates": result, "count": len(result)}


@router.post("/templates/run")
async def run_template(req: RunTemplateRequest) -> dict[str, Any]:
    """Execute a saved query template by key."""
    import re as _re

    from app.sql_agent.chart_recommender import recommend_chart
    from app.sql_agent.executor import execute_sql
    from app.sql_agent.query_templates import get_template, render_template
    from app.sql_agent.validator import validate_sql

    template = get_template(req.template_key)
    if not template:
        return {"error": f"Unknown template: {req.template_key}"}

    params: dict[str, Any] = {
        "business_id": req.business_id,
        "limit": req.row_limit,
    }
    if req.env_id:
        params["env_id"] = req.env_id
    if req.quarter:
        params["quarter"] = req.quarter
        m = _re.match(r"(\d{4})Q([1-4])", req.quarter)
        if m:
            year, q = int(m.group(1)), int(m.group(2))
            params["prev_quarter"] = f"{year - 1}Q4" if q == 1 else f"{year}Q{q - 1}"
    if req.tenant_id:
        params["tenant_id"] = req.tenant_id

    try:
        sql, clean_params = render_template(req.template_key, params)
    except ValueError as e:
        return {"error": str(e)}

    validation = validate_sql(sql, req.business_id)
    if not validation.valid:
        return {"error": f"Validation failed: {validation.error}", "sql": sql}

    exec_result = execute_sql(sql, clean_params, row_limit=req.row_limit)
    if exec_result.error:
        return {"error": exec_result.error, "sql": sql}

    chart_rec = recommend_chart(
        exec_result.columns,
        exec_result.rows,
        query_type=template.query_type.value,
        template_chart=template.default_chart,
    )

    return {
        "template_key": req.template_key,
        "description": template.description,
        "columns": exec_result.columns,
        "rows": exec_result.rows,
        "row_count": exec_result.row_count,
        "truncated": exec_result.truncated,
        "execution_time_ms": round(exec_result.execution_time_ms, 1),
        "sql": sql,
        "chart": chart_rec.primary.to_block(exec_result.rows) if chart_rec.primary else None,
    }


@router.get("/schema")
async def schema(domain: str | None = None) -> dict[str, Any]:
    """Describe domain schema."""
    from app.sql_agent.engine import describe_schema

    return describe_schema(domain)


@router.post("/validate")
async def validate(req: ValidateRequest) -> dict[str, Any]:
    """Validate SQL for safety."""
    from app.sql_agent.validator import validate_sql

    result = validate_sql(req.sql, req.business_id)
    return {
        "valid": result.valid,
        "error": result.error,
        "warnings": result.warnings,
        "sql": result.sql,
    }


@router.get("/health")
async def health() -> dict[str, Any]:
    """Health check for the SQL agent."""
    from app.sql_agent.query_templates import list_templates

    return {
        "status": "ok",
        "template_count": len(list_templates()),
        "domains": ["repe", "pds", "crm"],
    }
