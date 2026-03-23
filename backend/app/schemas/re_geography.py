"""Pydantic schemas for Geography + Market Data endpoints."""
from __future__ import annotations

from datetime import date
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


class GeoOverlayCatalogItem(BaseModel):
    metric_key: str
    display_name: str
    description: str | None = None
    category: str
    units: str | None = None
    geography_levels: list[str] = Field(default_factory=list)
    compare_modes: list[str] = Field(default_factory=list)
    color_scale: str
    source_name: str
    source_url: str | None = None
    is_active: bool = True


class GeoNearbyDealOut(BaseModel):
    deal_id: str
    deal_name: str
    stage: str
    sector: str | None = None
    strategy: str | None = None
    fund_name: str | None = None


class GeoMapContextFeatureOut(BaseModel):
    geoid: str
    geography_level: str
    name: str
    geometry: dict[str, Any] | None = None
    metric_value: float | None = None
    metric_label: str
    units: str | None = None
    source_name: str | None = None
    dataset_vintage: str | None = None
    nearby_deals: list[GeoNearbyDealOut] = Field(default_factory=list)


class GeoMapContextOverlayOut(BaseModel):
    metric_key: str
    label: str
    units: str | None = None
    source_name: str
    dataset_vintage: str | None = None
    geography_level: str
    color_scale: str
    bins: list[dict[str, float | str]] = Field(default_factory=list)


class GeoMapContextOut(BaseModel):
    overlay: GeoMapContextOverlayOut
    features: list[GeoMapContextFeatureOut] = Field(default_factory=list)
    total_count: int = 0


class GeoMetricFactOut(BaseModel):
    label: str
    value: float | None = None
    units: str | None = None
    source_name: str | None = None
    dataset_vintage: str | None = None


class GeoDealComparisonOut(BaseModel):
    metric_key: str
    label: str
    subject_value: float | None = None
    benchmark_value: float | None = None
    delta: float | None = None
    units: str | None = None


class GeoDealFitOut(BaseModel):
    sector_fit_score: float | None = None
    positives: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    benchmark_deltas: list[GeoDealComparisonOut] = Field(default_factory=list)


class GeoCommentarySeedOut(BaseModel):
    facts: dict[str, Any] = Field(default_factory=dict)
    safe_narrative: list[str] = Field(default_factory=list)


class GeoDealContextOut(BaseModel):
    deal: dict[str, Any] = Field(default_factory=dict)
    underwriting: dict[str, float | None] = Field(default_factory=dict)
    tract_profile: dict[str, GeoMetricFactOut] = Field(default_factory=dict)
    county_profile: dict[str, GeoMetricFactOut] = Field(default_factory=dict)
    metro_benchmark: dict[str, GeoMetricFactOut] = Field(default_factory=dict)
    hazard: dict[str, GeoMetricFactOut] = Field(default_factory=dict)
    fit: GeoDealFitOut = Field(default_factory=GeoDealFitOut)
    commentary_seed: GeoCommentarySeedOut = Field(default_factory=GeoCommentarySeedOut)


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
