from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.assistant_runtime.turn_receipts import ContextReceipt, ContextResolutionStatus
from app.schemas.ai_gateway import AssistantContextEnvelope, AssistantSelectedEntity, ResolvedAssistantScope
from app.services.assistant_scope import ensure_context_envelope, resolve_assistant_scope

_DEICTIC_RE = re.compile(r"\b(this|that|current|selected|it|these|those)\b", re.IGNORECASE)
_SPACE_RE = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class RuntimeContext:
    envelope: AssistantContextEnvelope
    resolved_scope: ResolvedAssistantScope
    receipt: ContextReceipt


def _normalize_text(value: str | None) -> str:
    return _SPACE_RE.sub(" ", (value or "").lower()).strip()


def _focus_entities(envelope: AssistantContextEnvelope) -> list[AssistantSelectedEntity]:
    entities: list[AssistantSelectedEntity] = []
    seen: set[tuple[str, str]] = set()

    def append(entity: AssistantSelectedEntity | None) -> None:
        if entity is None or entity.entity_type == "environment":
            return
        key = (entity.entity_type, entity.entity_id)
        if key in seen:
            return
        seen.add(key)
        entities.append(entity)

    for entity in envelope.ui.selected_entities:
        append(entity)
    if envelope.ui.page_entity_type and envelope.ui.page_entity_id:
        append(
            AssistantSelectedEntity(
                entity_type=envelope.ui.page_entity_type,
                entity_id=envelope.ui.page_entity_id,
                name=envelope.ui.page_entity_name,
                source="page",
            )
        )
    return entities


def _has_explicit_focus_reference(message: str, focus_entities: list[AssistantSelectedEntity]) -> bool:
    normalized_message = _normalize_text(message)
    if not normalized_message:
        return False
    for entity in focus_entities:
        name = _normalize_text(entity.name)
        if name and name in normalized_message:
            return True
    return False


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

    focus_entities = _focus_entities(normalized)
    if (
        _DEICTIC_RE.search(message or "")
        and len(focus_entities) > 1
        and not _has_explicit_focus_reference(message, focus_entities)
    ):
        status = ContextResolutionStatus.AMBIGUOUS_CONTEXT
        notes.append("Multiple selected entities were available for a deictic request.")

    receipt = ContextReceipt(
        environment_id=resolved.environment_id,
        entity_type=None if status == ContextResolutionStatus.AMBIGUOUS_CONTEXT else resolved.entity_type,
        entity_id=None if status == ContextResolutionStatus.AMBIGUOUS_CONTEXT else resolved.entity_id,
        resolution_status=status,
        notes=notes,
    )
    return RuntimeContext(envelope=normalized, resolved_scope=resolved, receipt=receipt)
