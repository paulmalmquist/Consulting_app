"""The ONE shared provider observation model. All four adapters normalize to this.

Provider-specific detail goes into ``raw_summary`` (a nested dict), never into new
core fields — that keeps PR 4 (recommendations) from fragmenting into four bespoke
shapes.
"""
from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class CloudProvider(StrEnum):
    SNOWFLAKE = "snowflake"
    DATABRICKS = "databricks"
    GCP = "gcp"
    AWS = "aws"


class ProviderStatus(StrEnum):
    CONFIGURED = "configured"        # adapter saw usable read-only telemetry
    NOT_CONFIGURED = "not_configured"  # no CLI/auth/account/project/workspace/region
    UNAVAILABLE = "unavailable"      # configured-ish but the read failed / returned nothing


class ProviderInventoryObservation(BaseModel):
    """One normalized read-only observation of a provider resource (or of the
    provider's overall config status when no resources are listed)."""

    provider: CloudProvider
    account_or_workspace: str | None = None
    region: str | None = None
    resource_type: str | None = None        # warehouse | job | cluster | dataset | glue_job | emr_cluster | ...
    resource_id: str | None = None
    display_name: str | None = None
    observed_at: str | None = None          # ISO ts of the read; None when nothing was read
    evidence_source: str                    # e.g. "snowflake ACCOUNT_USAGE.WAREHOUSE_LOAD_HISTORY (mocked)"
    status: ProviderStatus
    null_reason: str | None = None          # why not_configured/unavailable; None when configured

    # Availability of downstream observation dimensions — PR 3 reports what COULD
    # be observed read-only; it does not compute or optimize anything.
    runtime_observation_available: bool = False
    cost_observation_available: bool = False
    freshness_observation_available: bool = False
    rightsizing_candidate_available: bool = False  # always False in PR 3 (no optimization)

    raw_summary: dict = Field(default_factory=dict)  # provider-specific detail lives here only

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")


class ProviderConfigStatus(BaseModel):
    """Per-provider rollup for scan_pipelines / the console: is this provider's
    telemetry configured, and which read-only observation dimensions are available."""

    provider: CloudProvider
    status: ProviderStatus
    null_reason: str | None = None
    resource_count: int = 0
    runtime_observation_available: bool = False
    cost_observation_available: bool = False
    freshness_observation_available: bool = False
    evidence_source: str | None = None

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")
