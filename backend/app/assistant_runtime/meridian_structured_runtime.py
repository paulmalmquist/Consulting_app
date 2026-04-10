from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from app.assistant_runtime.result_memory import (
    build_bucketed_count_result_memory,
    build_list_result_memory,
    build_memory_scope,
    build_query_signature,
)
from app.assistant_runtime.meridian_structured_capabilities import (
    evaluate_meridian_contract_support,
    resolve_inventory_key,
)
from app.assistant_runtime.metric_normalizer import extract_metric
from app.assistant_runtime.turn_receipts import StructuredQueryReceipt
from app.db import get_cursor
from app.observability.logger import emit_log
from app.schemas.ai_gateway import AssistantContextEnvelope
from app.services import re_authoritative_snapshots, re_env_portfolio, repe
from app.sql_agent.executor import execute_sql
from app.sql_agent.query_classifier import extract_conditions
from app.sql_agent.query_templates import render_template

MERIDIAN_BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
MERIDIAN_ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"

_QUARTER_RE = re.compile(r"\b(20\d{2}Q[1-4])\b", re.IGNORECASE)
_TOP_BOTTOM_RE = re.compile(r"\b(top|bottom)\s+(\d+)\b", re.IGNORECASE)
_BREAKOUT_RE = re.compile(r"\bbreak\s+that\s+out(?:\s+by\s+(?P<group>fund|market|property\s*type|quarter|status))?\b", re.IGNORECASE)
_STRUCTURED_HINT_RE = re.compile(
    r"\b("
    r"fund|funds|investment|investments|deal|deals|asset|assets|property|properties|loan|loans|"
    r"portfolio|portal|performance|irr|tvpi|dpi|rvpi|nav|noi|occupancy|commitments|count|how many|how much|"
    r"sort|rank|list|summarize|summary|break\s+that\s+out|descending|ascending|worst to best|above|below|worse"
    r")\b",
    re.IGNORECASE,
)
_RANK_RE = re.compile(
    r"\b(sort|rank|top|bottom|highest|lowest|descending|ascending|worst to best|best to worst)\b",
    re.IGNORECASE,
)
_FILTER_RE = re.compile(
    r"\b(which\s+have|which\s+assets\s+have|with|above|below|less\s+than|greater\s+than|or\s+worse|not\s+active)\b",
    re.IGNORECASE,
)
_TREND_RE = re.compile(r"\b(trend|over time|historical|by quarter)\b", re.IGNORECASE)
_COMPARE_RE = re.compile(r"\b(compare|versus|vs\.?)\b", re.IGNORECASE)
_LIST_RE = re.compile(r"\b(list|list all|which ones|what are the names|names)\b", re.IGNORECASE)
_SUMMARY_RE = re.compile(r"\b(summary|summarize|rundown|how many|how much)\b", re.IGNORECASE)
_GROUP_BY_RE = re.compile(r"\b(by|per|each)\s+(fund|market|property\s*type|quarter|status)\b", re.IGNORECASE)


@dataclass(frozen=True)
class StructuredFilter:
    field: str
    operator: str
    value: Any
    raw_text: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "field": self.field,
            "operator": self.operator,
            "value": self.value,
            "raw_text": self.raw_text,
        }


@dataclass
class StructuredPortfolioQueryContract:
    entity: str | None
    entity_name: str | None = None
    metric: str | None = None
    fact: str | None = None
    transformation: str = "summary"
    group_by: str | None = None
    aggregation: str | None = None
    filters: list[StructuredFilter] = field(default_factory=list)
    sort_by: str | None = None
    sort_direction: str | None = None
    limit: int | None = None
    timeframe_type: str = "none"
    timeframe_value: str | None = None
    needs_clarification: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "entity": self.entity,
            "entity_name": self.entity_name,
            "metric": self.metric,
            "fact": self.fact,
            "transformation": self.transformation,
            "group_by": self.group_by,
            "aggregation": self.aggregation,
            "filters": [item.to_dict() for item in self.filters],
            "sort_by": self.sort_by,
            "sort_direction": self.sort_direction,
            "limit": self.limit,
            "timeframe_type": self.timeframe_type,
            "timeframe_value": self.timeframe_value,
            "needs_clarification": self.needs_clarification,
        }


@dataclass
class MeridianStructuredOutcome:
    text: str
    receipt: StructuredQueryReceipt
    result_memory: dict[str, Any] | None = None
    structured_query_state: dict[str, Any] | None = None


def _to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _format_currency(value: Any) -> str:
    amount = _to_decimal(value)
    if amount is None:
        return "n/a"
    return f"${amount:,.0f}"


def _format_percent(value: Any) -> str:
    amount = _to_decimal(value)
    if amount is None:
        return "n/a"
    if abs(amount) <= Decimal("1"):
        amount *= Decimal("100")
    return f"{amount:.1f}%"


def is_meridian_scope(*, resolved_scope: Any, envelope: AssistantContextEnvelope) -> bool:
    business_id = str(
        getattr(resolved_scope, "business_id", None)
        or envelope.ui.active_business_id
        or envelope.session.org_id
        or ""
    )
    env_id = str(
        getattr(resolved_scope, "environment_id", None)
        or envelope.ui.active_environment_id
        or envelope.session.session_env_id
        or ""
    )
    env_name = (envelope.ui.active_environment_name or "").lower()
    return (
        (business_id == MERIDIAN_BUSINESS_ID and env_id == MERIDIAN_ENV_ID)
        or (env_id == MERIDIAN_ENV_ID and "meridian" in env_name)
    )


