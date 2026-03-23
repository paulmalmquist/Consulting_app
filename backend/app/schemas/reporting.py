from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class MetricsQueryRequest(BaseModel):
    business_id: UUID
    metric_keys: list[str] = Field(default_factory=list)
    dimension: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    refresh: bool = True


class MetricsQueryPoint(BaseModel):
    metric_id: UUID
    metric_key: str
    metric_label: str
    unit: str | None = None
    aggregation: str
    dimension: str | None = None
    dimension_value: str | None = None
    value: str
    source_fact_ids: list[str] = Field(default_factory=list)


class MetricsQueryResponse(BaseModel):
    query_hash: str
    points: list[MetricsQueryPoint]


class MetricDefinition(BaseModel):
    metric_id: UUID
    key: str
    label: str
    description: str | None = None
    unit: str | None = None
    aggregation: str


class DimensionDefinition(BaseModel):
    key: str
    label: str
    source: str


class MetricDefinitionsResponse(BaseModel):
    metrics: list[MetricDefinition]
    dimensions: list[DimensionDefinition]


class ReportCreateRequest(BaseModel):
    business_id: UUID
    title: str
    description: str | None = None
    query: dict[str, Any]
    is_draft: bool = True


class ReportOut(BaseModel):
    report_id: UUID
    key: str
    label: str
    description: str | None = None
    version: int
    config: dict[str, Any]
    created_at: str


class ReportRunRequest(BaseModel):
    business_id: UUID
    refresh: bool = True


class ReportRunOut(BaseModel):
    report_run_id: UUID
    run_id: UUID | None = None
    query_hash: str
    points: list[MetricsQueryPoint]


class ReportExplainOut(BaseModel):
    report_id: UUID
    report_run_id: UUID
    explanation: list[dict[str, Any]]
