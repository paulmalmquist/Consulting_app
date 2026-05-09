"""AI Conversation persistence service.

Manages conversation threads for Winston AI assistant.
Each conversation is scoped to a business_id and stores multi-turn message history.
"""
from __future__ import annotations

from functools import lru_cache
from uuid import UUID
from typing import Any

from app.db import get_cursor


_OPTIONAL_CONVERSATION_COLUMNS = (
    "thread_kind",
    "scope_type",
    "scope_id",
    "scope_label",
    "launch_source",
    "context_summary",
    "last_route",
    "thread_entity_state",
    "runtime",
    "anthropic_session_id",
    "anthropic_agent_id",
    "anthropic_agent_version",
    "anthropic_environment_id",
    "anthropic_vault_id",
    "session_health_checked_at",
    "session_health_status",
)


@lru_cache(maxsize=1)
def _conversation_table_columns() -> tuple[str, ...]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT column_name
               FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ai_conversations'"""
        )
        rows = cur.fetchall() or []

    columns: list[str] = []
    for row in rows:
        if isinstance(row, dict):
            name = row.get("column_name")
        else:
            name = row[0] if row else None
        if name:
            columns.append(str(name))
    return tuple(columns)


def _available_optional_columns() -> tuple[str, ...]:
    available = set(_conversation_table_columns())
    return tuple(column for column in _OPTIONAL_CONVERSATION_COLUMNS if column in available)


def _selectable_conversation_columns(*, alias: str = "", include_actor: bool = False) -> list[str]:
    prefix = f"{alias}." if alias else ""
    columns = [
        f"{prefix}conversation_id",
        f"{prefix}business_id",
        f"{prefix}env_id",
        f"{prefix}title",
        f"{prefix}created_at",
        f"{prefix}updated_at",
        f"{prefix}archived",
    ]
    if include_actor:
        columns.append(f"{prefix}actor")
    columns.extend(f"{prefix}{column}" for column in _available_optional_columns())
    return columns


def _normalize_conversation_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    normalized = dict(row)
    normalized.setdefault("thread_kind", "general")
    normalized.setdefault("scope_type", None)
    normalized.setdefault("scope_id", None)
    normalized.setdefault("scope_label", None)
    normalized.setdefault("launch_source", None)
    normalized.setdefault("context_summary", None)
    normalized.setdefault("last_route", None)
    normalized.setdefault("thread_entity_state", None)
    normalized.setdefault("actor", "anonymous")
    normalized.setdefault("runtime", "gateway")
    normalized.setdefault("anthropic_session_id", None)
    normalized.setdefault("anthropic_agent_id", None)
    normalized.setdefault("anthropic_agent_version", None)
    normalized.setdefault("anthropic_environment_id", None)
    normalized.setdefault("anthropic_vault_id", None)
    normalized.setdefault("session_health_checked_at", None)
    normalized.setdefault("session_health_status", None)
    return normalized


def create_conversation(
    *,
    business_id: UUID,
    env_id: UUID | None = None,
    title: str | None = None,
    thread_kind: str = "general",
    scope_type: str | None = None,
    scope_id: str | None = None,
    scope_label: str | None = None,
    launch_source: str | None = None,
    context_summary: str | None = None,
    last_route: str | None = None,
    actor: str = "anonymous",
    runtime: str = "gateway",
) -> dict[str, Any]:
    insert_payload: dict[str, Any] = {
        "business_id": str(business_id),
        "env_id": str(env_id) if env_id else None,
        "title": title,
        "actor": actor,
    }
    optional_values = {
        "thread_kind": thread_kind,
        "scope_type": scope_type,
        "scope_id": scope_id,
        "scope_label": scope_label,
        "launch_source": launch_source,
        "context_summary": context_summary,
        "last_route": last_route,
        "runtime": runtime,
    }
    for column in _available_optional_columns():
        if column in optional_values:
            insert_payload[column] = optional_values[column]

    returning = _selectable_conversation_columns(include_actor=True)

    with get_cursor() as cur:
        cur.execute(
            f"""INSERT INTO ai_conversations (
                   {", ".join(insert_payload.keys())}
               )
               VALUES ({", ".join(["%s"] * len(insert_payload))})
               RETURNING {", ".join(returning)}""",
            tuple(insert_payload.values()),
        )
        return _normalize_conversation_row(cur.fetchone()) or {}


