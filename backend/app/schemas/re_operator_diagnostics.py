"""Pydantic schemas for the Operator Diagnostics endpoint.

Contract classes per field are explicit via `state_origin`:
  - authoritative : sourced from re_authoritative_snapshots.get_authoritative_state
  - operational   : sourced from re_asset_operating_qtr (non-authoritative)
  - profile       : sourced from re_asset_operator_profile (metadata)
  - derived       : computed from above; suppressed if inputs are null
  - fallback      : missing / unreleased — field is null and carries null_reason
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


FieldOrigin = Literal["authoritative", "operational", "profile", "derived", "fallback"]
AcuityType = Literal["AL", "IL", "MC", "SNF", "mixed"]
SizeBand = Literal["small", "mid", "large"]
ProvenanceSource = Literal["seed", "imported", "manual", "derived", "imported_gl"]
TrustStatus = Literal["trusted", "untrusted", "missing_source"]


class OperatorDiagnosticsPeerSet(BaseModel):
    """Cohort keys and sample size for the peer-delta computation on one asset."""
    acuity_type: AcuityType | None = None
    region: str | None = None
    size_band: SizeBand | None = None
    peer_count: int = 0


class OperatorDiagnosticsAssetSources(BaseModel):
    """Per-asset provenance so the UI can surface seed-vs-real at cell level."""
    operator_name_source: ProvenanceSource | None = None
    acuity_type_source: ProvenanceSource | None = None
    labor_cost_source: ProvenanceSource | None = None
    revenue_source: ProvenanceSource | None = None


class OperatorDiagnosticsAsset(BaseModel):
    asset_id: UUID
    name: str
    operator_name: str | None = None
    acuity_type: AcuityType | None = None
    size_band: SizeBand | None = None
    market: str | None = None
    units: int | None = None

    # authoritative
    noi: str | None = None
    occupancy: str | None = None

    # operational
    revenue: str | None = None
    labor_cost: str | None = None

    # derived
    noi_margin: str | None = None
    labor_intensity: str | None = None
    occupancy_trend_qoq: str | None = None
    peer_margin_delta: str | None = None

    # contract metadata
    state_origin: FieldOrigin = "fallback"
    snapshot_version: str | None = None
    period_exact: bool = False
    null_reasons: dict[str, str] = Field(default_factory=dict)
    sources: OperatorDiagnosticsAssetSources = Field(default_factory=OperatorDiagnosticsAssetSources)
    peer_set: OperatorDiagnosticsPeerSet = Field(default_factory=OperatorDiagnosticsPeerSet)


class OperatorDiagnosticsOperator(BaseModel):
    operator_name: str
    asset_count: int
    avg_noi_margin: str | None = None
    avg_occupancy: str | None = None
    avg_labor_intensity: str | None = None
    peer_margin_delta: str | None = None
    rank: int
    trust_status: TrustStatus = "missing_source"
    contains_seed_sources: bool = False


class OperatorDiagnosticsSummary(BaseModel):
    env_id: str
    quarter: str
    asset_count: int
    released_count: int
    avg_noi_margin: str | None = None
    avg_occupancy: str | None = None
    avg_labor_intensity: str | None = None
    avg_peer_delta: str | None = None
    state_origin: FieldOrigin = "derived"
    null_reasons: dict[str, str] = Field(default_factory=dict)


class OperatorDiagnosticsPeerSetDefinition(BaseModel):
    cohort_keys: list[str] = Field(default_factory=lambda: ["acuity_type", "region", "size_band"])
    min_sample: int = 3
    aggregation: Literal["mean"] = "mean"
    exclude_self: bool = True


class OperatorDiagnosticsAudit(BaseModel):
    snapshot_versions: list[str] = Field(default_factory=list)
    released_count: int = 0
    missing_count: int = 0
    peer_set_definition: OperatorDiagnosticsPeerSetDefinition = Field(
        default_factory=OperatorDiagnosticsPeerSetDefinition
    )
    peer_count_histogram: dict[str, int] = Field(default_factory=dict)
    metric_suppression_reasons: dict[str, dict[str, int]] = Field(default_factory=dict)
    source_provenance_counts: dict[str, dict[str, int]] = Field(default_factory=dict)
    demo_seed_present: bool = False
    authoritative_fixture_present: bool = False
    authoritative_fixture_snapshot_versions: list[str] = Field(default_factory=list)
    quarter: str
    requested_quarter: str
    generated_at: datetime


class OperatorDiagnosticsOut(BaseModel):
    summary: OperatorDiagnosticsSummary
    operators: list[OperatorDiagnosticsOperator] = Field(default_factory=list)
    assets: list[OperatorDiagnosticsAsset] = Field(default_factory=list)
    audit: OperatorDiagnosticsAudit
