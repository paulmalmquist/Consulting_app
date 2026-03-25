"""Pydantic schemas for Execution Pattern Intelligence (EPI)."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------

class EpiContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Engagements
# ---------------------------------------------------------------------------

class EngagementCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    client_name: str | None = None
    industry: str | None = None
    sub_industry: str | None = None
    engagement_stage: str = "active"


class EngagementOut(BaseModel):
    engagement_id: UUID
    env_id: str
    business_id: UUID
    client_name: str | None = None
    industry: str | None = None
    sub_industry: str | None = None
    engagement_stage: str
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Source artifacts (approved upstream ingest)
# ---------------------------------------------------------------------------

class SourceArtifactIngest(BaseModel):
    source_env_id: UUID
    source_record_id: UUID
    source_type: str  # discovery_account, data_studio_profile, workflow_observation, vendor_stack, metric_definition, pilot_outcome, architecture_outcome, case_insight
    engagement_id: UUID
    approved_at: datetime | None = None
    version: int = 1
    provenance: dict[str, Any] = Field(default_factory=dict)
    payload: dict[str, Any] = Field(default_factory=dict)


class SourceArtifactOut(BaseModel):
    artifact_id: UUID
    engagement_id: UUID
    source_env_id: UUID
    source_record_id: UUID
    source_type: str
    approved_at: datetime
    version: int
    provenance: dict[str, Any] = Field(default_factory=dict)
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


# ---------------------------------------------------------------------------
# Observations (raw ingest types)
# ---------------------------------------------------------------------------

class VendorObservationInput(BaseModel):
    engagement_id: UUID
    vendor_name: str
    vendor_family: str | None = None
    product_name: str | None = None
    category: str | None = None
    version_info: str | None = None
    contract_value: Decimal | None = None
    renewal_date: date | None = None
    problems: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)


class WorkflowObservationInput(BaseModel):
    engagement_id: UUID
    workflow_name: str
    canonical_name: str | None = None
    steps: list[dict[str, Any]] = Field(default_factory=list)
    step_count: int | None = None
    handoff_count: int | None = None
    manual_steps: int | None = None
    automated_steps: int | None = None
    cycle_time_hours: Decimal | None = None
    bottleneck_step: str | None = None
    industry: str | None = None
    tags: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)


class MetricObservationInput(BaseModel):
    engagement_id: UUID
    metric_name: str
    canonical_key: str | None = None
    formula: str | None = None
    formula_ast: dict[str, Any] | None = None
    unit: str | None = None
    source_system: str | None = None
    report_usage: list[str] = Field(default_factory=list)
    industry: str | None = None
    tags: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)


class ArchitectureObservationInput(BaseModel):
    engagement_id: UUID
    architecture_name: str
    modules: list[dict[str, Any]] = Field(default_factory=list)
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    replaced_vendors: list[str] = Field(default_factory=list)
    phase_count: int | None = None
    status: str = "proposed"
    business_outcome_score: Decimal | None = None
    adoption_score: Decimal | None = None
    time_to_value_score: Decimal | None = None
    stability_score: Decimal | None = None
    schedule_adherence_score: Decimal | None = None
    industry: str | None = None
    tags: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)


class PilotObservationInput(BaseModel):
    engagement_id: UUID
    pilot_name: str
    pilot_type: str | None = None
    target_workflow: str | None = None
    target_vendor: str | None = None
    modules_used: list[str] = Field(default_factory=list)
    duration_weeks: int | None = None
    status: str = "proposed"
    business_outcome_score: Decimal | None = None
    adoption_score: Decimal | None = None
    time_to_value_score: Decimal | None = None
    stability_score: Decimal | None = None
    schedule_adherence_score: Decimal | None = None
    industry: str | None = None
    tags: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)


class FailureObservationInput(BaseModel):
    engagement_id: UUID
    failure_mode: str
    category: str | None = None
    severity: str = "medium"
    related_vendors: list[str] = Field(default_factory=list)
    related_workflows: list[str] = Field(default_factory=list)
    related_metrics: list[str] = Field(default_factory=list)
    root_cause: str | None = None
    resolution: str | None = None
    industry: str | None = None
    tags: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)


class ObservationOut(BaseModel):
    observation_id: UUID
    engagement_id: UUID
    created_at: datetime
    payload: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

class PatternOut(BaseModel):
    pattern_id: UUID
    pattern_type: str
    pattern_description: str
    confidence_score: Decimal
    support_count: int
    industry_tags: list[str] = Field(default_factory=list)
    related_vendors: list[str] = Field(default_factory=list)
    related_workflows: list[str] = Field(default_factory=list)
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None
    status: str
    visibility_scope: str
    created_at: datetime
    updated_at: datetime
    # Subtype detail (nullable, filled when detail requested)
    detail: dict[str, Any] | None = None


class PatternQueryRequest(BaseModel):
    question: str
    industry: str | None = None
    filters: dict[str, Any] = Field(default_factory=dict)
    privacy_mode: bool = True


class PatternAnswer(BaseModel):
    answer_text: str
    confidence: Decimal
    matched_patterns: list[UUID] = Field(default_factory=list)
    support_counts: dict[str, int] = Field(default_factory=dict)
    recommended_actions: list[str] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    privacy_mode: bool = True


# ---------------------------------------------------------------------------
# Predictions & recommendations
# ---------------------------------------------------------------------------

class PredictionOut(BaseModel):
    prediction_id: UUID
    engagement_id: UUID
    prediction_type: str
    industry: str | None = None
    vendor_stack: list[str] = Field(default_factory=list)
    workflows: list[str] = Field(default_factory=list)
    likely_issues: list[dict[str, Any]] = Field(default_factory=list)
    recommended_discovery_requests: list[dict[str, Any]] = Field(default_factory=list)
    matched_patterns: list[UUID] = Field(default_factory=list)
    overall_confidence: Decimal | None = None
    created_at: datetime
    updated_at: datetime


class RecommendationOut(BaseModel):
    recommendation_id: UUID
    engagement_id: UUID
    recommendation_type: str
    title: str
    description: str | None = None
    confidence: Decimal | None = None
    matched_patterns: list[UUID] = Field(default_factory=list)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    rank: int
    status: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

class GraphNodeOut(BaseModel):
    node_id: UUID
    node_type: str
    node_label: str
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphEdgeOut(BaseModel):
    edge_id: UUID
    source_node_id: UUID
    target_node_id: UUID
    edge_type: str
    weight: Decimal
    confidence: Decimal


class GraphQueryOut(BaseModel):
    nodes: list[GraphNodeOut] = Field(default_factory=list)
    edges: list[GraphEdgeOut] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Case feed
# ---------------------------------------------------------------------------

class CaseFeedItemOut(BaseModel):
    item_id: UUID
    title: str
    summary: str | None = None
    industry: str | None = None
    draft_body: str | None = None
    status: str
    source_type: str | None = None
    generated_from_pattern: UUID | None = None
    approved_by: str | None = None
    approved_at: datetime | None = None
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    linked_patterns: list[UUID] = Field(default_factory=list)


class CaseFeedApproveRequest(BaseModel):
    approved_by: str


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class DashboardKpisOut(BaseModel):
    total_engagements: int = 0
    total_patterns: int = 0
    total_predictions: int = 0
    prediction_hit_rate: Decimal | None = None
    industries_covered: int = 0
    top_recurring_failures: list[dict[str, Any]] = Field(default_factory=list)
    top_successful_pilots: list[dict[str, Any]] = Field(default_factory=list)
    recent_case_feed_drafts: list[dict[str, Any]] = Field(default_factory=list)


class IndustryDashboardOut(BaseModel):
    industry: str
    rollup_date: date | None = None
    total_engagements: int = 0
    total_patterns: int = 0
    top_vendor_stacks: list[dict[str, Any]] = Field(default_factory=list)
    top_workflow_bottlenecks: list[dict[str, Any]] = Field(default_factory=list)
    top_metric_conflicts: list[dict[str, Any]] = Field(default_factory=list)
    top_failure_modes: list[dict[str, Any]] = Field(default_factory=list)
    top_successful_pilots: list[dict[str, Any]] = Field(default_factory=list)
    top_architectures: list[dict[str, Any]] = Field(default_factory=list)
    reporting_delay_patterns: list[dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Materialize trigger
# ---------------------------------------------------------------------------

class MaterializeRequest(BaseModel):
    engagement_id: UUID | None = None
    source_type: str | None = None  # narrow to specific source type
    full_rebuild: bool = False


class MaterializeOut(BaseModel):
    observations_created: int = 0
    patterns_updated: int = 0
    graph_edges_updated: int = 0
    message: str = "ok"
