"""Pydantic response shapes for the Healthcare Subscription Analytics module (hha).

SYNTHETIC / NO-PHI. These are read-only analytics payloads — exec KPI strip plus a
health probe. Money is exposed as decimal dollars (cast from integer minor units at the
service edge); rates are exposed as [0,1] fractions and formatted client-side.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class HhaMetricDefinition(BaseModel):
    """One governed metric definition — the 'one definition per metric' contract,
    surfaced in the UI metric drawer."""

    key: str
    label: str
    formula: str
    grain: str
    owner: str
    source: str


class HhaKpi(BaseModel):
    """A single exec KPI with its value, render format, and governed definition."""

    key: str
    label: str
    value: float | int | None
    unit: str  # 'usd' | 'fraction' | 'ratio' | 'months' | 'count'
    fmt: str  # 'currency' | 'percent' | 'ratio' | 'months' | 'count'
    definition: HhaMetricDefinition


class HhaOverview(BaseModel):
    """Exec overview payload: the KPI strip plus freshness/provenance for the footer."""

    env_id: str
    as_of_date: str | None
    source_freshness_at: str | None
    provenance_label: str | None
    synthetic: bool = True
    phi: bool = False
    disclaimer: str
    kpis: list[HhaKpi] = Field(default_factory=list)


class HhaHealth(BaseModel):
    """Liveness + row-count probe for the env's hha_ serving tables."""

    ok: bool
    env_id: str
    row_counts: dict[str, int]
    source_freshness_at: str | None
    provenance_label: str | None
    synthetic: bool = True
    phi: bool = False


class HhaSurfaceResponse(BaseModel):
    """Shared metadata carried by each analytics surface."""

    env_id: str
    as_of_date: str | None
    source_freshness_at: str | None
    provenance_label: str | None
    synthetic: bool = True
    phi: bool = False
    disclaimer: str
    definitions: list[HhaMetricDefinition] = Field(default_factory=list)


class HhaFunnelStage(BaseModel):
    stage_key: str
    stage_label: str
    stage_order: int
    entered_count: int | None
    converted_count: int | None
    conversion_pct: float | None


class HhaFunnelChannel(BaseModel):
    channel: str
    cac_dollars: float | None
    stages: list[HhaFunnelStage] = Field(default_factory=list)


class HhaFunnel(HhaSurfaceResponse):
    blended_stages: list[HhaFunnelStage] = Field(default_factory=list)
    channels: list[HhaFunnelChannel] = Field(default_factory=list)


class HhaCohortCell(BaseModel):
    signup_cohort_month: str
    months_since_signup: int
    cohort_size: int
    retained_count: int | None
    retention_pct: float | None
    ltv_dollars: float | None


class HhaMaskedCohort(BaseModel):
    signup_cohort_month: str
    channel: str
    masked: Literal[True] = True
    reason: str


class HhaChannelLtvCac(BaseModel):
    channel: str
    ltv_dollars: float
    cac_dollars: float
    ratio: float


class HhaCohorts(HhaSurfaceResponse):
    cells: list[HhaCohortCell] = Field(default_factory=list)
    masked_cohorts: list[HhaMaskedCohort] = Field(default_factory=list)
    ltv_cac_by_channel: list[HhaChannelLtvCac] = Field(default_factory=list)
    ltv_cac_unavailable_reason: str | None = None


class HhaOperationsDomain(BaseModel):
    ops_domain: str
    metric_label: str | None
    volume: int | None
    sla_target_hours: float | None
    sla_actual_p50_hours: float | None
    sla_actual_p90_hours: float | None
    sla_breach_pct: float | None
    backlog_count: int | None
    over_sla: bool | None


class HhaOperations(HhaSurfaceResponse):
    domains: list[HhaOperationsDomain] = Field(default_factory=list)
