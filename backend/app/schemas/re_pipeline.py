"""Pydantic schemas for Pipeline + Census + Vector Search."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

PipelineDealStatus = Literal[
    "sourced", "screening", "loi", "dd", "ic", "closing", "closed", "dead"
]
PipelineStrategy = Literal[
    "core", "core_plus", "value_add", "opportunistic", "debt", "development"
]
TrancheType = Literal[
    "equity", "pref_equity", "mezz", "senior_debt", "bridge", "note_purchase"
]
TrancheStatus = Literal["open", "committed", "funded", "closed", "withdrawn"]
ActivityType = Literal[
    "note", "call", "meeting", "email", "document", "status_change", "milestone"
]


# ── Deal ─────────────────────────────────────────────────────────────────────

class RePipelineDealCreateRequest(BaseModel):
    deal_name: str = Field(min_length=2, max_length=300)
    fund_id: UUID | None = None
    status: PipelineDealStatus = "sourced"
    source: str | None = None
    strategy: PipelineStrategy | None = None
    property_type: str | None = None
    target_close_date: date | None = None
    headline_price: Decimal | None = None
    target_irr: Decimal | None = None
    target_moic: Decimal | None = None
    notes: str | None = None


class RePipelineDealPatchRequest(BaseModel):
    deal_name: str | None = None
    fund_id: UUID | None = None
    status: PipelineDealStatus | None = None
    source: str | None = None
    strategy: PipelineStrategy | None = None
    property_type: str | None = None
    target_close_date: date | None = None
    headline_price: Decimal | None = None
    target_irr: Decimal | None = None
    target_moic: Decimal | None = None
    notes: str | None = None


class RePipelineDealOut(BaseModel):
    deal_id: UUID
    env_id: UUID
    fund_id: UUID | None = None
    deal_name: str
    status: str
    source: str | None = None
    strategy: str | None = None
    property_type: str | None = None
    target_close_date: date | None = None
    headline_price: Decimal | None = None
    target_irr: Decimal | None = None
    target_moic: Decimal | None = None
    notes: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


# ── Property ─────────────────────────────────────────────────────────────────

class RePipelinePropertyCreateRequest(BaseModel):
    property_name: str = Field(min_length=1, max_length=300)
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    lat: Decimal | None = None
    lon: Decimal | None = None
    property_type: str | None = None
    units: int | None = None
    sqft: int | None = None
    year_built: int | None = None
    occupancy: Decimal | None = None
    noi: Decimal | None = None
    asking_cap_rate: Decimal | None = None


class RePipelinePropertyOut(BaseModel):
    property_id: UUID
    deal_id: UUID
    canonical_property_id: UUID | None = None
    property_name: str
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    lat: Decimal | None = None
    lon: Decimal | None = None
    property_type: str | None = None
    units: int | None = None
    sqft: int | None = None
    year_built: int | None = None
    occupancy: Decimal | None = None
    noi: Decimal | None = None
    asking_cap_rate: Decimal | None = None
    census_tract_geoid: str | None = None
    created_at: datetime


# ── Tranche ──────────────────────────────────────────────────────────────────

class RePipelineTrancheCreateRequest(BaseModel):
    tranche_name: str = Field(min_length=1, max_length=200)
    tranche_type: TrancheType = "equity"
    close_date: date | None = None
    commitment_amount: Decimal | None = None
    price: Decimal | None = None
    terms_json: dict = Field(default_factory=dict)
    status: TrancheStatus = "open"


class RePipelineTrancheOut(BaseModel):
    tranche_id: UUID
    deal_id: UUID
    tranche_name: str
    tranche_type: str
    close_date: date | None = None
    commitment_amount: Decimal | None = None
    price: Decimal | None = None
    terms_json: dict
    status: str
    created_at: datetime


# ── Contact ──────────────────────────────────────────────────────────────────

class RePipelineContactCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str | None = None
    phone: str | None = None
    org: str | None = None
    role: str | None = None


class RePipelineContactOut(BaseModel):
    contact_id: UUID
    deal_id: UUID
    name: str
    email: str | None = None
    phone: str | None = None
    org: str | None = None
    role: str | None = None
    created_at: datetime


# ── Activity ─────────────────────────────────────────────────────────────────

class RePipelineActivityCreateRequest(BaseModel):
    activity_type: ActivityType
    body: str | None = None
    occurred_at: datetime | None = None
    tranche_id: UUID | None = None


class RePipelineActivityOut(BaseModel):
    activity_id: UUID
    deal_id: UUID
    tranche_id: UUID | None = None
    activity_type: str
    occurred_at: datetime
    body: str | None = None
    created_by: str | None = None
    created_at: datetime


# ── Map ──────────────────────────────────────────────────────────────────────

class ReMapMarkerOut(BaseModel):
    deal_id: UUID
    canonical_property_id: UUID | None = None
    deal_name: str
    status: str
    lat: Decimal
    lon: Decimal
    property_name: str
    property_type: str | None = None
    headline_price: Decimal | None = None


# ── Census ───────────────────────────────────────────────────────────────────

class ReCensusTractOut(BaseModel):
    tract_geoid: str
    geometry_geojson: Any | None = None
    centroid_lat: Decimal | None = None
    centroid_lon: Decimal | None = None
    metrics_json: dict
    source_year: int


class ReCensusLayerOut(BaseModel):
    layer_id: UUID
    layer_name: str
    census_variable: str
    label: str
    color_scale: str
    unit: str | None = None
    description: str | None = None
    is_active: bool


# ── Vector Search ────────────────────────────────────────────────────────────

class ReVectorSearchRequest(BaseModel):
    query: str = Field(min_length=2)
    entity_type: str | None = None
    entity_id: UUID | None = None
    limit: int = Field(default=10, le=50)


class ReVectorSearchResult(BaseModel):
    chunk_id: UUID
    document_id: UUID
    title: str | None = None
    anchor_label: str | None = None
    snippet: str
    score: float
