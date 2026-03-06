from __future__ import annotations

import json
import re
from typing import Any, Iterable

from app.schemas.ai_gateway import (
    AssistantContextEnvelope,
    AssistantSelectedEntity,
    AssistantVisibleData,
    AssistantVisibleRecord,
    ResolvedAssistantScope,
)
from app.services.env_context import EnvContextError, resolve_env_business_context

_SPACE_RE = re.compile(r"[^a-z0-9]+")
_DEICTIC_RE = re.compile(r"\b(this|current|selected|that|these|it|here)\b")
_LIST_QUERY_RE = re.compile(r"\b(which|what|list|show)\b.*\b(funds|fund|assets|asset|investments|investment|models|model)\b")
_ENTITY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "fund": ("fund", "vehicle"),
    "asset": ("asset", "property"),
    "investment": ("investment", "deal"),
    "deal": ("deal", "investment"),
    "model": ("model", "scenario"),
    "pipeline_deal": ("pipeline", "deal"),
}


def _normalize_text(value: str | None) -> str:
    return _SPACE_RE.sub(" ", (value or "").lower()).strip()


def _is_present(value: Any) -> bool:
    return value not in (None, "", [], {}, ())


def _pick_first(*values: Any) -> Any:
    for value in values:
        if _is_present(value):
            return value
    return None


def _entity_from_page(envelope: AssistantContextEnvelope) -> AssistantSelectedEntity | None:
    page_entity_type = envelope.ui.page_entity_type
    page_entity_id = envelope.ui.page_entity_id
    if not page_entity_type or not page_entity_id:
        return None
    return AssistantSelectedEntity(
        entity_type=page_entity_type,
        entity_id=page_entity_id,
        name=envelope.ui.page_entity_name,
        source="page",
    )


def _iter_visible_records(visible_data: AssistantVisibleData | None) -> Iterable[AssistantVisibleRecord]:
    if not visible_data:
        return []
    return [
        *visible_data.funds,
        *visible_data.investments,
        *visible_data.assets,
        *visible_data.models,
        *visible_data.pipeline_items,
    ]


def _named_entities(envelope: AssistantContextEnvelope) -> list[AssistantSelectedEntity]:
    entities: list[AssistantSelectedEntity] = []
    seen: set[tuple[str, str]] = set()

    def append(entity: AssistantSelectedEntity | None) -> None:
        if entity is None:
            return
        key = (entity.entity_type, entity.entity_id)
        if key in seen:
            return
        seen.add(key)
        entities.append(entity)

    append(_entity_from_page(envelope))
    for entity in envelope.ui.selected_entities:
        append(entity)
    for record in _iter_visible_records(envelope.ui.visible_data):
        append(
            AssistantSelectedEntity(
                entity_type=record.entity_type,
                entity_id=record.entity_id,
                name=record.name,
                source="visible_data",
                parent_entity_type=record.parent_entity_type,
                parent_entity_id=record.parent_entity_id,
                metadata=record.metadata,
            )
        )
    return entities


def _match_explicit_entity(
    *,
    message: str,
    envelope: AssistantContextEnvelope,
) -> AssistantSelectedEntity | None:
    normalized_message = _normalize_text(message)
    if not normalized_message:
        return None

    ranked = sorted(
        [entity for entity in _named_entities(envelope) if _normalize_text(entity.name)],
        key=lambda entity: len(_normalize_text(entity.name)),
        reverse=True,
    )
    for entity in ranked:
        name = _normalize_text(entity.name)
        if name and name in normalized_message:
            return entity
    return None


def _find_visible_record(
    visible_data: AssistantVisibleData | None,
    entity_type: str,
    entity_id: str | None = None,
    entity_name: str | None = None,
) -> AssistantVisibleRecord | None:
    if visible_data is None:
        return None
    normalized_name = _normalize_text(entity_name)
    for record in _iter_visible_records(visible_data):
        if record.entity_type != entity_type:
            continue
        if entity_id and record.entity_id == entity_id:
            return record
        if normalized_name and _normalize_text(record.name) == normalized_name:
            return record
    return None


