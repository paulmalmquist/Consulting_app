"""Pydantic input schemas for novendor.* MCP tools.

All 6 families: pipeline, contacts, outreach, proof_assets, tasks, signals.
"""
from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Family 1: novendor.pipeline.* ────────────────────────────────────────────

class ListPipelineAccountsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    status_filter: Optional[str] = None  # "Identified" | "Hypothesis Built" | etc.
    min_readiness: Optional[int] = Field(None, ge=0, le=8)
    limit: int = Field(20, ge=1, le=50)


class GetAccountBriefInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    crm_account_id: UUID


class CreateOpportunityNVInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    crm_account_id: UUID
    name: str
    amount: str = Field(..., description="Dollar amount as string, e.g. '7500'")
    initial_stage_key: str = "identified"
    confirm: bool = False


class AdvanceOpportunityStageInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    crm_opportunity_id: UUID
    to_stage_key: str
    note: Optional[str] = None
    confirm: bool = False


class SetNextActionNVInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    entity_type: str = Field(..., description="'account' | 'opportunity' | 'lead'")
    entity_id: UUID
    action_type: str
    description: str
    due_date: date
    priority: str = "normal"
    confirm: bool = False


class ArchiveAccountInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    strategic_lead_id: UUID
    reason: str
    confirm: bool = False


# ── Family 2: novendor.contacts.* ────────────────────────────────────────────

class FindMissingContactFieldsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    crm_account_id: UUID


class UpsertContactNVInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    crm_account_id: UUID
    name: str
    title: str
    email: Optional[str] = None
    linkedin_url: Optional[str] = None
    buyer_type: Optional[str] = None   # COO | CFO | CIO | VP_Ops | Other
    authority_level: Optional[str] = None  # High | Medium | Low
    confirm: bool = False


class LinkContactToAccountInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    strategic_contact_id: UUID
    crm_account_id: UUID
    confirm: bool = False


class ScoreContactRelevanceInput(BaseModel):
    model_config = {"extra": "forbid"}
    title: str
    company_industry: str
    company_size: Optional[str] = None


# ── Family 3: novendor.outreach.* ────────────────────────────────────────────

class GetOutreachQueueInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    filter: str = Field("all", description="'all' | 'send_ready' | 'needs_approval'")


class DraftOutreachMessageInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    crm_account_id: UUID
    sequence_stage: int = Field(1, ge=1, le=3)
    confirm: bool = False


class LogOutreachTouchInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    crm_account_id: UUID
    channel: str = Field(..., description="'email' | 'linkedin' | 'phone' | 'other'")
    subject: Optional[str] = None
    body_preview: Optional[str] = None
    sent_by: Optional[str] = None
    confirm: bool = False


class RecordReplyNVInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    outreach_log_id: UUID
    sentiment: str = Field(..., description="'positive' | 'neutral' | 'negative' | 'bounce'")
    meeting_booked: bool = False
    notes: Optional[str] = None
    confirm: bool = False


class ScheduleFollowUpInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    crm_account_id: UUID
    follow_up_date: date
    channel: str = "email"
    confirm: bool = False


class PromoteToOutreachReadyInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    strategic_lead_id: UUID
    confirm: bool = False


# ── Family 4: novendor.proof_assets.* ────────────────────────────────────────

class ListRequiredProofAssetsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str


class AttachProofAssetInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    outreach_sequence_id: UUID
    proof_asset_id: UUID
    confirm: bool = False


class MarkProofAssetStatusInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    proof_asset_id: UUID
    status: str = Field(..., description="'draft' | 'ready' | 'needs_update'")
    notes: Optional[str] = None
    confirm: bool = False


class GenerateOfferSheetContextInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    crm_account_id: UUID


# ── Family 5: novendor.tasks.* ────────────────────────────────────────────────

class CreateExecutionTaskInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    entity_type: str = Field(..., description="'account' | 'opportunity' | 'lead' | 'contact'")
    entity_id: UUID
    action_type: str
    description: str
    due_date: date
    priority: str = "normal"
    confirm: bool = False


class CompleteTaskInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    next_action_id: UUID
    outcome_notes: Optional[str] = None
    create_followup: bool = False
    followup_description: Optional[str] = None
    followup_due_date: Optional[date] = None
    confirm: bool = False


class RescheduleTaskInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    next_action_id: UUID
    new_due_date: date
    snooze_reason: Optional[str] = None
    confirm: bool = False


class ListTasksDueTodayInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    include_overdue: bool = True


# ── Family 6: novendor.signals.* ─────────────────────────────────────────────

class CreateSignalFromResearchInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    lead_profile_id: UUID
    trigger_type: str = Field(
        ...,
        description="'ERP_Announcement' | 'AI_Initiative' | 'CFO_Hire' | 'Job_Posting' | 'PE_Acquisition' | 'Other'",
    )
    summary: str
    source_url: Optional[str] = None
    detected_at: Optional[str] = None   # ISO datetime string; defaults to now
    confirm: bool = False


class PromoteSignalToAccountInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    trigger_signal_id: UUID
    confirm: bool = False


class LinkSignalToOutreachAngleInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    trigger_signal_id: UUID
    crm_account_id: UUID
    outreach_angle_notes: str
    confirm: bool = False


class RefreshPriorityScoresInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str
    confirm: bool = False