def try_run_meridian_structured_query(
    *,
    message: str,
    resolved_scope: Any,
    envelope: AssistantContextEnvelope,
    thread_entity_state: dict[str, Any] | None,
) -> MeridianStructuredOutcome | None:
    if not is_meridian_scope(resolved_scope=resolved_scope, envelope=envelope):
        return None

    normalized = (message or "").strip()
    if not normalized or not _STRUCTURED_HINT_RE.search(normalized):
        return None

    structured_state = (thread_entity_state or {}).get("structured_query_state") or {}
    contract, memory_used = _parse_contract(message=normalized, structured_state=structured_state)
    if contract is None:
        metric_hint = extract_metric(normalized, business_id=str(envelope.ui.active_business_id or MERIDIAN_BUSINESS_ID))
        if metric_hint is not None:
            _emit_unsupported_ask(
                message=normalized,
                reason_bucket="missing_transformation_support",
                metric_key=str(metric_hint.get("normalized") or ""),
                contract=None,
            )
        return None

    supported, reason_bucket, inventory_key = evaluate_meridian_contract_support(contract)
    if not supported:
        _emit_unsupported_ask(
            message=normalized,
            reason_bucket=reason_bucket or "missing_execution_path",
            metric_key=inventory_key,
            contract=contract,
        )
        return None

    business_id = str(
        getattr(resolved_scope, "business_id", None)
        or envelope.ui.active_business_id
        or MERIDIAN_BUSINESS_ID
    )
    env_id = str(
        getattr(resolved_scope, "environment_id", None)
        or envelope.ui.active_environment_id
        or MERIDIAN_ENV_ID
    )

    outcome = _execute_contract(
        contract=contract,
        business_id=business_id,
        env_id=env_id,
        resolved_scope=resolved_scope,
        memory_used=memory_used,
        structured_state=structured_state,
    )
    if outcome is None:
        _emit_unsupported_ask(
            message=normalized,
            reason_bucket="missing_execution_path",
            metric_key=resolve_inventory_key(metric=contract.metric, fact=contract.fact),
            contract=contract,
        )
        return None

    emit_log(
        level="info",
        service="backend",
        action="assistant_runtime.meridian_structured_query",
        message="Executed Meridian structured query",
        context={
            "contract": contract.to_dict(),
            "execution_path": outcome.receipt.execution_path,
            "memory_used": outcome.receipt.memory_used,
            "degraded": outcome.receipt.degraded,
        },
    )
    return outcome


def _parse_contract(
    *,
    message: str,
    structured_state: dict[str, Any],
) -> tuple[StructuredPortfolioQueryContract | None, bool]:
    text = (message or "").strip()
    lower = text.lower()
    previous_contract = structured_state.get("last_contract") or {}
    memory_used = False

    breakout_match = _BREAKOUT_RE.search(text)
    if breakout_match and previous_contract:
        memory_used = True
        group_by = _normalize_group_by(breakout_match.group("group")) or "fund"
        inherited = _contract_from_state(previous_contract)
        inherited.transformation = "breakout"
        inherited.group_by = group_by
        inherited.aggregation = inherited.aggregation or "sum"
        return inherited, memory_used

    if lower in {"which ones", "what are their names", "their names", "what are the names"} and previous_contract:
        memory_used = True
        inherited = _contract_from_state(previous_contract)
        inherited.transformation = "detail"
        return inherited, memory_used

    entity = _extract_entity(lower, previous_contract)
    metric, fact = _extract_metric_or_fact(lower, previous_contract)
    transformation = _extract_transformation(lower, previous_contract)
    if transformation is None:
        return None, memory_used

    group_by = _extract_group_by(lower, previous_contract, transformation)
    aggregation = _extract_aggregation(lower, metric=metric, fact=fact, transformation=transformation, group_by=group_by)
    filters = _extract_filters(lower)
    sort_by, sort_direction = _extract_sort(lower, metric=metric)
    limit = _extract_limit(lower)
    timeframe_type, timeframe_value = _extract_timeframe(lower, previous_contract)

    if previous_contract and not entity and transformation in {"breakout", "detail", "filter"}:
        inherited = _contract_from_state(previous_contract)
        entity = entity or inherited.entity
        metric = metric or inherited.metric
        fact = fact or inherited.fact
        timeframe_type = timeframe_type if timeframe_type != "none" else inherited.timeframe_type
        timeframe_value = timeframe_value or inherited.timeframe_value
        memory_used = True

    if not entity and not metric and not fact:
        return None, memory_used

    if not entity:
        if metric in {"noi_variance", "occupancy", "noi"}:
            entity = "asset"
        elif metric in {"commitments", "asset_count"}:
            entity = "portfolio"
        elif fact == "performance_family":
            entity = "fund"

    if not entity:
        entity = "portfolio"

    if not metric and not fact and transformation not in {"list", "summary"}:
        return None, memory_used

    contract = StructuredPortfolioQueryContract(
        entity=entity,
        entity_name=None,
        metric=metric,
        fact=fact,
        transformation=transformation,
        group_by=group_by,
        aggregation=aggregation,
        filters=filters,
        sort_by=sort_by,
        sort_direction=sort_direction,
        limit=limit,
        timeframe_type=timeframe_type,
        timeframe_value=timeframe_value,
        needs_clarification=False,
    )
    return contract, memory_used


def _contract_from_state(state: dict[str, Any]) -> StructuredPortfolioQueryContract:
    return StructuredPortfolioQueryContract(
        entity=state.get("entity"),
        entity_name=state.get("entity_name"),
        metric=state.get("metric"),
        fact=state.get("fact"),
        transformation=state.get("transformation") or "summary",
        group_by=state.get("group_by"),
        aggregation=state.get("aggregation"),
        filters=[
            StructuredFilter(
                field=item.get("field"),
                operator=item.get("operator"),
                value=item.get("value"),
                raw_text=item.get("raw_text"),
            )
            for item in list(state.get("filters") or [])
            if item.get("field") and item.get("operator")
        ],
        sort_by=state.get("sort_by"),
        sort_direction=state.get("sort_direction"),
        limit=state.get("limit"),
        timeframe_type=state.get("timeframe_type") or "none",
        timeframe_value=state.get("timeframe_value"),
        needs_clarification=bool(state.get("needs_clarification")),
    )


def _extract_entity(text: str, previous_contract: dict[str, Any]) -> str | None:
    if "investment" in text or "deal" in text:
        return "investment"
    if "asset" in text or "property" in text:
        return "asset"
    if "loan" in text:
        return "loan"
    if "fund" in text:
        return "fund"
    if "portfolio" in text or "portal" in text or "environment" in text:
        return "portfolio"
    return previous_contract.get("entity")


