from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.assistant_runtime.turn_receipts import ContextReceipt, ContextResolutionStatus
from app.schemas.ai_gateway import AssistantContextEnvelope, AssistantSelectedEntity, ResolvedAssistantScope
from app.services.assistant_scope import ensure_context_envelope, resolve_assistant_scope

_DEICTIC_RE = re.compile(r"\b(this|that|current|selected|it|these|those|other|second|first|next|previous)\b", re.IGNORECASE)
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


def _resolve_from_thread_state(
    *,
    thread_entity_state: dict[str, Any] | None,
    focus_entities: list[AssistantSelectedEntity],
    resolved: ResolvedAssistantScope,
) -> tuple[str | None, str | None, str | None]:
    """Check thread entity state for a previously resolved entity.

    Returns (entity_type, entity_id, entity_name) if a match is found among
    focus entities, or (None, None, None) if no match.
    """
    if not thread_entity_state:
        return None, None, None
    resolved_entities = thread_entity_state.get("resolved_entities", [])
    if not resolved_entities:
        return None, None, None

    focus_keys = {(e.entity_type, e.entity_id) for e in focus_entities}
    # Check most recently resolved first
    for entry in reversed(resolved_entities):
        key = (entry.get("entity_type"), entry.get("entity_id"))
        if key in focus_keys:
            return entry.get("entity_type"), entry.get("entity_id"), entry.get("name")

    # Even if not in focus entities, if the thread has a resolved entity
    # in the same environment, use it for follow-up turns
    env_id = resolved.environment_id
    if env_id:
        for entry in reversed(resolved_entities):
            if entry.get("entity_type") and entry.get("entity_id"):
                return entry.get("entity_type"), entry.get("entity_id"), entry.get("name")

    return None, None, None


def resolve_runtime_context(
    *,
    context_envelope: AssistantContextEnvelope | dict[str, Any] | None,
    env_id: str | None,
    business_id: str | None,
    conversation_id: str | None,
    actor: str,
    message: str,
    thread_entity_state: dict[str, Any] | None = None,
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
    inherited_entity_id: str | None = None
    inherited_entity_source: str | None = None
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
        # Before marking as ambiguous, check thread entity state for a
        # previously resolved entity (e.g., from a clarification turn).
        thread_type, thread_id, thread_name = _resolve_from_thread_state(
            thread_entity_state=thread_entity_state,
            focus_entities=focus_entities,
            resolved=resolved,
        )
        if thread_id:
            # Thread state has a resolved entity — use it instead of degrading
            resolved = ResolvedAssistantScope(
                resolved_scope_type=thread_type or resolved.resolved_scope_type,
                environment_id=resolved.environment_id,
                business_id=resolved.business_id,
                schema_name=resolved.schema_name,
                industry=resolved.industry,
                entity_type=thread_type,
                entity_id=thread_id,
                entity_name=thread_name,
                confidence=0.88,
                source="thread_entity_state",
            )
            inherited_entity_id = thread_id
            inherited_entity_source = "thread_state"
            notes.append(f"Inherited entity {thread_name or thread_id} from prior turn thread state.")
        else:
            status = ContextResolutionStatus.AMBIGUOUS_CONTEXT
            notes.append("Multiple selected entities were available for a deictic request.")

    # For non-deictic follow-up requests with no explicit entity reference,
    # if the resolved scope has no entity but thread state does, inherit it.
    if (
        status == ContextResolutionStatus.RESOLVED
        and not resolved.entity_id
        and thread_entity_state
        and not _has_explicit_focus_reference(message, focus_entities)
    ):
        thread_type, thread_id, thread_name = _resolve_from_thread_state(
            thread_entity_state=thread_entity_state,
            focus_entities=focus_entities,
            resolved=resolved,
        )
        if thread_id:
            resolved = ResolvedAssistantScope(
                resolved_scope_type=thread_type or resolved.resolved_scope_type,
                environment_id=resolved.environment_id,
                business_id=resolved.business_id,
                schema_name=resolved.schema_name,
                industry=resolved.industry,
                entity_type=thread_type,
                entity_id=thread_id,
                entity_name=thread_name,
                confidence=0.85,
                source="thread_entity_state",
            )
            inherited_entity_id = thread_id
            inherited_entity_source = "thread_state"
            notes.append(f"Inherited entity {thread_name or thread_id} from thread state for follow-up.")

    receipt = ContextReceipt(
        environment_id=resolved.environment_id,
        entity_type=None if status == ContextResolutionStatus.AMBIGUOUS_CONTEXT else resolved.entity_type,
        entity_id=None if status == ContextResolutionStatus.AMBIGUOUS_CONTEXT else resolved.entity_id,
        resolution_status=status,
        notes=notes,
        inherited_entity_id=inherited_entity_id,
        inherited_entity_source=inherited_entity_source,
    )
    return RuntimeContext(envelope=normalized, resolved_scope=resolved, receipt=receipt)
