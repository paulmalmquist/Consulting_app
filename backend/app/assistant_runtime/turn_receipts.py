from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

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
    NO_RESPONSE = "no_response"
    STRUCTURED_DEGRADED = "structured_degraded"


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
    EXECUTED = "executed"
    FAILED = "failed"


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
    # Harness metadata (optional, backward-compatible)
    preferred_loop_pattern: str | None = None
    default_mode: str | None = None
    requires_quality_gate: bool = True
    requires_grounding: bool | None = None
    max_tool_calls: int | None = None


class ContextReceipt(BaseModel):
    model_config = {"extra": "forbid"}

    environment_id: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    resolution_status: ContextResolutionStatus
    notes: list[str] = Field(default_factory=list)
    inherited_entity_id: str | None = None
    inherited_entity_source: str | None = None


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


class StructuredQueryReceipt(BaseModel):
    model_config = {"extra": "forbid"}

    parsed_contract: dict[str, Any] = Field(default_factory=dict)
    execution_path: str
    transformation_applied: str | None = None
    operators_applied: dict[str, Any] = Field(default_factory=dict)
    memory_used: bool = False
    degraded: bool = False
    canonical_source: str | None = None
    canonical_check: str | None = None
    degradation_reason: str | None = None


class ConceptReceipt(BaseModel):
    model_config = {"extra": "forbid"}

    concept_id: str
    concept_version: str
    matched_alias: str | None = None
    confidence: float
    match_reason: str
    behavior_tier: str
    concept_object_included: bool
    concept_object_extended_included: bool = False
    concept_object_tokens: int = 0
    concept_object_extended_tokens: int = 0
    required_context_present: list[str] = Field(default_factory=list)
    required_context_missing: list[str] = Field(default_factory=list)
    output_contract_sections_expected: list[str] = Field(default_factory=list)
    failure_modes_available: list[str] = Field(default_factory=list)


class SourceDisciplineReceipt(BaseModel):
    """Source-discipline plumbing. v1 fields are mostly None until the data
    layer exposes per-source as-of dates and conflict summaries. Scorers gate
    on `applicable: bool` so missing fields skip rather than fail.
    """

    model_config = {"extra": "forbid"}

    source_inventory: list[str] | None = None
    source_as_of_dates: dict[str, str] | None = None
    freshness_status: str | None = None
    conflict_summary: list[dict[str, Any]] | None = None
    basis_rule_applied: str | None = None
    scope_rule_applied: str | None = None


class ThreadSubjectReceipt(BaseModel):
    """Lightweight structured memory of what the prior answer was about.

    Produced only by trusted producers (structured_executor, concept_receipt) —
    never inferred from arbitrary assistant prose. Consumed on the next turn to
    resolve referential follow-ups ("which ones don't have a status") without
    asking broad entity-type clarification questions.

    Expiry uses ``created_turn_index`` (the user-message count at the time the
    receipt was written). The consumer computes live ``turn_distance`` by
    subtracting from the current turn index and discards subjects older than
    ``max_turn_distance``. Storing an index rather than a UUID lets distance
    arithmetic actually mean something.
    """

    model_config = {"extra": "ignore"}

    subject_type: Literal["entity_collection", "metric_summary", "concept", "unknown"]
    entity_type: str | None = None
    entity_label_plural: str | None = None
    result_set_hint: str | None = None
    last_metric: str | None = None
    supported_followups: list[str] = Field(default_factory=list)
    environment_id: str | None = None
    confidence: float = 0.9
    source: Literal["structured_executor", "concept_receipt"]
    turn_distance: int = 0
    created_at: str | None = None
    created_turn_index: int | None = None
    max_turn_distance: int = 2


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
    structured_query: StructuredQueryReceipt | None = None
    status: TurnStatus
    degraded_reason: DegradedReason | None = None
    quality_gates: list[dict[str, Any]] | None = None
    concept: ConceptReceipt | None = None
    source_discipline: SourceDisciplineReceipt | None = None
    thread_subject: ThreadSubjectReceipt | None = None


def build_concept_receipt(plan: Any, compiled: Any) -> ConceptReceipt | None:
    """Assemble a ConceptReceipt from a CompositionPlan + CompiledContext.

    Returns None when no concept matched. Reads diagnostics already populated
    by prompt_receipts.build_receipt_from_compiled — keeps the lifecycle
    assembly logic to a single call.
    """
    match = getattr(plan, "concept_match", None)
    if match is None:
        return None

    concept_obj_item = compiled.item("concept_object") if compiled else None
    concept_ext_item = compiled.item("concept_object_extended") if compiled else None

    output_sections: list[str] = []
    failure_codes: list[str] = []
    required_missing: list[str] = []
    try:
        from app.assistant_runtime.concepts import load_concept

        concept = load_concept(match.concept_id)
        output_sections = concept.output_contract.all_section_names()
        failure_codes = [fm.code for fm in concept.failure_modes]
        required_missing = concept.required_context.required_field_names()
    except Exception:
        pass

    return ConceptReceipt(
        concept_id=match.concept_id,
        concept_version=match.version,
        matched_alias=match.matched_alias,
        confidence=match.confidence,
        match_reason=match.match_reason.value,
        behavior_tier=match.behavior_tier.value,
        concept_object_included=bool(concept_obj_item and concept_obj_item.included),
        concept_object_extended_included=bool(concept_ext_item and concept_ext_item.included),
        concept_object_tokens=(concept_obj_item.tokens if concept_obj_item and concept_obj_item.included else 0),
        concept_object_extended_tokens=(concept_ext_item.tokens if concept_ext_item and concept_ext_item.included else 0),
        required_context_present=[],
        required_context_missing=required_missing,
        output_contract_sections_expected=output_sections,
        failure_modes_available=failure_codes,
    )


def build_source_discipline_receipt(
    *,
    structured_evidence_sources: list[str] | None = None,
) -> SourceDisciplineReceipt | None:
    """Build a SourceDisciplineReceipt from real evidence sources used.

    `structured_evidence_sources` lists deterministic-precheck source IDs
    that contributed to the prompt as domain_blocks (e.g.,
    "meridian_noi_variance:structured_precheck"). When this list is
    populated, PR 4's `unsupported_claim_penalty` and
    `source_discipline_score` scorers activate against real data.

    The other source-discipline fields (source_as_of_dates,
    freshness_status, conflict_summary, basis_rule_applied,
    scope_rule_applied) remain None until the data layer plumbs them.
    Returns None when there is no evidence to report.
    """
    if not structured_evidence_sources:
        return None
    return SourceDisciplineReceipt(
        source_inventory=list(structured_evidence_sources),
        source_as_of_dates=None,
        freshness_status=None,
        conflict_summary=None,
        basis_rule_applied=None,
        scope_rule_applied=None,
    )


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
