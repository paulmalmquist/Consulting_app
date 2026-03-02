from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PdsContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class PdsProjectCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    program_id: UUID | None = None
    name: str = Field(min_length=2, max_length=240)
    project_code: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=4000)
    sector: str | None = Field(default=None, min_length=1, max_length=120)
    project_type: str | None = Field(default=None, min_length=1, max_length=120)
    stage: str = "planning"
    status: str = "active"
    project_manager: str | None = None
    start_date: date | None = None
    target_end_date: date | None = None
    approved_budget: Decimal = Field(default=Decimal("0"), ge=0)
    contingency_budget: Decimal = Field(default=Decimal("0"), ge=0)
    next_milestone_date: date | None = None
    currency_code: str = Field(default="USD", min_length=3, max_length=8)
    baseline_period: str | None = Field(default=None, min_length=5, max_length=20)
    baseline_lines: list["PdsBudgetLineIn"] = Field(default_factory=list)
    created_by: str | None = None


class PdsProjectOut(BaseModel):
    project_id: UUID
    env_id: UUID
    business_id: UUID
    program_id: UUID | None = None
    name: str
    project_code: str | None = None
    description: str | None = None
    sector: str | None = None
    project_type: str | None = None
    stage: str
    start_date: date | None = None
    target_end_date: date | None = None
    project_manager: str | None = None
    approved_budget: Decimal
    committed_amount: Decimal
    spent_amount: Decimal
    forecast_at_completion: Decimal
    contingency_budget: Decimal
    contingency_remaining: Decimal
    pending_change_order_amount: Decimal
    next_milestone_date: date | None = None
    risk_score: Decimal
    currency_code: str
    status: str
    created_at: datetime
    updated_at: datetime


class PdsProjectUpdateRequest(BaseModel):
    project_code: str | None = Field(default=None, min_length=1, max_length=80)
    name: str | None = Field(default=None, min_length=2, max_length=240)
    description: str | None = Field(default=None, max_length=4000)
    sector: str | None = Field(default=None, min_length=1, max_length=120)
    project_type: str | None = Field(default=None, min_length=1, max_length=120)
    stage: str | None = None
    status: str | None = None
    project_manager: str | None = None
    start_date: date | None = None
    target_end_date: date | None = None
    approved_budget: Decimal | None = Field(default=None, ge=0)
    contingency_budget: Decimal | None = Field(default=None, ge=0)
    next_milestone_date: date | None = None
    currency_code: str | None = Field(default=None, min_length=3, max_length=8)
    updated_by: str | None = None


class PdsBudgetLineIn(BaseModel):
    cost_code: str = Field(min_length=1, max_length=80)
    line_label: str = Field(min_length=1, max_length=240)
    approved_amount: Decimal = Field(default=Decimal("0"), ge=0)


class PdsBudgetBaselineRequest(BaseModel):
    period: str = Field(min_length=5, max_length=20)
    approved_budget: Decimal = Field(ge=0)
    lines: list[PdsBudgetLineIn] = Field(default_factory=list)
    created_by: str | None = None


class PdsBudgetRevisionRequest(BaseModel):
    period: str = Field(min_length=5, max_length=20)
    revision_ref: str = Field(min_length=1, max_length=120)
    amount_delta: Decimal
    reason: str | None = None
    status: str = "approved"
    created_by: str | None = None


class PdsContractCreateRequest(BaseModel):
    contract_number: str = Field(min_length=1, max_length=120)
    vendor_id: UUID | None = None
    vendor_name: str | None = None
    scope_description: str | None = None
    contract_value: Decimal = Field(default=Decimal("0"), ge=0)
    executed_date: date | None = None
    status: str = "active"
    created_by: str | None = None


class PdsCommitmentCreateRequest(BaseModel):
    period: str = Field(min_length=5, max_length=20)
    amount: Decimal
    contract_id: UUID | None = None
    created_by: str | None = None


class PdsChangeOrderCreateRequest(BaseModel):
    change_order_ref: str = Field(min_length=1, max_length=120)
    amount_impact: Decimal
    schedule_impact_days: int = 0
    approval_required: bool = True
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class PdsChangeOrderApproveRequest(BaseModel):
    approved_by: str | None = None


class PdsInvoiceCreateRequest(BaseModel):
    invoice_number: str = Field(min_length=1, max_length=120)
    amount: Decimal
    invoice_date: date | None = None
    status: str = "approved"
    created_by: str | None = None


class PdsPaymentCreateRequest(BaseModel):
    payment_ref: str = Field(min_length=1, max_length=120)
    amount: Decimal
    payment_date: date | None = None
    invoice_id: UUID | None = None
    status: str = "paid"
    created_by: str | None = None


class PdsForecastCreateRequest(BaseModel):
    period: str = Field(min_length=5, max_length=20)
    forecast_to_complete: Decimal
    eac: Decimal
    status: str = "published"
    created_by: str | None = None


