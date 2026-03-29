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
    normalized.setdefault("actor", "anonymous")
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
    }
    for column in _available_optional_columns():
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
) -> list[dict[str, Any]]:
    select_columns = ", ".join(_selectable_conversation_columns(alias="c"))
    with get_cursor() as cur:
        if include_archived:
            cur.execute(
                f"""SELECT {select_columns},
                          (SELECT count(*) FROM ai_messages m WHERE m.conversation_id = c.conversation_id) AS message_count
                   FROM ai_conversations c
                   WHERE c.business_id = %s
                   ORDER BY c.updated_at DESC
                   LIMIT %s""",
                (str(business_id), limit),
            )
        else:
            cur.execute(
                f"""SELECT {select_columns},
                          (SELECT count(*) FROM ai_messages m WHERE m.conversation_id = c.conversation_id) AS message_count
                   FROM ai_conversations c
                   WHERE c.business_id = %s AND c.archived = false
                   ORDER BY c.updated_at DESC
                   LIMIT %s""",
                (str(business_id), limit),
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
) -> dict[str, Any]:
    import json

    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO ai_messages (conversation_id, role, content, tool_calls, citations, response_blocks, message_meta, token_count)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
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
