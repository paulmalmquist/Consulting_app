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
