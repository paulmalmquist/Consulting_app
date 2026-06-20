"""Request schemas for the Telemetry Go/No-Go Control Tower routes."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class ScoreAndGateRequest(BaseModel):
    env_id: str
    business_id: UUID
    run_key: str
    channel_name: str
    window: list[dict] = Field(default_factory=list)
    itar_tagged: bool = False
    execute_triage: bool = False  # default: route-only (no provider call, no cost). Opt-in to execute.


class ResolveRequest(BaseModel):
    env_id: str
    business_id: UUID
    human_decision: str  # approve | reject | request_more_evidence
    resolved_by: str | None = None  # defaults to the authenticated actor
    rationale: str | None = None
    requested_evidence: str | None = None


class ScopeRequest(BaseModel):
    env_id: str
    business_id: UUID


class GemmaActionRequest(BaseModel):
    env_id: str
    business_id: UUID
    confirm: str | None = None  # must equal the action's confirmation token (WARM-GEMMA / TEARDOWN-GEMMA)
