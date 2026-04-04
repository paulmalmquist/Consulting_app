from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class Lane(StrEnum):
    A_FAST = "A_FAST"
    B_LOOKUP = "B_LOOKUP"
    C_ANALYSIS = "C_ANALYSIS"
    D_DEEP = "D_DEEP"


class RetrievalPolicy(StrEnum):
    NONE = "none"
    LIGHT = "light"
    FULL = "full"


class ConfirmationMode(StrEnum):
    NONE = "none"
    REQUIRED = "required"
    CONDITIONAL = "conditional"


class PermissionMode(StrEnum):
    READ = "read"
    RETRIEVE = "retrieve"
    ANALYZE = "analyze"
    WRITE_CONFIRMED = "write_confirmed"
    WRITE_AUTO = "write_auto"
    PRIVILEGED = "privileged"


class SideEffectClass(StrEnum):
    READ = "read"
    WRITE = "write"


class ContextResolutionStatus(StrEnum):
    RESOLVED = "resolved"
    MISSING_CONTEXT = "missing_context"
    AMBIGUOUS_CONTEXT = "ambiguous_context"


class ToolStatus(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"
    DENIED = "denied"


class RetrievalStatus(StrEnum):
    OK = "ok"
    EMPTY = "empty"


class StructuredPrecheckStatus(StrEnum):
    OK = "ok"
    EMPTY = "empty"
    UNAVAILABLE = "unavailable"
    ERROR = "error"


class TurnStatus(StrEnum):
    SUCCESS = "success"
    DEGRADED = "degraded"
    FAILED = "failed"


class DegradedReason(StrEnum):
    MISSING_CONTEXT = "missing_context"
    AMBIGUOUS_CONTEXT = "ambiguous_context"
    TOOL_DENIED = "tool_denied"
    TOOL_FAILED = "tool_failed"
    RETRIEVAL_EMPTY = "retrieval_empty"
    NO_SKILL_MATCH = "no_skill_match"


class DispatchAmbiguity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class DispatchSource(StrEnum):
    MODEL = "model"
    LEGACY_FALLBACK = "legacy_fallback"
    DETERMINISTIC_GUARDRAIL = "deterministic_guardrail"


class PendingActionStatus(StrEnum):
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    SUPERSEDED = "superseded"
    EXPIRED = "expired"


class SkillDefinition(BaseModel):
    model_config = {"extra": "forbid"}

    id: str
    description: str
    triggers: list[str]
    capability_tags: list[str]
    allowed_tool_tags: list[str]
    retrieval_policy: RetrievalPolicy
    confirmation_mode: ConfirmationMode
    response_blocks: list[str]


class ContextReceipt(BaseModel):
    model_config = {"extra": "forbid"}

    environment_id: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    resolution_status: ContextResolutionStatus
    notes: list[str] = Field(default_factory=list)


class SkillSelection(BaseModel):
    model_config = {"extra": "forbid"}

    skill_id: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    triggers_matched: list[str] = Field(default_factory=list)


class DispatchProposal(BaseModel):
    model_config = {"extra": "forbid"}

    skill: str | None = None
    lane: Lane | None = None
    needs_retrieval: bool = False
    write_intent: bool = False
    ambiguity_level: DispatchAmbiguity = DispatchAmbiguity.LOW
    confidence: float = Field(ge=0.0, le=1.0)


class DispatchDecision(BaseModel):
    model_config = {"extra": "forbid"}

    source: DispatchSource
    skill_id: str | None = None
    lane: Lane
    needs_retrieval: bool
    write_intent: bool
    ambiguity_level: DispatchAmbiguity
    confidence: float = Field(ge=0.0, le=1.0)
    fallback_used: bool = False
    fallback_reason: str | None = None
    notes: list[str] = Field(default_factory=list)


class DispatchTrace(BaseModel):
    model_config = {"extra": "forbid"}

    raw: DispatchProposal | None = None
    normalized: DispatchDecision


class ToolReceipt(BaseModel):
    model_config = {"extra": "forbid"}

    tool_name: str
    status: ToolStatus
    permission_mode: PermissionMode
    input: Any = None
    output: Any = None
    error: str | None = None


class StructuredPrecheckReceipt(BaseModel):
    model_config = {"extra": "forbid"}

    name: str
    source: str
    status: StructuredPrecheckStatus
    scoped: bool = False
    result_count: int = 0
    evidence: dict[str, Any] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)
    error: str | None = None


class RetrievalDebugReceipt(BaseModel):
    model_config = {"extra": "forbid"}

    query_text: str
    scope_filters: dict[str, Any] = Field(default_factory=dict)
    strategy: str
    top_hits: list[dict[str, Any]] = Field(default_factory=list)
    structured_prechecks: list[StructuredPrecheckReceipt] = Field(default_factory=list)
    empty_reason: str | None = None


class RetrievalReceipt(BaseModel):
    model_config = {"extra": "forbid"}

    used: bool
    result_count: int
    status: RetrievalStatus
    debug: RetrievalDebugReceipt | None = None


class PendingActionReceipt(BaseModel):
    model_config = {"extra": "forbid"}

    pending_action_id: str
    status: PendingActionStatus
    action_type: str
    scope_label: str | None = None
    confirmation_required: bool = True


class TurnReceipt(BaseModel):
    model_config = {"extra": "forbid"}

    request_id: str
    lane: Lane
    dispatch: DispatchTrace
    fallback_reason: str | None = None
    context: ContextReceipt
    skill: SkillSelection
    tools: list[ToolReceipt] = Field(default_factory=list)
    retrieval: RetrievalReceipt
    pending_action: PendingActionReceipt | None = None
    status: TurnStatus
    degraded_reason: DegradedReason | None = None


_PERMISSION_ORDER: dict[PermissionMode, int] = {
    PermissionMode.READ: 0,
    PermissionMode.RETRIEVE: 1,
    PermissionMode.ANALYZE: 2,
    PermissionMode.WRITE_CONFIRMED: 3,
    PermissionMode.WRITE_AUTO: 4,
    PermissionMode.PRIVILEGED: 5,
}


def permission_satisfies(active: PermissionMode, required: PermissionMode) -> bool:
    return _PERMISSION_ORDER[active] >= _PERMISSION_ORDER[required]


def lane_to_legacy_code(lane: Lane) -> str:
    return {
        Lane.A_FAST: "A",
        Lane.B_LOOKUP: "B",
        Lane.C_ANALYSIS: "C",
        Lane.D_DEEP: "D",
    }[lane]


def legacy_code_to_lane(code: str) -> Lane:
    return {
        "A": Lane.A_FAST,
        "B": Lane.B_LOOKUP,
        "C": Lane.C_ANALYSIS,
        "D": Lane.D_DEEP,
    }.get(code, Lane.B_LOOKUP)
