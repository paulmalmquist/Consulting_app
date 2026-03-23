from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class CreditContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class CreditCaseCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    case_number: str = Field(min_length=1, max_length=120)
    borrower_name: str = Field(min_length=1, max_length=240)
    facility_type: str | None = None
    stage: str = "intake"
    requested_amount: Decimal = Field(default=Decimal("0"), ge=0)
    risk_grade: str | None = None
    created_by: str | None = None


class CreditCaseOut(BaseModel):
    case_id: UUID
    env_id: UUID
    business_id: UUID
    case_number: str
    borrower_name: str
    facility_type: str | None = None
    stage: str
    requested_amount: Decimal
    approved_amount: Decimal
    risk_grade: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class CreditUnderwritingRequest(BaseModel):
    pd: Decimal | None = Field(default=None, ge=0)
    lgd: Decimal | None = Field(default=None, ge=0)
    ead: Decimal | None = Field(default=None, ge=0)
    score: Decimal | None = None
    recommendation: str | None = None
    created_by: str | None = None


class CreditCommitteeDecisionRequest(BaseModel):
    decision_status: str = Field(default="pending")
    decision_date: date | None = None
    conditions_json: list[dict[str, Any]] = Field(default_factory=list)
    rationale: str | None = None
    created_by: str | None = None


class CreditFacilityCreateRequest(BaseModel):
    facility_ref: str = Field(min_length=1, max_length=120)
    principal_amount: Decimal = Field(default=Decimal("0"), ge=0)
    outstanding_amount: Decimal = Field(default=Decimal("0"), ge=0)
    maturity_date: date | None = None
    status: str = "active"
    created_by: str | None = None


class CreditCovenantCreateRequest(BaseModel):
    covenant_name: str = Field(min_length=1, max_length=200)
    threshold_value: Decimal | None = None
    current_value: Decimal | None = None
    breached: bool = False
    as_of_date: date | None = None
    created_by: str | None = None


class CreditWatchlistCreateRequest(BaseModel):
    watch_reason: str | None = None
    status: str = "open"
    created_by: str | None = None


class CreditWorkoutCreateRequest(BaseModel):
    strategy: str | None = None
    recovery_estimate: Decimal = Field(default=Decimal("0"), ge=0)
    status: str = "open"
    created_by: str | None = None

