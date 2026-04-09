"""PDS AI Chat — SSE streaming endpoint for conversational text-to-SQL.

Accepts messages, runs the PDS SQL agent, streams results back
using Vercel AI SDK Data Stream Protocol format.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.db import get_cursor
from app.sql_agent.pds_agent import run_pds_agent
from app.sql_agent.validator import validate_sql

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pds/v2/chat", tags=["pds-v2-chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    env_id: str
    business_id: str


def _json_default(obj: object) -> str:
    """Custom JSON serializer for date/datetime/Decimal objects."""
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return format(obj, "f")
    return str(obj)


def _safe_dumps(data: object) -> str:
    return json.dumps(data, default=_json_default)


SUGGESTED_QUESTIONS = [
    "Why is this project over budget?",
    "What are the top risks?",
    "What should we do?",
    "Generate report",
]


ALLOWED_PREFIXES = tuple(question.lower() for question in SUGGESTED_QUESTIONS)


def _is_allowed_demo_prompt(text: str) -> bool:
    normalized = text.strip().lower()
    return any(normalized.startswith(prefix) for prefix in ALLOWED_PREFIXES)


def _sse_text(text: str) -> str:
    """Format as Vercel AI SDK text stream token."""
    return f"0:{json.dumps(text)}\n"


def _sse_data(data: dict[str, Any]) -> str:
    """Format as Vercel AI SDK data."""
    return f"2:{_safe_dumps([data])}\n"


async def _stream_chat(req: ChatRequest):
    """Generator that yields SSE events for the chat response."""
    # Extract latest user message
    user_message = ""
    for msg in reversed(req.messages):
        if msg.role == "user":
            user_message = msg.content
            break

    if not user_message:
        yield _sse_text("Please ask a question about your PDS data.")
        return

    if not _is_allowed_demo_prompt(user_message):
        allowed = "\n".join(f"- {question}" for question in SUGGESTED_QUESTIONS)
        yield _sse_text(
            "This flagship demo is locked to four command-safe prompts:\n\n"
            f"{allowed}\n\n"
            "Choose one of those prompts so the answer stays deterministic and audit-ready."
        )
        return

    yield _sse_text("Analyzing your question...\n\n")

    try:
        # Run PDS agent
        agent_result = await run_pds_agent(
            user_message,
            env_id=req.env_id,
            business_id=req.business_id,
        )

        if not agent_result.sql:
            yield _sse_text("I couldn't generate a query for that question. Could you rephrase it?")
            return

        yield _sse_text(f"**Intent:** {agent_result.intent}\n\n")

        # Validate
        validation = validate_sql(agent_result.sql, req.business_id)
        if not validation.valid:
            yield _sse_text(f"SQL validation failed: {validation.error}\n\nLet me try to fix this...\n\n")

            # Retry with error context
            retry_result = await run_pds_agent(
                f"{user_message}\n\nPrevious SQL failed validation: {validation.error}\nFailed SQL: {agent_result.sql}\nPlease fix the query.",
                env_id=req.env_id,
                business_id=req.business_id,
            )
            if retry_result.sql:
                validation = validate_sql(retry_result.sql, req.business_id)
                agent_result = retry_result

            if not validation.valid:
                yield _sse_text(f"Unable to generate a valid query. Error: {validation.error}")
                return

        # Execute
        yield _sse_text("Running query...\n\n")

        with get_cursor() as cur:
            cur.execute(
                validation.sql,
                {"env_id": req.env_id, "business_id": req.business_id},
            )
            rows = cur.fetchall()

        results = [dict(r) for r in rows[:500]]

        yield _sse_text(f"Found **{len(rows)}** results.\n\n")

        # Emit SQL in collapsible block
        yield _sse_text(f"<details><summary>View SQL</summary>\n\n```sql\n{validation.sql}\n```\n\n</details>\n\n")

        # Emit chart if suggested
        if agent_result.chart_suggestion and results:
            chart_config = {
                **agent_result.chart_suggestion,
                "data": results[:100],
                "title": agent_result.intent,
            }
            yield _sse_text(f"<!--CHART_START-->{_safe_dumps(chart_config)}<!--CHART_END-->\n\n")

        # Emit data
        if results:
            yield _sse_data({
                "type": "query_result",
                "results": results[:50],
                "total_rows": len(rows),
                "sql": validation.sql,
            })

        # Summary
        if len(rows) == 0:
            yield _sse_text("No data found for this query. The analytics tables may need to be seeded first.")

    except Exception as exc:
        logger.exception("PDS chat stream error")
        yield _sse_text(f"\n\nError: {exc}")


@router.post("")
async def chat(request: Request, req: ChatRequest):
    """SSE streaming chat endpoint for PDS AI queries."""
    return StreamingResponse(
        _stream_chat(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/suggestions")
def chat_suggestions():
    """Return suggested starter questions."""
    return {"suggestions": SUGGESTED_QUESTIONS}
