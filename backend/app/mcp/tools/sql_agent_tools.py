"""MCP tools for the SQL Agent — structured querying, schema, templates, validation.

Exposes the SQL agent as a set of narrow, stable MCP tools so Claude
and other AI agents can query relational data safely.
"""
from __future__ import annotations

import asyncio
import logging

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.sql_agent_tools import (
    SqlDescribeSchemaInput,
    SqlExplainQuestionInput,
    SqlListTemplatesInput,
    SqlPreviewChartInput,
    SqlQueryStructuredInput,
    SqlRunTemplateInput,
    SqlValidateQueryInput,
)
from app.observability.logger import emit_log

logger = logging.getLogger(__name__)


def _sql_query_structured(ctx: McpContext, inp: SqlQueryStructuredInput) -> dict:
    """Execute a natural-language question through the full SQL agent pipeline."""
    from app.sql_agent.engine import run_query

    result = asyncio.get_event_loop().run_until_complete(
        run_query(
            inp.question,
            business_id=str(inp.business_id),
            env_id=str(inp.env_id) if inp.env_id else None,
            quarter=inp.quarter,
            tenant_id=inp.tenant_id,
            row_limit=inp.row_limit,
        )
    )

    emit_log(
        level="info",
        service="mcp",
        action="tool.sql.query_structured",
        message=f"SQL query: type={result.query_type} source={result.sql_source} rows={result.row_count}",
        context={
            "question": inp.question[:200],
            "query_type": result.query_type,
            "sql_source": result.sql_source,
            "row_count": result.row_count,
            "total_time_ms": result.total_time_ms,
        },
    )

    return result.to_dict()


def _sql_explain_question(ctx: McpContext, inp: SqlExplainQuestionInput) -> dict:
    """Explain how a question would be processed without executing it."""
    from app.sql_agent.engine import explain_question

    return explain_question(inp.question)


def _sql_describe_schema(ctx: McpContext, inp: SqlDescribeSchemaInput) -> dict:
    """Return schema information for a domain."""
    from app.sql_agent.engine import describe_schema

    return describe_schema(inp.domain)


def _sql_list_templates(ctx: McpContext, inp: SqlListTemplatesInput) -> dict:
    """List available deterministic query templates."""
    from app.sql_agent.engine import list_available_templates

    templates = list_available_templates(inp.domain)
    return {"templates": templates, "count": len(templates)}


def _sql_validate_query(ctx: McpContext, inp: SqlValidateQueryInput) -> dict:
    """Validate a SQL query for safety without executing it."""
    from app.sql_agent.validator import validate_sql

    result = validate_sql(inp.sql, str(inp.business_id))
    return {
        "valid": result.valid,
        "error": result.error,
        "warnings": result.warnings,
        "sql": result.sql,
    }


def _sql_run_template(ctx: McpContext, inp: SqlRunTemplateInput) -> dict:
    """Execute a saved query template by key."""
    from app.sql_agent.chart_recommender import recommend_chart
    from app.sql_agent.executor import execute_sql
    from app.sql_agent.query_templates import get_template, render_template
    from app.sql_agent.validator import validate_sql

    template = get_template(inp.template_key)
    if not template:
        return {"error": f"Unknown template: {inp.template_key}"}

    params: dict = {
        "business_id": str(inp.business_id),
        "limit": inp.row_limit,
    }
    if inp.env_id:
        params["env_id"] = str(inp.env_id)
    if inp.quarter:
        params["quarter"] = inp.quarter
        # Compute prev_quarter
        import re
        m = re.match(r"(\d{4})Q([1-4])", inp.quarter)
        if m:
            year, q = int(m.group(1)), int(m.group(2))
            params["prev_quarter"] = f"{year - 1}Q4" if q == 1 else f"{year}Q{q - 1}"
    if inp.tenant_id:
        params["tenant_id"] = inp.tenant_id

    try:
        sql, clean_params = render_template(inp.template_key, params)
    except ValueError as e:
        return {"error": str(e)}

    validation = validate_sql(sql, str(inp.business_id))
    if not validation.valid:
        return {"error": f"Validation failed: {validation.error}", "sql": sql}

    exec_result = execute_sql(sql, clean_params, row_limit=inp.row_limit)
    if exec_result.error:
        return {"error": exec_result.error, "sql": sql}

    chart_rec = recommend_chart(
        exec_result.columns,
        exec_result.rows,
        query_type=template.query_type.value,
        template_chart=template.default_chart,
    )

    return {
        "template_key": inp.template_key,
        "description": template.description,
        "columns": exec_result.columns,
        "rows": exec_result.rows,
        "row_count": exec_result.row_count,
        "truncated": exec_result.truncated,
        "execution_time_ms": round(exec_result.execution_time_ms, 1),
        "sql": sql,
        "chart": chart_rec.primary.to_block(exec_result.rows) if chart_rec.primary else None,
    }


