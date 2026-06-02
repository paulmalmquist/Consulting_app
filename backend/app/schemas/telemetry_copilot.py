"""Pydantic schemas for the Test Intelligence Copilot (Phase 6).

One response contract for both endpoints. Every answer is either grounded (evidence non-empty,
answer_source live_llm|fallback_template) or a structured refusal / fail-closed null_reason. The
contract is the same the frontend governance strip reads from — one source of truth per response.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ExplainVerdictRequest(BaseModel):
    """Pins the flagship `why_no_go` intent — called by the replay 'Explain this verdict' button."""
    env_id: str
    business_id: UUID
    run_key: str
    verdict: str = "NO_GO"
    fire_tick: int
    channel: str | None = None


class DraftReportRequest(BaseModel):
    """Phase 7: assemble + persist a draft test report from the run's real evidence."""
    env_id: str
    business_id: UUID
    run_key: str
    fire_tick: int
    channel: str | None = None


class AskRequest(BaseModel):
    """Free-form question — classified deterministically; unmatched intents are refused (not a chatbot)."""
    env_id: str
    business_id: UUID
    question: str = Field(min_length=1)
    context: dict[str, Any] | None = None


class EvidenceItem(BaseModel):
    type: str                       # run | model | prediction | anomaly | metric | mlflow | threshold
    id: str | None = None           # real run_id / receipt_id / mlflow_run_id / model_version
    label: str
    value: Any = None
    metadata: dict[str, Any] = {}


class ToolTraceItem(BaseModel):
    tool_name: str
    status: str                     # success | error | skipped
    args: dict[str, Any] = {}
    result_summary: str = ""        # short summary, NOT the full payload
    duration_ms: int = 0


class CopilotAnswerResponse(BaseModel):
    answer: str
    evidence: list[EvidenceItem] = []
    tool_trace: list[ToolTraceItem] = []
    null_reason: str | None = None
    is_refusal: bool = False
    intent: str | None = None
    answer_source: str = "live_llm"   # live_llm | fallback_template | refusal
    prompt_version: str
    model: str
    draft_report_md: str | None = None
    request_id: UUID
