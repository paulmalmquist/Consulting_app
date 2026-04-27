"""pitch_forge.py — Pydantic schemas for the Pitch Forge API."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------

class PfContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------

class ProjectCreateIn(BaseModel):
    client_name: str
    client_slug: str
    notes: str | None = None


class ProjectOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    client_name: str
    client_slug: str
    status: str
    iteration_count: int
    current_score: int | None
    pass_threshold: int
    fail_reason: str | None
    notes: str | None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Source
# ---------------------------------------------------------------------------

class SourceCreateIn(BaseModel):
    source_type: str  # deep_research|interview_note|questionnaire|document|inference|public_record
    label: str
    content: str
    url: str | None = None
    confidence: str = "medium"


class SourceOut(BaseModel):
    id: UUID
    project_id: UUID
    source_type: str
    label: str
    content: str
    url: str | None
    confidence: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Claim
# ---------------------------------------------------------------------------

class ClaimCreateIn(BaseModel):
    claim_text: str
    claim_category: str  # constraint|fact|inference|gap|risk
    source_id: UUID | None = None
    is_available: bool = True
    unavailable_reason: str | None = None


class ClaimOut(BaseModel):
    id: UUID
    project_id: UUID
    claim_text: str
    claim_category: str
    is_available: bool
    unavailable_reason: str | None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Iteration
# ---------------------------------------------------------------------------

class IterationOut(BaseModel):
    id: UUID
    project_id: UUID
    iteration_num: int
    status: str
    score: int | None
    score_breakdown: dict | None
    raw_proposal: str | None
    rebuilt_proposal: str | None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Use Case
# ---------------------------------------------------------------------------

class UseCaseOut(BaseModel):
    id: UUID
    iteration_id: UUID
    workflow_name: str
    current_pain: str
    proposed_intervention: str
    who_uses_it: str
    change_tomorrow: str
    estimated_impact: str
    impact_confidence: str
    dependencies: str | None
    novendor_credibility: str
    status: str
    kill_reason: str | None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Red Team Review
# ---------------------------------------------------------------------------

class RedTeamReviewOut(BaseModel):
    id: UUID
    iteration_id: UUID
    score: int
    score_breakdown: dict
    kill_list: list
    weak_spots: list
    missing_evidence: list
    research_refill: list
    fatal_issues: list
    fixable_issues: list
    acceptable_weaknesses: list
    missing_inputs: list
    verdict: str
    verdict_reason: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Final Output
# ---------------------------------------------------------------------------

class FinalOutputFormatIn(BaseModel):
    format: str = "bullet_email"  # bullet_email|deck_bullets|talking_points


class FinalOutputOut(BaseModel):
    id: UUID
    project_id: UUID
    format: str
    content: str
    score: int
    use_case_count: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# AI action responses
# ---------------------------------------------------------------------------

class GenerateProposalOut(BaseModel):
    iteration: IterationOut
    use_cases: list[UseCaseOut]
    message: str


class RunRedTeamOut(BaseModel):
    review: RedTeamReviewOut
    verdict: str
    score: int
    message: str


class ResearchSynthesisIn(BaseModel):
    raw_research: str
    known_constraints: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Sarat Mode
# ---------------------------------------------------------------------------

class SaratRedTeamOut(BaseModel):
    """Sarat Mode red team response — CFO/CIO persona critique."""
    section_verdicts: dict[str, str]       # section → PASS | WEAK | REJECT
    objection_scores: dict[str, int]       # criterion → 0–10
    overall_verdict: str                   # PASS | WEAK | REJECT
    sarat_voice_summary: str               # 2–4 sentences in Sarat's voice
    kill_list: list
    fixable_issues: list
    fatal_issues: list
    score: int
    score_breakdown: dict


# ---------------------------------------------------------------------------
# Deck generation
# ---------------------------------------------------------------------------

class GenerateDeckIn(BaseModel):
    topic: str
    iteration_id: str | None = None  # if provided, pulls previous critique for context


class GenerateDeckOut(BaseModel):
    content: str           # full markdown presentation
    iteration_num: int
    client_name: str
    message: str
