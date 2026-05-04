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


# ── Winston Legal AI Brain (schema 539) ─────────────────────────────────────
# Reference-implementation schemas for the AI-assisted legal operating layer.
# Buyer-facing names: Intake Triage, First-Pass Contract Review, Decision Packet
# Builder, Attorney Workbench, Outside Counsel Packet Builder, Legal Memory.


# ── Playbooks ───────────────────────────────────────────────────────────────

class LegalPlaybookCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    name: str = Field(min_length=1, max_length=240)
    contract_type: str = Field(min_length=1, max_length=120)
    jurisdiction: str | None = None
    owner: str | None = None
    status: str = "active"
    effective_from: date | None = None
    effective_to: date | None = None
    created_by: str | None = None


class LegalPlaybookOut(BaseModel):
    playbook_id: UUID
    env_id: UUID
    business_id: UUID
    name: str
    contract_type: str
    jurisdiction: str | None = None
    owner: str | None = None
    status: str
    effective_from: date | None = None
    effective_to: date | None = None
    created_at: datetime
    updated_at: datetime


class LegalPlaybookPositionCreateRequest(BaseModel):
    clause_key: str = Field(min_length=1, max_length=120)
    clause_label: str = Field(min_length=1, max_length=240)
    preferred_text: str | None = None
    fallback_text: str | None = None
    deal_breaker_text: str | None = None
    sample_external_comment: str | None = None
    internal_escalation_note: str | None = None
    approval_required_if: dict[str, Any] = Field(default_factory=dict)
    severity: str = "medium"
    source_reference: str | None = None
    created_by: str | None = None


class LegalPlaybookPositionOut(BaseModel):
    position_id: UUID
    env_id: UUID
    business_id: UUID
    playbook_id: UUID
    clause_key: str
    clause_label: str
    preferred_text: str | None = None
    fallback_text: str | None = None
    deal_breaker_text: str | None = None
    sample_external_comment: str | None = None
    internal_escalation_note: str | None = None
    approval_required_if: dict[str, Any]
    severity: str
    source_reference: str | None = None
    created_at: datetime
    updated_at: datetime


# ── Clause library ──────────────────────────────────────────────────────────

class LegalClauseCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    clause_key: str = Field(min_length=1, max_length=120)
    clause_label: str = Field(min_length=1, max_length=240)
    canonical_text: str | None = None
    tags_json: list[str] = Field(default_factory=list)
    jurisdiction: str | None = None
    created_by: str | None = None


class LegalClauseOut(BaseModel):
    clause_id: UUID
    env_id: UUID
    business_id: UUID
    clause_key: str
    clause_label: str
    canonical_text: str | None = None
    tags_json: list[str] | dict[str, Any]
    jurisdiction: str | None = None
    created_at: datetime
    updated_at: datetime


# ── Approval rules ──────────────────────────────────────────────────────────

class LegalApprovalRuleCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    rule_name: str = Field(min_length=1, max_length=240)
    contract_type: str | None = None
    trigger_json: dict[str, Any] = Field(default_factory=dict)
    required_approver: str = Field(min_length=1, max_length=240)
    escalation_level: str = "standard"
    created_by: str | None = None


class LegalApprovalRuleOut(BaseModel):
    rule_id: UUID
    env_id: UUID
    business_id: UUID
    rule_name: str
    contract_type: str | None = None
    trigger_json: dict[str, Any]
    required_approver: str
    escalation_level: str
    created_at: datetime
    updated_at: datetime


# ── Approver registry ───────────────────────────────────────────────────────

class LegalApproverCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    role_label: str = Field(min_length=1, max_length=120)
    person_name: str | None = None
    contact: str | None = None
    scope_json: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class LegalApproverOut(BaseModel):
    approver_id: UUID
    env_id: UUID
    business_id: UUID
    role_label: str
    person_name: str | None = None
    contact: str | None = None
    scope_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


# ── Legal Memory (prior decisions) ──────────────────────────────────────────

class LegalPriorDecisionCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    matter_id: UUID | None = None
    contract_type: str | None = None
    clause_key: str | None = None
    accepted_text: str | None = None
    rejected_text: str | None = None
    decided_by: str | None = None
    decided_at: datetime | None = None
    rationale: str | None = None
    attorney_disposition_id: UUID | None = None
    outside_counsel_guidance: str | None = None
    created_by: str | None = None


class LegalPriorDecisionOut(BaseModel):
    decision_id: UUID
    env_id: UUID
    business_id: UUID
    matter_id: UUID | None = None
    contract_type: str | None = None
    clause_key: str | None = None
    accepted_text: str | None = None
    rejected_text: str | None = None
    decided_by: str | None = None
    decided_at: datetime | None = None
    rationale: str | None = None
    attorney_disposition_id: UUID | None = None
    outside_counsel_guidance: str | None = None
    created_at: datetime
    updated_at: datetime


