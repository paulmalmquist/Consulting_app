from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class LegalOpsContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class LegalMatterCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    matter_number: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=240)
    matter_type: str = Field(min_length=1, max_length=120)
    related_entity_type: str | None = None
    related_entity_id: UUID | None = None
    counterparty: str | None = None
    outside_counsel: str | None = None
    internal_owner: str | None = None
    risk_level: str = "medium"
    budget_amount: Decimal = Field(default=Decimal("0"), ge=0)
    status: str = "open"
    created_by: str | None = None


class LegalMatterOut(BaseModel):
    matter_id: UUID
    env_id: UUID
    business_id: UUID
    matter_number: str
    title: str
    matter_type: str
    related_entity_type: str | None = None
    related_entity_id: UUID | None = None
    counterparty: str | None = None
    outside_counsel: str | None = None
    internal_owner: str | None = None
    risk_level: str
    budget_amount: Decimal
    actual_spend: Decimal
    status: str
    created_at: datetime
    updated_at: datetime


class LegalContractCreateRequest(BaseModel):
    contract_ref: str = Field(min_length=1, max_length=120)
    contract_type: str = Field(min_length=1, max_length=120)
    counterparty_name: str | None = None
    effective_date: date | None = None
    expiration_date: date | None = None
    governing_law: str | None = None
    auto_renew: bool = False
    status: str = "draft"
    created_by: str | None = None


class LegalDeadlineCreateRequest(BaseModel):
    deadline_type: str = Field(min_length=1, max_length=120)
    due_date: date
    status: str = "open"
    created_by: str | None = None


class LegalApprovalCreateRequest(BaseModel):
    approval_type: str = Field(min_length=1, max_length=120)
    approver: str | None = None
    status: str = "pending"
    created_by: str | None = None


class LegalSpendEntryCreateRequest(BaseModel):
    outside_counsel: str | None = None
    invoice_ref: str | None = None
    amount: Decimal = Field(ge=0)
    incurred_date: date | None = None
    created_by: str | None = None


# ── Expansion schemas ────────────────────────────────────────────────────────

class LegalFirmCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    firm_name: str = Field(min_length=1, max_length=240)
    primary_contact: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    billing_rates_json: dict[str, Any] = Field(default_factory=dict)
    specialties: list[str] = Field(default_factory=list)
    status: str = "active"
    created_by: str | None = None


class LegalFirmOut(BaseModel):
    firm_id: UUID
    env_id: UUID
    business_id: UUID
    firm_name: str
    primary_contact: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    specialties: list[str] = []
    performance_rating: Decimal | None = None
    status: str
    matter_count: int = 0
    ytd_spend: Decimal = Decimal("0")
    created_at: datetime
    updated_at: datetime


class LegalContractOut(BaseModel):
    legal_contract_id: UUID
    env_id: UUID
    business_id: UUID
    matter_id: UUID | None = None
    contract_ref: str
    contract_type: str
    counterparty_name: str | None = None
    effective_date: date | None = None
    expiration_date: date | None = None
    governing_law: str | None = None
    auto_renew: bool
    status: str
    created_at: datetime
    updated_at: datetime


class LegalRegulatoryItemOut(BaseModel):
    regulatory_item_id: UUID
    env_id: UUID
    business_id: UUID
    agency: str
    regulation_ref: str | None = None
    obligation_text: str
    deadline: date | None = None
    frequency: str | None = None
    owner: str | None = None
    status: str
    created_at: datetime


class LegalGovernanceItemOut(BaseModel):
    governance_item_id: UUID
    env_id: UUID
    business_id: UUID
    item_type: str
    title: str
    scheduled_date: date | None = None
    status: str
    owner: str | None = None
    entity_name: str | None = None
    created_at: datetime


class LegalSpendEntryOut(BaseModel):
    legal_spend_entry_id: UUID
    env_id: UUID
    business_id: UUID
    matter_id: UUID
    matter_number: str | None = None
    matter_title: str | None = None
    outside_counsel: str | None = None
    invoice_ref: str | None = None
    amount: Decimal
    incurred_date: date | None = None
    created_at: datetime


class LegalLitigationCaseOut(BaseModel):
    litigation_case_id: UUID
    env_id: UUID
    business_id: UUID
    matter_id: UUID
    matter_number: str | None = None
    matter_title: str | None = None
    jurisdiction: str | None = None
    claims: str | None = None
    exposure_estimate: Decimal
    reserve_amount: Decimal
    insurance_carrier: str | None = None
    status: str
    created_at: datetime


class LegalDashboardKpis(BaseModel):
    open_matters: int
    high_risk_matters: int
    litigation_exposure: Decimal
    contracts_pending_review: int
    contracts_expiring_soon: int
    regulatory_deadlines_30d: int
    outside_counsel_spend_ytd: Decimal
    total_budget: Decimal


class LegalDashboard(BaseModel):
    kpis: LegalDashboardKpis
    risk_radar: list[dict[str, Any]]
    contract_pipeline: dict[str, int]
    upcoming_deadlines: list[dict[str, Any]]
    spend_summary: dict[str, Any]
    governance_alerts: list[dict[str, Any]]

