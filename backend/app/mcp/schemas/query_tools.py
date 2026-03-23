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
