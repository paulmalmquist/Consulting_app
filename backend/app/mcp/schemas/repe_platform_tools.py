"""Schemas for REPE platform MCP tools (approvals, saved analyses, documents)."""
from __future__ import annotations


from pydantic import BaseModel, Field


class ListApprovalsInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    status: str | None = Field(default=None, description="Filter: pending/approved/rejected")
    limit: int = Field(default=50, description="Max results")


class SaveAnalysisInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    title: str = Field(description="Analysis title")
    description: str | None = Field(default=None, description="Description")
    nl_prompt: str | None = Field(default=None, description="Original natural language prompt")
    visualization_spec: dict | None = Field(default=None, description="Chart/viz configuration")


class ListSavedAnalysesInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    limit: int = Field(default=50, description="Max results")


class ListDocumentsInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    classification: str | None = Field(default=None, description="Filter: subscription/side_letter/loan/other")
    entity_type: str | None = Field(default=None, description="Filter by linked entity type")
    entity_id: str | None = Field(default=None, description="Filter by linked entity ID")
    limit: int = Field(default=50, description="Max results")
