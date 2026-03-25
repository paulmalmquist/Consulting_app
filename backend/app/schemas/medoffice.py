from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class MedOfficeContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class MedPropertyCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    property_name: str = Field(min_length=1, max_length=240)
    market: str | None = None
    status: str = "active"
    created_by: str | None = None


class MedPropertyOut(BaseModel):
    property_id: UUID
    env_id: UUID
    business_id: UUID
    property_name: str
    market: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class MedTenantCreateRequest(BaseModel):
    legal_name: str = Field(min_length=1, max_length=240)
    specialty: str | None = None
    npi_number: str | None = None
    license_status: str | None = None
    coi_expiration_date: date | None = None
    risk_level: str = "medium"
    created_by: str | None = None


class MedLeaseCreateRequest(BaseModel):
    tenant_id: UUID
    lease_number: str = Field(min_length=1, max_length=120)
    start_date: date | None = None
    end_date: date | None = None
    monthly_base_rent: Decimal = Field(default=Decimal("0"), ge=0)
    escalator_type: str | None = None
    status: str = "active"
    created_by: str | None = None


class MedComplianceCreateRequest(BaseModel):
    compliance_type: str = Field(min_length=1, max_length=120)
    due_date: date | None = None
    status: str = "open"
    severity: str = "medium"
    created_by: str | None = None


class MedWorkOrderCreateRequest(BaseModel):
    tenant_id: UUID | None = None
    title: str = Field(min_length=1, max_length=240)
    priority: str = "medium"
    status: str = "open"
    due_date: date | None = None
    created_by: str | None = None

