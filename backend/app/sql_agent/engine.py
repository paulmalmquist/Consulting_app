"""SQL Agent engine — orchestrates the full query lifecycle.

Entry point for all SQL agent operations. Coordinates:
  1. Query classification (deterministic)
  2. Template matching OR LLM-based SQL generation
  3. Validation
  4. Execution
  5. Chart recommendation
  6. Result packaging

Returns a single AgentResponse containing everything the frontend needs.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from app.sql_agent.chart_recommender import ChartRecommendation, recommend_chart
from app.sql_agent.executor import ExecutionResult, execute_sql
from app.sql_agent.query_classifier import QueryClassification, QueryType, classify_query
from app.sql_agent.query_templates import get_template, list_templates, render_template
from app.sql_agent.validator import ValidationResult, validate_sql

logger = logging.getLogger(__name__)


@dataclass
class AgentResponse:
    """Complete response from the SQL agent."""
    # Classification
    query_type: str
    domain: str
    confidence: float

    # SQL
    sql: str | None = None
    sql_params: dict[str, Any] = field(default_factory=dict)
    sql_source: str = "none"  # "template" | "llm" | "none"
    template_key: str | None = None
    validation: dict[str, Any] | None = None

    # Execution
    columns: list[str] = field(default_factory=list)
    rows: list[dict[str, Any]] = field(default_factory=list)
    row_count: int = 0
    truncated: bool = False
    execution_time_ms: float = 0.0

    # Chart
    chart: dict[str, Any] | None = None
    chart_alternatives: list[dict[str, Any]] = field(default_factory=list)

    # Meta
    answer_summary: str | None = None
    follow_up_suggestions: list[str] = field(default_factory=list)
    total_time_ms: float = 0.0
    error: str | None = None
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "query_type": self.query_type,
            "domain": self.domain,
            "confidence": round(self.confidence, 2),
            "sql": self.sql,
            "sql_params": {k: str(v) for k, v in self.sql_params.items()} if self.sql_params else {},
            "sql_source": self.sql_source,
            "template_key": self.template_key,
            "validation": self.validation,
            "columns": self.columns,
            "rows": self.rows,
            "row_count": self.row_count,
            "truncated": self.truncated,
            "execution_time_ms": round(self.execution_time_ms, 1),
            "chart": self.chart,
            "chart_alternatives": self.chart_alternatives,
            "answer_summary": self.answer_summary,
            "follow_up_suggestions": self.follow_up_suggestions,
            "total_time_ms": round(self.total_time_ms, 1),
            "error": self.error,
            "warnings": self.warnings,
        }
        return d


async def run_query(
    question: str,
    *,
    business_id: str,
    env_id: str | None = None,
    quarter: str | None = None,
    tenant_id: str | None = None,
    entity_id: str | None = None,
    row_limit: int = 500,
    capture_explain: bool = False,
) -> AgentResponse:
    """Full SQL agent pipeline: classify → generate → validate → execute → chart.

    Args:
        question: Natural-language question from the user.
        business_id: Required for tenant isolation.
        env_id: Environment ID (required for PDS queries).
        quarter: Current quarter context (e.g. "2026Q1").
        tenant_id: Tenant ID (required for CRM queries).
        entity_id: Optional entity scoping (fund_id, asset_id, etc.).
        row_limit: Max rows to return.
        capture_explain: Whether to include EXPLAIN plan.

    Returns:
        AgentResponse with full results, chart specs, and metadata.
    """
    start = time.perf_counter()

    # ── 1. Classify ──────────────────────────────────────────────────
    classification = classify_query(question)

    response = AgentResponse(
        query_type=classification.query_type.value,
        domain=classification.domain,
        confidence=classification.confidence,
    )

    # ── 2. Handle diagnostic questions ───────────────────────────────
    if classification.query_type == QueryType.DIAGNOSTIC:
        return _handle_diagnostic(question, classification, response, start)

    # ── 3. Try template match first ──────────────────────────────────
    sql: str | None = None
    params: dict[str, Any] = {}
    template_key = classification.suggested_template_key

    if template_key:
        template = get_template(template_key)
        if template:
            try:
                # Build params for the template
                template_params = _build_template_params(
                    template_key=template_key,
                    business_id=business_id,
                    env_id=env_id,
                    quarter=quarter,
                    tenant_id=tenant_id,
                    entity_id=entity_id,
                    classification=classification,
                    row_limit=row_limit,
                )
                sql, params = render_template(template_key, template_params)
                response.sql_source = "template"
                response.template_key = template_key
                logger.info("Using template: %s", template_key)
            except ValueError as e:
                logger.warning("Template render failed for %s: %s", template_key, e)
                # Fall through to LLM generation

    # ── 4. Fall back to LLM SQL generation ───────────────────────────
    if not sql:
        try:
            sql, params = await _generate_sql_via_llm(
                question=question,
                classification=classification,
                business_id=business_id,
                env_id=env_id,
                quarter=quarter,
            )
            response.sql_source = "llm"
        except Exception as e:
            response.error = f"SQL generation failed: {e}"
            response.total_time_ms = (time.perf_counter() - start) * 1000
            return response

    if not sql:
        response.error = "No SQL could be generated for this question"
        response.total_time_ms = (time.perf_counter() - start) * 1000
        return response

    response.sql = sql
    response.sql_params = params

    # ── 5. Validate ──────────────────────────────────────────────────
    validation = validate_sql(sql, business_id)
    response.validation = {
        "valid": validation.valid,
        "error": validation.error,
        "warnings": validation.warnings,
    }

    if not validation.valid:
        response.error = f"SQL validation failed: {validation.error}"
        response.warnings = validation.warnings or []
        response.total_time_ms = (time.perf_counter() - start) * 1000
        return response

    if validation.warnings:
        response.warnings = validation.warnings

    # ── 6. Execute ───────────────────────────────────────────────────
    exec_result = execute_sql(
        sql,
        params,
        row_limit=row_limit,
        capture_explain=capture_explain,
    )

    if exec_result.error:
        response.error = f"SQL execution failed: {exec_result.error}"
        response.execution_time_ms = exec_result.execution_time_ms
        response.total_time_ms = (time.perf_counter() - start) * 1000
        return response

    response.columns = exec_result.columns
    response.rows = exec_result.rows
    response.row_count = exec_result.row_count
    response.truncated = exec_result.truncated
    response.execution_time_ms = exec_result.execution_time_ms

    # ── 7. Chart recommendation ──────────────────────────────────────
    template = get_template(template_key) if template_key else None
    chart_rec = recommend_chart(
        exec_result.columns,
        exec_result.rows,
        query_type=classification.query_type.value,
        template_chart=template.default_chart if template else None,
    )

    if chart_rec.primary:
        response.chart = chart_rec.primary.to_block(exec_result.rows)
    response.chart_alternatives = [
        alt.to_block(exec_result.rows) for alt in chart_rec.alternatives
    ]

    # ── 8. Answer summary ────────────────────────────────────────────
    response.answer_summary = _build_summary(
        classification, exec_result, chart_rec,
    )

    # ── 9. Follow-up suggestions ─────────────────────────────────────
    response.follow_up_suggestions = _suggest_followups(
        classification, exec_result,
    )

    response.total_time_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "SQL agent complete: %s domain=%s source=%s rows=%d time=%.0fms",
        classification.query_type.value,
        classification.domain,
        response.sql_source,
        response.row_count,
        response.total_time_ms,
    )
    return response


# ── Internal helpers ─────────────────────────────────────────────────


def _handle_diagnostic(
    question: str,
    classification: QueryClassification,
    response: AgentResponse,
    start: float,
) -> AgentResponse:
    """Handle schema/diagnostic questions without executing SQL."""
    templates = list_templates(classification.domain if classification.domain != "general" else None)
    response.answer_summary = (
        f"Available query templates for {classification.domain}: "
        + ", ".join(t.key for t in templates[:10])
    )
    response.rows = [
        {"template": t.key, "description": t.description, "chart": t.default_chart or "table"}
        for t in templates
    ]
    response.columns = ["template", "description", "chart"]
    response.row_count = len(response.rows)
    response.total_time_ms = (time.perf_counter() - start) * 1000
    return response


def _build_template_params(
    *,
    template_key: str,
    business_id: str,
    env_id: str | None,
    quarter: str | None,
    tenant_id: str | None,
    entity_id: str | None,
    classification: QueryClassification,
    row_limit: int,
) -> dict[str, Any]:
    """Assemble params dict for a template from available context."""
    params: dict[str, Any] = {
        "business_id": business_id,
        "limit": row_limit,
    }
    if env_id:
        params["env_id"] = env_id
    if quarter:
        params["quarter"] = quarter
        # Compute prev_quarter for variance templates
        params["prev_quarter"] = _prev_quarter(quarter)
    if tenant_id:
        params["tenant_id"] = tenant_id
    if entity_id:
        params["entity_id"] = entity_id

    # Extract stale_days from signals
    stale_days = classification.signals.get("stale_days", 21)
    params["stale_days"] = stale_days

    # Months ahead for loan maturity
    params["months_ahead"] = 12

    return params


def _prev_quarter(quarter: str) -> str:
    """Compute the previous quarter string (e.g. 2026Q1 → 2025Q4)."""
    import re
    m = re.match(r"(\d{4})Q([1-4])", quarter)
    if not m:
        return quarter
    year, q = int(m.group(1)), int(m.group(2))
    if q == 1:
        return f"{year - 1}Q4"
    return f"{year}Q{q - 1}"


async def _generate_sql_via_llm(
    *,
    question: str,
    classification: QueryClassification,
    business_id: str,
    env_id: str | None,
    quarter: str | None,
) -> tuple[str, dict[str, Any]]:
    """Generate SQL via LLM when no template matches."""
    params: dict[str, Any] = {"business_id": business_id}
    if quarter:
        params["quarter"] = quarter

    if classification.domain == "pds" and env_id:
        # Use PDS-specific agent
        from app.sql_agent.pds_agent import run_pds_agent
        result = await run_pds_agent(
            question,
            env_id=env_id,
            business_id=business_id,
        )
        params["env_id"] = env_id
        return result.sql, params
    else:
        # Use REPE combined agent
        from app.sql_agent.combined_agent import run_agent
        result = await run_agent(
            question,
            business_id=business_id,
            quarter=quarter,
        )
        if result.sql:
            return result.sql, params
        raise ValueError(f"LLM returned no SQL (route={result.route})")


def _build_summary(
    classification: QueryClassification,
    result: ExecutionResult,
    chart_rec: ChartRecommendation,
) -> str:
    """Generate a concise answer summary."""
    parts = []

    if result.row_count == 0:
        return "No results found for this query."

    if result.row_count == 1 and len(result.columns) <= 3:
        # Single-row result: format as direct answer
        row = result.rows[0]
        kv = [f"{k}: {v}" for k, v in row.items() if v is not None]
        return " | ".join(kv)

    parts.append(f"Found {result.row_count} results")
    if result.truncated:
        parts.append("(results truncated)")

    if chart_rec.primary:
        parts.append(f"— shown as {chart_rec.primary.chart_type} chart")

    return " ".join(parts) + "."


def _suggest_followups(
    classification: QueryClassification,
    result: ExecutionResult,
) -> list[str]:
    """Suggest follow-up questions based on query type and results."""
    suggestions: list[str] = []
    domain = classification.domain

    if classification.query_type == QueryType.RANKED_COMPARISON:
        suggestions.append("Show this as a trend over time")
        suggestions.append("Break down by category")

    elif classification.query_type == QueryType.TIME_SERIES:
        suggestions.append("Which items changed the most?")
        suggestions.append("Compare to budget")

    elif classification.query_type == QueryType.GROUPED_AGGREGATION:
        suggestions.append("Show trend over time")
        suggestions.append("Rank by largest value")

    elif classification.query_type == QueryType.VARIANCE_ANALYSIS:
        suggestions.append("Show the variance trend")
        suggestions.append("Which items missed by the most?")

    elif classification.query_type == QueryType.FILTERED_LIST:
        suggestions.append("Rank these results")
        suggestions.append("Show a chart of this data")

    # Domain-specific suggestions
    if domain == "repe":
        if "noi" in " ".join(result.columns).lower():
            suggestions.append("Show NOI by property type")
        if "fund" in " ".join(result.columns).lower():
            suggestions.append("Show fund performance trend")

    elif domain == "pds":
        if "utilization" in " ".join(result.columns).lower():
            suggestions.append("Show bench report")
        suggestions.append("Compare to NPS scores")

    return suggestions[:4]  # cap at 4 suggestions


# ── Convenience functions for MCP tools ──────────────────────────────


def explain_question(question: str) -> dict[str, Any]:
    """Explain how a question would be processed without executing it."""
    classification = classify_query(question)
    template_key = classification.suggested_template_key
    template = get_template(template_key) if template_key else None

    return {
        "query_type": classification.query_type.value,
        "domain": classification.domain,
        "confidence": round(classification.confidence, 2),
        "signals": classification.signals,
        "template_match": {
            "key": template_key,
            "description": template.description if template else None,
            "default_chart": template.default_chart if template else None,
        } if template_key else None,
        "would_use_llm": template is None,
    }


def describe_schema(domain: str | None = None) -> dict[str, Any]:
    """Return schema information for a domain."""
    from app.sql_agent.catalog import ENTITY_TABLES, PDS_TABLES, STATEMENT_TABLES

    tables = []
    if domain in (None, "repe"):
        tables.extend(ENTITY_TABLES + STATEMENT_TABLES)
    if domain in (None, "pds"):
        tables.extend(PDS_TABLES)

    return {
        "domain": domain or "all",
        "table_count": len(tables),
        "tables": [
            {
                "name": t.name,
                "description": t.description,
                "pk": t.pk,
                "columns": [
                    {"name": c.name, "type": c.type, "description": c.description}
                    for c in t.columns
                ],
            }
            for t in tables
        ],
    }


def list_available_templates(domain: str | None = None) -> list[dict[str, Any]]:
    """List all query templates, optionally filtered by domain."""
    templates = list_templates(domain)
    return [
        {
            "key": t.key,
            "description": t.description,
            "domain": t.domain,
            "query_type": t.query_type.value,
            "default_chart": t.default_chart,
            "required_params": sorted(t.required_params),
            "optional_params": sorted(t.optional_params),
        }
        for t in templates
    ]
