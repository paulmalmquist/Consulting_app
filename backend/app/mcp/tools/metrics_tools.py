"""Metrics module MCP tools."""

from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.metrics_tools import MetricsDefinitionsInput, MetricsQueryInput
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
        description="Run a semantic metrics query",
        module="metrics",
        permission="read",
        input_model=MetricsQueryInput,
        handler=_metrics_query,
        tags=frozenset({"repe", "core"}),
    ))
