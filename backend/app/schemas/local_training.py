from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class LocalTrainingSeedRequest(BaseModel):
    env_id: str
    business_id: UUID


class LocalTrainingContactCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    first_name: str | None = None
    last_name: str | None = None
    full_name: str
    email: str | None = None
    phone: str | None = None
    title: str | None = None
    organization_account_id: UUID | None = None
    preferred_contact_method: str | None = None
    city: str | None = None
    age_band: str | None = None
    persona_type: str | None = None
    audience_segment: str | None = None
    business_owner_flag: bool = False
    company_name_text: str | None = None
    notes: str | None = None
    lead_source: str | None = None
    status: str | None = None
    consent_to_email: bool = False
    interest_area: str | None = None
    follow_up_priority: str | None = None
    tags: list[str] = Field(default_factory=list)


class LocalTrainingEventCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    event_name: str
    event_series: str | None = None
    event_type: str | None = None
    event_status: str | None = None
    event_date: date
    event_start_time: time | None = None
    event_end_time: time | None = None
    venue_id: UUID | None = None
    city: str | None = None
    target_capacity: int | None = None
    ticket_price_standard: Decimal | None = None
    ticket_price_early: Decimal | None = None
    event_theme: str | None = None
    audience_level: str | None = None
    instructor: str | None = None
    assistant_count: int | None = None
    registration_link: str | None = None
    notes: str | None = None
    outcome_summary: str | None = None
    campaign_id: UUID | None = None


class LocalTrainingActivityCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    activity_type: str
    contact_id: UUID | None = None
    organization_id: UUID | None = None
    event_id: UUID | None = None
    campaign_id: UUID | None = None
    owner: str | None = None
    activity_date: datetime | None = None
    channel: str | None = None
    subject: str | None = None
    message_summary: str | None = None
    outcome: str | None = None
    next_step: str | None = None
    due_date: date | None = None
    status: str | None = None


class LocalTrainingRegistrationUpsertRequest(BaseModel):
    env_id: str
    business_id: UUID
    event_id: UUID
    contact_id: UUID
    registration_date: datetime | None = None
    ticket_type: str | None = None
    price_paid: Decimal | None = None
    payment_status: str | None = None
    attended_flag: bool = False
    checked_in_time: datetime | None = None
    source_channel: str | None = None
    referral_source: str | None = None
    follow_up_status: str | None = None
    feedback_score: int | None = None
    feedback_notes: str | None = None
    walk_in_flag: bool = False


class LocalTrainingCheckInRequest(BaseModel):
    attended_flag: bool = True


class LocalTrainingTaskStatusRequest(BaseModel):
    status: str = Field(pattern=r"^(open|in_progress|done)$")
