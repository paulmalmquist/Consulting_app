from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


PsychragRole = Literal["patient", "therapist", "admin"]
RiskLevel = Literal["none", "low", "moderate", "high", "crisis"]


class PsychragProfileOut(BaseModel):
    id: str
    practice_id: str
    role: PsychragRole
    display_name: str
    email: str
    license_number: str | None = None
    license_state: str | None = None
    specializations: list[str] = Field(default_factory=list)
    onboarding_complete: bool = False


class PsychragConnectionOut(BaseModel):
    id: str
    patient_id: str
    therapist_id: str | None = None
    therapist_email: str
    status: Literal["pending", "active", "inactive"]
    allow_therapist_feedback_to_ai: bool = False
    consent_captured_at: str | None = None


class PsychragMeResponse(BaseModel):
    profile: PsychragProfileOut | None = None
    relationships: list[PsychragConnectionOut] = Field(default_factory=list)


class OnboardingRequest(BaseModel):
    role: PsychragRole
    display_name: str = Field(min_length=2, max_length=120)
    therapist_email: str | None = None
    license_number: str | None = None
    license_state: str | None = None
    specializations: list[str] = Field(default_factory=list)


class CitationOut(BaseModel):
    document_id: str
    chunk_id: str
    title: str
    chapter: str | None = None
    section: str | None = None
    page_start: int | None = None
    page_end: int | None = None
    score: float | None = None
    excerpt: str | None = None


class SafetyFlagsOut(BaseModel):
    risk_level: RiskLevel
    crisis_detected: bool = False
    keywords: list[str] = Field(default_factory=list)
    resources: list[str] = Field(default_factory=list)
    notify_therapist: bool = False


class ChatMessageOut(BaseModel):
    id: str
    role: Literal["user", "assistant", "system"]
    content: str
    rag_sources: list[CitationOut] = Field(default_factory=list)
    safety_flags: SafetyFlagsOut | None = None
    model_used: str | None = None
    created_at: str


class ChatSessionOut(BaseModel):
    id: str
    title: str | None = None
    session_type: Literal["therapy", "psychoeducation", "crisis"]
    mood_pre: int | None = None
    mood_post: int | None = None
    techniques_used: list[str] = Field(default_factory=list)
    ai_summary: str | None = None
    crisis_level: RiskLevel = "none"
    is_active: bool = True
    created_at: str
    ended_at: str | None = None
    messages: list[ChatMessageOut] = Field(default_factory=list)


class ChatStartRequest(BaseModel):
    title: str | None = None
    session_type: Literal["therapy", "psychoeducation", "crisis"] = "therapy"
    mood_pre: int | None = Field(default=None, ge=1, le=10)


class ChatMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12_000)
    session_id: UUID | None = None
    session_type: Literal["therapy", "psychoeducation", "crisis"] = "therapy"
    mood_pre: int | None = Field(default=None, ge=1, le=10)


class EndSessionRequest(BaseModel):
    mood_post: int | None = Field(default=None, ge=1, le=10)


class SessionSummaryResponse(BaseModel):
    session_id: str
    summary: str | None = None
    techniques_used: list[str] = Field(default_factory=list)
    crisis_level: RiskLevel = "none"


class ShareSessionRequest(BaseModel):
    session_id: UUID
    share_type: Literal["full", "summary_only", "flagged_only"] = "summary_only"
    patient_note: str | None = Field(default=None, max_length=2_000)


class AnnotationInput(BaseModel):
    message_id: UUID | None = None
    annotation_type: Literal[
        "clinical_note", "risk_flag", "technique_suggestion", "homework_assignment", "diagnosis_observation"
    ]
    content: str = Field(min_length=1, max_length=5_000)


class ReviewSharedSessionRequest(BaseModel):
    therapist_notes: str | None = Field(default=None, max_length=4_000)
    risk_assessment: RiskLevel = "none"
    follow_up_needed: bool = False
    annotations: list[AnnotationInput] = Field(default_factory=list)


class SharedSessionOut(BaseModel):
    id: str
    session_id: str
    patient_id: str
    therapist_id: str
    share_type: Literal["full", "summary_only", "flagged_only"]
    patient_note: str | None = None
    reviewed: bool = False
    reviewed_at: str | None = None
    therapist_notes: str | None = None
    risk_assessment: RiskLevel | None = None
    follow_up_needed: bool = False
    ai_clinical_summary: str | None = None
    shared_at: str


class TherapistPatientOut(BaseModel):
    patient_id: str
    display_name: str
    email: str
    pending_reviews: int = 0
    crisis_alerts: int = 0
    last_shared_at: str | None = None


class TherapistPatientOverview(BaseModel):
    patient: PsychragProfileOut
    shared_sessions: list[SharedSessionOut] = Field(default_factory=list)
    recent_assessments: list[dict[str, Any]] = Field(default_factory=list)
    crisis_alerts: list[dict[str, Any]] = Field(default_factory=list)


class AssessmentSubmitRequest(BaseModel):
    instrument: Literal["phq9", "gad7"]
    responses: dict[str, int]
    administered_by: Literal["self", "ai_prompted", "therapist"] = "self"
    session_id: UUID | None = None


class AssessmentOut(BaseModel):
    id: str
    instrument: Literal["phq9", "gad7"]
    total_score: int
    severity: str
    responses: dict[str, int]
    session_id: str | None = None
    created_at: str


class AlertOut(BaseModel):
    id: str
    notification_type: Literal["shared_session", "crisis_alert", "summary_ready"]
    status: Literal["pending", "acknowledged"]
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class RagDocumentIngestRequest(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    author: str | None = None
    document_type: Literal[
        "textbook", "clinical_guideline", "research_paper",
        "treatment_manual", "assessment_instrument", "psychoeducation"
    ]
    source_url: str | None = None
    source_license: Literal["owned", "licensed", "public_domain", "rights_cleared", "restricted"]
    approved_for_rag: bool = False
    rights_notes: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    chunks: list[dict[str, Any]] = Field(default_factory=list)


class RagDocumentOut(BaseModel):
    id: str
    title: str
    document_type: str
    source_license: str
    approved_for_rag: bool
    total_chunks: int
    ingested_at: str
