from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ResumeContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class ResumeRoleOut(BaseModel):
    role_id: UUID
    env_id: UUID
    business_id: UUID
    company: str
    division: str | None = None
    title: str
    location: str | None = None
    start_date: date
    end_date: date | None = None
    role_type: str
    industry: str | None = None
    summary: str | None = None
    highlights: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    sort_order: int = 0
    created_at: datetime


class ResumeSkillOut(BaseModel):
    skill_id: UUID
    env_id: UUID
    business_id: UUID
    name: str
    category: str
    proficiency: int
    years_used: int | None = None
    context: str | None = None
    current: bool = True
    created_at: datetime


class ResumeProjectOut(BaseModel):
    project_id: UUID
    env_id: UUID
    business_id: UUID
    name: str
    client: str | None = None
    role_id: UUID | None = None
    status: str
    summary: str | None = None
    impact: str | None = None
    technologies: list[str] = Field(default_factory=list)
    metrics: list[dict[str, Any]] = Field(default_factory=list)
    url: str | None = None
    sort_order: int = 0
    created_at: datetime


class ResumeCareerSummaryOut(BaseModel):
    total_years: float
    total_roles: int
    total_companies: int
    total_skills: int
    total_projects: int
    education: str
    location: str
    current_title: str
    current_company: str


class ResumeSystemComponentOut(BaseModel):
    component_id: UUID
    env_id: UUID
    business_id: UUID
    layer: str
    name: str
    description: str | None = None
    tools: list[str] = Field(default_factory=list)
    outcomes: list[str] = Field(default_factory=list)
    connections: list[dict[str, Any]] = Field(default_factory=list)
    icon_key: str | None = None
    sort_order: int = 0
    created_at: datetime


class ResumeDeploymentOut(BaseModel):
    deployment_id: UUID
    env_id: UUID
    business_id: UUID
    role_id: UUID | None = None
    deployment_name: str
    system_type: str
    problem: str | None = None
    architecture: str | None = None
    before_state: dict[str, Any] = Field(default_factory=dict)
    after_state: dict[str, Any] = Field(default_factory=dict)
    status: str = "completed"
    sort_order: int = 0
    created_at: datetime
    # Joined from role
    company: str | None = None
    title: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    location: str | None = None


class ResumeSystemStatsOut(BaseModel):
    properties_managed: int
    pipelines_built: int
    hours_saved_monthly: int
    performance_gain_pct: int
    mcp_tools: int
    active_systems: int
    total_roles: int
    total_projects: int
    system_status: str = "active"


class ResumeMetricItemOut(BaseModel):
    label: str
    value: str
    detail: str | None = None


class ResumeIdentityOut(BaseModel):
    name: str
    title: str
    tagline: str
    location: str
    summary: str
    badges: list[str] = Field(default_factory=list)
    metrics: list[ResumeMetricItemOut] = Field(default_factory=list)


class ResumeTimelineInitiativeOut(BaseModel):
    initiative_id: str
    role_id: str
    title: str
    summary: str
    team_context: str
    business_challenge: str
    measurable_outcome: str
    stakeholder_group: str
    scale: str
    architecture: str
    start_date: date
    end_date: date
    category: str
    capability: str
    impact_area: str
    technologies: list[str] = Field(default_factory=list)
    impact_tag: str
    linked_modules: list[str] = Field(default_factory=list)
    linked_architecture_node_ids: list[str] = Field(default_factory=list)
    linked_bi_entity_ids: list[str] = Field(default_factory=list)
    linked_model_preset: str | None = None


class ResumeTimelineMilestoneOut(BaseModel):
    milestone_id: str
    title: str
    date: date
    summary: str
    linked_modules: list[str] = Field(default_factory=list)
    linked_architecture_node_ids: list[str] = Field(default_factory=list)
    linked_bi_entity_ids: list[str] = Field(default_factory=list)
    linked_model_preset: str | None = None


class ResumeTimelineRoleOut(BaseModel):
    timeline_role_id: str
    company: str
    title: str
    lane: str
    start_date: date
    end_date: date | None = None
    summary: str
    scope: str
    technologies: list[str] = Field(default_factory=list)
    outcomes: list[str] = Field(default_factory=list)
    initiatives: list[ResumeTimelineInitiativeOut] = Field(default_factory=list)
    milestones: list[ResumeTimelineMilestoneOut] = Field(default_factory=list)