# ── Policy sources ──────────────────────────────────────────────────────────

class LegalPolicySourceCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    title: str = Field(min_length=1, max_length=240)
    source_url: str | None = None
    document_id: UUID | None = None
    effective_from: date | None = None
    version_history: list[dict[str, Any]] = Field(default_factory=list)
    created_by: str | None = None


class LegalPolicySourceOut(BaseModel):
    policy_id: UUID
    env_id: UUID
    business_id: UUID
    title: str
    source_url: str | None = None
    document_id: UUID | None = None
    effective_from: date | None = None
    version_history: list[dict[str, Any]] | dict[str, Any]
    created_at: datetime
    updated_at: datetime


# ── Intake Triage ───────────────────────────────────────────────────────────

class LegalIntakeRequestPayload(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    request_text: str = Field(min_length=1)
    requestor: str | None = None
    urgency_input: str | None = None
    source_adapter: str | None = None
    source_external_id: str | None = None
    provider: str | None = None
    created_by: str | None = None


class LegalIntakeOut(BaseModel):
    intake_id: UUID
    env_id: UUID
    business_id: UUID
    request_text: str
    requestor: str | None = None
    urgency_input: str | None = None
    classification_json: dict[str, Any]
    classification_status: str
    null_reason: str | None = None
    matter_id: UUID | None = None
    source_adapter: str
    source_external_id: str | None = None
    created_at: datetime


# ── Evidence-Grounded Findings ──────────────────────────────────────────────

class LegalReviewFindingOut(BaseModel):
    finding_id: UUID
    env_id: UUID
    business_id: UUID
    matter_id: UUID
    document_id: UUID | None = None
    contract_type: str | None = None
    clause_key: str
    status: str
    evidence_quote: str | None = None
    evidence_offset: int | None = None
    evidence_page: int | None = None
    evidence_section: str | None = None
    extraction_confidence: Decimal | None = None
    suggested_redline: str | None = None
    suggested_external_comment: str | None = None
    suggested_internal_note: str | None = None
    playbook_position_id: UUID | None = None
    prior_decision_id: UUID | None = None
    risk_score: Decimal | None = None
    confidence: Decimal | None = None
    null_reason: str | None = None
    created_at: datetime


class LegalReviewRequestPayload(BaseModel):
    document_id: UUID
    provider: str | None = None


class LegalReviewRunResult(BaseModel):
    matter_id: UUID
    document_id: UUID
    status: str  # 'ok' | 'pending' | 'failed'
    findings_count: int
    null_reason: str | None = None


# ── Decision Packet ─────────────────────────────────────────────────────────

class LegalDecisionPacketOut(BaseModel):
    packet_id: UUID
    env_id: UUID
    business_id: UUID
    matter_id: UUID
    packet_json: dict[str, Any]
    executive_summary: str | None = None
    approval_required: str | None = None
    recommended_next_step: str | None = None
    generated_at: datetime
    null_reason: str | None = None


class LegalDecisionPacketCompileRequest(BaseModel):
    provider: str | None = None


# ── Attorney Workbench ──────────────────────────────────────────────────────

class AttorneyDispositionRequest(BaseModel):
    action: str = Field(pattern="^(approve|revise|escalate|request_info|close)$")
    reviewer: str = Field(min_length=1)
    notes: str | None = None
    payload_json: dict[str, Any] = Field(default_factory=dict)
    finding_id: UUID | None = None
    promote_to_legal_memory: bool = False


class AttorneyDispositionOut(BaseModel):
    disposition_id: UUID
    env_id: UUID
    business_id: UUID
    matter_id: UUID
    finding_id: UUID | None = None
    action: str
    reviewer: str
    notes: str | None = None
    payload_json: dict[str, Any]
    created_at: datetime


class AttorneyWorkbenchOut(BaseModel):
    matters_awaiting_review: list[dict[str, Any]]
    decision_packets_ready: list[dict[str, Any]]
    evidence_gaps: list[dict[str, Any]]
    playbook_deviations: list[dict[str, Any]]
    requested_approvals: list[dict[str, Any]]
    legal_memory_hits: list[dict[str, Any]]
    recent_dispositions: list[dict[str, Any]]
    audit_summary: dict[str, Any]


# ── Outside Counsel Packet ──────────────────────────────────────────────────

class OutsideCounselPacketRequest(BaseModel):
    firm: str = Field(min_length=1, max_length=240)
    provider: str | None = None


class OutsideCounselPacketOut(BaseModel):
    oc_packet_id: UUID
    env_id: UUID
    business_id: UUID
    matter_id: UUID
    packet_json: dict[str, Any]
    generated_for_firm: str | None = None
    null_reason: str | None = None
    created_at: datetime