def _message_refers_to_selected_scope(message: str, entity_type: str | None) -> bool:
    normalized = _normalize_text(message)
    if not normalized or not entity_type:
        return False
    if not _DEICTIC_RE.search(normalized):
        return False
    keywords = _ENTITY_KEYWORDS.get(entity_type, (entity_type,))
    return any(keyword in normalized for keyword in keywords)


def _selected_focus_entity(
    *,
    message: str,
    envelope: AssistantContextEnvelope,
) -> AssistantSelectedEntity | None:
    for entity in envelope.ui.selected_entities:
        if entity.entity_type == "environment":
            continue
        if _message_refers_to_selected_scope(message, entity.entity_type):
            return entity
    page_entity = _entity_from_page(envelope)
    if page_entity and page_entity.entity_type != "environment" and _message_refers_to_selected_scope(message, page_entity.entity_type):
        return page_entity
    return None


def _context_base(
    *,
    envelope: AssistantContextEnvelope,
    fallback_env_id: str | None = None,
    fallback_business_id: str | None = None,
) -> dict[str, Any]:
    env_id = _pick_first(
        envelope.ui.active_environment_id,
        fallback_env_id,
        envelope.session.session_env_id,
    )
    business_id = _pick_first(
        envelope.ui.active_business_id,
        fallback_business_id,
        envelope.session.org_id,
    )

    schema_name = envelope.ui.schema_name
    industry = envelope.ui.industry
    if env_id or business_id:
        try:
            ctx = resolve_env_business_context(
                env_id=str(env_id) if env_id else None,
                business_id=str(business_id) if business_id else None,
                allow_create=False,
            )
            env_id = _pick_first(ctx.env_id, env_id)
            business_id = _pick_first(ctx.business_id, business_id)
            if ctx.environment:
                schema_name = _pick_first(ctx.environment.get("schema_name"), schema_name)
                industry = _pick_first(
                    ctx.environment.get("industry_type"),
                    ctx.environment.get("industry"),
                    industry,
                )
        except EnvContextError:
            pass
        except Exception:
            pass

    return {
        "environment_id": str(env_id) if env_id else None,
        "business_id": str(business_id) if business_id else None,
        "schema_name": schema_name,
        "industry": industry,
    }


def ensure_context_envelope(
    *,
    context_envelope: AssistantContextEnvelope | dict[str, Any] | None,
    env_id: str | None = None,
    business_id: str | None = None,
    conversation_id: str | None = None,
    actor: str | None = None,
) -> AssistantContextEnvelope:
    envelope = (
        context_envelope
        if isinstance(context_envelope, AssistantContextEnvelope)
        else AssistantContextEnvelope.model_validate(context_envelope or {})
    )

    if not envelope.session.actor and actor:
        envelope.session.actor = actor
    if not envelope.session.org_id and business_id:
        envelope.session.org_id = business_id
    if not envelope.ui.active_business_id and business_id:
        envelope.ui.active_business_id = business_id
    if not envelope.ui.active_environment_id and env_id:
        envelope.ui.active_environment_id = env_id
    if not envelope.session.session_env_id and env_id:
        envelope.session.session_env_id = env_id
    if not envelope.thread.thread_id and conversation_id:
        envelope.thread.thread_id = conversation_id
    if not envelope.thread.scope_type:
        envelope.thread.scope_type = "environment"
    if not envelope.thread.assistant_mode:
        envelope.thread.assistant_mode = "environment_copilot"
    if not envelope.thread.launch_source:
        envelope.thread.launch_source = "winston_commandbar"
    return envelope


