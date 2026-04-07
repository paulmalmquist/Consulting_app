"""Pydantic schemas for the unified metrics API (v2)."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class UnifiedMetricQueryRequest(BaseModel):
    model_config = {"extra": "forbid"}

    business_id: UUID
    env_id: UUID | None = None
    metric_keys: list[str] = Field(..., min_length=1, max_length=50)
    entity_type: str | None = None
    entity_ids: list[UUID] | None = None
    quarter: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    dimension: str | None = None
    scenario_id: UUID | None = None
    limit: int = Field(default=500, ge=1, le=5000)


class MetricResultItem(BaseModel):
    metric_key: str
    display_name: str
    metric_family: str | None = None
    value: str | None = None
    unit: str
    format_hint: str | None = None
    polarity: str
    dimension_value: str | None = None
    entity_id: str | None = None
    entity_name: str | None = None
    quarter: str | None = None
    source: str
    query_hash: str | None = None
    latency_ms: float | None = None


class UnifiedMetricQueryResponse(BaseModel):
    results: list[MetricResultItem]
    query_hash: str
    total_latency_ms: float
    strategy_latencies: dict[str, float]
    resolved_count: int
    unresolved_keys: list[str]


class MetricCatalogEntry(BaseModel):
    metric_key: str
    display_name: str
    description: str | None = None
    aliases: list[str]
    metric_family: str | None = None
    query_strategy: str
    template_key: str | None = None
    unit: str
    aggregation: str
    format_hint_fe: str | None = None
    polarity: str
    entity_key: str | None = None
    allowed_breakouts: list[str]
    time_behavior: str


class MetricDebugResponse(BaseModel):
    registry_entry: MetricCatalogEntry
    query_strategy: str
    generated_sql: str | None = None
    join_path: list[str] | None = None
    sample_results: list[MetricResultItem]
    query_hash: str | None = None
    data_contract_status: str | None = None
