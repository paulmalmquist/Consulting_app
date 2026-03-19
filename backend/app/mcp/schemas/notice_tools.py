"""Schemas for capital call / distribution notice MCP tools."""
from __future__ import annotations

from pydantic import BaseModel, Field
from uuid import UUID


class GenerateCapitalCallNoticesInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to generate notices for")
    call_entry_id: UUID = Field(description="Capital ledger entry ID for the call event")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    confirm: bool = Field(False, description="Must be true to execute write")


class GenerateDistributionNoticesInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to generate notices for")
    distribution_entry_id: UUID = Field(description="Capital ledger entry ID for the distribution event")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    confirm: bool = Field(False, description="Must be true to execute write")