def resolve_assistant_scope(
    *,
    user: str,
    context_envelope: AssistantContextEnvelope,
    user_message: str,
    fallback_env_id: str | None = None,
    fallback_business_id: str | None = None,
) -> ResolvedAssistantScope:
    base = _context_base(
        envelope=context_envelope,
        fallback_env_id=fallback_env_id,
        fallback_business_id=fallback_business_id,
    )

    explicit_entity = _match_explicit_entity(message=user_message, envelope=context_envelope)
    if explicit_entity is not None:
        return ResolvedAssistantScope(
            resolved_scope_type=explicit_entity.entity_type,
            entity_type=explicit_entity.entity_type,
            entity_id=explicit_entity.entity_id,
            entity_name=explicit_entity.name,
            confidence=0.98,
            source="message:ui_context",
            **base,
        )

    selected_entity = _selected_focus_entity(message=user_message, envelope=context_envelope)
    if selected_entity is not None:
        return ResolvedAssistantScope(
            resolved_scope_type=selected_entity.entity_type,
            entity_type=selected_entity.entity_type,
            entity_id=selected_entity.entity_id,
            entity_name=selected_entity.name,
            confidence=0.94,
            source="selected_ui_entity",
            **base,
        )

    if context_envelope.ui.active_environment_id:
        return ResolvedAssistantScope(
            resolved_scope_type="environment",
            entity_type="environment",
            entity_id=context_envelope.ui.active_environment_id,
            entity_name=context_envelope.ui.active_environment_name,
            confidence=0.91,
            source="ui_context",
            **base,
        )

    if context_envelope.thread.scope_id and context_envelope.thread.scope_type:
        return ResolvedAssistantScope(
            resolved_scope_type=context_envelope.thread.scope_type,
            entity_type=context_envelope.thread.scope_type,
            entity_id=context_envelope.thread.scope_id,
            confidence=0.72,
            source="thread_scope",
            **base,
        )

    if context_envelope.session.session_env_id:
        session_base = _context_base(
            envelope=context_envelope,
            fallback_env_id=context_envelope.session.session_env_id,
            fallback_business_id=fallback_business_id,
        )
        return ResolvedAssistantScope(
            resolved_scope_type="environment",
            entity_type="environment",
            entity_id=context_envelope.session.session_env_id,
            confidence=0.66,
            source=f"user_default_environment:{user}",
            **session_base,
        )

    return ResolvedAssistantScope(
        resolved_scope_type="global",
        confidence=0.2,
        source="unresolved",
        **base,
    )


def _summarize_visible_data(visible_data: AssistantVisibleData | None) -> list[str]:
    if not visible_data:
        return []

    def summarize_records(label: str, records: list[AssistantVisibleRecord]) -> str | None:
        if not records:
            return None
        names = ", ".join(record.name for record in records[:8])
        suffix = "" if len(records) <= 8 else f", +{len(records) - 8} more"
        return f"{label}: {names}{suffix}"

    lines = [
        summarize_records("Visible funds", visible_data.funds),
        summarize_records("Visible investments", visible_data.investments),
        summarize_records("Visible assets", visible_data.assets),
        summarize_records("Visible models", visible_data.models),
        summarize_records("Visible pipeline items", visible_data.pipeline_items),
    ]
    if visible_data.metrics:
        lines.append(f"Visible metrics: {json.dumps(visible_data.metrics, default=str, ensure_ascii=True)}")
    if visible_data.notes:
        lines.append(f"UI notes: {'; '.join(visible_data.notes[:4])}")
    return [line for line in lines if line]


def _prompt_visible_data(visible_data: AssistantVisibleData | None) -> dict[str, Any] | None:
    if visible_data is None:
        return None
    return {
        **visible_data.model_dump(),
        "funds": [record.model_dump() for record in visible_data.funds[:12]],
        "investments": [record.model_dump() for record in visible_data.investments[:12]],
        "assets": [record.model_dump() for record in visible_data.assets[:12]],
        "models": [record.model_dump() for record in visible_data.models[:12]],
        "pipeline_items": [record.model_dump() for record in visible_data.pipeline_items[:12]],
    }


