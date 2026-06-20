"""Contracts for the telemetry metadata and lineage graph."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


MetadataStatus = Literal["fresh", "stale", "missing", "quarantined", "unknown"]
MetadataConfidence = Literal["explicit", "inferred", "unknown"]
MetadataKind = Literal[
    "source",
    "stream",
    "table",
    "view",
    "pipeline",
    "metric",
    "dashboard",
    "report",
    "model",
    "ai_consumer",
    "api",
]
MetadataLayer = Literal[
    "source",
    "bronze",
    "silver",
    "gold",
    "metric",
    "consumer",
    "model",
    "runtime",
]
MetadataRelationship = Literal[
    "ingests_to",
    "cleans_to",
    "aggregates_to",
    "defines_metric",
    "feeds_dashboard",
    "feeds_model",
    "used_by_ai",
    "streamed_from",
    "batch_loaded_from",
    "quality_checked_by",
    "quarantines_to",
    "exports_to",
    "references",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MetadataWarning(StrictModel):
    code: str
    message: str
    severity: Literal["info", "warning", "error"]


class TelemetryMetadataNode(StrictModel):
    id: str
    label: str
    kind: MetadataKind
    layer: MetadataLayer | None = None
    schema: str | None = None
    object_name: str | None = None
    description: str | None = None
    status: MetadataStatus | None = None
    confidence: MetadataConfidence
    metadata: dict[str, Any] = Field(default_factory=dict)


class TelemetryMetadataEdge(StrictModel):
    id: str
    source: str
    target: str
    relationship: MetadataRelationship
    confidence: MetadataConfidence
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TelemetryMetadataStats(StrictModel):
    source_count: int
    bronze_count: int
    silver_count: int
    gold_count: int
    metric_count: int
    model_count: int
    dashboard_count: int
    edge_count: int
    unavailable_count: int


class TelemetryMetadataGraph(StrictModel):
    generated_at: datetime
    env_id: str | None = None
    environment: str | None = None
    status: Literal["ok", "partial", "error"]
    warnings: list[MetadataWarning]
    nodes: list[TelemetryMetadataNode]
    edges: list[TelemetryMetadataEdge]
    stats: TelemetryMetadataStats


class TelemetryCatalogNode(TelemetryMetadataNode):
    domain: Literal["telemetry"]


class TelemetryMetadataCatalog(StrictModel):
    version: Literal["1.0"]
    domain: Literal["telemetry"]
    environment: str
    reviewed_at: datetime
    nodes: list[TelemetryCatalogNode]
    edges: list[TelemetryMetadataEdge]