def list_conversations(
    *,
    business_id: UUID,
    limit: int = 50,
    include_archived: bool = False,
    runtime: str | None = None,
) -> list[dict[str, Any]]:
    select_columns = ", ".join(_selectable_conversation_columns(alias="c"))
    runtime_filter_sql = ""
    runtime_params: tuple[Any, ...] = ()
    if runtime is not None and "runtime" in _conversation_table_columns():
        runtime_filter_sql = " AND c.runtime = %s"
        runtime_params = (runtime,)

    with get_cursor() as cur:
        if include_archived:
            cur.execute(
                f"""SELECT {select_columns},
                          (SELECT count(*) FROM ai_messages m WHERE m.conversation_id = c.conversation_id) AS message_count
                   FROM ai_conversations c
                   WHERE c.business_id = %s{runtime_filter_sql}
                   ORDER BY c.updated_at DESC
                   LIMIT %s""",
                (str(business_id), *runtime_params, limit),
            )
        else:
            cur.execute(
                f"""SELECT {select_columns},
                          (SELECT count(*) FROM ai_messages m WHERE m.conversation_id = c.conversation_id) AS message_count
                   FROM ai_conversations c
                   WHERE c.business_id = %s AND c.archived = false{runtime_filter_sql}
                   ORDER BY c.updated_at DESC
                   LIMIT %s""",
                (str(business_id), *runtime_params, limit),
            )
        return [_normalize_conversation_row(row) or {} for row in cur.fetchall()]


def get_conversation(*, conversation_id: UUID) -> dict[str, Any] | None:
    select_columns = ", ".join(_selectable_conversation_columns(include_actor=True))
    with get_cursor() as cur:
        cur.execute(
            f"""SELECT {select_columns}
               FROM ai_conversations WHERE conversation_id = %s""",
            (str(conversation_id),),
        )
        return _normalize_conversation_row(cur.fetchone())


def get_messages(*, conversation_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT message_id, conversation_id, role, content, tool_calls, citations, response_blocks, message_meta, token_count, created_at
               FROM ai_messages
               WHERE conversation_id = %s
               ORDER BY created_at ASC""",
            (str(conversation_id),),
        )
        return cur.fetchall()


def count_user_messages(*, conversation_id: UUID | str) -> int:
    """Cheap COUNT(*) of user-role messages in a conversation.

    Used by the Meridian structured runtime path to compute
    ``created_turn_index`` for thread_subject receipts without loading the
    full message history. Returns 0 on any failure.
    """
    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS n FROM ai_messages "
                "WHERE conversation_id = %s AND role = 'user'",
                (str(conversation_id),),
            )
            row = cur.fetchone()
        if not row:
            return 0
        if isinstance(row, dict):
            return int(row.get("n") or 0)
        return int(row[0])
    except Exception:
        return 0


def append_message(
    *,
    conversation_id: UUID,
    role: str,
    content: str,
    tool_calls: list | None = None,
    citations: list | None = None,
    response_blocks: list[dict[str, Any]] | None = None,
    message_meta: dict[str, Any] | None = None,
    token_count: int | None = None,
    attachment_document_ids: list[str] | None = None,
) -> dict[str, Any]:
    import json

    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO ai_messages (conversation_id, role, content, tool_calls, citations, response_blocks, message_meta, token_count, attachment_document_ids)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING message_id, conversation_id, role, content, tool_calls, citations, response_blocks, message_meta, token_count, created_at""",
            (
                str(conversation_id),
                role,
                content,
                json.dumps(tool_calls) if tool_calls else None,
                json.dumps(citations) if citations else None,
                json.dumps(response_blocks or []),
                json.dumps(message_meta or {}),
                token_count,
                attachment_document_ids or [],
            ),
        )
        msg = cur.fetchone()

        # Update conversation updated_at; auto-title from first user message
        cur.execute(
            """UPDATE ai_conversations
               SET updated_at = now(),
                   title = COALESCE(title, CASE WHEN %s = 'user' THEN left(%s, 100) ELSE title END)
               WHERE conversation_id = %s""",
            (role, content, str(conversation_id)),
        )

        return msg


def archive_conversation(*, conversation_id: UUID) -> bool:
    with get_cursor() as cur:
        cur.execute(
            """UPDATE ai_conversations SET archived = true, updated_at = now()
               WHERE conversation_id = %s RETURNING conversation_id""",
            (str(conversation_id),),
        )
        return cur.fetchone() is not None


# ── Operator (Anthropic Managed Agent) session ownership ──────────────

