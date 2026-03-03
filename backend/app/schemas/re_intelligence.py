from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


IngestScope = Literal["national", "state", "metro"]


class CreIngestRunCreateRequest(BaseModel):
    source_key: str = Field(min_length=2, max_length=120)
    scope: IngestScope = "metro"
    filters: dict[str, Any] = Field(default_factory=dict)
    force_refresh: bool = False


class CreIngestRunOut(BaseModel):
    run_id: UUID
    source_key: str
    scope_json: dict[str, Any]
    status: str
    rows_read: int
    rows_written: int
    error_count: int
    duration_ms: int | None = None
    token_cost: float | None = None
    raw_artifact_path: str | None = None
    error_summary: str | None = None
    started_at: datetime
    finished_at: datetime | None = None


class CreGeographyFeaturePropertiesOut(BaseModel):
    geography_id: UUID
    geography_type: str
    geoid: str
    name: str
    state_code: str | None = None
    cbsa_code: str | None = None
    vintage: int
    metric_key: str | None = None
    metric_value: float | None = None
    units: str | None = None
    source: str | None = None
    value_vintage: str | None = None
    pulled_at: datetime | None = None


class CreGeographyFeatureOut(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: dict[str, Any] | None = None
    properties: CreGeographyFeaturePropertiesOut


class CreGeographyFeatureCollectionOut(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[CreGeographyFeatureOut]


class CrePropertySummaryOut(BaseModel):
    property_id: UUID
    env_id: UUID
    business_id: UUID
    property_name: str
    address: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    lat: float | None = None
    lon: float | None = None
    land_use: str | None = None
    size_sqft: float | None = None
    year_built: int | None = None
    resolution_confidence: float
    latest_forecast_id: UUID | None = None
    latest_forecast_target: str | None = None
    latest_prediction: float | None = None
    latest_prediction_low: float | None = None
    latest_prediction_high: float | None = None
    latest_prediction_at: datetime | None = None


class CreLinkedGeographyOut(BaseModel):
    geography_id: UUID
    geography_type: str
    geoid: str
    name: str
    state_code: str | None = None
    cbsa_code: str | None = None
    confidence: float
    match_method: str


class CreLinkedEntityOut(BaseModel):
    entity_id: UUID
    entity_type: str
    name: str
    role: str
    confidence: float
    identifiers: dict[str, Any] = Field(default_factory=dict)


class CreForecastOut(BaseModel):
    forecast_id: UUID
    env_id: UUID
    business_id: UUID
    scope: str
    entity_id: UUID
    target: str
    horizon: str
    model_version: str
    prediction: float
    lower_bound: float | None = None
    upper_bound: float | None = None
    baseline_prediction: float | None = None
    status: str
    intervals: dict[str, Any] = Field(default_factory=dict)
    explanation_ptr: str | None = None
    explanation_json: dict[str, Any] = Field(default_factory=dict)
    source_vintages: list[dict[str, Any]] = Field(default_factory=list)
    generated_at: datetime


class CrePropertyDetailOut(BaseModel):
    property: CrePropertySummaryOut
    source_provenance: dict[str, Any] = Field(default_factory=dict)
    parcels: list[dict[str, Any]] = Field(default_factory=list)
    buildings: list[dict[str, Any]] = Field(default_factory=list)
    linked_geographies: list[CreLinkedGeographyOut] = Field(default_factory=list)
    linked_entities: list[CreLinkedEntityOut] = Field(default_factory=list)
    latest_forecasts: list[CreForecastOut] = Field(default_factory=list)


class CreMetricValueOut(BaseModel):
    metric_key: str
    label: str
    value: float
    units: str | None = None
    source: str
    vintage: str | None = None
    pulled_at: datetime | None = None
    provenance: dict[str, Any] = Field(default_factory=dict)


class CreExternalitiesBundleOut(BaseModel):
    property_id: UUID
    period: date
    macro: list[CreMetricValueOut] = Field(default_factory=list)
    housing: list[CreMetricValueOut] = Field(default_factory=list)
    hazard: list[CreMetricValueOut] = Field(default_factory=list)
    policy: list[CreMetricValueOut] = Field(default_factory=list)


class CreFeatureValueOut(BaseModel):
    feature_id: UUID
    entity_scope: str
    entity_id: UUID
    period: date
    feature_key: str
    value: float
    version: str
    lineage_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CreForecastMaterializeRequest(BaseModel):
    scope: str = Field(min_length=3, max_length=40)
    entity_ids: list[UUID] = Field(min_length=1)
    targets: list[str] = Field(min_length=1)
    horizon: str = Field(default="12m", min_length=2, max_length=20)
    feature_version: str = Field(default="miami_mvp_v1", min_length=3, max_length=120)


class CreForecastQuestionCreateRequest(BaseModel):
    env_id: UUID
    business_id: UUID
    text: str = Field(min_length=8, max_length=500)
    scope: str = Field(min_length=2, max_length=80)
    event_date: date
    resolution_criteria: str = Field(min_length=8, max_length=2000)
    resolution_source: str = Field(min_length=2, max_length=300)
    entity_id: UUID | None = None


class CreForecastQuestionOut(BaseModel):
    question_id: UUID
    env_id: UUID
    business_id: UUID
    text: str
    scope: str
    entity_id: UUID | None = None
    event_date: date
    resolution_criteria: str
    resolution_source: str
    probability: float
    method: str
    status: str
    brier_score: float | None = None
    last_moved_at: datetime
    created_at: datetime


class CreForecastSignalOut(BaseModel):
    signal_source: str
    signal_type: str
    probability: float
    weight: float | None = None
    observed_at: datetime
    source_ref: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class CreForecastSignalsBundleOut(BaseModel):
    question: CreForecastQuestionOut
    signals: list[CreForecastSignalOut]
    aggregate_probability: float
    weights: dict[str, float]
    reason_codes: list[str] = Field(default_factory=list)


class CreResolutionCandidateApproveRequest(BaseModel):
    approved_by: str = Field(min_length=2, max_length=200)
    decision_notes: str | None = Field(default=None, max_length=2000)


class CreResolutionCandidateOut(BaseModel):
    candidate_id: UUID
    env_id: UUID
    business_id: UUID
    property_id: UUID | None = None
    entity_type: str
    candidate_type: str
    source_record: dict[str, Any] = Field(default_factory=dict)
    proposed_match: dict[str, Any] = Field(default_factory=dict)
    confidence: float
    evidence: dict[str, Any] = Field(default_factory=dict)
    status: str
    created_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by: str | None = None


class CreResolutionDecisionOut(BaseModel):
    decision_id: UUID
    candidate_id: UUID
    env_id: UUID
    business_id: UUID
    property_id: UUID | None = None
    action: str
    approved_by: str
    decision_notes: str | None = None
    before_state: dict[str, Any] = Field(default_factory=dict)
    after_state: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CreDocumentExtractionRequest(BaseModel):
    document_id: UUID
    profile_key: str = Field(min_length=3, max_length=120)
    property_id: UUID | None = None
    entity_id: UUID | None = None

    @model_validator(mode="after")
    def validate_target(self):
        if not self.property_id and not self.entity_id:
            raise ValueError("property_id or entity_id is required")
        return self


class CreDocumentExtractionOut(BaseModel):
    doc_id: UUID
    env_id: UUID
    business_id: UUID
    property_id: UUID | None = None
    entity_id: UUID | None = None
    type: str
    uri: str
    extracted_json: dict[str, Any] = Field(default_factory=dict)
    extraction_version: str
    citations: list[dict[str, Any]] = Field(default_factory=list)
    confidence_score: float
    review_status: str
    created_at: datetime
    updated_at: datetime

