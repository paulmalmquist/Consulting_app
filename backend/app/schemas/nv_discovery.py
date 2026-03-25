from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class NvContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

class AccountCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    company_name: str = Field(min_length=1, max_length=200)
    industry: str | None = None
    sub_industry: str | None = None
    employee_count: int | None = None
    annual_revenue: Decimal | None = None
    headquarters: str | None = None
    website_url: str | None = None
    primary_contact_name: str | None = None
    primary_contact_email: str | None = None
    primary_contact_role: str | None = None
    champion_name: str | None = None
    champion_email: str | None = None
    engagement_stage: str = "discovery"
    pain_summary: str | None = None
    notes: str | None = None


class AccountUpdateRequest(BaseModel):
    company_name: str | None = None
    industry: str | None = None
    sub_industry: str | None = None
    employee_count: int | None = None
    annual_revenue: Decimal | None = None
    headquarters: str | None = None
    website_url: str | None = None
    primary_contact_name: str | None = None
    primary_contact_email: str | None = None
    primary_contact_role: str | None = None
    champion_name: str | None = None
    champion_email: str | None = None
    engagement_stage: str | None = None
    pain_summary: str | None = None
    notes: str | None = None
    status: str | None = None


class AccountOut(BaseModel):
    account_id: UUID
    env_id: str
    business_id: UUID
    company_name: str
    industry: str | None = None
    sub_industry: str | None = None
    employee_count: int | None = None
    annual_revenue: Decimal | None = None
    headquarters: str | None = None
    website_url: str | None = None
    primary_contact_name: str | None = None
    primary_contact_email: str | None = None
    primary_contact_role: str | None = None
    champion_name: str | None = None
    champion_email: str | None = None
    engagement_stage: str
    pain_summary: str | None = None
    vendor_count: int
    system_count: int
    status: str
    notes: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

class ContactCreateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: str | None = None
    phone: str | None = None
    role: str | None = None
    department: str | None = None
    is_champion: bool = False
    is_decision_maker: bool = False
    notes: str | None = None


class ContactOut(BaseModel):
    contact_id: UUID
    account_id: UUID
    full_name: str
    email: str | None = None
    phone: str | None = None
    role: str | None = None
    department: str | None = None
    is_champion: bool
    is_decision_maker: bool
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Source Systems
# ---------------------------------------------------------------------------

class SystemCreateRequest(BaseModel):
    system_name: str = Field(min_length=1, max_length=200)
    vendor_name: str | None = None
    system_category: str = "other"
    system_role: str = "work"
    department: str | None = None
    annual_cost: Decimal | None = None
    user_count: int | None = None
    integration_count: int = 0
    data_quality_score: Decimal | None = None
    exportability: str = "unknown"
    pain_level: str = "low"
    disposition: str = "unknown"
    lock_in_risk: str = "unknown"
    replacement_candidate: bool = False
    notes: str | None = None


class SystemUpdateRequest(BaseModel):
    system_name: str | None = None
    vendor_name: str | None = None
    system_category: str | None = None
    system_role: str | None = None
    department: str | None = None
    annual_cost: Decimal | None = None
    user_count: int | None = None
    integration_count: int | None = None
    data_quality_score: Decimal | None = None
    exportability: str | None = None
    pain_level: str | None = None
    disposition: str | None = None
    lock_in_risk: str | None = None
    replacement_candidate: bool | None = None
    notes: str | None = None


class SystemOut(BaseModel):
    system_id: UUID
    account_id: UUID
    system_name: str
    vendor_name: str | None = None
    system_category: str
    system_role: str | None = None
    department: str | None = None
    annual_cost: Decimal | None = None
    user_count: int | None = None
    integration_count: int
    data_quality_score: Decimal | None = None
    exportability: str | None = None
    pain_level: str
    disposition: str
    lock_in_risk: str | None = None
    replacement_candidate: bool
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Vendors
# ---------------------------------------------------------------------------

class VendorCreateRequest(BaseModel):
    vendor_name: str = Field(min_length=1, max_length=200)
    category: str | None = None
    annual_spend: Decimal | None = None
    contract_end_date: date | None = None
    lock_in_risk: str = "unknown"
    replacement_difficulty: str = "medium"
    capabilities: list[str] = Field(default_factory=list)
    notes: str | None = None


class VendorOut(BaseModel):
    vendor_id: UUID
    account_id: UUID
    vendor_name: str
    category: str | None = None
    annual_spend: Decimal | None = None
    contract_end_date: date | None = None
    lock_in_risk: str | None = None
    replacement_difficulty: str | None = None
    capabilities: list[str] | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Discovery Sessions
# ---------------------------------------------------------------------------

class SessionCreateRequest(BaseModel):
    session_date: date | None = None
    attendees: str | None = None
    notes: str | None = None
    files_requested: str | None = None
    next_steps: str | None = None


class SessionOut(BaseModel):
    session_id: UUID
    account_id: UUID
    session_date: date
    attendees: str | None = None
    notes: str | None = None
    files_requested: str | None = None
    next_steps: str | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Pain Points
# ---------------------------------------------------------------------------

class PainPointCreateRequest(BaseModel):
    category: str = "process"
    title: str = Field(min_length=1, max_length=300)
    description: str | None = None
    severity: str = "medium"
    estimated_annual_cost: Decimal | None = None
    affected_systems: list[UUID] = Field(default_factory=list)
    source: str = "manual"


class PainPointOut(BaseModel):
    pain_point_id: UUID
    account_id: UUID
    category: str
    title: str
    description: str | None = None
    severity: str
    estimated_annual_cost: Decimal | None = None
    affected_systems: list[UUID] | None = None
    source: str | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class DashboardOut(BaseModel):
    total_accounts: int = 0
    active_engagements: int = 0
    total_systems: int = 0
    total_vendors: int = 0
    total_artifacts: int = 0
    total_vendor_spend: Decimal = Decimal("0")
    total_pain_points: int = 0
    stage_counts: dict[str, int] = Field(default_factory=dict)