def set_anthropic_session(
    *,
    conversation_id: UUID,
    session_id: str,
    agent_id: str,
    agent_version: int | None,
    environment_id: str,
    vault_id: str | None,
) -> None:
    """Persist Anthropic Managed Agent session ids on the conversation row.

    Why first-class columns (not message_meta): session health must be validated
    before each turn — having to scan back through messages to find the active
    session id is fragile and racey.
    """
    available = set(_conversation_table_columns())
    required = {
        "anthropic_session_id",
        "anthropic_agent_id",
        "anthropic_environment_id",
    }
    if not required.issubset(available):
        return

    fields: dict[str, Any] = {
        "anthropic_session_id": session_id,
        "anthropic_agent_id": agent_id,
        "anthropic_environment_id": environment_id,
        "session_health_status": "healthy",
        "session_health_checked_at": "now()",
    }
    if "anthropic_agent_version" in available:
        fields["anthropic_agent_version"] = agent_version
    if "anthropic_vault_id" in available:
        fields["anthropic_vault_id"] = vault_id

    set_parts: list[str] = []
    params: list[Any] = []
    for column, value in fields.items():
        if value == "now()":
            set_parts.append(f"{column} = now()")
        else:
            set_parts.append(f"{column} = %s")
            params.append(value)
    params.append(str(conversation_id))

    with get_cursor() as cur:
        cur.execute(
            f"""UPDATE ai_conversations
                SET {", ".join(set_parts)}, updated_at = now()
                WHERE conversation_id = %s""",
            tuple(params),
        )


def mark_session_health(
    *,
    conversation_id: UUID,
    status: str,
) -> None:
    """Record the result of the most recent session.retrieve health check."""
    if "session_health_status" not in _conversation_table_columns():
        return
    with get_cursor() as cur:
        cur.execute(
            """UPDATE ai_conversations
               SET session_health_status = %s,
                   session_health_checked_at = now()
               WHERE conversation_id = %s""",
            (status, str(conversation_id)),
        )


def clear_anthropic_session(*, conversation_id: UUID) -> None:
    """Null out Anthropic session ids so the next turn provisions a fresh session.

    Used when a session is detected as expired or invalidated; the user perceives
    a single continuous Winston conversation while the underlying Anthropic
    session is silently swapped.
    """
    available = set(_conversation_table_columns())
    columns = [
        c for c in (
            "anthropic_session_id",
            "anthropic_agent_id",
            "anthropic_agent_version",
            "anthropic_environment_id",
            "anthropic_vault_id",
            "session_health_status",
        ) if c in available
    ]
    if not columns:
        return
    set_clause = ", ".join(f"{c} = NULL" for c in columns)
    with get_cursor() as cur:
        cur.execute(
            f"""UPDATE ai_conversations
                SET {set_clause}, session_health_checked_at = now()
                WHERE conversation_id = %s""",
            (str(conversation_id),),
        )


# ── Thread entity state ──────────────────────────────────────────────

_THREAD_ENTITY_STATE_BOOTSTRAPPED = False

_MAX_RESOLVED_ENTITIES = 10


def _ensure_thread_entity_state_column() -> None:
    """Lazily add thread_entity_state JSONB column if missing."""
    global _THREAD_ENTITY_STATE_BOOTSTRAPPED
    if _THREAD_ENTITY_STATE_BOOTSTRAPPED:
        return
    try:
        with get_cursor() as cur:
            cur.execute(
                """ALTER TABLE ai_conversations
                   ADD COLUMN IF NOT EXISTS thread_entity_state JSONB"""
            )
        _THREAD_ENTITY_STATE_BOOTSTRAPPED = True
        # Bust the cached column list so the column is recognized
        _conversation_table_columns.cache_clear()
    except Exception:
        pass


def get_thread_entity_state(conversation_id: str | UUID) -> dict[str, Any] | None:
    """Read thread entity state for a conversation."""
    _ensure_thread_entity_state_column()
    if "thread_entity_state" not in _conversation_table_columns():
        return None
    try:
        with get_cursor() as cur:
            cur.execute(
                """SELECT thread_entity_state
                   FROM ai_conversations
                   WHERE conversation_id = %s""",
                (str(conversation_id),),
            )
            row = cur.fetchone()
            if row is None:
                return None
            raw = row["thread_entity_state"] if isinstance(row, dict) else row[0]
            if raw is None:
                return None
            import json
            return json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return None


