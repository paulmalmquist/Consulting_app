from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class SusAuthoritativeMetricItem(BaseModel):
    metric_key: str
    value: Optional[float] = None
    unit: Optional[str] = None
    null_reason: Optional[str] = None
    trust_status: Optional[str] = None


class SusAuthoritativeEvidenceItem(BaseModel):
    metric_key: str
    source_table: Optional[str] = None
    source_row_ref: Optional[str] = None
    emission_factor_set_id: Optional[str] = None
    ingestion_run_id: Optional[str] = None
    formula_id: Optional[str] = None


class SusAuthoritativeStateResponse(BaseModel):
    entity_scope: Optional[str] = None
    period_key: Optional[str] = None
    requested_period_key: Optional[str] = None
    period_exact: Optional[bool] = None
    state_origin: Optional[str] = None
    snapshot_version: Optional[str] = None
    promotion_state: Optional[str] = None
    trust_status: Optional[str] = None
    null_reason: Optional[str] = None
    metrics: list[SusAuthoritativeMetricItem] = []
    evidence: list[SusAuthoritativeEvidenceItem] = []


class SusAuthoritativeMetricResponse(BaseModel):
    value: Optional[float] = None
    unit: Optional[str] = None
    null_reason: Optional[str] = None
    trust_status: Optional[str] = None
    snapshot_version: Optional[str] = None
    state_origin: Optional[str] = None


class SusAuthoritativeEvidenceResponse(BaseModel):
    evidence: list[SusAuthoritativeEvidenceItem] = []


class SusAuthoritativeContextMetricItem(BaseModel):
    metric_key: str
    value: Optional[float] = None
    unit: Optional[str] = None
    null_reason: Optional[str] = None


class SusAuthoritativeContextResponse(BaseModel):
    scope: Optional[str] = None
    period_key: Optional[str] = None
    snapshot_version: Optional[str] = None
    trust_status: Optional[str] = None
    null_reason: Optional[str] = None
    metrics: list[SusAuthoritativeContextMetricItem] = []


class SusAuthoritativeReportResponse(BaseModel):
    entity_scope: Optional[str] = None
    period_key: Optional[str] = None
    requested_period_key: Optional[str] = None
    period_exact: Optional[bool] = None
    metric_family: Optional[str] = None
    state_origin: Optional[str] = None
    snapshot_version: Optional[str] = None
    promotion_state: Optional[str] = None
    trust_status: Optional[str] = None
    null_reason: Optional[str] = None
    metrics: list[SusAuthoritativeMetricItem] = []
    evidence: list[SusAuthoritativeEvidenceItem] = []
    generated_at: Optional[str] = None
