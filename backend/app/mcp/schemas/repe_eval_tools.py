"""Schemas for REPE Winston eval capability MCP tools."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class ResolveRepeContextInput(BaseModel):
    model_config = {"extra": "forbid"}

    env_id: str = Field(..., description="Active environment id")
    business_id: UUID = Field(..., description="Business/tenant id")
    query: str = Field(..., description="Entity name or search text")
    entity_type: str | None = Field(default=None, description="Optional fund/deal/asset/entity filter")


class GetAuthoritativeFundSnapshotsInput(BaseModel):
    model_config = {"extra": "forbid"}

    env_id: str
    business_id: UUID
    fund_ids: list[UUID] | None = None
    quarter: str | None = None
    released_only: bool = True


class RankFundsByMetricChangeInput(BaseModel):
    model_config = {"extra": "forbid"}

    env_id: str
    business_id: UUID
    metric_key: str = "nav"
    ranking_basis: str = "absolute_change"
    comparison_window_policy: str = "min_to_max_released_no_gaps"
    fund_id: UUID | None = None


class GetMetricProvenanceInput(BaseModel):
    model_config = {"extra": "forbid"}

    env_id: str
    business_id: UUID
    metric_key: str
    entity_type: str
    entity_id: UUID
    period: str = Field(..., description="Quarter label such as 2026Q2")


class ExplainUnavailableMetricInput(BaseModel):
    model_config = {"extra": "forbid"}

    env_id: str
    metric_key: str
    entity_type: str
    entity_id: UUID
    period: str = Field(..., description="Date string accepted by Postgres, e.g. 2026-04-01")
