from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------

class CreditV2ContextOut(BaseModel):
    env_id: str
    business_id: UUID
    credit_initialized: bool
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class CreditV2ContextInitRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None


# ---------------------------------------------------------------------------
# Portfolio
# ---------------------------------------------------------------------------

class PortfolioCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    product_type: str = "other"
    origination_channel: str = "direct"
    servicer: str | None = None
    vintage_quarter: str | None = None
    target_fico_min: int | None = None
    target_fico_max: int | None = None
    target_dti_max: Decimal | None = None
    target_ltv_max: Decimal | None = None
    target_segments_json: list[str] = Field(default_factory=list)
    target_geographies_json: list[str] = Field(default_factory=list)
    created_by: str | None = None


class PortfolioOut(BaseModel):
    portfolio_id: UUID
    env_id: UUID
    business_id: UUID
    name: str
    product_type: str
    origination_channel: str
    servicer: str | None = None
    currency_code: str = "USD"
    status: str
    vintage_quarter: str | None = None
    target_fico_min: int | None = None
    target_fico_max: int | None = None
    target_dti_max: Decimal | None = None
    target_ltv_max: Decimal | None = None
    target_segments_json: list[Any] = Field(default_factory=list)
    target_geographies_json: list[Any] = Field(default_factory=list)
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    loan_count: int = 0
    total_upb: Decimal = Decimal("0")
    created_at: datetime
    updated_at: datetime


class PortfolioUpdateRequest(BaseModel):
    name: str | None = None
    status: str | None = None
    servicer: str | None = None
    target_fico_min: int | None = None
    target_fico_max: int | None = None
    target_dti_max: Decimal | None = None
    target_ltv_max: Decimal | None = None


# ---------------------------------------------------------------------------
# Borrower
# ---------------------------------------------------------------------------

class BorrowerCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    borrower_ref: str = Field(min_length=1, max_length=120)
    fico_at_origination: int | None = None
    dti_at_origination: Decimal | None = None
    income_verified: bool = False
    annual_income: Decimal | None = None
    employment_length_months: int | None = None
    housing_status: str | None = None
    state_code: str | None = None
    attributes_json: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class BorrowerOut(BaseModel):
    borrower_id: UUID
    env_id: UUID
    business_id: UUID
    borrower_ref: str
    fico_at_origination: int | None = None
    dti_at_origination: Decimal | None = None
    income_verified: bool
    annual_income: Decimal | None = None
    employment_length_months: int | None = None
    housing_status: str | None = None
    state_code: str | None = None
    attributes_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Loan
# ---------------------------------------------------------------------------

class LoanCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    portfolio_id: UUID
    borrower_id: UUID
    loan_ref: str = Field(min_length=1, max_length=120)
    origination_date: date | None = None
    maturity_date: date | None = None
    original_balance: Decimal = Field(default=Decimal("0"), ge=0)
    current_balance: Decimal | None = None
    interest_rate: Decimal | None = None
    apr: Decimal | None = None
    term_months: int | None = None
    remaining_term_months: int | None = None
    loan_status: str = "current"
    risk_grade: str | None = None
    collateral_type: str | None = None
    collateral_value: Decimal | None = None
    ltv_at_origination: Decimal | None = None
    payment_amount: Decimal | None = None
    payment_frequency: str = "monthly"
    attributes_json: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class LoanOut(BaseModel):
    loan_id: UUID
    env_id: UUID
    business_id: UUID
    portfolio_id: UUID
    borrower_id: UUID
    loan_ref: str
    origination_date: date | None = None
    maturity_date: date | None = None
    original_balance: Decimal
    current_balance: Decimal
    interest_rate: Decimal | None = None
    apr: Decimal | None = None
    term_months: int | None = None
    remaining_term_months: int | None = None
    loan_status: str
    delinquency_bucket: str
    risk_grade: str | None = None
    collateral_type: str | None = None
    collateral_value: Decimal | None = None
    ltv_at_origination: Decimal | None = None
    payment_amount: Decimal | None = None
    payment_frequency: str
    attributes_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    # Joined fields (optional)
    borrower_ref: str | None = None
    fico_at_origination: int | None = None


