"""Schemas for CRM + Revenue pipeline MCP tools.

Exposes the Consulting Revenue OS (CRM accounts, opportunities, leads,
proposals, outreach, engagements) as MCP tools so any AI interface
(Claude Cowork, Claude Code, ChatGPT, web) can operate the Novendor
sales motion directly.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Accounts ────────────────────────────────────────────────────────────

class ListAccountsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID = Field(..., description="Business (tenant) ID")


class CreateAccountInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID = Field(..., description="Business (tenant) ID")
    name: str = Field(..., description="Company or account name")
    account_type: str = Field("prospect", description="Account type: prospect, client, partner, former_client")
    industry: Optional[str] = Field(None, description="Industry vertical (e.g., real_estate, healthcare, legal)")
    website: Optional[str] = Field(None, description="Company website URL")
    confirm: bool = Field(False, description="Must be true to execute write")


class GetAccountInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    crm_account_id: UUID = Field(..., description="Account ID to retrieve")


# ── Pipeline Stages ─────────────────────────────────────────────────────

class ListPipelineStagesInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID


# ── Opportunities ────────────────────────────────────────────────────────

class ListOpportunitiesInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID


class CreateOpportunityInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    name: str = Field(..., description="Opportunity name (e.g., 'Acme Corp - AI Diagnostic')")
    amount: str = Field(..., description="Deal value as string (e.g., '7500.00')")
    crm_account_id: Optional[UUID] = Field(None, description="Linked account ID")
    crm_pipeline_stage_id: Optional[UUID] = Field(None, description="Pipeline stage ID (defaults to first stage)")
    expected_close_date: Optional[str] = Field(None, description="Expected close date (YYYY-MM-DD)")
    confirm: bool = Field(False, description="Must be true to execute write")


class MoveOpportunityStageInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    crm_opportunity_id: UUID = Field(..., description="Opportunity to move")
    to_stage_id: UUID = Field(..., description="Target pipeline stage ID")
    note: Optional[str] = Field(None, description="Note explaining the stage change")
    confirm: bool = Field(False, description="Must be true to execute write")


# ── Activities ───────────────────────────────────────────────────────────

class ListActivitiesInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    crm_account_id: Optional[UUID] = Field(None, description="Filter by account")
    crm_opportunity_id: Optional[UUID] = Field(None, description="Filter by opportunity")
    limit: int = Field(20, description="Max results", ge=1, le=100)


class CreateActivityInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    activity_type: str = Field(..., description="Type: call, meeting, email, note, task")
    subject: str = Field(..., description="Activity subject line")
    body: Optional[str] = Field(None, description="Activity notes or body text")
    crm_account_id: Optional[UUID] = Field(None, description="Linked account")
    crm_opportunity_id: Optional[UUID] = Field(None, description="Linked opportunity")
    crm_contact_id: Optional[UUID] = Field(None, description="Linked contact")
    confirm: bool = Field(False, description="Must be true to execute write")


# ── Leads (CRO Extension) ───────────────────────────────────────────────

class CreateLeadInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: str = Field(..., description="Environment ID")
    business_id: UUID
    company_name: str = Field(..., description="Lead company name")
    industry: Optional[str] = None
    website: Optional[str] = None
    ai_maturity: Optional[str] = Field(None, description="AI maturity: none, exploring, piloting, scaling, advanced")
    pain_category: Optional[str] = Field(None, description="Primary pain: manual_processes, reporting, compliance, ai_strategy, cost_reduction")
    lead_source: Optional[str] = Field(None, description="Source: linkedin, referral, event, inbound, cold_outreach, workshop")
    company_size: Optional[str] = Field(None, description="Size band: 1-50, 51-200, 201-500, 501-1000, 1000+")
    revenue_band: Optional[str] = None
    estimated_budget: Optional[str] = Field(None, description="Estimated budget as string")
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_title: Optional[str] = None
    contact_linkedin: Optional[str] = None
    confirm: bool = Field(False, description="Must be true to execute write")


class ListLeadsInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: str
    business_id: UUID
    qualification_tier: Optional[str] = Field(None, description="Filter: hot, warm, cool, cold")
    limit: int = Field(20, ge=1, le=100)


# ── Proposals (CRO Extension) ───────────────────────────────────────────

class CreateProposalInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: str
    business_id: UUID
    title: str = Field(..., description="Proposal title")
    total_value: str = Field(..., description="Total proposal value as string (e.g., '7500.00')")
    cost_estimate: str = Field("0", description="Cost estimate for margin calculation")
    crm_opportunity_id: Optional[UUID] = None
    crm_account_id: Optional[UUID] = None
    pricing_model: Optional[str] = Field(None, description="fixed, hourly, retainer, milestone")
    valid_until: Optional[str] = Field(None, description="Expiry date (YYYY-MM-DD)")
    scope_summary: Optional[str] = None
    risk_notes: Optional[str] = None
    confirm: bool = Field(False, description="Must be true to execute write")


class ListProposalsInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: str
    business_id: UUID
    status: Optional[str] = Field(None, description="Filter: draft, sent, accepted, rejected, expired")


class SendProposalInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: str
    business_id: UUID
    proposal_id: UUID
    confirm: bool = Field(False, description="Must be true to execute write")


# ── Outreach (CRO Extension) ────────────────────────────────────────────

class ListOutreachTemplatesInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: str
    business_id: UUID


class CreateOutreachTemplateInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: str
    business_id: UUID
    name: str = Field(..., description="Template name")
    channel: str = Field(..., description="Channel: email, linkedin, phone, sms")
    category: Optional[str] = Field(None, description="Category: cold, follow_up, referral, event, workshop")
    subject_template: Optional[str] = Field(None, description="Email subject template with {placeholders}")
    body_template: str = Field(..., description="Message body template with {placeholders}")
    confirm: bool = Field(False, description="Must be true to execute write")


class LogOutreachInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: str
    business_id: UUID
    crm_account_id: UUID = Field(..., description="Target account")
    channel: str = Field(..., description="Channel used: email, linkedin, phone, sms")
    subject: Optional[str] = None
    body: str = Field(..., description="Message content sent")
    template_id: Optional[UUID] = Field(None, description="Template used (for tracking)")
    confirm: bool = Field(False, description="Must be true to execute write")


class RecordReplyInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: str
    business_id: UUID
    outreach_log_id: UUID = Field(..., description="Outreach log entry that got a reply")
    reply_summary: str = Field(..., description="Summary of the reply received")
    sentiment: Optional[str] = Field(None, description="positive, neutral, negative, objection")
    confirm: bool = Field(False, description="Must be true to execute write")


# ── Engagements (CRO Extension) ─────────────────────────────────────────

class CreateEngagementInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: str
    business_id: UUID
    client_id: UUID = Field(..., description="CRM account ID of the client")
    name: str = Field(..., description="Engagement name")
    engagement_type: str = Field(..., description="Type: diagnostic, sprint, pilot, retainer, workshop, advisory")
    budget: str = Field("0", description="Engagement budget as string")
    start_date: Optional[str] = Field(None, description="Start date (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="End date (YYYY-MM-DD)")
    notes: Optional[str] = None
    confirm: bool = Field(False, description="Must be true to execute write")


class ListEngagementsInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: str
    business_id: UUID
    client_id: Optional[UUID] = None


# ── Pipeline Scoreboard ─────────────────────────────────────────────────

class PipelineScoreboardInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: Optional[str] = Field(None, description="Optional environment scope")
