"""Thread rolling summary — memory compression for long conversations.

The ``ai_conversations.context_summary`` column already exists (added by
migration 424). This module is the reader + writer that nobody wired up
before: it loads the current summary for a thread, and after each turn
regenerates the summary when the turn count since the last rewrite exceeds
a threshold.

Design notes:
  * ``load_summary`` is cheap and called on every turn from the strategy
    engine. It returns ``(text, version, through_message_id)`` or
    ``(None, 0, None)`` if no summary exists yet.
  * ``maybe_generate_summary`` is called post-turn via ``run_in_executor``
    so it never blocks the user-facing stream. It uses a small model
    (``WINSTON_SUMMARY_MODEL``, default ``gpt-4o-mini``) with a fixed
    template that preserves entities, numbers, goals, and open questions.
  * Feature-gated by ``WINSTON_SUMMARY_ENABLED`` (default true).
  * Triggered when new messages since last summary ≥ ``WINSTON_SUMMARY_TRIGGER_TURNS``
    (default 10).

Failure mode: any error in summary generation is logged and swallowed. The
next turn will still load whatever the previous summary version was (or
None); strategy.pick_summary_strategy handles the None gracefully.
"""
from __future__ import annotations

import logging
import os
from uuid import UUID

from app.db import get_cursor

logger = logging.getLogger(__name__)


def is_enabled() -> bool:
    return os.getenv("WINSTON_SUMMARY_ENABLED", "true").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _trigger_turns() -> int:
    try:
        return max(1, int(os.getenv("WINSTON_SUMMARY_TRIGGER_TURNS", "10")))
    except (TypeError, ValueError):
        return 10


def _summary_model() -> str:
    return os.getenv("WINSTON_SUMMARY_MODEL", "gpt-4o-mini")


_SUMMARY_TEMPLATE = (
    "You are summarizing a conversation between a user and an AI assistant "
    "for downstream memory retrieval. Produce a 4-7 sentence summary that "
    "preserves: (1) the user's goal, (2) named entities and their ids, "
    "(3) any concrete numbers or dates that were discussed, (4) any open "
    "questions or pending decisions. Do NOT editorialize. Do NOT add "
    "information not present in the conversation.\n\nCONVERSATION:\n{body}\n\n"
    "SUMMARY:"
)


def load_summary(conversation_id: str | UUID) -> tuple[str | None, int, str | None]:
    """Return ``(text, version, through_message_id)`` for a conversation.

    Returns ``(None, 0, None)`` if no summary exists or on any DB error.
    """
    try:
        with get_cursor() as cur:
            cur.execute(
                """SELECT context_summary,
                          COALESCE(context_summary_version, 0) AS context_summary_version,
                          context_summary_through_message
                     FROM ai_conversations
                    WHERE conversation_id = %s""",
                (str(conversation_id),),
            )
            row = cur.fetchone()
    except Exception:
        logger.exception("load_summary failed for %s", conversation_id)
        return None, 0, None
    if not row:
        return None, 0, None
    text = row.get("context_summary") if isinstance(row, dict) else row[0]
    version = (
        row.get("context_summary_version", 0)
        if isinstance(row, dict)
        else (row[1] or 0)
    ) or 0
    through_id = (
        row.get("context_summary_through_message")
        if isinstance(row, dict)
        else row[2]
    )
    return (text or None), int(version), (str(through_id) if through_id else None)


def maybe_generate_summary(conversation_id: str | UUID) -> bool:
    """Regenerate and persist a rolling summary if the trigger threshold is met.

    Returns True if a new summary was written, False otherwise. Never raises.
    Synchronous — the caller must invoke via ``run_in_executor`` from async
    contexts. Intended to be called AFTER the user-facing stream has closed.
    """
    if not is_enabled():
        return False
    try:
        _, current_version, through_id = load_summary(conversation_id)

        with get_cursor() as cur:
            cur.execute(
                """SELECT message_id, role, content, created_at
                     FROM ai_messages
                    WHERE conversation_id = %s
                    ORDER BY created_at ASC""",
                (str(conversation_id),),
            )
            messages = cur.fetchall() or []

        if not messages:
            return False

        # Count messages since the last summary window.
        if through_id:
            idx = next(
                (
                    i
                    for i, m in enumerate(messages)
                    if str(m.get("message_id") if isinstance(m, dict) else m[0]) == through_id
                ),
                -1,
            )
            new_messages = messages[idx + 1:] if idx >= 0 else messages
        else:
            new_messages = messages

        if len(new_messages) < _trigger_turns():
            return False

        # Build the body for the summarizer (truncated to keep the call cheap).
        body_lines: list[str] = []
        for m in messages[-40:]:
            role = m.get("role") if isinstance(m, dict) else m[1]
            content = m.get("content") if isinstance(m, dict) else m[2]
            body_lines.append(f"[{role}] {content}")
        body = "\n".join(body_lines)[:6000]

        summary_text = _call_summary_model(body)
        if not summary_text:
            return False

        last_message_id = (
            messages[-1].get("message_id")
            if isinstance(messages[-1], dict)
            else messages[-1][0]
        )

        with get_cursor() as cur:
            cur.execute(
                """UPDATE ai_conversations
                      SET context_summary = %s,
                          context_summary_version = COALESCE(context_summary_version, 0) + 1,
                          context_summary_through_message = %s,
                          context_summary_updated_at = now()
                    WHERE conversation_id = %s""",
                (summary_text, str(last_message_id) if last_message_id else None, str(conversation_id)),
            )
        logger.info(
            "rolling summary regenerated for %s (version %s → %s)",
            conversation_id,
            current_version,
            current_version + 1,
        )
        return True
    except Exception:
        logger.exception("maybe_generate_summary failed for %s", conversation_id)
        return False


def _call_summary_model(body: str) -> str | None:
    """Invoke the small summary model. Returns the text or None on failure."""
    try:
        from app.services.ai_client import get_instrumented_client

        client = get_instrumented_client()
        # Use the non-streaming path; summaries are small and cached.
        response = client.chat.completions.create(
            model=_summary_model(),
            messages=[
                {"role": "system", "content": "You produce concise factual summaries."},
                {"role": "user", "content": _SUMMARY_TEMPLATE.format(body=body)},
            ],
            max_tokens=400,
            temperature=0.2,
        )
        choice = response.choices[0] if getattr(response, "choices", None) else None
        if choice and getattr(choice, "message", None):
            return (choice.message.content or "").strip() or None
    except Exception:
        logger.exception("summary model call failed")
    return None