def _extract_metric_or_fact(text: str, previous_contract: dict[str, Any]) -> tuple[str | None, str | None]:
    metric_map = [
        ("noi variance", "noi_variance"),
        ("gross irr", "gross_irr"),
        ("net irr", "net_irr"),
        ("tvpi", "tvpi"),
        ("dpi", "dpi"),
        ("rvpi", "rvpi"),
        ("occupancy", "occupancy"),
        ("commitments", "commitments"),
        ("commitment", "commitments"),
        ("nav", "nav"),
        ("noi", "noi"),
        ("asset count", "asset_count"),
    ]
    for phrase, metric in metric_map:
        if phrase in text:
            return metric, None
    if "how many" in text and ("asset" in text or "property" in text or "portal" in text or "portfolio" in text):
        return "asset_count", None
    if "performance" in text:
        return None, "performance_family"
    if any(phrase in text for phrase in ("rundown", "list all funds", "give me a rundown of the funds")):
        return None, "inventory"
    return previous_contract.get("metric"), previous_contract.get("fact")


def _extract_transformation(text: str, previous_contract: dict[str, Any]) -> str | None:
    if _BREAKOUT_RE.search(text):
        return "breakout"
    if _RANK_RE.search(text):
        return "rank"
    if _FILTER_RE.search(text) or extract_conditions(text):
        return "filter"
    if _TREND_RE.search(text):
        return "trend"
    if _COMPARE_RE.search(text):
        return "compare"
    if _LIST_RE.search(text):
        return "list"
    if _SUMMARY_RE.search(text):
        return "summary"
    if previous_contract and text.strip() in {"break that out", "which ones"}:
        return "breakout"
    return None


def _extract_group_by(text: str, previous_contract: dict[str, Any], transformation: str) -> str | None:
    match = _GROUP_BY_RE.search(text)
    if match:
        return _normalize_group_by(match.group(2))
    if "each fund" in text or "each funds" in text or "by fund" in text:
        return "fund"
    if transformation == "breakout" and previous_contract.get("group_by"):
        return previous_contract.get("group_by")
    return None


def _normalize_group_by(value: str | None) -> str | None:
    normalized = (value or "").strip().lower()
    if not normalized:
        return None
    return normalized.replace(" ", "_")


def _extract_aggregation(
    text: str,
    *,
    metric: str | None,
    fact: str | None,
    transformation: str,
    group_by: str | None,
) -> str | None:
    if metric == "asset_count" or "how many" in text:
        return "count"
    if metric == "commitments" or "how much" in text:
        return "sum"
    if fact == "performance_family" and group_by == "fund":
        return "latest"
    if transformation == "breakout":
        return "sum"
    return None


def _extract_filters(text: str) -> list[StructuredFilter]:
    filters = [
        StructuredFilter(
            field=item.field,
            operator=item.operator,
            value=item.value,
            raw_text=item.raw_text,
        )
        for item in extract_conditions(text)
    ]
    if "active asset" in text or "active assets" in text:
        filters.append(StructuredFilter(field="status", operator="=", value="active", raw_text="active assets"))
    if "not active" in text:
        filters.append(StructuredFilter(field="status", operator="!=", value="active", raw_text="not active"))
    return filters


def _extract_sort(text: str, *, metric: str | None) -> tuple[str | None, str | None]:
    if not _RANK_RE.search(text):
        return None, None

    direction = "desc"
    if any(token in text for token in ("ascending", "lowest", "bottom", "worst to best", "least")):
        direction = "asc"
    sort_by = metric
    if sort_by is None:
        if "performance" in text:
            sort_by = "gross_irr"
        elif "fund" in text:
            sort_by = "fund"
    return sort_by, direction


def _extract_limit(text: str) -> int | None:
    match = _TOP_BOTTOM_RE.search(text)
    if match:
        return int(match.group(2))
    return None


def _extract_timeframe(text: str, previous_contract: dict[str, Any]) -> tuple[str, str | None]:
    match = _QUARTER_RE.search(text)
    if match:
        return "quarter", match.group(1).upper()
    if "latest" in text:
        return "latest", None
    if "ttm" in text:
        return "ttm", None
    if "ltm" in text:
        return "ltm", None
    return previous_contract.get("timeframe_type") or "none", previous_contract.get("timeframe_value")


def _execute_contract(
    *,
    contract: StructuredPortfolioQueryContract,
    business_id: str,
    env_id: str,
    resolved_scope: Any,
    memory_used: bool,
    structured_state: dict[str, Any],
) -> MeridianStructuredOutcome | None:
    if contract.entity == "fund" and contract.fact == "inventory":
        return _fund_inventory_outcome(
            contract=contract,
            business_id=business_id,
            env_id=env_id,
            memory_used=memory_used,
        )

    if contract.entity == "fund" and contract.fact == "performance_family":
        return _fund_performance_outcome(
            contract=contract,
            business_id=business_id,
            env_id=env_id,
            resolved_scope=resolved_scope,
            memory_used=memory_used,
        )

    if contract.entity == "fund" and contract.transformation == "list" and not contract.metric and not contract.fact:
        inventory_contract = contract
        inventory_contract.fact = "inventory"
        return _fund_inventory_outcome(
            contract=inventory_contract,
            business_id=business_id,
            env_id=env_id,
            memory_used=memory_used,
        )

    if contract.entity == "investment" and contract.metric == "gross_irr" and contract.transformation == "rank":
        return _investment_irr_grain_fallback_outcome(
            contract=contract,
            business_id=business_id,
            env_id=env_id,
            memory_used=memory_used,
        )

    if contract.entity in {"portfolio", "asset"} and contract.metric == "asset_count":
        return _asset_count_outcome(
            contract=contract,
            business_id=business_id,
            env_id=env_id,
            resolved_scope=resolved_scope,
            memory_used=memory_used,
        )

    if contract.metric == "commitments":
        if contract.transformation == "breakout" and contract.group_by == "fund":
            return _commitments_by_fund_outcome(
                contract=contract,
                business_id=business_id,
                env_id=env_id,
                memory_used=memory_used,
            )
        return _commitments_total_outcome(
            contract=contract,
            business_id=business_id,
            env_id=env_id,
            memory_used=memory_used,
        )

    if contract.entity == "asset" and contract.metric == "noi_variance":
        if contract.transformation == "rank":
            return _noi_variance_ranked_outcome(
                contract=contract,
                business_id=business_id,
                env_id=env_id,
                memory_used=memory_used,
            )
        if contract.transformation == "filter":
            return _noi_variance_filtered_outcome(
                contract=contract,
                business_id=business_id,
                env_id=env_id,
                memory_used=memory_used,
            )

    if contract.entity == "asset" and contract.metric == "occupancy" and contract.transformation == "filter":
        return _occupancy_filtered_outcome(
            contract=contract,
            business_id=business_id,
            env_id=env_id,
            memory_used=memory_used,
        )

    if contract.transformation == "breakout" and structured_state.get("last_contract", {}).get("metric") == "commitments":
        inherited = _contract_from_state(structured_state["last_contract"])
        inherited.transformation = "breakout"
        inherited.group_by = contract.group_by or "fund"
        return _commitments_by_fund_outcome(
            contract=inherited,
            business_id=business_id,
            env_id=env_id,
            memory_used=True,
        )

    return None


