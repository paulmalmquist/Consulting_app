"""Unified Metrics API v2 — single endpoint for all metric queries.

Endpoints:
  POST /api/metrics/v2/query   — query metrics (UI + AI)
  GET  /api/metrics/v2/catalog — list all metric definitions
  GET  /api/metrics/v2/debug/{metric_key} — trace a metric through the system
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.unified_metrics import (
    MetricCatalogEntry,
    MetricDebugResponse,
    MetricResultItem,
    UnifiedMetricQueryRequest,
    UnifiedMetricQueryResponse,
)
from app.services.unified_metric_registry import get_registry
from app.services.unified_query_builder import (
    MetricQuery,
    execute_unified_query,
)

router = APIRouter(prefix="/api/metrics/v2", tags=["unified-metrics"])


@router.post("/query", response_model=UnifiedMetricQueryResponse)
def unified_query(req: UnifiedMetricQueryRequest) -> UnifiedMetricQueryResponse:
    """Single endpoint for all metric queries — used by both UI widgets and AI gateway."""
    registry = get_registry()

    query = MetricQuery(
        metric_keys=req.metric_keys,
        business_id=str(req.business_id),
        env_id=str(req.env_id) if req.env_id else None,
        entity_type=req.entity_type,
        entity_ids=[str(eid) for eid in req.entity_ids] if req.entity_ids else None,
        quarter=req.quarter,
        date_from=str(req.date_from) if req.date_from else None,
        date_to=str(req.date_to) if req.date_to else None,
        dimension=req.dimension,
        scenario_id=str(req.scenario_id) if req.scenario_id else None,
        limit=req.limit,
    )

    results, execution = execute_unified_query(query, registry)

    return UnifiedMetricQueryResponse(
        results=[MetricResultItem(
            metric_key=r.metric_key,
            display_name=r.display_name,
            metric_family=r.metric_family,
            value=r.value,
            unit=r.unit,
            format_hint=r.format_hint,
            polarity=r.polarity,
            dimension_value=r.dimension_value,
            entity_id=r.entity_id,
            entity_name=r.entity_name,
            quarter=r.quarter,
            source=r.source,
            query_hash=r.query_hash,
            latency_ms=r.latency_ms,
        ) for r in results],
        query_hash=execution.query_hash,
        total_latency_ms=execution.total_latency_ms,
        strategy_latencies=execution.strategy_latencies,
        resolved_count=execution.resolved_count,
        unresolved_keys=execution.unresolved_keys,
    )


@router.get("/catalog", response_model=list[MetricCatalogEntry])
def metric_catalog(
    business_id: UUID = Query(..., description="Tenant business ID"),
) -> list[MetricCatalogEntry]:
    """List all metric definitions from the unified registry."""
    registry = get_registry(business_id=str(business_id))

    return [
        MetricCatalogEntry(
            metric_key=c.metric_key,
            display_name=c.display_name,
            description=c.description,
            aliases=list(c.aliases),
            metric_family=c.metric_family,
            query_strategy=c.query_strategy,
            template_key=c.template_key,
            unit=c.unit,
            aggregation=c.aggregation,
            format_hint_fe=c.format_hint_fe,
            polarity=c.polarity,
            entity_key=c.entity_key,
            allowed_breakouts=list(c.allowed_breakouts),
            time_behavior=c.time_behavior,
        )
        for c in registry.list_all()
    ]


@router.get("/debug/{metric_key}", response_model=MetricDebugResponse)
def debug_metric(
    metric_key: str,
    business_id: UUID = Query(..., description="Tenant business ID"),
    env_id: UUID | None = Query(None),
    quarter: str | None = Query(None),
) -> MetricDebugResponse:
    """Trace a metric through the system — shows resolution, strategy, SQL, and sample data."""
    registry = get_registry(business_id=str(business_id))
    contract = registry.resolve(metric_key)
    if not contract:
        raise HTTPException(status_code=404, detail=f"Metric '{metric_key}' not found in registry")

    catalog_entry = MetricCatalogEntry(
        metric_key=contract.metric_key,
        display_name=contract.display_name,
        description=contract.description,
        aliases=list(contract.aliases),
        metric_family=contract.metric_family,
        query_strategy=contract.query_strategy,
        template_key=contract.template_key,
        unit=contract.unit,
        aggregation=contract.aggregation,
        format_hint_fe=contract.format_hint_fe,
        polarity=contract.polarity,
        entity_key=contract.entity_key,
        allowed_breakouts=list(contract.allowed_breakouts),
        time_behavior=contract.time_behavior,
    )

    # Execute a sample query with include_sql=True to get the generated SQL
    query = MetricQuery(
        metric_keys=[contract.metric_key],
        business_id=str(business_id),
        env_id=str(env_id) if env_id else None,
        quarter=quarter,
        limit=5,
    )

    try:
        results, execution = execute_unified_query(query, registry, include_sql=True)
    except Exception:
        results = []
        execution = None

    sample_items = [
        MetricResultItem(
            metric_key=r.metric_key,
            display_name=r.display_name,
            metric_family=r.metric_family,
            value=r.value,
            unit=r.unit,
            format_hint=r.format_hint,
            polarity=r.polarity,
            dimension_value=r.dimension_value,
            entity_id=r.entity_id,
            entity_name=r.entity_name,
            quarter=r.quarter,
            source=r.source,
            query_hash=r.query_hash,
            latency_ms=r.latency_ms,
        )
        for r in results[:5]
    ]

    generated_sql = None
    for r in results:
        if r.sql_used:
            generated_sql = r.sql_used
            break

    # Check data contract status
    data_contract_status = None
    try:
        from app.services.semantic_catalog import check_data_contract
        if contract.entity_key:
            from app.services.semantic_catalog import list_entities
            entities = list_entities(business_id=str(business_id))
            entity = next((e for e in entities if e["entity_key"] == contract.entity_key), None)
            if entity:
                dc = check_data_contract(business_id=str(business_id), table_name=entity["table_name"])
                if dc:
                    data_contract_status = dc.get("last_status", "unknown")
    except Exception:
        pass

    return MetricDebugResponse(
        registry_entry=catalog_entry,
        query_strategy=contract.query_strategy,
        generated_sql=generated_sql,
        sample_results=sample_items,
        query_hash=execution.query_hash if execution else None,
        data_contract_status=data_contract_status,
    )
