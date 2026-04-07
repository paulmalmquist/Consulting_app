from __future__ import annotations

from typing import Any

from app.assistant_runtime.turn_receipts import DegradedReason, StructuredPrecheckReceipt
from app.services.assistant_blocks import error_block, markdown_block, navigation_suggestion_block


# ── Static fallback messages (last resort) ────────────────────────────
_MESSAGES: dict[DegradedReason, str] = {
    DegradedReason.MISSING_CONTEXT: "I need more context to answer this. Specify the fund, asset, or entity name.",
    DegradedReason.AMBIGUOUS_CONTEXT: "That reference is ambiguous. Which entity are you referring to?",
    DegradedReason.TOOL_DENIED: "The requested action is not allowed in the current mode.",
    DegradedReason.TOOL_FAILED: "A required tool failed during execution.",
    DegradedReason.RETRIEVAL_EMPTY: "That data is not available in the environment.",
    DegradedReason.NO_SKILL_MATCH: "I'm not sure how to handle this request. Try asking about a metric, entity, or action.",
    DegradedReason.NO_RESPONSE: "I wasn't able to generate a response for this request.",
}

# Intent-specific fallback messages keyed by skill_id.
_SKILL_FALLBACKS: dict[str, str] = {
    "fund_summary": "I can list the funds in this environment. Try 'list all funds' or name a specific fund.",
    "fund_metrics": "I can look up fund metrics. Specify the fund name and quarter — e.g., 'fund metrics for [fund], [quarter]'.",
    "fund_holdings": "This fund has no recorded holdings. You can explore pipeline deals, target sectors, or add assets.",
    "asset_metrics": "I can look up asset metrics. Specify the asset name and metric — e.g., 'NOI for [asset name]'.",
    "asset_ranking": "I can rank assets by a specific metric. Try 'rank assets by NOI' or 'best performing assets'.",
    "rank_metric": "I can rank assets by a specific metric. Try 'rank assets by NOI' or 'best performing assets'.",
    "explain_metric": "I can look up specific metrics. Name the entity and metric — e.g., 'NOI for [asset]' or 'IRR for [fund]'.",
    "explain_metric_variance": "I can explain variances when budget or underwriting data is available. This environment may not have comparison data loaded yet.",
    "resume_qa": "I can answer questions about Paul's career, skills, and experience. Try asking about a specific role or time period.",
    "run_analysis": "I can analyze data in this environment. Try asking about a specific metric, entity, or time period.",
    "budget_variance": "I can explain budget variances. Specify the project — e.g., 'budget variance for [project name]'.",
    "create_entity": "I can help create new entities. Specify what — e.g., 'create a new fund named [name]'.",
    "project_risk": "I can show at-risk projects. Try 'which projects are at risk?' or name a project.",
    "lookup_entity": "I can look up entities in this environment. Try asking about a specific fund, asset, or project by name.",
    "draft_email": "I can draft outreach emails. Specify the recipient and purpose.",
}


def degraded_message(reason: DegradedReason) -> str:
    return _MESSAGES[reason]


def degraded_blocks(reason: DegradedReason) -> list[dict]:
    message = degraded_message(reason)
    return [
        markdown_block(message),
        error_block(message=message, title="Deterministic runtime degraded", recoverable=True),
    ]


# ── Investigation note (one-liner from precheck receipts) ────────────

def investigation_note(prechecks: list[StructuredPrecheckReceipt] | None) -> str:
    """Format a one-line 'Checked: X, Y, Z.' from precheck receipts.

    Returns empty string if no prechecks ran or list is empty.
    """
    if not prechecks:
        return ""
    checked = [
        pc.name.replace("_", " ")
        for pc in prechecks
        if pc.status not in ("unavailable",)
    ]
    if not checked:
        return ""
    return "Checked: " + ", ".join(checked) + "."


# ── Context-aware fallback ────────────────────────────────────────────

def _entity_label(entity_type: str | None, entity_name: str | None) -> str:
    if entity_name:
        prefix = entity_type.replace("_", " ").title() if entity_type else "Entity"
        return f"{prefix}: {entity_name}"
    return ""


