"""Schemas for metrics/reporting MCP tools."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class MetricsDefinitionsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID


class MetricsQueryInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    metric_keys: list[str] = Field(default_factory=list)
    dimension: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    refresh: bool = True


class UnifiedMetricsQueryInput(BaseModel):
    """Input for the unified metrics query tool — preferred for ALL metric lookups."""
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: UUID | None = None
    metric_keys: list[str] = Field(..., min_length=1, description="Metric keys or aliases to query")
    entity_type: str | None = Field(None, description="Entity type filter: fund, asset, portfolio")
    entity_ids: list[UUID] | None = Field(None, description="Specific entity IDs to filter")
    quarter: str | None = Field(None, description="Quarter filter (e.g. 2026Q1)")
    dimension: str | None = Field(None, description="Breakout dimension")
    limit: int | None = Field(None, ge=1, le=5000)
