from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ReServicerStatus(str, Enum):
    performing = "performing"
    watchlist = "watchlist"
    special_servicing = "special_servicing"
    matured = "matured"
    paid_off = "paid_off"
    resolved = "resolved"


class ReEventType(str, Enum):
    payment_default = "payment_default"
    maturity_default = "maturity_default"
    covenant_breach = "covenant_breach"
    cash_trap = "cash_trap"
    valuation_change = "valuation_change"
    tenant_roll = "tenant_roll"
    inspection = "inspection"
    servicing_note = "servicing_note"
    other = "other"


class ReEventSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class ReWorkoutCaseStatus(str, Enum):
    open = "open"
    in_review = "in_review"
    negotiating = "negotiating"
    approved = "approved"
    closed = "closed"


class ReWorkoutActionStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class ReWorkoutActionType(str, Enum):
    collect_docs = "collect_docs"
    borrower_outreach = "borrower_outreach"
    site_inspection = "site_inspection"
    cashflow_reforecast = "cashflow_reforecast"
    term_sheet = "term_sheet"
    committee_memo = "committee_memo"
    forbearance = "forbearance"
    modification = "modification"
    note_sale = "note_sale"
    other = "other"


class ReTrustCreateRequest(BaseModel):
    business_id: UUID
    name: str = Field(min_length=1, max_length=250)
    external_ids: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class ReTrustOut(BaseModel):
    trust_id: UUID
    business_id: UUID
    name: str
    external_ids: dict[str, Any]
    created_by: str | None = None
    created_at: datetime


class RePropertyIn(BaseModel):
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str = "US"
    property_type: str | None = None
    square_feet: float | None = None
    unit_count: int | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class ReBorrowerIn(BaseModel):
    name: str = Field(min_length=1, max_length=250)
    sponsor: str | None = None
    contacts_json: list[dict[str, Any]] = Field(default_factory=list)


class ReLoanCreateRequest(BaseModel):
    business_id: UUID
    trust_id: UUID
    loan_identifier: str = Field(min_length=1, max_length=250)
    external_ids: dict[str, Any] = Field(default_factory=dict)
    original_balance_cents: int = 0
    current_balance_cents: int = 0
    rate_decimal: float | None = Field(default=None, ge=0, le=1)
    maturity_date: date | None = None
    servicer_status: ReServicerStatus = ReServicerStatus.performing
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    borrowers: list[ReBorrowerIn] = Field(default_factory=list)
    properties: list[RePropertyIn] = Field(default_factory=list)
    created_by: str | None = None


class ReLoanOut(BaseModel):
    loan_id: UUID
    trust_id: UUID
    business_id: UUID
    loan_identifier: str
    external_ids: dict[str, Any]
    original_balance_cents: int
    current_balance_cents: int
    rate_decimal: float | None = None
    maturity_date: date | None = None
    servicer_status: ReServicerStatus
    metadata_json: dict[str, Any]
    created_by: str | None = None
    created_at: datetime


class ReSurveillanceCreateRequest(BaseModel):
    business_id: UUID
    period_end_date: date
    metrics_json: dict[str, Any] = Field(default_factory=dict)
    dscr: float | None = None
    occupancy: float | None = Field(default=None, ge=0, le=1)
    noi_cents: int | None = None
    notes: str | None = None
    created_by: str | None = None


class ReSurveillanceOut(BaseModel):
    surveillance_id: UUID
    loan_id: UUID
    business_id: UUID
    period_end_date: date
    metrics_json: dict[str, Any]
    dscr: float | None = None
    occupancy: float | None = None
    noi_cents: int | None = None
    notes: str | None = None
    created_by: str | None = None
    created_at: datetime


class ReUnderwriteRunCreateRequest(BaseModel):
    business_id: UUID
    cap_rate: float | None = Field(default=None, gt=0, le=1)
    stabilized_noi_cents: int | None = None
    vacancy_factor: float | None = Field(default=None, ge=0, le=1)
    expense_growth: float | None = Field(default=None, ge=0, le=1)
    interest_rate: float | None = Field(default=None, ge=0, le=1)
    amortization_years: int | None = Field(default=None, ge=1, le=40)
    created_by: str | None = None
    document_ids: list[str] = Field(default_factory=list)


class ReUnderwriteRunOut(BaseModel):
    underwrite_run_id: UUID
    loan_id: UUID
    business_id: UUID
    execution_id: UUID | None = None
    run_at: datetime
    inputs_json: dict[str, Any]
    outputs_json: dict[str, Any]
    document_ids: list[str]
    diff_from_run_id: UUID | None = None
    created_by: str | None = None
    version: int
    created_at: datetime


class ReWorkoutCaseCreateRequest(BaseModel):
    business_id: UUID
    case_status: ReWorkoutCaseStatus = ReWorkoutCaseStatus.open
    assigned_to: str | None = None
    summary: str | None = None
    created_by: str | None = None


class ReWorkoutCaseOut(BaseModel):
    case_id: UUID
    loan_id: UUID
    business_id: UUID
    case_status: ReWorkoutCaseStatus
    opened_at: datetime
    closed_at: datetime | None = None
    assigned_to: str | None = None
    summary: str | None = None
    created_by: str | None = None
    created_at: datetime
    actions: list[dict[str, Any]] = Field(default_factory=list)


class ReWorkoutActionCreateRequest(BaseModel):
    business_id: UUID
    action_type: ReWorkoutActionType
    status: ReWorkoutActionStatus = ReWorkoutActionStatus.open
    due_date: date | None = None
    owner: str | None = None
    summary: str | None = None
    audit_log_json: dict[str, Any] = Field(default_factory=dict)
    document_ids: list[str] = Field(default_factory=list)
    created_by: str | None = None


class ReWorkoutActionOut(BaseModel):
    action_id: UUID
    case_id: UUID
    business_id: UUID
    action_type: ReWorkoutActionType
    status: ReWorkoutActionStatus
    due_date: date | None = None
    owner: str | None = None
    summary: str | None = None
    audit_log_json: dict[str, Any]
    document_ids: list[str]
    created_by: str | None = None
    created_at: datetime


class ReEventCreateRequest(BaseModel):
    business_id: UUID
    event_type: ReEventType
    event_date: date
    severity: ReEventSeverity = ReEventSeverity.low
    description: str = Field(min_length=1)
    document_ids: list[str] = Field(default_factory=list)
    created_by: str | None = None


class ReEventOut(BaseModel):
    event_id: UUID
    loan_id: UUID
    business_id: UUID
    event_type: ReEventType
    event_date: date
    severity: ReEventSeverity
    description: str
    document_ids: list[str]
    created_by: str | None = None
    created_at: datetime


class ReLoanDetailOut(BaseModel):
    loan: ReLoanOut
    borrowers: list[dict[str, Any]] = Field(default_factory=list)
    properties: list[dict[str, Any]] = Field(default_factory=list)
    latest_surveillance: dict[str, Any] | None = None