class PdsMilestoneIn(BaseModel):
    milestone_name: str = Field(min_length=1, max_length=240)
    baseline_date: date | None = None
    current_date: date | None = None
    actual_date: date | None = None
    slip_reason: str | None = None
    is_critical: bool = False


class PdsScheduleBaselineRequest(BaseModel):
    period: str = Field(min_length=5, max_length=20)
    milestones: list[PdsMilestoneIn] = Field(default_factory=list)
    created_by: str | None = None


class PdsScheduleUpdateRequest(BaseModel):
    period: str = Field(min_length=5, max_length=20)
    milestones: list[PdsMilestoneIn] = Field(default_factory=list)
    created_by: str | None = None


class PdsRiskCreateRequest(BaseModel):
    risk_title: str = Field(min_length=1, max_length=240)
    probability: Decimal = Field(ge=0, le=1)
    impact_amount: Decimal = Field(default=Decimal("0"), ge=0)
    impact_days: int = Field(default=0, ge=0)
    mitigation_owner: str | None = None
    status: str = "open"
    created_by: str | None = None


class PdsSurveyResponseCreateRequest(BaseModel):
    survey_template_id: UUID | None = None
    vendor_name: str | None = None
    respondent_type: str = Field(min_length=1, max_length=120)
    score: Decimal | None = Field(default=None, ge=0, le=5)
    responses_json: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class PdsSnapshotRunRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    period: str = Field(min_length=5, max_length=20)
    project_id: UUID | None = None
    run_id: str | None = None
    created_by: str | None = None


class PdsSnapshotRunOut(BaseModel):
    run_id: str
    env_id: UUID
    business_id: UUID
    period: str
    project_id: UUID | None = None
    snapshot_hash: str
    portfolio_snapshot_id: UUID
    schedule_snapshot_id: UUID
    risk_snapshot_id: UUID
    vendor_snapshot_ids: list[UUID] = Field(default_factory=list)


class PdsReportPackRunRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    period: str = Field(min_length=5, max_length=20)
    run_id: str | None = None
    created_by: str | None = None


class PdsReportPackRunOut(BaseModel):
    report_run_id: UUID
    env_id: UUID
    business_id: UUID
    period: str
    run_id: str
    snapshot_hash: str | None = None
    narrative_text: str | None = None
    artifact_refs_json: list[dict[str, Any]] = Field(default_factory=list)
    deterministic_deltas_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class PdsPortfolioOut(BaseModel):
    env_id: UUID
    business_id: UUID
    period: str
    approved_budget: Decimal
    committed: Decimal
    spent: Decimal
    eac: Decimal
    variance: Decimal
    contingency_remaining: Decimal
    open_change_order_count: int
    pending_approval_count: int
    top_risk_count: int


class PdsSiteReportCreateRequest(BaseModel):
    report_date: date
    summary: str | None = None
    blockers: str | None = None
    weather: str | None = None
    temperature_high: int | None = None
    temperature_low: int | None = None
    workers_on_site: int = Field(default=0, ge=0)
    work_performed: str | None = None
    delays: str | None = None
    safety_incidents: str | None = None
    created_by: str | None = None


class PdsRfiCreateRequest(BaseModel):
    rfi_number: str | None = Field(default=None, min_length=1, max_length=80)
    subject: str = Field(min_length=1, max_length=240)
    description: str | None = None
    assigned_to: str | None = None
    due_date: date | None = None
    priority: str = "normal"
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class PdsRfiUpdateRequest(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = None
    assigned_to: str | None = None
    due_date: date | None = None
    priority: str | None = None
    response_text: str | None = None
    status: str | None = None
    metadata_json: dict[str, Any] | None = None
    updated_by: str | None = None


class PdsSubmittalCreateRequest(BaseModel):
    vendor_id: UUID | None = None
    submittal_number: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = None
    spec_section: str | None = None
    required_date: date | None = None
    submitted_date: date | None = None
    reviewed_date: date | None = None
    review_notes: str | None = None
    status: str = "pending"
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class PdsDocumentCreateRequest(BaseModel):
    rfi_id: UUID | None = None
    submittal_id: UUID | None = None
    title: str = Field(min_length=1, max_length=240)
    document_type: str = Field(default="general", min_length=1, max_length=120)
    version_label: str | None = Field(default=None, max_length=80)
    storage_key: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class PdsVendorCreateRequest(BaseModel):
    vendor_name: str = Field(min_length=1, max_length=240)
    trade: str | None = None
    license_number: str | None = None
    insurance_expiry: date | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    status: str = "active"
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class PdsVendorUpdateRequest(BaseModel):
    vendor_name: str | None = Field(default=None, min_length=1, max_length=240)
    trade: str | None = None
    license_number: str | None = None
    insurance_expiry: date | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    status: str | None = None
    metadata_json: dict[str, Any] | None = None
    updated_by: str | None = None


PdsProjectCreateRequest.model_rebuild()