def _fund_inventory_outcome(
    *,
    contract: StructuredPortfolioQueryContract,
    business_id: str,
    env_id: str,
    memory_used: bool,
) -> MeridianStructuredOutcome:
    funds = list(repe.list_funds(business_id=UUID(business_id)))
    scope = build_memory_scope(
        business_id=business_id,
        environment_id=env_id,
        entity_type="environment",
        entity_id=env_id,
        entity_name="Meridian Capital Management",
    )
    result_memory = build_list_result_memory(
        scope=scope,
        query_signature=build_query_signature(
            result_type="list",
            source_name="fund_inventory",
            scope=scope,
        ),
        summary={"total": len(funds), "item_label": "fund(s)"},
        rows=[
            {
                "id": str(row.get("fund_id")),
                "name": row.get("name"),
                "entity_type": "fund",
                "status": row.get("status"),
            }
            for row in funds
        ],
    )
    if contract.transformation == "summary":
        lines = [f"Meridian Capital Management has {len(funds)} funds:"]
        for row in funds:
            lines.append(
                f"- {row.get('name')}: {row.get('status') or 'status n/a'}, "
                f"{row.get('fund_type') or 'type n/a'}, vintage {row.get('vintage_year') or 'n/a'}, "
                f"target size {_format_currency(row.get('target_size'))}"
            )
        text = "\n".join(lines)
    else:
        lines = [f"All Meridian funds ({len(funds)} total):"]
        for row in funds:
            lines.append(f"- {row.get('name')}")
        text = "\n".join(lines)
    receipt = _build_receipt(
        contract=contract,
        execution_path="service",
        transformation_applied=contract.transformation,
        memory_used=memory_used,
        canonical_source="repe.list_funds",
        canonical_check="canonical_source_used",
    )
    return MeridianStructuredOutcome(
        text=text,
        receipt=receipt,
        result_memory=result_memory,
        structured_query_state=_build_structured_state(contract=contract, receipt=receipt),
    )


def _fund_performance_outcome(
    *,
    contract: StructuredPortfolioQueryContract,
    business_id: str,
    env_id: str,
    resolved_scope: Any,
    memory_used: bool,
) -> MeridianStructuredOutcome:
    """Fund performance handler.

    Authoritative State Lockdown — Phase 4: when the resolved scope is
    fund-typed, this handler reads only from the authoritative snapshot
    contract (`re_authoritative_snapshots.get_authoritative_state`).
    No SQL aggregation. No fallback to base scenario. The unscoped
    fan-out template path remains for genuinely portfolio-wide questions.
    See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.
    """
    quarter = _resolve_fund_quarter(contract.timeframe_value, business_id)

    # Single-fund fast path: read directly from the released authoritative
    # snapshot instead of running a SQL aggregate over the table.
    scope_entity_type = getattr(resolved_scope, "entity_type", None)
    scope_entity_id = getattr(resolved_scope, "entity_id", None)
    if scope_entity_type == "fund" and scope_entity_id:
        return _snapshot_fund_performance_outcome(
            contract=contract,
            business_id=business_id,
            env_id=env_id,
            fund_id=str(scope_entity_id),
            fund_name=getattr(resolved_scope, "entity_name", None),
            quarter=quarter,
            memory_used=memory_used,
        )

    # Unscoped portfolio-wide fan-out (kept for "show me all funds" style
    # questions). The query template only joins released rows, but each
    # row's metrics still come from the snapshot table.
    rows = _run_template(
        "repe.fund_performance_summary",
        {
            "business_id": business_id,
            "quarter": quarter,
            "limit": contract.limit or 100,
        },
    )
    scope = build_memory_scope(
        business_id=business_id,
        environment_id=env_id,
        entity_type="environment",
        entity_id=env_id,
        entity_name="Meridian Capital Management",
    )
    result_memory = build_list_result_memory(
        scope=scope,
        query_signature=build_query_signature(
            result_type="list",
            source_name="fund_performance_summary",
            scope=scope,
        ),
        summary={"total": len(rows), "item_label": "fund performance row(s)"},
        rows=[
            {
                "id": row.get("fund_id"),
                "name": row.get("fund_name"),
                "entity_type": "fund",
                "quarter": row.get("quarter"),
            }
            for row in rows
        ],
    )
    lines = [f"Fund performance for {quarter}:"]
    for row in rows:
        lines.append(
            f"- {row.get('fund_name')}: gross IRR {_format_percent(row.get('gross_irr'))}, "
            f"net IRR {_format_percent(row.get('net_irr'))}, TVPI {row.get('tvpi') or 'n/a'}, "
            f"DPI {row.get('dpi') or 'n/a'}, RVPI {row.get('rvpi') or 'n/a'}, NAV {_format_currency(row.get('portfolio_nav'))}"
        )
    receipt = _build_receipt(
        contract=contract,
        execution_path="template",
        transformation_applied="summary",
        memory_used=memory_used,
        canonical_source="re_authoritative_fund_state_qtr",
        canonical_check="canonical_source_used",
    )
    return MeridianStructuredOutcome(
        text="\n".join(lines),
        receipt=receipt,
        result_memory=result_memory,
        structured_query_state=_build_structured_state(contract=contract, receipt=receipt),
    )


