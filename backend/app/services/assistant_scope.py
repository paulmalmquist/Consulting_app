from __future__ import annotations

import json
import re
import time
from typing import Any, Iterable

from app.schemas.ai_gateway import (
    AssistantContextEnvelope,
    AssistantSelectedEntity,
    AssistantVisibleData,
    AssistantVisibleRecord,
    ResolvedAssistantScope,
)
from app.services.env_context import EnvContextError, resolve_env_business_context

# ── Environment context cache (5-minute TTL) ────────────────────────
_env_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_ENV_CACHE_TTL = 300  # seconds

def _cached_resolve_env(env_id: str | None, business_id: str | None) -> dict[str, Any] | None:
    key = f"{env_id}:{business_id}"
    now = time.time()
    cached = _env_cache.get(key)
    if cached and now - cached[0] < _ENV_CACHE_TTL:
        return cached[1]
    return None

def _set_env_cache(env_id: str | None, business_id: str | None, data: dict[str, Any]) -> None:
    key = f"{env_id}:{business_id}"
    _env_cache[key] = (time.time(), data)
    # Evict old entries if cache grows too large
    if len(_env_cache) > 100:
        cutoff = time.time() - _ENV_CACHE_TTL
        stale = [k for k, (ts, _) in _env_cache.items() if ts < cutoff]
        for k in stale:
            _env_cache.pop(k, None)

_SPACE_RE = re.compile(r"[^a-z0-9]+")
_DEICTIC_RE = re.compile(r"\b(this|current|selected|that|these|those|it|here|other|second|first|next|previous)\b")
_LIST_QUERY_RE = re.compile(r"\b(which|what|list|show|give|tell)\b.*\b(funds?|assets?|investments?|deals?|models?|pipeline)\b")
_COUNT_QUERY_RE = re.compile(r"\b(how many|count|number of|total)\b.*\b(funds?|assets?|investments?|deals?|models?|pipeline|entities)\b")
_IDENTITY_QUERY_RE = re.compile(r"\b(what|which)\b.*\b(environment|env|page|workspace|module|schema|industry)\b")
_SIMPLE_META_KEYWORDS = ("strategy", "vintage", "status", "type", "name", "stage", "target_size", "committed")
_ENTITY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "fund": ("fund", "vehicle"),
    "asset": ("asset", "property"),
    "investment": ("investment", "deal"),
    "deal": ("deal", "investment"),
    "model": ("model", "scenario"),
    "pipeline_deal": ("pipeline", "deal"),
    "portfolio": ("portfolio",),
    "loan": ("loan", "obligation"),
    "policy": ("policy", "underwriting"),
    "borrower": ("borrower", "counterparty"),
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


def _focus_candidates(envelope: AssistantContextEnvelope) -> list[AssistantSelectedEntity]:
    candidates: list[AssistantSelectedEntity] = []
    seen: set[tuple[str, str]] = set()

    def append(entity: AssistantSelectedEntity | None) -> None:
        if entity is None or entity.entity_type == "environment":
            return
        key = (entity.entity_type, entity.entity_id)
        if key in seen:
            return
        seen.add(key)
        candidates.append(entity)

    for entity in envelope.ui.selected_entities:
        append(entity)
    append(_entity_from_page(envelope))
    return candidates


