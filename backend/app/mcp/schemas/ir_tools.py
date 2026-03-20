"""Schemas for IR (Investor Relations) MCP tools."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class DraftLpLetterInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to draft letter for")
    quarter: str = Field(description="Quarter YYYYQN (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    tone: str = Field(default="professional", description="Tone: professional, conservative, optimistic")


class GenerateCapitalStatementsInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to generate statements for")
    quarter: str = Field(description="Quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class GetDraftInput(BaseModel):
    model_config = {"extra": "ignore"}
    draft_id: str = Field(description="IR draft ID")


class ListDraftsInput(BaseModel):
    model_config = {"extra": "ignore"}
    business_id: str = Field(description="Business ID")
    fund_id: str | None = Field(default=None, description="Filter by fund")
    quarter: str | None = Field(default=None, description="Filter by quarter")
    status: str | None = Field(default=None, description="Filter: draft, pending_review, approved, rejected")
    limit: int = Field(default=50, ge=1, le=200)


class ApproveDraftInput(BaseModel):
    model_config = {"extra": "ignore"}
    draft_id: str = Field(description="IR draft ID to approve")
    actor: str = Field(default="gp_principal", description="Approver identity")
    notes: str | None = Field(default=None, description="Optional reviewer notes")
    confirm: bool = Field(default=False, description="Set true to execute approval")


class RejectDraftInput(BaseModel):
    model_config = {"extra": "ignore"}
    draft_id: str = Field(description="IR draft ID to reject")
    actor: str = Field(default="gp_principal", description="Reviewer identity")
    reason: str = Field(default="", description="Rejection reason")
    confirm: bool = Field(default=False, description="Set true to execute rejection")
