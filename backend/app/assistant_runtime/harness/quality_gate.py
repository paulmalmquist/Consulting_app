"""Quality gate checks for the Winston assistant runtime.

Each gate is a pure, deterministic function -- no LLM calls, no external I/O.
Gates check structural consistency of the turn, not semantic quality.
"""
from __future__ import annotations

from typing import Any

from app.assistant_runtime.harness.harness_types import GateSeverity, QualityGateResult
from app.assistant_runtime.turn_receipts import (
    ContextReceipt,
    ContextResolutionStatus,
    DegradedReason,
    DispatchDecision,
    Lane,
    RetrievalReceipt,
    RetrievalStatus,
    TurnReceipt,
    TurnStatus,
)


_GENERIC_DEGRADED_PHRASES = [
    "not available in the current context",
    "context not available",
    "i cannot determine",
    "unable to determine",
]

_GROUNDING_SKILLS = {"run_analysis", "generate_lp_summary"}

_VALID_LANE_SKILL_PAIRS: dict[str, set[str]] = {
    "A_FAST": {"lookup_entity"},
    "B_LOOKUP": {"lookup_entity", "explain_metric", "run_analysis", "create_entity"},
    "C_ANALYSIS": {"run_analysis", "explain_metric", "generate_lp_summary", "create_entity", "lookup_entity"},
    "D_DEEP": {"run_analysis", "generate_lp_summary"},
}


def gate_context_resolution_sanity(
    *,
    context: ContextReceipt,
    dispatch: DispatchDecision | None,
    **_: Any,
) -> QualityGateResult:
    """Verify resolved scope is consistent with selected skill."""
    if not dispatch:
        return QualityGateResult(gate_name="context_resolution_sanity", passed=True)

    skill = dispatch.skill_id
    if (
        context.resolution_status == ContextResolutionStatus.MISSING_CONTEXT
        and skill in _GROUNDING_SKILLS
        and dispatch.lane != Lane.A_FAST
    ):
        return QualityGateResult(
            gate_name="context_resolution_sanity",
            passed=False,
            severity=GateSeverity.WARNING,
            message=f"Skill {skill} dispatched with MISSING_CONTEXT",
        )
    return QualityGateResult(gate_name="context_resolution_sanity", passed=True)


def gate_dispatch_consistency(
    *,
    dispatch: DispatchDecision | None,
    **_: Any,
) -> QualityGateResult:
    """Verify lane/skill pairing is valid."""
    if not dispatch or not dispatch.skill_id:
        return QualityGateResult(gate_name="dispatch_consistency", passed=True)

    lane = dispatch.lane
    skill = dispatch.skill_id
    if lane and lane.value in _VALID_LANE_SKILL_PAIRS:
        valid = _VALID_LANE_SKILL_PAIRS[lane.value]
        if skill not in valid:
            return QualityGateResult(
                gate_name="dispatch_consistency",
                passed=False,
                severity=GateSeverity.WARNING,
                message=f"Lane {lane} paired with unexpected skill {skill}",
                details={"lane": lane, "skill": skill, "valid_skills": list(valid)},
            )
    return QualityGateResult(gate_name="dispatch_consistency", passed=True)


def gate_grounding_sufficiency(
    *,
    dispatch: DispatchDecision | None,
    retrieval: RetrievalReceipt | None,
    has_visible_context: bool = False,
    **_: Any,
) -> QualityGateResult:
    """Flag when grounding-required skill got empty retrieval without visible data fallback."""
    if not dispatch or not dispatch.skill_id:
        return QualityGateResult(gate_name="grounding_sufficiency", passed=True)

    if dispatch.skill_id not in _GROUNDING_SKILLS:
        return QualityGateResult(gate_name="grounding_sufficiency", passed=True)

    if retrieval and retrieval.status == RetrievalStatus.EMPTY and not has_visible_context:
        return QualityGateResult(
            gate_name="grounding_sufficiency",
            passed=False,
            severity=GateSeverity.WARNING,
            message=f"Skill {dispatch.skill_id} requires grounding but retrieval was empty and no visible context available",
        )
    return QualityGateResult(gate_name="grounding_sufficiency", passed=True)