# ---------------------------------------------------------------------------
# Loan Event
# ---------------------------------------------------------------------------

class LoanEventCreateRequest(BaseModel):
    env_id: str | None = None
    loan_id: UUID | None = None
    event_date: date
    event_type: str
    principal_amount: Decimal = Decimal("0")
    interest_amount: Decimal = Decimal("0")
    fee_amount: Decimal = Decimal("0")
    balance_after: Decimal | None = None
    delinquency_days: int | None = None
    memo: str | None = None
    created_by: str | None = None


class LoanEventOut(BaseModel):
    loan_event_id: UUID
    env_id: UUID
    loan_id: UUID
    event_date: date
    event_type: str
    principal_amount: Decimal
    interest_amount: Decimal
    fee_amount: Decimal
    total_amount: Decimal | None = None
    balance_after: Decimal | None = None
    delinquency_days: int | None = None
    memo: str | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Decision Policy
# ---------------------------------------------------------------------------

class PolicyCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    portfolio_id: UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    policy_type: str = "underwriting"
    rules_json: list[dict[str, Any]] = Field(default_factory=list)
    is_active: bool = False
    effective_from: date | None = None
    effective_to: date | None = None
    created_by: str | None = None


class PolicyOut(BaseModel):
    policy_id: UUID
    env_id: UUID
    business_id: UUID
    portfolio_id: UUID | None = None
    name: str
    policy_type: str
    version_no: int
    rules_json: list[dict[str, Any]] = Field(default_factory=list)
    is_active: bool
    effective_from: date | None = None
    effective_to: date | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class PolicyActivateRequest(BaseModel):
    is_active: bool = True


# ---------------------------------------------------------------------------
# Evaluate / Decision Log
# ---------------------------------------------------------------------------

class EvaluateLoanRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    loan_id: UUID
    policy_id: UUID | None = None
    operator_id: str = "system"


class DecisionLogOut(BaseModel):
    decision_log_id: UUID
    env_id: UUID
    business_id: UUID
    loan_id: UUID | None = None
    policy_id: UUID
    policy_version_no: int
    decision: str
    rules_evaluated_json: list[dict[str, Any]] = Field(default_factory=list)
    explanation: str
    adverse_action_reasons: list[Any] = Field(default_factory=list)
    input_snapshot_json: dict[str, Any] = Field(default_factory=dict)
    citation_chain_json: list[dict[str, Any]] = Field(default_factory=list)
    chain_status: str
    reasoning_steps_json: list[dict[str, Any]] = Field(default_factory=list)
    format_lock: str | None = None
    schema_valid: bool
    decided_by: str
    override_reason: str | None = None
    latency_ms: int | None = None
    decided_at: datetime
    created_at: datetime
    # Joined fields (optional)
    policy_name: str | None = None
    loan_ref: str | None = None
    borrower_ref: str | None = None


# ---------------------------------------------------------------------------
# Exception Queue
# ---------------------------------------------------------------------------

class ExceptionQueueOut(BaseModel):
    exception_id: UUID
    env_id: UUID
    business_id: UUID
    loan_id: UUID | None = None
    decision_log_id: UUID
    route_to: str
    priority: str
    reason: str
    failing_rules_json: list[dict[str, Any]] = Field(default_factory=list)
    recommended_action: str | None = None
    status: str
    assigned_to: str | None = None
    resolution: str | None = None
    resolution_note: str | None = None
    resolution_citation_json: list[dict[str, Any]] = Field(default_factory=list)
    sla_deadline: datetime | None = None
    opened_at: datetime
    assigned_at: datetime | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Joined fields (optional)
    loan_ref: str | None = None
    borrower_ref: str | None = None


