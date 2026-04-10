from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


PromotionState = Literal["draft_audit", "verified", "released"]
TrustStatus = Literal["trusted", "untrusted", "missing_source"]
EntityType = Literal["asset", "investment", "fund"]
StateOrigin = Literal["authoritative", "derived", "fallback"]


class ReAuthoritativeStateOut(BaseModel):
    entity_type: EntityType
    entity_id: UUID
    quarter: str
    requested_quarter: str
    period_exact: bool
    state_origin: StateOrigin
    audit_run_id: UUID | None = None
    snapshot_version: str | None = None
    promotion_state: PromotionState | None = None
    trust_status: TrustStatus
    breakpoint_layer: str | None = None
    null_reason: str | None = None
    state: dict[str, Any] | None = None
    null_reasons: dict[str, Any] = Field(default_factory=dict)
    formulas: dict[str, Any] = Field(default_factory=dict)
    provenance: list[dict[str, Any]] = Field(default_factory=list)
    artifact_paths: dict[str, Any] = Field(default_factory=dict)


class ReAuthoritativeGrossToNetOut(BaseModel):
    fund_id: UUID
    quarter: str
    requested_quarter: str
    period_exact: bool
    state_origin: StateOrigin
    audit_run_id: UUID | None = None
    snapshot_version: str | None = None
    promotion_state: PromotionState | None = None
    trust_status: TrustStatus
    breakpoint_layer: str | None = None
    null_reason: str | None = None
    gross_return_amount: str | None = None
    management_fees: str | None = None
    fund_expenses: str | None = None
    net_return_amount: str | None = None
    bridge_items: list[dict[str, Any]] = Field(default_factory=list)
    null_reasons: dict[str, Any] = Field(default_factory=dict)
    formulas: dict[str, Any] = Field(default_factory=dict)
    provenance: list[dict[str, Any]] = Field(default_factory=list)
    artifact_paths: dict[str, Any] = Field(default_factory=dict)


class ReAuthoritativeSnapshotRunOut(BaseModel):
    audit_run_id: UUID
    snapshot_version: str
    env_id: str
    business_id: UUID
    methodology_version: str
    sample_manifest: dict[str, Any] = Field(default_factory=dict)
    artifact_root: str | None = None
    run_status: str
    findings_summary: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None
    verified_at: datetime | None = None
    verified_by: str | None = None
    released_at: datetime | None = None
    released_by: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
