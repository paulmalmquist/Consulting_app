from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


BusinessLine = Literal["consulting", "pds", "re_investment", "market_intel"]
RunMode = Literal["fixture", "live"]


class OpportunityEngineContextOut(BaseModel):
    env_id: UUID
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class OpportunityModelRunOut(BaseModel):
    run_id: UUID
    env_id: UUID
    business_id: UUID
    run_type: str
    mode: str
    model_version: str
    status: str
    business_lines: list[str] = Field(default_factory=list)
    triggered_by: str | None = None
    input_hash: str | None = None
    parameters_json: dict[str, Any] = Field(default_factory=dict)
    metrics_json: dict[str, Any] = Field(default_factory=dict)
    error_summary: str | None = None
    started_at: datetime
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class OpportunitySignalOut(BaseModel):
    market_signal_id: UUID
    run_id: UUID
    signal_source: str
    source_market_id: str
    signal_key: str
    signal_name: str
    canonical_topic: str
    business_line: str
    sector: str | None = None
    geography: str | None = None
    signal_direction: str | None = None
    probability: float
    signal_strength: float
    confidence: float | None = None
    observed_at: datetime | str | None = None
    expires_at: datetime | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    explanation_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class OpportunityRecommendationOut(BaseModel):
    recommendation_id: UUID
    run_id: UUID
    opportunity_score_id: UUID | None = None
    business_line: str
    entity_type: str
    entity_id: str | None = None
    entity_key: str
    recommendation_type: str
    title: str
    summary: str | None = None
    suggested_action: str | None = None
    action_owner: str | None = None
    priority: str
    sector: str | None = None
    geography: str | None = None
    confidence: float
    why_json: dict[str, Any] = Field(default_factory=dict)
    driver_summary: str | None = None
    created_at: datetime
    updated_at: datetime
    score: float | None = None
    probability: float | None = None
    expected_value: float | None = None
    rank_position: int | None = None
    model_version: str | None = None
    fallback_mode: str | None = None


class OpportunityExplanationOut(BaseModel):
    driver_key: str
    driver_label: str
    driver_value: float | None = None
    contribution_score: float | None = None
    rank_position: int | None = None
    explanation_text: str | None = None


class OpportunityScoreHistoryPointOut(BaseModel):
    as_of_date: date
    score: float | None = None
    probability: float | None = None


class OpportunityRecommendationDetailOut(OpportunityRecommendationOut):
    drivers: list[OpportunityExplanationOut] = Field(default_factory=list)
    score_history: list[OpportunityScoreHistoryPointOut] = Field(default_factory=list)
    linked_signals: list[OpportunitySignalOut] = Field(default_factory=list)
    linked_forecasts: list[dict[str, Any]] = Field(default_factory=list)


class OpportunityDashboardOut(BaseModel):
    latest_run: OpportunityModelRunOut | None = None
    recommendation_counts: dict[str, int] = Field(default_factory=dict)
    top_recommendations: list[OpportunityRecommendationOut] = Field(default_factory=list)
    top_signals: list[OpportunitySignalOut] = Field(default_factory=list)
    run_history: list[OpportunityModelRunOut] = Field(default_factory=list)


class OpportunityRunCreateRequest(BaseModel):
    env_id: UUID
    business_id: UUID | None = None
    mode: RunMode = "fixture"
    run_type: str = Field(default="manual", min_length=2, max_length=40)
    business_lines: list[BusinessLine] = Field(default_factory=lambda: ["consulting", "pds", "re_investment", "market_intel"])
    triggered_by: str | None = Field(default=None, max_length=200)
    as_of_date: date | None = None