def _sql_preview_chart(ctx: McpContext, inp: SqlPreviewChartInput) -> dict:
    """Preview chart recommendation for given columns and sample data."""
    from app.sql_agent.chart_recommender import recommend_chart

    rec = recommend_chart(
        inp.columns,
        inp.sample_rows,
        query_type=inp.query_type,
    )

    return {
        "primary": rec.primary.to_block(inp.sample_rows) if rec.primary else None,
        "alternatives": [alt.to_block(inp.sample_rows) for alt in rec.alternatives],
        "show_table": rec.show_table,
        "reason": rec.reason,
    }


def register_sql_agent_tools():
    """Register all SQL agent MCP tools."""

    registry.register(ToolDef(
        name="sql.query_structured",
        description=(
            "Ask a natural language question about business data and get structured results with SQL, "
            "table data, and chart recommendations. Supports REPE, PDS, and CRM domains. "
            "Examples: 'top assets by NOI', 'utilization trend', 'stale opportunities'"
        ),
        module="sql_agent",
        permission="read",
        input_model=SqlQueryStructuredInput,
        handler=_sql_query_structured,
        tags=frozenset({"sql_agent", "query"}),
    ))

    registry.register(ToolDef(
        name="sql.explain_question",
        description=(
            "Explain how a question would be classified and processed without executing it. "
            "Returns query type, domain, confidence, and template match."
        ),
        module="sql_agent",
        permission="read",
        input_model=SqlExplainQuestionInput,
        handler=_sql_explain_question,
        tags=frozenset({"sql_agent", "meta"}),
    ))

    registry.register(ToolDef(
        name="sql.describe_schema",
        description=(
            "Describe the database schema for a domain (repe, pds, or all). "
            "Returns table names, columns, types, and descriptions."
        ),
        module="sql_agent",
        permission="read",
        input_model=SqlDescribeSchemaInput,
        handler=_sql_describe_schema,
        tags=frozenset({"sql_agent", "meta"}),
    ))

    registry.register(ToolDef(
        name="sql.list_query_templates",
        description=(
            "List available deterministic query templates. Templates execute "
            "without LLM calls for maximum speed and reliability."
        ),
        module="sql_agent",
        permission="read",
        input_model=SqlListTemplatesInput,
        handler=_sql_list_templates,
        tags=frozenset({"sql_agent", "meta"}),
    ))

    registry.register(ToolDef(
        name="sql.validate_query",
        description=(
            "Validate a SQL query for safety: checks read-only, tenant isolation, "
            "table allowlist, and dangerous patterns."
        ),
        module="sql_agent",
        permission="read",
        input_model=SqlValidateQueryInput,
        handler=_sql_validate_query,
        tags=frozenset({"sql_agent", "validation"}),
    ))

    registry.register(ToolDef(
        name="sql.run_saved_query",
        description=(
            "Execute a saved query template by key (e.g. 'repe.noi_movers', "
            "'pds.utilization_trend'). Faster than natural language — no LLM call needed."
        ),
        module="sql_agent",
        permission="read",
        input_model=SqlRunTemplateInput,
        handler=_sql_run_template,
        tags=frozenset({"sql_agent", "query"}),
    ))

    registry.register(ToolDef(
        name="sql.preview_chart",
        description=(
            "Preview chart recommendations for given columns and sample data. "
            "Returns chart type, axis mapping, and format suggestions."
        ),
        module="sql_agent",
        permission="read",
        input_model=SqlPreviewChartInput,
        handler=_sql_preview_chart,
        tags=frozenset({"sql_agent", "chart"}),
    ))