class ExceptionResolveRequest(BaseModel):
    resolution: str
    resolution_note: str | None = None
    assigned_to: str | None = None
    resolution_citation_json: list[dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Corpus (Walled Garden)
# ---------------------------------------------------------------------------

class CorpusPassageInput(BaseModel):
    passage_ref: str = Field(min_length=1, max_length=120)
    section_path: str | None = None
    content_text: str = Field(min_length=1)
    token_count: int | None = None


class CorpusDocumentCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    document_ref: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=400)
    document_type: str = "policy"
    effective_from: date | None = None
    effective_to: date | None = None
    passages: list[CorpusPassageInput] = Field(default_factory=list)
    created_by: str | None = None


class CorpusDocumentOut(BaseModel):
    document_id: UUID
    env_id: UUID
    business_id: UUID
    document_ref: str
    title: str
    document_type: str
    version_no: int
    effective_from: date | None = None
    effective_to: date | None = None
    passage_count: int
    status: str
    ingested_at: datetime


class CorpusPassageOut(BaseModel):
    passage_id: UUID
    document_id: UUID
    passage_ref: str
    section_path: str | None = None
    content_text: str
    token_count: int | None = None
    created_at: datetime


class CorpusSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    document_type: str | None = None
    limit: int = Field(default=20, ge=1, le=100)


class CorpusSearchResult(BaseModel):
    passage_id: UUID
    document_id: UUID
    document_ref: str
    document_title: str
    passage_ref: str
    section_path: str | None = None
    content_text: str
    relevance: str = "match"


# ---------------------------------------------------------------------------
# Scenario
# ---------------------------------------------------------------------------

class ScenarioCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    portfolio_id: UUID
    name: str = Field(min_length=1, max_length=200)
    scenario_type: str = "base"
    is_base: bool = False
    assumptions_json: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class ScenarioOut(BaseModel):
    scenario_id: UUID
    env_id: UUID
    business_id: UUID
    portfolio_id: UUID
    name: str
    scenario_type: str
    is_base: bool
    assumptions_json: dict[str, Any] = Field(default_factory=dict)
    status: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Audit Record
# ---------------------------------------------------------------------------

class AuditRecordOut(BaseModel):
    audit_record_id: UUID
    env_id: UUID
    business_id: UUID
    query_id: UUID | None = None
    query_text: str | None = None
    operator_id: str
    mode: str
    timestamp_start: datetime
    timestamp_end: datetime | None = None
    latency_ms: int | None = None
    reasoning_steps_json: list[dict[str, Any]] = Field(default_factory=list)
    citation_chains_json: list[dict[str, Any]] = Field(default_factory=list)
    final_output_json: dict[str, Any] = Field(default_factory=dict)
    suppressed: bool
    format_lock: str | None = None
    schema_valid: bool | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

class CreditSeedRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    portfolio_name: str | None = None
    loan_count: int = Field(default=10, ge=1, le=200)


class CreditSeedOut(BaseModel):
    business_id: UUID
    portfolios: list[UUID] = Field(default_factory=list)
    loans: int = 0
    borrowers: int = 0
    policies: int = 0
    decisions: int = 0
    corpus_documents: int = 0
    audit_records: int = 0


# ---------------------------------------------------------------------------
# Environment Snapshot (KPIs)
# ---------------------------------------------------------------------------

class CreditEnvironmentSnapshot(BaseModel):
    portfolio_count: int = 0
    total_upb: Decimal = Decimal("0")
    total_loan_count: int = 0
    dq_30plus_rate: Decimal = Decimal("0")
    dq_60plus_rate: Decimal = Decimal("0")
    dq_90plus_rate: Decimal = Decimal("0")
    net_loss_rate: Decimal = Decimal("0")
    exception_queue_depth: int = 0
    open_exception_count: int = 0
    corpus_document_count: int = 0
    policy_count: int = 0
    decision_count: int = 0