def build_context_block(
    *,
    context_envelope: AssistantContextEnvelope,
    resolved_scope: ResolvedAssistantScope,
    additional_instructions: list[str] | None = None,
) -> str:
    selected_entities = ", ".join(
        f"{entity.entity_type}:{entity.name or entity.entity_id}"
        for entity in context_envelope.ui.selected_entities[:6]
    ) or "none"
    visible_lines = _summarize_visible_data(context_envelope.ui.visible_data)
    envelope_json = json.dumps(
        {
            "session": context_envelope.session.model_dump(),
            "ui": {
                **context_envelope.ui.model_dump(),
                "visible_data": _prompt_visible_data(context_envelope.ui.visible_data),
            },
            "thread": context_envelope.thread.model_dump(),
            "resolved_scope": resolved_scope.model_dump(),
        },
        default=str,
        ensure_ascii=True,
    )

    lines = [
        "CURRENT APPLICATION CONTEXT",
        f"Route: {context_envelope.ui.route or 'unknown'}",
        f"Surface: {context_envelope.ui.surface or 'unknown'}",
        f"Active environment: {context_envelope.ui.active_environment_name or 'unknown'}",
        f"Environment ID: {context_envelope.ui.active_environment_id or 'unknown'}",
        f"Business ID: {context_envelope.ui.active_business_id or context_envelope.session.org_id or 'unknown'}",
        f"Schema: {context_envelope.ui.schema_name or 'unknown'}",
        f"Industry: {context_envelope.ui.industry or 'unknown'}",
        f"Page entity: {context_envelope.ui.page_entity_type or 'unknown'}:{context_envelope.ui.page_entity_id or 'unknown'}",
        f"Selected entities: {selected_entities}",
        f"Resolved scope: {resolved_scope.resolved_scope_type}:{resolved_scope.entity_name or resolved_scope.entity_id or resolved_scope.environment_id or 'unknown'}",
        "Instructions:",
        "- UI state is the primary source of truth.",
        "- Default unspecified portfolio questions to the active environment.",
        "- Never ask for identifiers already present in context.",
        "- If the page already shows the answer, use the UI data before calling tools.",
        "- When the user says 'we', assume the active environment.",
        "- For environment-wide questions without sufficient visible UI data, call repe.get_environment_snapshot first.",
    ]
    for instruction in additional_instructions or []:
        lines.append(f"- {instruction}")
    lines.extend(visible_lines)
    lines.append(f"Context envelope JSON: {envelope_json}")
    return "\n".join(lines)


def resolve_visible_context_policy(
    *,
    context_envelope: AssistantContextEnvelope,
    user_message: str,
) -> dict[str, Any]:
    normalized_message = _normalize_text(user_message)
    visible_data = context_envelope.ui.visible_data
    instructions: list[str] = []
    disable_tools = False

    if visible_data and visible_data.funds and _LIST_QUERY_RE.search(normalized_message) and "fund" in normalized_message:
        instructions.append("The visible funds list already answers the question. Do not call repe.list_funds.")
        disable_tools = True

    explicit_entity = _match_explicit_entity(message=user_message, envelope=context_envelope)
    if explicit_entity and explicit_entity.entity_type == "fund" and "strategy" in normalized_message:
        visible_fund = _find_visible_record(
            visible_data,
            entity_type="fund",
            entity_id=explicit_entity.entity_id,
            entity_name=explicit_entity.name,
        )
        if visible_fund and (visible_fund.metadata or {}).get("strategy") is not None:
            instructions.append(
                f"Visible metadata already includes the strategy for {visible_fund.name}. Answer from visible data."
            )
            disable_tools = True

    return {
        "disable_tools": disable_tools,
        "instructions": instructions,
    }
