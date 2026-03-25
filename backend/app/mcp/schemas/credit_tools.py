"""Schemas for credit decisioning MCP tools."""

from pydantic import BaseModel, Field
from uuid import UUID

from app.mcp.schemas.repe_tools import ToolScopeInput, ResolvedScopeInput


# ── Read tool inputs ──────────────────────────────────────────────

class ListPortfoliosInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class GetPortfolioInput(BaseModel):
    model_config = {"extra": "forbid"}
    portfolio_id: UUID | None = Field(default=None, description="Portfolio ID to retrieve")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ListLoansInput(BaseModel):
    model_config = {"extra": "forbid"}
    portfolio_id: UUID | None = Field(default=None, description="Portfolio ID to list loans for")
    status: str | None = Field(default=None, description="Filter by loan status")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class GetLoanInput(BaseModel):
    model_config = {"extra": "forbid"}
    loan_id: UUID | None = Field(default=None, description="Loan ID to retrieve")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ListDecisionsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class GetDecisionInput(BaseModel):
    model_config = {"extra": "forbid"}
    decision_log_id: UUID = Field(description="Decision log ID to retrieve")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ListExceptionsInput(BaseModel):
    model_config = {"extra": "forbid"}
    status: str | None = Field(default=None, description="Filter: open, assigned, in_review, resolved, escalated")
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class GetExceptionInput(BaseModel):
    model_config = {"extra": "forbid"}
    exception_id: UUID = Field(description="Exception ID to retrieve")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ListPoliciesInput(BaseModel):
    model_config = {"extra": "forbid"}
    portfolio_id: UUID | None = Field(default=None, description="Filter by portfolio")
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class SearchCorpusInput(BaseModel):
    model_config = {"extra": "forbid"}
    query: str = Field(description="Search query for corpus passages")
    document_type: str | None = Field(default=None, description="Filter by document type")
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ListAuditRecordsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class GetEnvironmentSnapshotInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


# ── Write tool inputs ─────────────────────────────────────────────

class CreatePortfolioInput(BaseModel):
    model_config = {"extra": "ignore"}
    confirmed: bool = Field(default=False, description="Must be true to execute.")
    name: str | None = Field(default=None, description="Portfolio name (required)")
    product_type: str | None = Field(default=None, description="auto, personal, credit_card, mortgage, student, heloc, other")
    origination_channel: str | None = Field(default=None, description="direct, broker, correspondent, fintech_partner, wholesale, other")
    servicer: str | None = Field(default=None, description="Servicer name")
    vintage_quarter: str | None = Field(default=None, description="e.g. 2025-Q1")
    target_fico_min: int | None = None
    target_fico_max: int | None = None
    target_dti_max: float | None = None
    target_ltv_max: float | None = None
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class CreateLoanInput(BaseModel):
    model_config = {"extra": "ignore"}
    confirmed: bool = Field(default=False, description="Must be true to execute.")
    portfolio_id: UUID | None = Field(default=None, description="Portfolio ID (required)")
    borrower_id: UUID | None = Field(default=None, description="Borrower ID (required)")
    loan_ref: str | None = Field(default=None, description="Loan reference (required)")
    original_balance: float | None = Field(default=None, description="Original balance")
    interest_rate: float | None = None
    term_months: int | None = None
    collateral_type: str | None = None
    collateral_value: float | None = None
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class EvaluateLoanInput(BaseModel):
    model_config = {"extra": "ignore"}
    confirmed: bool = Field(default=False, description="Must be true to execute.")
    loan_id: UUID | None = Field(default=None, description="Loan ID to evaluate (required)")
    policy_id: UUID | None = Field(default=None, description="Policy ID — auto-resolved to active policy if omitted")
    operator_id: str = Field(default="system", description="Operator performing evaluation")
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ResolveExceptionInput(BaseModel):
    model_config = {"extra": "ignore"}
    confirmed: bool = Field(default=False, description="Must be true to execute.")
    exception_id: UUID | None = Field(default=None, description="Exception ID to resolve (required)")
    resolution: str | None = Field(default=None, description="approved, declined, modified, escalated, withdrawn")
    resolution_note: str | None = Field(default=None, description="Resolution explanation")
    assigned_to: str | None = None
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class IngestDocumentInput(BaseModel):
    model_config = {"extra": "ignore"}
    confirmed: bool = Field(default=False, description="Must be true to execute.")
    document_ref: str | None = Field(default=None, description="Document reference (required)")
    title: str | None = Field(default=None, description="Document title (required)")
    document_type: str = Field(default="policy", description="policy, procedure, rate_sheet, regulatory_guidance, etc.")
    passages: list[dict] = Field(default_factory=list, description="List of passages with passage_ref and content_text")
    effective_from: str | None = None
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class CreatePolicyInput(BaseModel):
    model_config = {"extra": "ignore"}
    confirmed: bool = Field(default=False, description="Must be true to execute.")
    name: str | None = Field(default=None, description="Policy name (required)")
    portfolio_id: UUID | None = Field(default=None, description="Portfolio to attach policy to")
    policy_type: str = Field(default="underwriting", description="underwriting, modification, collection, exception_handling")
    rules_json: list[dict] = Field(default_factory=list, description="Policy rules array")
    is_active: bool = Field(default=False, description="Whether to activate immediately")
    effective_from: str | None = None
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None
