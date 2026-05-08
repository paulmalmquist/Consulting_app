"""Pydantic response models for the Vultr Cloud Intelligence OS surface.

Authoritative envelope shape: every metric carries provenance, freshness, and a
`null_reason` instead of silently coercing to zero. Pattern adapted from the REPE
authoritative-state contract (`docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md`); the
snapshot machinery itself is out of scope — this surface adopts the *discipline*,
not the lock/release pipeline.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class VultrContextOut(BaseModel):
    env_id: UUID
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


MetricStatus = Literal["ok", "stale", "unavailable", "blocked"]
SourceFreshness = Literal["fresh", "stale", "unavailable"]
MetricUnit = Literal[
    "usd", "usd_per_hour", "pct", "count", "hours", "gpu_hours", "days", "ratio"
]
MetricPeriod = Literal["7D", "30D", "90D", "MTD", "QTD", "YTD"]


class Provenance(BaseModel):
    source: str
    source_system: str | None = None
    source_record_count: int | None = None
    joined_with: list[str] = Field(default_factory=list)


class MetricBlock(BaseModel):
    key: str
    label: str
    value: Decimal | None = None
    unit: MetricUnit
    period: MetricPeriod | None = None
    status: MetricStatus
    null_reason: str | None = None
    provenance: Provenance


class FreshnessReport(BaseModel):
    usage: SourceFreshness
    billing: SourceFreshness
    netsuite: SourceFreshness
    salesforce: SourceFreshness
    support: SourceFreshness
    last_synced_at: datetime | None = None


class ReconciliationException(BaseModel):
    exception_id: str
    customer_id: str
    customer_name: str | None = None
    exception_type: Literal[
        "usage_not_invoiced",
        "invoice_no_usage",
        "contract_mismatch",
        "discount_mismatch",
        "recognition_lag",
        "cash_not_collected",
    ]
    severity: Literal["info", "warning", "critical"]
    period_start: date
    period_end: date
    amount_usd: Decimal
    detected_at: datetime | None = None
    resolved_at: datetime | None = None
    notes: str | None = None


class Warning(BaseModel):
    code: str
    message: str
    detail: dict[str, Any] = Field(default_factory=dict)


class VultrEnvelope(BaseModel):
    """Common response envelope for every /api/vultr/* endpoint."""

    env_id: str
    as_of: datetime
    freshness: FreshnessReport
    metric_blocks: list[MetricBlock] = Field(default_factory=list)
    data: dict[str, Any] = Field(default_factory=dict)
    exceptions: list[ReconciliationException] = Field(default_factory=list)
    warnings: list[Warning] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Reconciliation bridge
# ─────────────────────────────────────────────────────────────────────────────

class BridgeStage(BaseModel):
    stage_key: Literal[
        "platform_usage",
        "rated_billing",
        "issued_invoices",
        "recognized_revenue",
        "collected_cash",
        "contract_committed",
    ]
    label: str
    amount_usd: Decimal | None = None
    delta_from_previous_usd: Decimal | None = None
    null_reason: str | None = None
    source_system: str
    record_count: int | None = None


class ReconciliationBridgeOut(BaseModel):
    period_start: date
    period_end: date
    stages: list[BridgeStage]
    exceptions_total_usd: Decimal
    exceptions_count: int


# ─────────────────────────────────────────────────────────────────────────────
# GPU command graph
# ─────────────────────────────────────────────────────────────────────────────

class GpuRegionNode(BaseModel):
    region_key: str
    region_name: str
    available_gpu_hours: Decimal
    utilized_gpu_hours: Decimal
    utilization_pct: Decimal | None
    capacity_risk: Literal["low", "medium", "high", "critical"]
    exhaustion_forecast_days: int | None = None
    exhaustion_null_reason: str | None = None


class GpuSkuNode(BaseModel):
    sku_key: str
    gpu_model: str | None
    utilized_gpu_hours: Decimal
    realized_price_per_hour_usd: Decimal | None
    cost_per_hour_usd: Decimal | None
    gross_margin_per_hour_usd: Decimal | None
    margin_null_reason: str | None = None


class GpuCustomerNode(BaseModel):
    customer_id: str
    name: str
    segment: str | None
    consumed_gpu_hours: Decimal
    concentration_pct: Decimal | None


class GpuFlow(BaseModel):
    from_key: str = Field(alias="from")
    to_key: str = Field(alias="to")
    weight: Decimal
    metric: Literal["utilized_gpu_hours", "revenue_usd", "margin_usd", "risk_score"]

    model_config = {"populate_by_name": True}


class GpuTimePoint(BaseModel):
    ts: date
    utilization_pct: Decimal | None
    realized_margin_per_hour_usd: Decimal | None


class GpuCommandGraphFilters(BaseModel):
    period: MetricPeriod = "30D"
    region: str | None = None
    sku: str | None = None
    segment: str | None = None
    metric: Literal["utilization", "revenue", "margin", "risk"] = "utilization"


class GpuCommandGraphOut(BaseModel):
    env_id: str
    as_of: datetime
    filters: GpuCommandGraphFilters
    kpis: list[MetricBlock]
    regions: list[GpuRegionNode]
    sku_nodes: list[GpuSkuNode]
    customer_nodes: list[GpuCustomerNode]
    flows: list[GpuFlow]
    time_series: list[GpuTimePoint]
    exceptions: list[ReconciliationException]
    freshness: FreshnessReport


# ─────────────────────────────────────────────────────────────────────────────
# Customer 360
# ─────────────────────────────────────────────────────────────────────────────

class CustomerSummary(BaseModel):
    customer_id: str
    display_name: str
    segment: str | None
    contract_type: str | None
    account_status: str | None
    support_tier: str | None
    signup_date: date | None
    country: str | None
    salesforce_owner_id: str | None
    risk_flags: list[str] = Field(default_factory=list)
    mtd_usage_revenue_usd: Decimal | None
    mtd_recognized_revenue_usd: Decimal | None
    outstanding_ar_usd: Decimal | None
    open_tickets: int
    churn_risk_score: Decimal | None


class CustomerDetailOut(BaseModel):
    customer: CustomerSummary
    contract: dict[str, Any] | None = None
    daily_snapshots: list[dict[str, Any]] = Field(default_factory=list)
    recent_invoices: list[dict[str, Any]] = Field(default_factory=list)
    recent_payments: list[dict[str, Any]] = Field(default_factory=list)
    open_exceptions: list[ReconciliationException] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Sales / Operations / Data model
# ─────────────────────────────────────────────────────────────────────────────

class PipelineOpportunity(BaseModel):
    opportunity_id: str
    customer_id: str
    customer_name: str | None
    rep_key: str | None
    stage: str
    amount_usd: Decimal
    close_probability: int
    expected_close_date: date | None
    committed_capacity_usd: Decimal | None
    lost_reason: str | None


class SupportTicketOut(BaseModel):
    ticket_id: str
    customer_id: str
    category_key: str
    opened_at: datetime
    resolved_at: datetime | None
    severity: str
    sla_breached: bool
    region_key: str | None
    sku_key: str | None
    customer_satisfaction: Decimal | None


class IncidentOut(BaseModel):
    incident_id: str
    region_key: str
    sku_key: str | None
    started_at: datetime
    resolved_at: datetime | None
    severity: str
    customers_impacted: int
    root_cause: str | None


class MetricDefinition(BaseModel):
    key: str
    label: str
    formula: str
    primary_source: str
    joined_with: list[str] = Field(default_factory=list)
    null_rules: list[str] = Field(default_factory=list)
    refresh_cadence: str