def _snapshot_fund_performance_outcome(
    *,
    contract: StructuredPortfolioQueryContract,
    business_id: str,
    env_id: str,
    fund_id: str,
    fund_name: str | None,
    quarter: str,
    memory_used: bool,
) -> MeridianStructuredOutcome:
    """Read fund KPIs from the released authoritative snapshot only.

    Authoritative State Lockdown — Phase 4. See
    docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.
    """
    payload = re_authoritative_snapshots.get_authoritative_state(
        entity_type="fund",
        entity_id=fund_id,
        quarter=quarter,
    )
    display_name = fund_name or "this fund"
    canonical_metrics = ((payload.get("state") or {}).get("canonical_metrics") or {})
    null_reason = payload.get("null_reason")
    state_origin = payload.get("state_origin")
    snapshot_version = payload.get("snapshot_version")
    trust_status = payload.get("trust_status")
    period_exact = payload.get("period_exact")

    if null_reason or state_origin != "authoritative" or not period_exact:
        text = (
            f"No released authoritative snapshot is available for {display_name} in {quarter}. "
            f"Reason: {null_reason or 'state_origin=' + str(state_origin)}. "
            f"Per the Authoritative State Lockdown rules, I will not return an approximation."
        )
        receipt = _build_receipt(
            contract=contract,
            execution_path="snapshot",
            transformation_applied="summary",
            memory_used=memory_used,
            canonical_source="re_authoritative_fund_state_qtr",
            canonical_check="snapshot_missing_or_unexact",
        )
        scope = build_memory_scope(
            business_id=business_id,
            environment_id=env_id,
            entity_type="fund",
            entity_id=fund_id,
            entity_name=display_name,
        )
        result_memory = build_list_result_memory(
            scope=scope,
            query_signature=build_query_signature(
                result_type="list",
                source_name="fund_performance_snapshot",
                scope=scope,
            ),
            summary={"total": 0, "item_label": "fund performance row(s)"},
            rows=[],
        )
        return MeridianStructuredOutcome(
            text=text,
            receipt=receipt,
            result_memory=result_memory,
            structured_query_state=_build_structured_state(contract=contract, receipt=receipt),
        )

    gross_irr = canonical_metrics.get("gross_irr")
    net_irr = canonical_metrics.get("net_irr")
    tvpi = canonical_metrics.get("tvpi")
    dpi = canonical_metrics.get("dpi")
    rvpi = canonical_metrics.get("rvpi")
    portfolio_nav = canonical_metrics.get("ending_nav") or canonical_metrics.get("portfolio_nav")
    text = (
        f"Fund performance for {display_name} as of {quarter} "
        f"(snapshot {snapshot_version}, trust {trust_status}):\n"
        f"- Gross IRR: {_format_percent(gross_irr)}\n"
        f"- Net IRR: {_format_percent(net_irr)}\n"
        f"- TVPI: {tvpi if tvpi is not None else 'n/a'}\n"
        f"- DPI: {dpi if dpi is not None else 'n/a'}\n"
        f"- RVPI: {rvpi if rvpi is not None else 'n/a'}\n"
        f"- NAV: {_format_currency(portfolio_nav)}"
    )
    scope = build_memory_scope(
        business_id=business_id,
        environment_id=env_id,
        entity_type="fund",
        entity_id=fund_id,
        entity_name=display_name,
    )
    result_memory = build_list_result_memory(
        scope=scope,
        query_signature=build_query_signature(
            result_type="list",
            source_name="fund_performance_snapshot",
            scope=scope,
        ),
        summary={"total": 1, "item_label": "fund performance row"},
        rows=[
            {
                "id": fund_id,
                "name": display_name,
                "entity_type": "fund",
                "quarter": quarter,
                "gross_irr": gross_irr,
                "net_irr": net_irr,
                "tvpi": tvpi,
                "ending_nav": portfolio_nav,
                "snapshot_version": snapshot_version,
                "state_origin": state_origin,
                "trust_status": trust_status,
                "period_exact": period_exact,
            }
        ],
    )
    receipt = _build_receipt(
        contract=contract,
        execution_path="snapshot",
        transformation_applied="summary",
        memory_used=memory_used,
        canonical_source="re_authoritative_fund_state_qtr",
        canonical_check="snapshot_authoritative_period_exact",
    )
    return MeridianStructuredOutcome(
        text=text,
        receipt=receipt,
        result_memory=result_memory,
        structured_query_state=_build_structured_state(contract=contract, receipt=receipt),
    )