def update_thread_entity_state(
    conversation_id: str | UUID,
    *,
    entity_type: str,
    entity_id: str,
    name: str | None = None,
    source: str = "clarification",
    turn_request_id: str | None = None,
    active_metric: dict | None = None,
    active_timeframe: dict | None = None,
    last_skill_id: str | None = None,
) -> None:
    """Persist resolved entity and active context into thread state.

    Maintains:
    - resolved_entities: bounded list (max 10, evicts oldest)
    - active_context: current entity, metric, timeframe with confidence/source
    """
    import json
    from datetime import datetime, timezone

    _ensure_thread_entity_state_column()
    if "thread_entity_state" not in _conversation_table_columns():
        return

    current = get_thread_entity_state(conversation_id) or {}
    entities = current.get("resolved_entities", [])
    prev_context = current.get("active_context", {})

    now_iso = datetime.now(timezone.utc).isoformat()

    new_entry = {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "name": name,
        "resolved_at": now_iso,
        "source": source,
        "turn_request_id": turn_request_id,
    }

    # Remove existing entry for same entity to avoid duplicates
    entities = [
        e for e in entities
        if not (e.get("entity_type") == entity_type and e.get("entity_id") == entity_id)
    ]
    entities.append(new_entry)

    # Cap at max entries, evict oldest
    if len(entities) > _MAX_RESOLVED_ENTITIES:
        entities = entities[-_MAX_RESOLVED_ENTITIES:]

    # Build active_context with confidence + source per field
    prev_entity_id = (prev_context.get("entity") or {}).get("id")
    entity_switched = prev_entity_id and prev_entity_id != entity_id

    active_context: dict[str, Any] = {
        "entity": {
            "type": entity_type,
            "id": entity_id,
            "name": name,
            "confidence": 0.97,
            "source": source,
        },
        "last_skill_id": last_skill_id,
        "updated_at": now_iso,
    }

    # Metric: use new if provided, otherwise inherit from previous (unless entity switched)
    if active_metric and active_metric.get("confidence", 0) >= 0.5:
        active_context["metric"] = active_metric
    elif not entity_switched and prev_context.get("metric"):
        # Inherit but mark as prior_turn
        inherited = dict(prev_context["metric"])
        inherited["source"] = "prior_turn"
        active_context["metric"] = inherited
    # else: no metric context

    # Timeframe: same logic
    if active_timeframe and active_timeframe.get("confidence", 0) >= 0.5:
        active_context["timeframe"] = active_timeframe
    elif not entity_switched and prev_context.get("timeframe"):
        inherited = dict(prev_context["timeframe"])
        inherited["source"] = "prior_turn"
        active_context["timeframe"] = inherited

    state = {
        "resolved_entities": entities,
        "active_context": active_context,
        "result_memory": current.get("result_memory"),
        "structured_query_state": current.get("structured_query_state"),
    }
    try:
        with get_cursor() as cur:
            cur.execute(
                """UPDATE ai_conversations
                   SET thread_entity_state = %s, updated_at = now()
                   WHERE conversation_id = %s""",
                (json.dumps(state), str(conversation_id)),
            )
    except Exception:
        pass


def update_thread_result_memory(
    conversation_id: str | UUID,
    *,
    result_memory: dict[str, Any] | None,
) -> None:
    """Persist structured result memory while preserving existing thread state."""
    import json
    from datetime import datetime, timezone

    _ensure_thread_entity_state_column()
    if "thread_entity_state" not in _conversation_table_columns():
        return

    current = get_thread_entity_state(conversation_id) or {}
    state = {
        "resolved_entities": current.get("resolved_entities", []),
        "active_context": current.get("active_context", {}),
        "result_memory": None,
        "structured_query_state": current.get("structured_query_state"),
    }
    if result_memory is not None:
        normalized = dict(result_memory)
        normalized["stored_at"] = datetime.now(timezone.utc).isoformat()
        state["result_memory"] = normalized

    try:
        with get_cursor() as cur:
            cur.execute(
                """UPDATE ai_conversations
                   SET thread_entity_state = %s, updated_at = now()
                   WHERE conversation_id = %s""",
                (json.dumps(state), str(conversation_id)),
            )
    except Exception:
        pass


def update_thread_structured_query_state(
    conversation_id: str | UUID,
    *,
    structured_query_state: dict[str, Any] | None,
) -> None:
    """Persist deterministic structured-query state while preserving existing thread state."""
    import json
    from datetime import datetime, timezone

    _ensure_thread_entity_state_column()
    if "thread_entity_state" not in _conversation_table_columns():
        return

    current = get_thread_entity_state(conversation_id) or {}
    state = {
        "resolved_entities": current.get("resolved_entities", []),
        "active_context": current.get("active_context", {}),
        "result_memory": current.get("result_memory"),
        "structured_query_state": None,
    }
    if structured_query_state is not None:
        normalized = dict(structured_query_state)
        normalized["stored_at"] = datetime.now(timezone.utc).isoformat()
        state["structured_query_state"] = normalized

    try:
        with get_cursor() as cur:
            cur.execute(
                """UPDATE ai_conversations
                   SET thread_entity_state = %s, updated_at = now()
                   WHERE conversation_id = %s""",
                (json.dumps(state), str(conversation_id)),
            )
    except Exception:
        pass
