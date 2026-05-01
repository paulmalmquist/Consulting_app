"""MCP tools for deterministic REPE read eval capabilities."""

from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.repe_eval_tools import (
    ExplainUnavailableMetricInput,
    GetAuthoritativeFundSnapshotsInput,
    GetMetricProvenanceInput,
    RankFundsByMetricChangeInput,
    ResolveRepeContextInput,
)
from app.services import repe_eval_capabilities as capabilities


def _resolve_repe_context(ctx: McpContext, inp: ResolveRepeContextInput) -> dict:
    return capabilities.resolve_repe_context(
        env_id=inp.env_id,
        business_id=inp.business_id,
        query=inp.query,
        entity_type=inp.entity_type,
    )


def _get_authoritative_fund_snapshots(ctx: McpContext, inp: GetAuthoritativeFundSnapshotsInput) -> dict:
    return capabilities.get_authoritative_fund_snapshots(
        env_id=inp.env_id,
        business_id=inp.business_id,
        fund_ids=inp.fund_ids,
        quarter=inp.quarter,
        released_only=inp.released_only,
    )


def _rank_funds_by_metric_change(ctx: McpContext, inp: RankFundsByMetricChangeInput) -> dict:
    return capabilities.rank_funds_by_metric_change(
        env_id=inp.env_id,
        business_id=inp.business_id,
        metric_key=inp.metric_key,
        ranking_basis=inp.ranking_basis,
        comparison_window_policy=inp.comparison_window_policy,
        fund_id=inp.fund_id,
    )


def _get_metric_provenance(ctx: McpContext, inp: GetMetricProvenanceInput) -> dict:
    return capabilities.get_metric_provenance(
        env_id=inp.env_id,
        business_id=inp.business_id,
        metric_key=inp.metric_key,
        entity_type=inp.entity_type,
        entity_id=inp.entity_id,
        period=inp.period,
    )


def _explain_unavailable_metric(ctx: McpContext, inp: ExplainUnavailableMetricInput) -> dict:
    return capabilities.explain_unavailable_metric(
        env_id=inp.env_id,
        metric_key=inp.metric_key,
        entity_type=inp.entity_type,
        entity_id=inp.entity_id,
        period=inp.period,
    )


def register_repe_eval_tools() -> None:
    registry.register(
        ToolDef(
            name="repe.resolve_repe_context",
            description="Resolve canonical REPE fund/deal/asset/entity ids in the active environment scope.",
            module="bm",
            permission="read",
            input_model=ResolveRepeContextInput,
            handler=_resolve_repe_context,
            tags=frozenset({"repe", "eval", "context"}),
        )
    )
    registry.register(
        ToolDef(
            name="repe.get_authoritative_fund_snapshots",
            description="Fetch released authoritative fund snapshots and provenance from re_authoritative_fund_state_qtr.",
            module="bm",
            permission="read",
            input_model=GetAuthoritativeFundSnapshotsInput,
            handler=_get_authoritative_fund_snapshots,
            tags=frozenset({"repe", "eval", "authoritative"}),
        )
    )
    registry.register(
        ToolDef(
            name="repe.rank_funds_by_metric_change",
            description="Rank funds by deterministic metric change using repe.fn_eligible_metric_history.",
            module="bm",
            permission="read",
            input_model=RankFundsByMetricChangeInput,
            handler=_rank_funds_by_metric_change,
            tags=frozenset({"repe", "eval", "comparison"}),
        )
    )
    registry.register(
        ToolDef(
            name="repe.get_metric_provenance",
            description="Fetch metric provenance and snapshot ids for a canonical authoritative metric.",
            module="bm",
            permission="read",
            input_model=GetMetricProvenanceInput,
            handler=_get_metric_provenance,
            tags=frozenset({"repe", "eval", "provenance"}),
        )
    )
    registry.register(
        ToolDef(
            name="repe.explain_unavailable_metric",
            description="Classify why a REPE metric is unavailable using the SQL failure taxonomy.",
            module="bm",
            permission="read",
            input_model=ExplainUnavailableMetricInput,
            handler=_explain_unavailable_metric,
            tags=frozenset({"repe", "eval", "unavailable"}),
        )
    )