def _investment_irr_grain_fallback_outcome(
    *,
    contract: StructuredPortfolioQueryContract,
    business_id: str,
    env_id: str,
    memory_used: bool,
) -> MeridianStructuredOutcome:
    quarter = _resolve_fund_quarter(contract.timeframe_value, business_id)
    rows = _run_template(
        "repe.irr_ranked",
        {
            "business_id": business_id,
            "quarter": quarter,
            "limit": contract.limit or 100,
        },
    )
    scope = build_memory_scope(
        business_id=business_id,
        environment_id=env_id,
        entity_type="environment",
        entity_id=env_id,
        entity_name="Meridian Capital Management",
    )
    result_memory = build_list_result_memory(
        scope=scope,
        query_signature=build_query_signature(
            result_type="ranked_list",
            source_name="fund_gross_irr_ranked",
            scope=scope,
        ),
        summary={"total": len(rows), "item_label": "fund(s)"},
        rows=[
            {
                "id": row.get("fund_name"),
                "name": row.get("fund_name"),
                "entity_type": "fund",
                "quarter": row.get("quarter"),
                "gross_irr": row.get("gross_irr"),
            }
            for row in rows
        ],
        result_type="ranked_list",
    )
    lines = [
        f"I checked investment-level gross IRR for {quarter}.",
        "That metric is not available at the investment grain in Meridian.",
        "The closest valid grain is released authoritative fund performance, so I ranked the funds instead:",
    ]
    for index, row in enumerate(rows, start=1):
        lines.append(f"{index}. {row.get('fund_name')} — gross IRR {_format_percent(row.get('gross_irr'))}")
    receipt = _build_receipt(
        contract=contract,
        execution_path="degraded",
        transformation_applied="rank",
        memory_used=memory_used,
        degraded=True,
        canonical_source="re_authoritative_fund_state_qtr",
        canonical_check="investment_grain_checked;fund_grain_used",
        degradation_reason=(
            f"Requested investment-level gross IRR for {quarter}; executed closest valid fund-level ranking instead."
        ),
    )
    return MeridianStructuredOutcome(
        text="\n".join(lines),
        receipt=receipt,
        result_memory=result_memory,
        structured_query_state=_build_structured_state(contract=contract, receipt=receipt),
    )


def _asset_count_outcome(
    *,
    contract: StructuredPortfolioQueryContract,
    business_id: str,
    env_id: str,
    resolved_scope: Any,
    memory_used: bool,
) -> MeridianStructuredOutcome:
    # Authoritative State Lockdown — Phase 4
    # When the resolved scope is fund-typed, restrict the asset query to
    # that fund instead of returning the env-wide count. The Meridian
    # verification on 2026-04-10 caught this returning 45 for IGF VII
    # when the authoritative count is 22. See
    # docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md (Invariants 2 and 7).
    scope_entity_type = getattr(resolved_scope, "entity_type", None)
    scope_entity_id = getattr(resolved_scope, "entity_id", None)
    fund_id_arg: UUID | None = None
    if scope_entity_type == "fund" and scope_entity_id:
        try:
            fund_id_arg = UUID(str(scope_entity_id))
        except (TypeError, ValueError):
            fund_id_arg = None
    assets = list(
        repe.list_property_assets(business_id=UUID(business_id), fund_id=fund_id_arg)
    )
    bucket_members: dict[str, list[dict[str, Any]]] = {
        "active": [],
        "disposed": [],
        "pipeline": [],
        "other": [],
    }
    rows: list[dict[str, Any]] = []
    for asset in assets:
        bucket = repe.classify_property_asset_status(asset.get("asset_status"))
        normalized = {
            "id": str(asset.get("asset_id")),
            "name": asset.get("name"),
            "entity_type": "asset",
            "status": asset.get("asset_status"),
            "bucket": bucket,
        }
        rows.append(normalized)
        bucket_members.setdefault(bucket, []).append(normalized)

    counts = repe.count_assets(business_id=UUID(business_id), fund_id=fund_id_arg)
    non_active_rows = list(bucket_members.get("disposed") or []) + list(bucket_members.get("pipeline") or []) + list(bucket_members.get("other") or [])
    summary = {
        "total": counts["total"],
        "item_label": "property asset(s)",
        "bucket_counts": {
            "active": counts["active"],
            "disposed": counts["disposed"],
            "pipeline": counts["pipeline"],
            "other": len(bucket_members.get("other") or []),
        },
        "primary_bucket": "active",
        "primary_bucket_count": counts["active"],
        "remainder_count": len(non_active_rows),
        "active_definition": "Active includes statuses active, held, lease_up, operating, or NULL.",
    }
    scope = build_memory_scope(
        business_id=business_id,
        environment_id=env_id,
        entity_type=getattr(resolved_scope, "entity_type", None) or "environment",
        entity_id=getattr(resolved_scope, "entity_id", None) or env_id,
        entity_name=getattr(resolved_scope, "entity_name", None) or "Meridian Capital Management",
    )
    result_memory = build_bucketed_count_result_memory(
        scope=scope,
        query_signature=build_query_signature(
            result_type="bucketed_count",
            source_name="asset_count",
            scope=scope,
        ),
        summary=summary,
        rows=rows,
        bucket_members=bucket_members,
    )

    status_filter = next((item for item in contract.filters if item.field == "status"), None)
    if status_filter and status_filter.operator == "!=" and status_filter.value == "active":
        lines = [f"Meridian has {len(non_active_rows)} property assets that are not active:"]
        for row in non_active_rows:
            lines.append(f"- {row.get('name')} ({row.get('status') or 'status n/a'})")
    elif status_filter and status_filter.operator == "=" and status_filter.value == "active":
        lines = [f"Meridian currently has {counts['active']} active property assets."]
    elif contract.transformation == "summary" and contract.metric == "asset_count":
        lines = [
            f"Meridian has {counts['total']} total property assets in the portal.",
            f"Active: {counts['active']}",
            f"Disposed: {counts['disposed']}",
            f"Pipeline: {counts['pipeline']}",
        ]
        other_count = len(bucket_members.get("other") or [])
        if other_count:
            lines.append(f"Other / non-canonical status: {other_count}")
    else:
        lines = [f"Meridian has {counts['total']} total property assets."]

    receipt = _build_receipt(
        contract=contract,
        execution_path="service",
        transformation_applied=contract.transformation,
        memory_used=memory_used,
        canonical_source="repe.count_assets",
        canonical_check="canonical_source_used",
    )
    state = _build_structured_state(
        contract=contract,
        receipt=receipt,
        last_partition={
            "primary_bucket": "active",
            "primary_count": counts["active"],
            "remainder_count": len(non_active_rows),
        },
    )
    return MeridianStructuredOutcome(
        text="\n".join(lines),
        receipt=receipt,
        result_memory=result_memory,
        structured_query_state=state,
    )


