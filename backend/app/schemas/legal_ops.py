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

