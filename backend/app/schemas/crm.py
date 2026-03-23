from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel


class CrmAccountCreateRequest(BaseModel):
    business_id: UUID
    name: str
    account_type: str = "customer"
    industry: str | None = None
    website: str | None = None


class CrmOpportunityCreateRequest(BaseModel):
    business_id: UUID
    name: str
    amount: str
    crm_account_id: UUID | None = None
    crm_pipeline_stage_id: UUID | None = None
    expected_close_date: date | None = None


class CrmActivityCreateRequest(BaseModel):
    business_id: UUID
    subject: str
    activity_type: str = "note"
    crm_account_id: UUID | None = None
    crm_contact_id: UUID | None = None
    crm_opportunity_id: UUID | None = None