def _commitments_total_outcome(
    *,
    contract: StructuredPortfolioQueryContract,
    business_id: str,
    env_id: str,
    memory_used: bool,
) -> MeridianStructuredOutcome:
    quarter = _resolve_fund_quarter(contract.timeframe_value, business_id)
    kpis = re_env_portfolio.get_portfolio_kpis(
        env_id=env_id,
        business_id=business_id,
        quarter=quarter,
    )
    total_commitments = kpis.get("total_commitments")
    text = f"Total commitments are {_format_currency(total_commitments)} as of {quarter}."
    receipt = _build_receipt(
        contract=contract,
        execution_path="service",
        transformation_applied="summary",
        memory_used=memory_used,
        canonical_source="re_env_portfolio.get_portfolio_kpis",
        canonical_check="canonical_source_used",
    )
    scope = build_memory_scope(
        business_id=business_id,
        environment_id=env_id,
        entity_type="environment",
        entity_id=env_id,
        entity_name="Meridian Capital Management",
    )
    result_memory = build_list_result_memory(
        scope=scope,
        query_signature=build_query_signature(
            result_type="list",
            source_name="commitments_total",
            scope=scope,
        ),
        summary={"total": 1, "item_label": "portfolio commitment summary"},
        rows=[{"id": "portfolio_commitments", "name": "Total commitments", "value": total_commitments}],
    )
    return MeridianStructuredOutcome(
        text=text,
        receipt=receipt,
        result_memory=result_memory,
        structured_query_state=_build_structured_state(contract=contract, receipt=receipt),
    )


def _commitments_by_fund_outcome(
    *,
    contract: StructuredPortfolioQueryContract,
    business_id: str,
    env_id: str,
    memory_used: bool,
) -> MeridianStructuredOutcome:
    rows = _run_template(
        "repe.commitments_by_fund",
        {"business_id": business_id, "limit": contract.limit or 100},
    )
    lines = ["Commitments by fund:"]
    for row in rows:
        lines.append(f"- {row.get('fund_name')}: {_format_currency(row.get('commitments'))}")
    scope = build_memory_scope(
        business_id=business_id,
        environment_id=env_id,
        entity_type="environment",
        entity_id=env_id,
        entity_name="Meridian Capital Management",
    )
    result_memory = build_list_result_memory(
        scope=scope,
        query_signature=build_query_signature(
            result_type="list",
            source_name="commitments_by_fund",
            scope=scope,
        ),
        summary={"total": len(rows), "item_label": "fund commitment row(s)"},
        rows=[
            {"id": row.get("fund_id"), "name": row.get("fund_name"), "entity_type": "fund"}
            for row in rows
        ],
    )
    receipt = _build_receipt(
        contract=contract,
        execution_path="template",
        transformation_applied="breakout",
        memory_used=memory_used,
        canonical_source="re_partner_commitment",
        canonical_check="canonical_source_used",
    )
    return MeridianStructuredOutcome(
        text="\n".join(lines),
        receipt=receipt,
        result_memory=result_memory,
        structured_query_state=_build_structured_state(contract=contract, receipt=receipt),
    )


def _noi_variance_ranked_outcome(
    *,
    contract: StructuredPortfolioQueryContract,
    business_id: str,
    env_id: str,
    memory_used: bool,
) -> MeridianStructuredOutcome:
    quarter = _resolve_variance_quarter(contract.timeframe_value, business_id)
    direction = contract.sort_direction or "desc"
    rows = _run_template(
        "repe.noi_variance_ranked",
        {
            "business_id": business_id,
            "quarter": quarter,
            "sort_direction": direction,
            "limit": contract.limit or 100,
        },
    )
    ordering_label = "worst to best" if direction == "asc" else "best to worst"
    lines = [f"Assets ranked by NOI variance for {quarter} ({ordering_label}):"]
    for index, row in enumerate(rows, start=1):
        lines.append(
            f"{index}. {row.get('asset_name')} — NOI variance {_format_percent(row.get('variance_pct'))} "
            f"({row.get('market') or 'market n/a'})"
        )
    result_memory = _ranked_asset_result_memory(
        business_id=business_id,
        env_id=env_id,
        source_name="noi_variance_ranked",
        rows=rows,
    )
    receipt = _build_receipt(
        contract=contract,
        execution_path="template",
        transformation_applied="rank",
        memory_used=memory_used,
        canonical_source="finance.noi_variance",
        canonical_check="canonical_source_used",
    )
    return MeridianStructuredOutcome(
        text="\n".join(lines),
        receipt=receipt,
        result_memory=result_memory,
        structured_query_state=_build_structured_state(contract=contract, receipt=receipt),
    )


def _noi_variance_filtered_outcome(
    *,
    contract: StructuredPortfolioQueryContract,
    business_id: str,
    env_id: str,
    memory_used: bool,
) -> MeridianStructuredOutcome:
    quarter = _resolve_variance_quarter(contract.timeframe_value, business_id)
    threshold_filter = next((item for item in contract.filters if item.field == "variance_pct"), None)
    threshold = threshold_filter.value if threshold_filter is not None else -0.05
    rows = _run_template(
        "repe.noi_variance_filtered",
        {
            "business_id": business_id,
            "quarter": quarter,
            "variance_threshold": threshold,
            "limit": contract.limit or 100,
        },
    )
    lines = [f"{len(rows)} assets have NOI variance of {_format_percent(threshold)} or worse in {quarter}:"]
    for row in rows:
        lines.append(f"- {row.get('asset_name')} — {_format_percent(row.get('variance_pct'))}")
    result_memory = _ranked_asset_result_memory(
        business_id=business_id,
        env_id=env_id,
        source_name="noi_variance_filtered",
        rows=rows,
    )
    receipt = _build_receipt(
        contract=contract,
        execution_path="template",
        transformation_applied="filter",
        memory_used=memory_used,
        canonical_source="finance.noi_variance",
        canonical_check="canonical_source_used",
    )
    return MeridianStructuredOutcome(
        text="\n".join(lines),
        receipt=receipt,
        result_memory=result_memory,
        structured_query_state=_build_structured_state(contract=contract, receipt=receipt),
    )


