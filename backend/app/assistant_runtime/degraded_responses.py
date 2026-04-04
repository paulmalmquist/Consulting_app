from __future__ import annotations

from app.assistant_runtime.turn_receipts import DegradedReason
from app.services.assistant_blocks import error_block, markdown_block


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

