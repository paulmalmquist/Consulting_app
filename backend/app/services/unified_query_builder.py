"""Unified Query Builder — routes metric queries through the correct execution strategy.

Strategies:
  template  → deterministic SQL from query_templates.py
  semantic  → sql_template fragments from semantic_metric_def
  service   → existing service functions (portfolio KPIs, fund metrics)
  computed  → multi-fragment SQL assembly with join resolution

Every strategy produces the same MetricResult shape. No raw dicts leak through.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.services.unified_metric_registry import (
    MetricContract,
    UnifiedMetricRegistry,
    _get_service_map,
)

log = logging.getLogger(__name__)


# ── Data structures ──────────────────────────────────────────────────

@dataclass
class MetricQuery:
    """Input to the unified query builder."""
    metric_keys: list[str]
    business_id: str
    env_id: str | None = None
    entity_type: str | None = None
    entity_ids: list[str] | None = None
    quarter: str | None = None
    date_from: str | None = None
    date_to: str | None = None
    dimension: str | None = None
    scenario_id: str | None = None
    limit: int = 500


@dataclass
class MetricResult:
    """Standardized output shape — ALL strategies produce this exact shape."""
    metric_key: str
    display_name: str
    metric_family: str | None
    value: str | None             # string-encoded Decimal for precision
    unit: str
    format_hint: str | None
    polarity: str
    dimension_value: str | None = None
    entity_id: str | None = None
    entity_name: str | None = None
    quarter: str | None = None
    source: str = "unknown"
    query_hash: str | None = None
    latency_ms: float | None = None
    sql_used: str | None = None   # populated ONLY for debug endpoint


@dataclass
class QueryExecution:
    """Returned alongside results for observability."""
    query_hash: str
    total_latency_ms: float
    strategy_latencies: dict[str, float]
    resolved_count: int
    unresolved_keys: list[str]


# ── Query hash computation ───────────────────────────────────────────

def _compute_query_hash(query: MetricQuery, resolved_keys: list[str]) -> str:
    canonical = json.dumps({
        "metric_keys": sorted(resolved_keys),
        "business_id": query.business_id,
        "env_id": query.env_id,
        "entity_type": query.entity_type,
        "entity_ids": sorted(query.entity_ids) if query.entity_ids else None,
        "quarter": query.quarter,
        "dimension": query.dimension,
        "scenario_id": query.scenario_id,
    }, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


# ── Join path resolution (BFS) ───────────────────────────────────────

@dataclass
class JoinDef:
    from_entity: str
    to_entity: str
    join_sql: str
    cardinality: str
    is_safe: bool


class JoinPathError(Exception):
    pass


def _load_join_graph(business_id: str) -> dict[str, list[JoinDef]]:
    """Load the join graph from semantic_join_def as adjacency list."""
    from app.services.semantic_catalog import list_joins
    raw_joins = list_joins(business_id=business_id)
    graph: dict[str, list[JoinDef]] = defaultdict(list)
    for j in raw_joins:
        jd = JoinDef(
            from_entity=j["from_entity_key"],
            to_entity=j["to_entity_key"],
            join_sql=j["join_sql"],
            cardinality=j["cardinality"],
            is_safe=j["is_safe"],
        )
        graph[jd.from_entity].append(jd)
        # Add reverse edge for BFS traversal
        reverse = JoinDef(
            from_entity=jd.to_entity,
            to_entity=jd.from_entity,
            join_sql=jd.join_sql,
            cardinality=jd.cardinality,
            is_safe=jd.is_safe,
        )
        graph[reverse.from_entity].append(reverse)
    return graph


def resolve_join_path(
    from_entity: str,
    to_entity: str,
    graph: dict[str, list[JoinDef]],
) -> list[JoinDef]:
    """BFS shortest-path through the join graph."""
    if from_entity == to_entity:
        return []
    visited = {from_entity}
    queue: list[tuple[str, list[JoinDef]]] = [(from_entity, [])]
    while queue:
        current, path = queue.pop(0)
        for edge in graph.get(current, []):
            if edge.to_entity in visited:
                continue
            new_path = path + [edge]
            if edge.to_entity == to_entity:
                return new_path
            visited.add(edge.to_entity)
            queue.append((edge.to_entity, new_path))
    raise JoinPathError(f"No join path from {from_entity} to {to_entity}")


# ── Entity resolution ────────────────────────────────────────────────

def _load_entity_map(business_id: str) -> dict[str, dict[str, Any]]:
    """Load entity definitions as {entity_key: row_dict}."""
    from app.services.semantic_catalog import list_entities
    entities = list_entities(business_id=business_id)
    return {e["entity_key"]: e for e in entities}


# ── Strategy: template ───────────────────────────────────────────────

def _execute_template_strategy(
    contracts: list[MetricContract],
    query: MetricQuery,
    include_sql: bool,
    query_hash: str,
) -> list[MetricResult]:
    """Execute metrics via deterministic SQL templates."""
    from app.sql_agent.query_templates import render_template

    results: list[MetricResult] = []
    # Group by template_key to batch
    by_template: dict[str, list[MetricContract]] = defaultdict(list)
    for c in contracts:
        if c.template_key:
            by_template[c.template_key].append(c)

    for template_key, batch in by_template.items():
        params: dict[str, Any] = {"business_id": query.business_id}
        if query.quarter:
            params["quarter"] = query.quarter
        if query.limit:
            params["limit"] = query.limit
        if query.env_id:
            params["env_id"] = query.env_id

        try:
            sql, clean_params = render_template(template_key, params)
        except ValueError as e:
            log.warning("Template render failed for %s: %s", template_key, e)
            for c in batch:
                results.append(_empty_result(c, query_hash, "template"))
            continue

        try:
            with get_cursor() as cur:
                cur.execute(sql, clean_params)
                rows = cur.fetchall()
        except Exception as e:
            log.warning("Template execution failed for %s: %s", template_key, e)
            for c in batch:
                results.append(_empty_result(c, query_hash, "template"))
            continue

        for c in batch:
            col_name = _metric_to_column(c.metric_key)
            for row in rows:
                val = row.get(col_name) or row.get(c.metric_key.lower())
                results.append(MetricResult(
                    metric_key=c.metric_key,
                    display_name=c.display_name,
                    metric_family=c.metric_family,
                    value=_format_value(val),
                    unit=c.unit,
                    format_hint=c.format_hint_fe,
                    polarity=c.polarity,
                    entity_id=str(row.get("fund_id") or row.get("asset_id") or ""),
                    entity_name=row.get("fund_name") or row.get("asset_name"),
                    quarter=row.get("quarter") or query.quarter,
                    source="template",
                    query_hash=query_hash,
                    sql_used=sql if include_sql else None,
                ))

    return results


# ── Strategy: semantic ───────────────────────────────────────────────

def _execute_semantic_strategy(
    contracts: list[MetricContract],
    query: MetricQuery,
    entity_map: dict[str, dict[str, Any]],
    join_graph: dict[str, list[JoinDef]],
    include_sql: bool,
    query_hash: str,
) -> list[MetricResult]:
    """Execute metrics using sql_template fragments + entity tables + joins."""
    results: list[MetricResult] = []

    for c in contracts:
        if not c.sql_template or not c.entity_key:
            results.append(_empty_result(c, query_hash, "semantic"))
            continue

        entity = entity_map.get(c.entity_key)
        if not entity:
            results.append(_empty_result(c, query_hash, "semantic"))
            continue

        table = entity["table_name"]
        pk_col = entity["pk_column"]
        biz_path = entity.get("business_id_path") or f"{table}.business_id"

        # Build SELECT with the metric's sql_template as the computed column
        select_expr = c.sql_template
        from_clause = table
        where_clauses = [f"{biz_path} = %(business_id)s::uuid"]
        params: dict[str, Any] = {"business_id": query.business_id}

        # Add quarter filter if the table has a quarter column
        if query.quarter:
            where_clauses.append(f"{table}.quarter = %(quarter)s")
            params["quarter"] = query.quarter

        # Add entity_ids filter
        if query.entity_ids:
            where_clauses.append(f"{table}.{pk_col} = ANY(%(entity_ids)s::uuid[])")
            params["entity_ids"] = query.entity_ids

        # Resolve joins if we need to traverse the entity hierarchy
        join_clauses: list[str] = []
        if query.entity_type and query.entity_type != c.entity_key:
            try:
                path = resolve_join_path(c.entity_key, query.entity_type, join_graph)
                for jd in path:
                    join_clauses.append(f"JOIN {_table_for_entity(jd.to_entity, entity_map)} ON {jd.join_sql}")
            except JoinPathError:
                pass  # best effort

        sql = f"""
            SELECT {select_expr} AS metric_value,
                   {table}.{pk_col} AS entity_id
            FROM {from_clause}
            {' '.join(join_clauses)}
            WHERE {' AND '.join(where_clauses)}
            LIMIT %(limit)s
        """
        params["limit"] = query.limit

        try:
            with get_cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
        except Exception as e:
            log.warning("Semantic query failed for %s: %s", c.metric_key, e)
            results.append(_empty_result(c, query_hash, "semantic"))
            continue

        if not rows:
            results.append(_empty_result(c, query_hash, "semantic"))
            continue

        for row in rows:
            results.append(MetricResult(
                metric_key=c.metric_key,
                display_name=c.display_name,
                metric_family=c.metric_family,
                value=_format_value(row.get("metric_value")),
                unit=c.unit,
                format_hint=c.format_hint_fe,
                polarity=c.polarity,
                entity_id=str(row.get("entity_id") or ""),
                quarter=query.quarter,
                source="semantic",
                query_hash=query_hash,
                sql_used=sql if include_sql else None,
            ))

    return results


# ── Strategy: service ────────────────────────────────────────────────

# Maps service_function key → dict key in the service response → metric_key
_SERVICE_KEY_MAP: dict[str, dict[str, str]] = {
    "portfolio_kpis": {
        "fund_count": "fund_count",
        "total_commitments": "total_commitments",
        "portfolio_nav": "portfolio_nav",
        "active_assets": "active_asset_count",
        "gross_irr": "gross_irr_weighted",
        "net_irr": "net_irr_weighted",
    },
    "fund_metrics": {
        # From re_fund_metrics_qtr row
        "gross_tvpi": "tvpi",
        "net_tvpi": "tvpi",
        "dpi": "dpi",
        "rvpi": "rvpi",
        "gross_irr": "gross_irr",
        "net_irr": "net_irr",
    },
}


def _execute_service_strategy(
    contracts: list[MetricContract],
    query: MetricQuery,
    include_sql: bool,
    query_hash: str,
) -> list[MetricResult]:
    """Execute metrics via service function calls, then normalize output."""
    results: list[MetricResult] = []
    svc_map = _get_service_map()

    # Group by service_function
    by_service: dict[str, list[MetricContract]] = defaultdict(list)
    for c in contracts:
        if c.service_function:
            by_service[c.service_function].append(c)

    for svc_key, batch in by_service.items():
        fn = svc_map.get(svc_key)
        if not fn:
            for c in batch:
                results.append(_empty_result(c, query_hash, "service"))
            continue

        try:
            if svc_key == "portfolio_kpis":
                raw = fn(
                    env_id=query.env_id or query.business_id,
                    business_id=query.business_id,
                    quarter=query.quarter or _current_quarter(),
                    scenario_id=query.scenario_id,
                )
            elif svc_key == "fund_metrics":
                if not query.entity_ids:
                    for c in batch:
                        results.append(_empty_result(c, query_hash, "service"))
                    continue
                raw = fn(
                    env_id=query.env_id or query.business_id,
                    business_id=UUID(query.business_id),
                    fund_id=UUID(query.entity_ids[0]),
                    quarter=query.quarter or _current_quarter(),
                )
            else:
                raw = None
        except Exception as e:
            log.warning("Service call failed for %s: %s", svc_key, e)
            for c in batch:
                results.append(_empty_result(c, query_hash, "service"))
            continue

        if not raw:
            for c in batch:
                results.append(_empty_result(c, query_hash, "service"))
            continue

        results.extend(_normalize_service_output(raw, batch, query, query_hash, svc_key))

    return results


def _normalize_service_output(
    raw: dict,
    contracts: list[MetricContract],
    query: MetricQuery,
    query_hash: str,
    svc_key: str,
) -> list[MetricResult]:
    """Convert raw service output to standardized MetricResult list."""
    results: list[MetricResult] = []
    key_map = _SERVICE_KEY_MAP.get(svc_key, {})

    # For fund_metrics, unwrap the nested structure
    flat = raw
    if svc_key == "fund_metrics" and "metrics" in raw:
        flat = raw["metrics"] or {}

    for c in contracts:
        # Try to find the value: first by metric_key, then by reverse key_map
        val = None
        for raw_key, mapped_key in key_map.items():
            if mapped_key == c.metric_key:
                val = flat.get(raw_key)
                break
        if val is None:
            val = flat.get(c.metric_key)

        results.append(MetricResult(
            metric_key=c.metric_key,
            display_name=c.display_name,
            metric_family=c.metric_family,
            value=_format_value(val),
            unit=c.unit,
            format_hint=c.format_hint_fe,
            polarity=c.polarity,
            quarter=query.quarter,
            source="service",
            query_hash=query_hash,
        ))

    return results


# ── Main entry point ─────────────────────────────────────────────────

def execute_unified_query(
    query: MetricQuery,
    registry: UnifiedMetricRegistry,
    *,
    include_sql: bool = False,
) -> tuple[list[MetricResult], QueryExecution]:
    """Route each metric_key through its designated strategy.

    Returns (results, execution_metadata).
    """
    t0 = time.monotonic()
    all_results: list[MetricResult] = []
    strategy_latencies: dict[str, float] = {}
    unresolved: list[str] = []

    # Resolve all metric keys through registry
    resolved: dict[str, MetricContract] = {}
    for key in query.metric_keys:
        contract = registry.resolve(key)
        if contract:
            resolved[contract.metric_key] = contract
        else:
            unresolved.append(key)

    query_hash = _compute_query_hash(query, list(resolved.keys()))

    # Group by strategy
    by_strategy: dict[str, list[MetricContract]] = defaultdict(list)
    for contract in resolved.values():
        by_strategy[contract.query_strategy].append(contract)

    # Load entity map and join graph once (for semantic/computed strategies)
    entity_map: dict[str, dict[str, Any]] = {}
    join_graph: dict[str, list[JoinDef]] = {}
    if "semantic" in by_strategy or "computed" in by_strategy:
        try:
            entity_map = _load_entity_map(query.business_id)
            join_graph = _load_join_graph(query.business_id)
        except Exception as e:
            log.warning("Failed to load entity/join metadata: %s", e)

    # Execute each strategy
    for strategy, contracts in by_strategy.items():
        st0 = time.monotonic()
        try:
            if strategy == "template":
                results = _execute_template_strategy(contracts, query, include_sql, query_hash)
            elif strategy == "semantic":
                results = _execute_semantic_strategy(
                    contracts, query, entity_map, join_graph, include_sql, query_hash,
                )
            elif strategy == "service":
                results = _execute_service_strategy(contracts, query, include_sql, query_hash)
            elif strategy == "computed":
                # Computed uses same path as semantic for now
                results = _execute_semantic_strategy(
                    contracts, query, entity_map, join_graph, include_sql, query_hash,
                )
            else:
                results = [_empty_result(c, query_hash, strategy) for c in contracts]
        except Exception as e:
            log.error("Strategy %s failed: %s", strategy, e)
            results = [_empty_result(c, query_hash, strategy) for c in contracts]

        st_ms = (time.monotonic() - st0) * 1000
        strategy_latencies[strategy] = round(st_ms, 2)
        for r in results:
            r.latency_ms = round(st_ms, 2)
        all_results.extend(results)

    total_ms = (time.monotonic() - t0) * 1000

    execution = QueryExecution(
        query_hash=query_hash,
        total_latency_ms=round(total_ms, 2),
        strategy_latencies=strategy_latencies,
        resolved_count=len(resolved),
        unresolved_keys=unresolved,
    )

    log.info(
        "unified_query.complete hash=%s total=%.1fms strategies=%s resolved=%d unresolved=%s",
        query_hash, total_ms, strategy_latencies, len(resolved), unresolved,
    )

    return all_results, execution


# ── Helpers ──────────────────────────────────────────────────────────

def _format_value(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, Decimal):
        return str(val)
    if isinstance(val, float):
        return str(Decimal(str(val)))
    return str(val)


def _empty_result(contract: MetricContract, query_hash: str, source: str) -> MetricResult:
    return MetricResult(
        metric_key=contract.metric_key,
        display_name=contract.display_name,
        metric_family=contract.metric_family,
        value=None,
        unit=contract.unit,
        format_hint=contract.format_hint_fe,
        polarity=contract.polarity,
        source=source,
        query_hash=query_hash,
    )


def _metric_to_column(metric_key: str) -> str:
    """Map metric_key to likely column name in template result rows."""
    return metric_key.lower()


def _table_for_entity(entity_key: str, entity_map: dict[str, dict[str, Any]]) -> str:
    entity = entity_map.get(entity_key)
    return entity["table_name"] if entity else entity_key


def _current_quarter() -> str:
    """Return the current fiscal quarter string (e.g., '2026Q1')."""
    from datetime import date
    today = date.today()
    q = (today.month - 1) // 3 + 1
    return f"{today.year}Q{q}"
