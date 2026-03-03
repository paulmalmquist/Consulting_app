"""Pydantic schemas for Geography + Market Data endpoints."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ── Geography ────────────────────────────────────────────────────────────────

class GeographyFeatureProperties(BaseModel):
    geography_id: str
    geography_type: str
    name: str
    state_fips: str | None = None
    county_fips: str | None = None
    cbsa_code: str | None = None
    centroid_lat: float | None = None
    centroid_lon: float | None = None
    area_sq_miles: float | None = None


class GeographyFeature(BaseModel):
    type: str = "Feature"
    id: str
    properties: GeographyFeatureProperties
    geometry: dict[str, Any] | None = None  # GeoJSON geometry


class GeographyFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[GeographyFeature]
    total_count: int = 0


# ── Metrics ──────────────────────────────────────────────────────────────────

class MetricCatalogItem(BaseModel):
    metric_key: str
    display_name: str
    description: str | None = None
    units: str
    grain_supported: list[str]
    geography_types_supported: list[str]
    source_name: str
    source_url: str | None = None
    color_scale: str
    is_active: bool


class MetricValue(BaseModel):
    geography_id: str
    metric_key: str
    period_start: date
    period_grain: str
    value: float | None
    units: str | None
    source_name: str | None
    dataset_vintage: str | None


class MetricTimeSeries(BaseModel):
    geography_id: str
    metric_key: str
    values: list[MetricValue]


class ChoroplethEntry(BaseModel):
    geography_id: str
    value: float | None
    units: str | None
    dataset_vintage: str | None
    source_name: str | None


# ── Pipeline Map Feed ────────────────────────────────────────────────────────

class PipelineMapMarker(BaseModel):
    property_id: UUID
    deal_id: UUID | None = None
    property_name: str
    address: str | None = None
    lat: float
    lon: float
    deal_name: str | None = None
    deal_status: str | None = None
    geographies: list[dict[str, str]] = Field(default_factory=list)


class PipelineMapFeed(BaseModel):
    markers: list[PipelineMapMarker]
    total_count: int


# ── Geocode Result ───────────────────────────────────────────────────────────

class GeocodeResult(BaseModel):
    property_id: str
    lat: float
    lon: float
    linked_geographies: list[dict[str, str]]
