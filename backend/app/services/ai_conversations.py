"""AI Conversation persistence service.

Manages conversation threads for Winston AI assistant.
Each conversation is scoped to a business_id and stores multi-turn message history.
"""
from __future__ import annotations

from uuid import UUID
from typing import Any

from app.db import get_cursor


def create_conversation(
    *,
    business_id: UUID,
    env_id: UUID | None = None,
    title: str | None = None,
    actor: str = "anonymous",
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO ai_conversations (business_id, env_id, title, actor)
               VALUES (%s, %s, %s, %s)
               RETURNING conversation_id, business_id, env_id, title, created_at, updated_at, archived, actor""",
            (str(business_id), str(env_id) if env_id else None, title, actor),
        )
        return cur.fetchone()


def list_conversations(
    *,
    business_id: UUID,
    limit: int = 50,
    include_archived: bool = False,
) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        if include_archived:
            cur.execute(
                """SELECT conversation_id, business_id, title, created_at, updated_at, archived,
                          (SELECT count(*) FROM ai_messages m WHERE m.conversation_id = c.conversation_id) AS message_count
                   FROM ai_conversations c
                   WHERE c.business_id = %s
                   ORDER BY c.updated_at DESC
                   LIMIT %s""",
                (str(business_id), limit),
            )
        else:
            cur.execute(
                """SELECT conversation_id, business_id, title, created_at, updated_at, archived,
                          (SELECT count(*) FROM ai_messages m WHERE m.conversation_id = c.conversation_id) AS message_count
                   FROM ai_conversations c
                   WHERE c.business_id = %s AND c.archived = false
                   ORDER BY c.updated_at DESC
                   LIMIT %s""",
                (str(business_id), limit),
            )
        return cur.fetchall()


def get_conversation(*, conversation_id: UUID) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT conversation_id, business_id, env_id, title, created_at, updated_at, archived, actor
               FROM ai_conversations WHERE conversation_id = %s""",
            (str(conversation_id),),
        )
        return cur.fetchone()


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
