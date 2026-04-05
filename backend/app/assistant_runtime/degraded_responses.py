from __future__ import annotations

from typing import Any

from app.assistant_runtime.turn_receipts import DegradedReason
from app.services.assistant_blocks import error_block, markdown_block, navigation_suggestion_block


# ── Static fallback messages (last resort) ────────────────────────────
_MESSAGES: dict[DegradedReason, str] = {
    DegradedReason.MISSING_CONTEXT: "Context not available.",
    DegradedReason.AMBIGUOUS_CONTEXT: "Context is ambiguous.",
    DegradedReason.TOOL_DENIED: "The requested action is not allowed in the current mode.",
    DegradedReason.TOOL_FAILED: "A required tool failed during execution.",
    DegradedReason.RETRIEVAL_EMPTY: "Not available in the current context.",
    DegradedReason.NO_SKILL_MATCH: "Winston could not determine the task type for this request.",
}


def degraded_message(reason: DegradedReason) -> str:
    return _MESSAGES[reason]


def degraded_blocks(reason: DegradedReason) -> list[dict]:
    message = degraded_message(reason)
    return [
        markdown_block(message),
        error_block(message=message, title="Deterministic runtime degraded", recoverable=True),
    ]


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
    """Generate contextual navigation suggestions based on degraded reason and entity context."""
    suggestions: list[dict[str, str]] = []

    if reason == DegradedReason.RETRIEVAL_EMPTY:
        if entity_type == "fund" and entity_id and env_id:
            suggestions.append({
                "label": f"View {entity_name or 'Fund'} overview",
                "path": f"/lab/env/{env_id}/re/funds/{entity_id}",
            })
            suggestions.append({
                "label": f"View {entity_name or 'Fund'} financials",
                "path": f"/lab/env/{env_id}/re/funds/{entity_id}/financials",
            })
        elif entity_type == "asset" and entity_id and env_id:
            suggestions.append({
                "label": f"View {entity_name or 'Asset'} detail",
                "path": f"/lab/env/{env_id}/re/assets/{entity_id}",
            })
        elif env_id:
            suggestions.append({
                "label": "View environment dashboard",
                "path": f"/lab/env/{env_id}/re",
            })

    if reason == DegradedReason.MISSING_CONTEXT:
        if env_id:
            suggestions.append({
                "label": "Browse funds",
                "path": f"/lab/env/{env_id}/re/funds",
            })
            suggestions.append({
                "label": "Browse assets",
                "path": f"/lab/env/{env_id}/re/assets",
            })

    # Always suggest related queries when we have entity context
    related_queries: list[dict[str, str]] = []
    if entity_name:
        related_queries.append({
            "type": "query",
            "label": "List all funds in this environment",
            "message": "How many funds are in this environment?",
        })
        if entity_type == "fund":
            related_queries.append({
                "type": "query",
                "label": f"Show assets in {entity_name}",
                "message": f"What assets are in {entity_name}?",
            })
    if related_queries:
        suggestions.extend(related_queries)

    return suggestions


def _build_context_message(
    reason: DegradedReason,
    *,
    entity_type: str | None = None,
    entity_name: str | None = None,
    skill_id: str | None = None,
) -> str:
    """Build a human-readable degraded message that includes entity context."""
    entity_label = _entity_label(entity_type, entity_name)

    if reason == DegradedReason.RETRIEVAL_EMPTY:
        if entity_label and skill_id:
            skill_display = skill_id.replace("_", " ")
            return (
                f"I wasn't able to find the data needed to {skill_display} for {entity_label}. "
                f"This may mean the data hasn't been loaded yet, or the entity doesn't have records for this metric."
            )
        if entity_label:
            return (
                f"I wasn't able to retrieve data for {entity_label}. "
                f"The entity exists but may not have the specific records needed to answer."
            )
        return "I wasn't able to find relevant data for this request. Try navigating to a specific entity page or naming the entity directly."

    if reason == DegradedReason.MISSING_CONTEXT:
        return (
            "I need more context to answer this question. "
            "Try naming a specific fund, asset, or entity, or navigate to an entity page."
        )

    if reason == DegradedReason.AMBIGUOUS_CONTEXT:
        return (
            "Your question is ambiguous in the current context. "
            "Could you specify which entity you're referring to?"
        )

    if reason == DegradedReason.NO_SKILL_MATCH:
        return (
            "I'm not sure how to handle this type of request. "
            "Try asking about a specific metric, entity, or use a phrase like "
            "'show me', 'compare', 'trend', or 'explain'."
        )

    return _MESSAGES[reason]


def degraded_blocks_with_context(
    reason: DegradedReason,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    entity_name: str | None = None,
    env_id: str | None = None,
    skill_id: str | None = None,
) -> tuple[list[dict[str, Any]], str]:
    """Generate context-aware degraded blocks with navigation suggestions.

    Returns (blocks, message_text).
    """
    message_text = _build_context_message(
        reason,
        entity_type=entity_type,
        entity_name=entity_name,
        skill_id=skill_id,
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
