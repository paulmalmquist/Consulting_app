"""Metrics module MCP tools."""

from __future__ import annotations

from dataclasses import asdict

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.metrics_tools import (
    MetricsDefinitionsInput,
    MetricsQueryInput,
    UnifiedMetricsQueryInput,
)
from app.services import metrics_semantic


def _metrics_definitions(ctx: McpContext, inp: MetricsDefinitionsInput) -> dict:
    return metrics_semantic.list_metric_definitions(business_id=inp.business_id)


def _metrics_query(ctx: McpContext, inp: MetricsQueryInput) -> dict:
    return metrics_semantic.query_metrics(
        business_id=inp.business_id,
        metric_keys=inp.metric_keys,
        dimension=inp.dimension,
        date_from=inp.date_from,
        date_to=inp.date_to,
        refresh=inp.refresh,
    )


def _unified_metrics_query(ctx: McpContext, inp: UnifiedMetricsQueryInput) -> dict:
    """Route through the unified query builder — preferred tool for all metric lookups."""
    from app.services.unified_metric_registry import get_registry
    from app.services.unified_query_builder import MetricQuery, execute_unified_query

    registry_inst = get_registry()
    query = MetricQuery(
        metric_keys=inp.metric_keys,
        business_id=str(inp.business_id),
        env_id=str(inp.env_id) if inp.env_id else None,
        entity_type=inp.entity_type,
        entity_ids=[str(eid) for eid in inp.entity_ids] if inp.entity_ids else None,
        quarter=inp.quarter,
        dimension=inp.dimension,
        limit=inp.limit or 500,
    )
    results, execution = execute_unified_query(query, registry_inst)
    return {
        "results": [asdict(r) for r in results],
        "query_hash": execution.query_hash,
        "total_latency_ms": execution.total_latency_ms,
        "strategy_latencies": execution.strategy_latencies,
        "resolved_count": execution.resolved_count,
        "unresolved_keys": execution.unresolved_keys,
    }


def register_metrics_tools():
    registry.register(ToolDef(
        name="metrics.definitions",
        description="List visible metrics and dimensions for a business",
        module="metrics",
        permission="read",
        input_model=MetricsDefinitionsInput,
        handler=_metrics_definitions,
        tags=frozenset({"repe", "core"}),
    ))
    registry.register(ToolDef(
        name="metrics.query",
        description="Run a semantic metrics query (legacy — prefer metrics.unified_query)",
        module="metrics",
        permission="read",
        input_model=MetricsQueryInput,
        handler=_metrics_query,
        tags=frozenset({"repe", "core"}),
    ))
    registry.register(ToolDef(
        name="metrics.unified_query",
        description=(
            "Query any metric through the unified registry. "
            "Routes to deterministic templates, semantic SQL, or service functions. "
            "Returns consistent results with query_hash and latency tracking. "
            "Use this for ALL metric lookups — IRR, TVPI, NOI, occupancy, etc."
        ),
        module="metrics",
        permission="read",
        input_model=UnifiedMetricsQueryInput,
        handler=_unified_metrics_query,
        tags=frozenset({"repe", "core", "metrics"}),
    ))
