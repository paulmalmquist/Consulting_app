"""Schemas for LP report MCP tools."""
from __future__ import annotations

from pydantic import BaseModel, Field
from uuid import UUID


class AssembleLpReportInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to generate LP report for")
    quarter: str = Field(description="Report quarter YYYYQN (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class GenerateGpNarrativeInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to generate narrative for")
    quarter: str = Field(description="Report quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