def _selected_focus_entity(
    *,
    message: str,
    envelope: AssistantContextEnvelope,
) -> AssistantSelectedEntity | None:
    normalized = _normalize_text(message)
    if not normalized or not _DEICTIC_RE.search(normalized):
        return None

    candidates = _focus_candidates(envelope)
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    narrowed = [entity for entity in candidates if _message_refers_to_selected_scope(message, entity.entity_type)]
    if len(narrowed) == 1:
        return narrowed[0]
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
        # Check cache first to avoid DB round-trip
        cached = _cached_resolve_env(str(env_id) if env_id else None, str(business_id) if business_id else None)
        if cached:
            env_id = _pick_first(cached.get("env_id"), env_id)
            business_id = _pick_first(cached.get("business_id"), business_id)
            schema_name = _pick_first(cached.get("schema_name"), schema_name)
            industry = _pick_first(cached.get("industry"), industry)
        else:
            try:
                ctx = resolve_env_business_context(
                    env_id=str(env_id) if env_id else None,
                    business_id=str(business_id) if business_id else None,
                    allow_create=False,
                )
                env_id = _pick_first(ctx.env_id, env_id)
                business_id = _pick_first(ctx.business_id, business_id)
                resolved_schema = schema_name
                resolved_industry = industry
                if ctx.environment:
                    resolved_schema = _pick_first(ctx.environment.get("schema_name"), schema_name)
                    resolved_industry = _pick_first(
                        ctx.environment.get("industry_type"),
                        ctx.environment.get("industry"),
                        industry,
                    )
                schema_name = resolved_schema
                industry = resolved_industry
                _set_env_cache(
                    str(env_id) if env_id else None,
                    str(business_id) if business_id else None,
                    {"env_id": env_id, "business_id": business_id, "schema_name": schema_name, "industry": industry},
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

    lines = [
        "CURRENT APPLICATION CONTEXT",
        "",
        "## User-Visible Context (safe to reference in responses)",
        f"Active environment: {context_envelope.ui.active_environment_name or 'unknown'}",
        f"Industry: {context_envelope.ui.industry or 'unknown'}",
        f"Current page: {context_envelope.ui.surface or 'unknown'}",
        f"Selected entities: {selected_entities}",
        f"Resolved scope: {resolved_scope.resolved_scope_type}:{resolved_scope.entity_name or 'auto-resolved'}",
        "",
        "## Internal Context (use for scope resolution — NEVER include in responses)",
        f"Environment ID: {context_envelope.ui.active_environment_id or 'unknown'}",
        f"Business ID: {context_envelope.ui.active_business_id or context_envelope.session.org_id or 'unknown'}",
        f"Schema: {context_envelope.ui.schema_name or 'unknown'}",
        f"Route: {context_envelope.ui.route or 'unknown'}",
        f"Page entity: {context_envelope.ui.page_entity_type or 'unknown'}:{context_envelope.ui.page_entity_id or 'unknown'}",
        "",
        "## Response Rules",
        "- NEVER include UUIDs, schema names, route paths, or environment IDs in your responses.",
        "- Refer to entities by their human-readable NAME, not their ID.",
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
    # NOTE: Full envelope JSON removed to reduce prompt tokens (~30-50% savings).
    # The structured fields above contain the same information in compact form.
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

    # ── Identity queries: "what environment", "which page", "what module" ──
    if _IDENTITY_QUERY_RE.search(normalized_message):
        env_name = context_envelope.ui.active_environment_name or context_envelope.ui.active_environment_id
        route = context_envelope.ui.route
        module = context_envelope.ui.active_module
        if env_name or route:
            parts = []
            if env_name:
                parts.append(f"Environment: {env_name}")
            if route:
                parts.append(f"Route: {route}")
            if module:
                parts.append(f"Module: {module}")
            if context_envelope.ui.schema_name:
                parts.append(f"Schema: {context_envelope.ui.schema_name}")
            if context_envelope.ui.industry:
                parts.append(f"Industry: {context_envelope.ui.industry}")
            instructions.append(f"Answer from UI context: {'; '.join(parts)}. No tools needed.")
            disable_tools = True

    # ── Count queries: "how many funds", "total assets" ──
    if not disable_tools and visible_data and _COUNT_QUERY_RE.search(normalized_message):
        counts = []
        if visible_data.funds and any(w in normalized_message for w in ("fund", "funds", "vehicle")):
            counts.append(f"{len(visible_data.funds)} fund(s)")
        if visible_data.assets and any(w in normalized_message for w in ("asset", "assets", "property", "properties")):
            counts.append(f"{len(visible_data.assets)} asset(s)")
        if visible_data.investments and any(w in normalized_message for w in ("investment", "investments", "deal", "deals")):
            counts.append(f"{len(visible_data.investments)} investment(s)/deal(s)")
        if visible_data.models and any(w in normalized_message for w in ("model", "models", "scenario")):
            counts.append(f"{len(visible_data.models)} model(s)")
        if visible_data.pipeline_items and "pipeline" in normalized_message:
            counts.append(f"{len(visible_data.pipeline_items)} pipeline item(s)")
        if counts:
            instructions.append(f"Visible data shows: {', '.join(counts)}. Answer from visible data.")
            disable_tools = True

    # ── List queries: "which funds", "show assets", "list investments" ──
    if not disable_tools and visible_data and _LIST_QUERY_RE.search(normalized_message):
        for entity_word, records in [
            ("fund", visible_data.funds),
            ("asset", visible_data.assets),
            ("investment", visible_data.investments),
            ("deal", visible_data.investments),  # deals = investments in REPE
            ("model", visible_data.models),
            ("pipeline", visible_data.pipeline_items),
        ]:
            if records and entity_word in normalized_message:
                names = ", ".join(r.name for r in records[:8])
                instructions.append(f"Visible {entity_word} list: {names}. Answer from visible data, do not call tools.")
                disable_tools = True
                break

    # ── Simple metadata lookup on an explicit entity ──
    if not disable_tools:
        explicit_entity = _match_explicit_entity(message=user_message, envelope=context_envelope)
        if explicit_entity:
            visible_record = _find_visible_record(
                visible_data,
                entity_type=explicit_entity.entity_type,
                entity_id=explicit_entity.entity_id,
                entity_name=explicit_entity.name,
            )
            if visible_record and visible_record.metadata:
                matched_keys = [k for k in _SIMPLE_META_KEYWORDS if k in normalized_message]
                if matched_keys:
                    available = {k: v for k, v in (visible_record.metadata or {}).items() if k in matched_keys and v is not None}
                    if available:
                        meta_str = ", ".join(f"{k}={v}" for k, v in available.items())
                        instructions.append(
                            f"Visible metadata for {visible_record.name}: {meta_str}. Answer from visible data."
                        )
                        disable_tools = True

    return {
        "disable_tools": disable_tools,
        "instructions": instructions,
    }