def _navigation_suggestions_for_reason(
    reason: DegradedReason,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    entity_name: str | None = None,
    env_id: str | None = None,
    skill_id: str | None = None,
) -> list[dict[str, str]]:
    """Generate contextual suggestions based on degraded reason and entity context."""
    suggestions: list[dict[str, str]] = []

    # One navigation suggestion max
    if reason == DegradedReason.RETRIEVAL_EMPTY:
        if entity_type == "fund" and entity_id and env_id:
            suggestions.append({
                "label": f"View {entity_name or 'Fund'} detail",
                "path": f"/lab/env/{env_id}/re/funds/{entity_id}",
            })
        elif entity_type == "asset" and entity_id and env_id:
            suggestions.append({
                "label": f"View {entity_name or 'Asset'} detail",
                "path": f"/lab/env/{env_id}/re/assets/{entity_id}",
            })

    # Up to two query suggestions based on entity context
    if entity_name and entity_type == "fund":
        suggestions.append({
            "type": "query",
            "label": f"Show holdings for {entity_name}",
            "message": f"What does {entity_name} own?",
        })
    elif entity_name:
        suggestions.append({
            "type": "query",
            "label": f"Show metrics for {entity_name}",
            "message": f"What are the key metrics for {entity_name}?",
        })

    return suggestions[:3]


def _build_context_message(
    reason: DegradedReason,
    *,
    entity_type: str | None = None,
    entity_name: str | None = None,
    skill_id: str | None = None,
    prechecks: list[StructuredPrecheckReceipt] | None = None,
) -> str:
    """Build a human-readable degraded message with entity context and investigation note."""
    entity_label = _entity_label(entity_type, entity_name)
    note = investigation_note(prechecks)
    suffix = f" {note}" if note else ""

    if reason == DegradedReason.RETRIEVAL_EMPTY:
        if entity_label and skill_id:
            skill_display = skill_id.replace("_", " ")
            return (
                f"The data needed to {skill_display} for {entity_label} "
                f"is not available in the environment data.{suffix}"
            )
        if entity_label:
            return (
                f"No matching records found for {entity_label} in available data.{suffix}"
            )
        return f"No relevant data found for this request. Specify the entity name directly.{suffix}"

    if reason == DegradedReason.MISSING_CONTEXT:
        return f"I need more context. Specify the fund, asset, or entity name.{suffix}"

    if reason == DegradedReason.AMBIGUOUS_CONTEXT:
        return f"That reference is ambiguous. Which entity are you referring to?{suffix}"

    if reason == DegradedReason.NO_SKILL_MATCH:
        return (
            "I'm not sure how to handle this request. "
            "Try asking about a metric, entity, or use a phrase like 'show me', 'compare', or 'trend'."
        )

    if reason == DegradedReason.NO_RESPONSE:
        if skill_id and skill_id in _SKILL_FALLBACKS:
            return f"{_SKILL_FALLBACKS[skill_id]}{suffix}"
        return f"I wasn't able to generate a response. Try rephrasing or specifying more context.{suffix}"

    return _MESSAGES[reason]


def degraded_blocks_with_context(
    reason: DegradedReason,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    entity_name: str | None = None,
    env_id: str | None = None,
    skill_id: str | None = None,
    prechecks: list[StructuredPrecheckReceipt] | None = None,
) -> tuple[list[dict[str, Any]], str]:
    """Generate context-aware degraded blocks with suggestions.

    Returns (blocks, message_text).
    """
    message_text = _build_context_message(
        reason,
        entity_type=entity_type,
        entity_name=entity_name,
        skill_id=skill_id,
        prechecks=prechecks,
    )

    blocks: list[dict[str, Any]] = [
        markdown_block(message_text),
    ]

    nav_suggestions = _navigation_suggestions_for_reason(
        reason,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        env_id=env_id,
        skill_id=skill_id,
    )
    if nav_suggestions:
        blocks.append(navigation_suggestion_block(nav_suggestions))

    blocks.append(
        error_block(message=message_text, title="Context-aware fallback", recoverable=True),
    )

    return blocks, message_text


def empty_response_fallback(
    *,
    skill_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    entity_name: str | None = None,
    env_id: str | None = None,
    prechecks: list[StructuredPrecheckReceipt] | None = None,
) -> tuple[list[dict[str, Any]], str]:
    """Safety-net fallback when the LLM produces empty content and no response blocks."""
    return degraded_blocks_with_context(
        DegradedReason.NO_RESPONSE,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        env_id=env_id,
        skill_id=skill_id,
        prechecks=prechecks,
    )