class ResumeTimelineOut(BaseModel):
    default_view: str
    views: list[str] = Field(default_factory=list)
    start_date: date
    end_date: date
    roles: list[ResumeTimelineRoleOut] = Field(default_factory=list)
    milestones: list[ResumeTimelineMilestoneOut] = Field(default_factory=list)


class ResumeArchitectureNodeOut(BaseModel):
    node_id: str
    label: str
    layer: str
    group: str
    position: dict[str, float]
    description: str
    tools: list[str] = Field(default_factory=list)
    outcomes: list[str] = Field(default_factory=list)
    business_problem: str
    real_example: str
    linked_timeline_ids: list[str] = Field(default_factory=list)
    linked_bi_entity_ids: list[str] = Field(default_factory=list)
    linked_model_preset: str | None = None


class ResumeArchitectureEdgeOut(BaseModel):
    edge_id: str
    source: str
    target: str
    technical_label: str
    impact_label: str


class ResumeArchitectureOut(BaseModel):
    default_view: str
    nodes: list[ResumeArchitectureNodeOut] = Field(default_factory=list)
    edges: list[ResumeArchitectureEdgeOut] = Field(default_factory=list)


class ResumeScenarioInputOut(BaseModel):
    purchase_price: float
    exit_cap_rate: float
    hold_period: int
    noi_growth_pct: float
    debt_pct: float


class ResumeScenarioPresetOut(BaseModel):
    preset_id: str
    label: str
    description: str
    inputs: ResumeScenarioInputOut


class ResumeModelingOut(BaseModel):
    defaults: ResumeScenarioInputOut
    assumptions: dict[str, float | str]
    presets: list[ResumeScenarioPresetOut] = Field(default_factory=list)


class ResumeBiPointOut(BaseModel):
    period: str
    noi: float
    occupancy: float
    value: float
    irr: float


class ResumeBiEntityOut(BaseModel):
    entity_id: str
    parent_id: str | None = None
    level: str
    name: str
    market: str | None = None
    property_type: str | None = None
    sector: str | None = None
    coordinates: dict[str, float] | None = None
    metrics: dict[str, float | str]
    trend: list[ResumeBiPointOut] = Field(default_factory=list)
    story: str
    linked_architecture_node_ids: list[str] = Field(default_factory=list)
    linked_timeline_ids: list[str] = Field(default_factory=list)


class ResumeBiOut(BaseModel):
    root_entity_id: str
    levels: list[str] = Field(default_factory=list)
    markets: list[str] = Field(default_factory=list)
    property_types: list[str] = Field(default_factory=list)
    periods: list[str] = Field(default_factory=list)
    entities: list[ResumeBiEntityOut] = Field(default_factory=list)


class ResumeStoryOut(BaseModel):
    story_id: str
    title: str
    module: str
    why_it_matters: str
    before_state: str
    after_state: str
    audience: str


class ResumeWorkspaceOut(BaseModel):
    identity: ResumeIdentityOut
    timeline: ResumeTimelineOut
    architecture: ResumeArchitectureOut
    modeling: ResumeModelingOut
    bi: ResumeBiOut
    stories: list[ResumeStoryOut] = Field(default_factory=list)


class ResumeAssistantContextIn(BaseModel):
    active_module: str
    selected_timeline_id: str | None = None
    selected_architecture_node_id: str | None = None
    selected_bi_entity_id: str | None = None
    architecture_view: str | None = None
    timeline_view: str | None = None
    model_preset_id: str | None = None
    model_inputs: dict[str, float | int | str] = Field(default_factory=dict)
    breadcrumb: list[str] = Field(default_factory=list)
    metrics: dict[str, float | int | str] = Field(default_factory=dict)
    filters: dict[str, str] = Field(default_factory=dict)


class ResumeAssistantRequestIn(BaseModel):
    env_id: str
    business_id: UUID | None = None
    query: str
    context: ResumeAssistantContextIn


class ResumeAssistantResponseOut(BaseModel):
    blocks: list[dict[str, Any]] = Field(default_factory=list)
    suggested_questions: list[str] = Field(default_factory=list)