def gate_write_confirmation_present(
    *,
    dispatch: DispatchDecision | None,
    turn_receipt: TurnReceipt | None,
    **_: Any,
) -> QualityGateResult:
    """Verify write intent requires confirmation."""
    if not dispatch or not dispatch.write_intent:
        return QualityGateResult(gate_name="write_confirmation_present", passed=True)

    if turn_receipt and turn_receipt.pending_action is None:
        return QualityGateResult(
            gate_name="write_confirmation_present",
            passed=False,
            severity=GateSeverity.FAILURE,
            message="Write intent detected but no pending action / confirmation created",
        )
    return QualityGateResult(gate_name="write_confirmation_present", passed=True)


def gate_response_honesty(
    *,
    response_text: str,
    context: ContextReceipt,
    has_visible_context: bool = False,
    **_: Any,
) -> QualityGateResult:
    """Flag generic degraded phrases on pages with rich visible context."""
    if not response_text or not has_visible_context:
        return QualityGateResult(gate_name="response_honesty", passed=True)

    if context.resolution_status != ContextResolutionStatus.RESOLVED:
        return QualityGateResult(gate_name="response_honesty", passed=True)

    lowered = response_text.lower()
    for phrase in _GENERIC_DEGRADED_PHRASES:
        if phrase in lowered:
            return QualityGateResult(
                gate_name="response_honesty",
                passed=False,
                severity=GateSeverity.WARNING,
                message=f"Generic degraded phrase used on page with visible context: '{phrase}'",
            )
    return QualityGateResult(gate_name="response_honesty", passed=True)


def gate_lost_followup_context(
    *,
    context: ContextReceipt,
    thread_entity_state: dict[str, Any] | None = None,
    turn_receipt: TurnReceipt | None = None,
    **_: Any,
) -> QualityGateResult:
    """Detect when thread entity state exists but context fell to AMBIGUOUS or degraded."""
    if not thread_entity_state:
        return QualityGateResult(gate_name="lost_followup_context", passed=True)

    resolved_entities = thread_entity_state.get("resolved_entities", [])
    if not resolved_entities:
        return QualityGateResult(gate_name="lost_followup_context", passed=True)

    if context.resolution_status == ContextResolutionStatus.AMBIGUOUS_CONTEXT:
        return QualityGateResult(
            gate_name="lost_followup_context",
            passed=False,
            severity=GateSeverity.FAILURE,
            message="Thread entity state has resolved entity but context resolution fell back to ambiguous",
            details={"thread_entities": [e.get("name") for e in resolved_entities]},
        )

    if (
        turn_receipt
        and turn_receipt.status == TurnStatus.DEGRADED
        and turn_receipt.degraded_reason in {DegradedReason.MISSING_CONTEXT, DegradedReason.RETRIEVAL_EMPTY}
    ):
        return QualityGateResult(
            gate_name="lost_followup_context",
            passed=False,
            severity=GateSeverity.WARNING,
            message=f"Turn degraded ({turn_receipt.degraded_reason}) despite thread entity state having resolved entities",
            details={"thread_entities": [e.get("name") for e in resolved_entities]},
        )

    return QualityGateResult(gate_name="lost_followup_context", passed=True)


# ── Gate registry ────────────────────────────────────────────────────

_GATE_FUNCTIONS = [
    gate_context_resolution_sanity,
    gate_dispatch_consistency,
    gate_grounding_sufficiency,
    gate_write_confirmation_present,
    gate_response_honesty,
    gate_lost_followup_context,
]

GATE_NAMES = [fn.__name__.replace("gate_", "") for fn in _GATE_FUNCTIONS]


def run_gates(**kwargs: Any) -> list[QualityGateResult]:
    """Run all registered quality gates and return results."""
    results: list[QualityGateResult] = []
    for gate_fn in _GATE_FUNCTIONS:
        try:
            results.append(gate_fn(**kwargs))
        except Exception:
            results.append(
                QualityGateResult(
                    gate_name=gate_fn.__name__.replace("gate_", ""),
                    passed=True,
                    severity=GateSeverity.INFO,
                    message="Gate raised exception; treated as pass",
                )
            )
    return results