def _occupancy_filtered_outcome(
    *,
    contract: StructuredPortfolioQueryContract,
    business_id: str,
    env_id: str,
    memory_used: bool,
) -> MeridianStructuredOutcome:
    occupancy_filter = next((item for item in contract.filters if item.field == "occupancy"), None)
    operator = occupancy_filter.operator if occupancy_filter is not None else ">"
    threshold = occupancy_filter.value if occupancy_filter is not None else Decimal("0.90")
    rows = _run_template(
        "repe.occupancy_filtered",
        {
            "business_id": business_id,
            "operator": operator,
            "threshold": threshold,
            "limit": contract.limit or 100,
        },
    )
    lines = [f"{len(rows)} assets have occupancy {operator} {_format_percent(threshold)}:"]
    for row in rows:
        lines.append(
            f"- {row.get('asset_name')} — occupancy {_format_percent(row.get('occupancy'))}, "
            f"{row.get('market') or 'market n/a'}"
        )
    result_memory = _ranked_asset_result_memory(
        business_id=business_id,
        env_id=env_id,
        source_name="occupancy_filtered",
        rows=rows,
    )
    receipt = _build_receipt(
        contract=contract,
        execution_path="template",
        transformation_applied="filter",
        memory_used=memory_used,
        canonical_source="repe_property_asset.occupancy",
        canonical_check="canonical_source_used",
    )
    return MeridianStructuredOutcome(
        text="\n".join(lines),
        receipt=receipt,
        result_memory=result_memory,
        structured_query_state=_build_structured_state(contract=contract, receipt=receipt),
    )


def _ranked_asset_result_memory(
    *,
    business_id: str,
    env_id: str,
    source_name: str,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    scope = build_memory_scope(
        business_id=business_id,
        environment_id=env_id,
        entity_type="environment",
        entity_id=env_id,
        entity_name="Meridian Capital Management",
    )
    return build_list_result_memory(
        scope=scope,
        query_signature=build_query_signature(
            result_type="ranked_list",
            source_name=source_name,
            scope=scope,
        ),
        summary={"total": len(rows), "item_label": "asset(s)"},
        rows=[
            {
                "id": row.get("asset_id"),
                "name": row.get("asset_name"),
                "entity_type": "asset",
            }
            for row in rows
        ],
        result_type="ranked_list",
    )


def _run_template(template_key: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    sql, clean_params = render_template(template_key, params)
    result = execute_sql(sql, clean_params, row_limit=int(clean_params.get("limit") or 500))
    if result.error:
        raise RuntimeError(f"{template_key} failed: {result.error}")
    return list(result.rows)


def _resolve_fund_quarter(explicit_quarter: str | None, business_id: str) -> str:
    return explicit_quarter or _latest_quarter(
        """
        SELECT MAX(fs.quarter) AS quarter
        FROM re_authoritative_fund_state_qtr fs
        JOIN repe_fund f ON f.fund_id = fs.fund_id
        WHERE f.business_id = %s::uuid
          AND fs.promotion_state = 'released'
        """,
        business_id,
    )


def _resolve_variance_quarter(explicit_quarter: str | None, business_id: str) -> str:
    return explicit_quarter or _latest_quarter(
        """
        SELECT MAX(v.quarter) AS quarter
        FROM re_asset_variance_qtr v
        JOIN repe_asset a ON a.asset_id = v.asset_id
        JOIN repe_deal d ON d.deal_id = a.deal_id
        JOIN repe_fund f ON f.fund_id = d.fund_id
        WHERE f.business_id = %s::uuid
          AND v.line_code = 'NOI'
        """,
        business_id,
    )


def _latest_quarter(sql: str, business_id: str) -> str:
    with get_cursor() as cur:
        cur.execute(sql, (business_id,))
        row = cur.fetchone() or {}
    quarter = row.get("quarter") if isinstance(row, dict) else None
    return str(quarter or "2026Q1")


def _build_receipt(
    *,
    contract: StructuredPortfolioQueryContract,
    execution_path: str,
    transformation_applied: str,
    memory_used: bool,
    canonical_source: str,
    canonical_check: str,
    degraded: bool = False,
    degradation_reason: str | None = None,
) -> StructuredQueryReceipt:
    return StructuredQueryReceipt(
        parsed_contract=contract.to_dict(),
        execution_path=execution_path,
        transformation_applied=transformation_applied,
        operators_applied={
            "group_by": contract.group_by,
            "aggregation": contract.aggregation,
            "filters": [item.to_dict() for item in contract.filters],
            "sort_by": contract.sort_by,
            "sort_direction": contract.sort_direction,
            "limit": contract.limit,
            "timeframe": {
                "type": contract.timeframe_type,
                "value": contract.timeframe_value,
            },
        },
        memory_used=memory_used,
        degraded=degraded,
        canonical_source=canonical_source,
        canonical_check=canonical_check,
        degradation_reason=degradation_reason,
    )


def _build_structured_state(
    *,
    contract: StructuredPortfolioQueryContract,
    receipt: StructuredQueryReceipt,
    last_partition: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "last_contract": contract.to_dict(),
        "last_execution": {
            "execution_path": receipt.execution_path,
            "transformation_applied": receipt.transformation_applied,
            "operators_applied": receipt.operators_applied,
            "memory_used": receipt.memory_used,
            "degraded": receipt.degraded,
            "canonical_source": receipt.canonical_source,
            "canonical_check": receipt.canonical_check,
            "degradation_reason": receipt.degradation_reason,
        },
        "last_partition": last_partition,
    }


def _emit_unsupported_ask(
    *,
    message: str,
    reason_bucket: str,
    metric_key: str | None,
    contract: StructuredPortfolioQueryContract | None,
) -> None:
    emit_log(
        level="info",
        service="backend",
        action="assistant_runtime.meridian_unsupported_ask",
        message="Meridian prompt resolved to a declared metric outside the current askable contract",
        context={
            "reason_bucket": reason_bucket,
            "metric_key": metric_key,
            "contract": contract.to_dict() if contract is not None else None,
            "prompt": message,
        },
    )
