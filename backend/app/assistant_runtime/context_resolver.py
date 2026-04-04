from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.assistant_runtime.turn_receipts import ContextReceipt, ContextResolutionStatus
from app.schemas.ai_gateway import AssistantContextEnvelope, ResolvedAssistantScope
from app.services.assistant_scope import ensure_context_envelope, resolve_assistant_scope

_DEICTIC_RE = re.compile(r"\b(this|that|current|selected|it|these|those)\b", re.IGNORECASE)


@dataclass(frozen=True)
class RuntimeContext:
    envelope: AssistantContextEnvelope
    resolved_scope: ResolvedAssistantScope
    receipt: ContextReceipt


def resolve_runtime_context(
    *,
    context_envelope: AssistantContextEnvelope | dict[str, Any] | None,
    env_id: str | None,
    business_id: str | None,
    conversation_id: str | None,
    actor: str,
    message: str,
) -> RuntimeContext:
    normalized = ensure_context_envelope(
        context_envelope=context_envelope,
        env_id=env_id,
        business_id=business_id,
        conversation_id=conversation_id,
        actor=actor,
    )
    resolved = resolve_assistant_scope(
        user=actor,
        context_envelope=normalized,
        user_message=message,
        fallback_env_id=env_id,
        fallback_business_id=business_id,
    )

    notes: list[str] = []
    status = ContextResolutionStatus.RESOLVED
    if not (resolved.environment_id or resolved.entity_id or resolved.business_id):
        status = ContextResolutionStatus.MISSING_CONTEXT
        notes.append("No environment, business, or entity scope could be resolved.")

    if _DEICTIC_RE.search(message or "") and len(normalized.ui.selected_entities) > 1 and not resolved.entity_id:
        status = ContextResolutionStatus.AMBIGUOUS_CONTEXT
        notes.append("Multiple selected entities were available for a deictic request.")

    receipt = ContextReceipt(
        environment_id=resolved.environment_id,
        entity_type=resolved.entity_type,
        entity_id=resolved.entity_id,
        resolution_status=status,
        notes=notes,
    )
    return RuntimeContext(envelope=normalized, resolved_scope=resolved, receipt=receipt)

