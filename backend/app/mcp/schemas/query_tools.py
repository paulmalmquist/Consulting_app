"""Schemas for the natural language query MCP tool."""

from pydantic import BaseModel, Field
from uuid import UUID


class NlQueryInput(BaseModel):
    model_config = {"extra": "forbid"}

    prompt: str = Field(
        ...,
        description="Natural language question about REPE data (e.g. 'Show NOI by asset', 'recalculate IRR')",
    )
    business_id: UUID = Field(
        ...,
        description="Business/tenant UUID for data scoping",
    )
    env_id: UUID | None = Field(
        default=None,
        description="Environment UUID (optional)",
    )
    quarter: str | None = Field(
        default=None,
        description="Quarter context (e.g. '2025Q4'). Defaults to latest available.",
    )


class ReadonlySqlWithContractInput(BaseModel):
    model_config = {"extra": "forbid"}

    sql_text: str = Field(..., description="Readonly SELECT SQL to execute")
    declared_purpose: str = Field(..., description="Why this SQL is needed")
    capability_key: str = Field(..., description="Registered REPE capability key")
    env_id: str | None = Field(default=None, description="Active environment id")
    business_id: UUID | None = Field(default=None, description="Business/tenant UUID")
    timeout_ms: int = Field(default=10_000, ge=100, le=60_000)
