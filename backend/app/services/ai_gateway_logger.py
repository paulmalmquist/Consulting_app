"""Persist per-request logs for the AI gateway.

Every call to ``run_gateway_stream()`` writes one row to ``ai_gateway_logs``.
This gives a queryable audit trail of routing decisions, model usage,
tool calls, RAG retrieval, cost, and timings.
"""
from __future__ import annotations

import json
import logging
from typing import Any
from app.db import get_cursor

logger = logging.getLogger(__name__)


def log_request(
    *,
    conversation_id: str | None = None,
    session_id: str | None = None,
    business_id: str | None = None,
    env_id: str | None = None,
    actor: str = "anonymous",
    message_preview: str | None = None,
    route_lane: str = "?",
    route_model: str = "unknown",
    is_write: bool = False,
    workflow_override: bool = False,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cached_tokens: int = 0,
    reasoning_effort: str | None = None,
    tool_call_count: int = 0,
    tool_calls_json: list[dict] | None = None,
    tools_skipped: bool = False,
    rag_chunks_raw: int = 0,
    rag_chunks_used: int = 0,
    rag_rerank_method: str | None = None,
    rag_scores: list[float] | None = None,
    cost_total: float = 0,
    cost_model: float = 0,
    cost_embedding: float = 0,
    cost_rerank: float = 0,
    elapsed_ms: int | None = None,
    ttft_ms: int | None = None,
    model_ms: int | None = None,
    fallback_used: bool = False,
    error_message: str | None = None,
) -> str | None:
    """Insert one row into ai_gateway_logs. Returns the log id or None on failure."""
    try:
        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO ai_gateway_logs (
                    conversation_id, session_id, business_id, env_id, actor,
                    message_preview, route_lane, route_model, is_write, workflow_override,
                    prompt_tokens, completion_tokens, cached_tokens, reasoning_effort,
                    tool_call_count, tool_calls_json, tools_skipped,
                    rag_chunks_raw, rag_chunks_used, rag_rerank_method, rag_scores,
                    cost_total, cost_model, cost_embedding, cost_rerank,
                    elapsed_ms, ttft_ms, model_ms,
                    fallback_used, error_message
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s
                ) RETURNING id""",
                (
                    conversation_id,
                    session_id,
                    business_id,
                    env_id,
                    actor,
                    (message_preview or "")[:500],
                    route_lane,
                    route_model,
                    is_write,
                    workflow_override,
                    prompt_tokens,
                    completion_tokens,
                    cached_tokens,
                    reasoning_effort,
                    tool_call_count,
                    json.dumps(tool_calls_json or []),
                    tools_skipped,
                    rag_chunks_raw,
                    rag_chunks_used,
                    rag_rerank_method,
                    json.dumps(rag_scores) if rag_scores else None,
                    cost_total,
                    cost_model,
                    cost_embedding,
                    cost_rerank,
                    elapsed_ms,
                    ttft_ms,
                    model_ms,
                    fallback_used,
                    error_message,
                ),
            )
            row = cur.fetchone()
            return str(row["id"]) if row else None
    except Exception:
        logger.exception("Failed to write ai_gateway_log")
        return None


def get_logs(
    *,
    business_id: str | None = None,
    conversation_id: str | None = None,
    lane: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Query gateway logs with optional filters."""
    clauses: list[str] = []
    params: list[Any] = []

    if business_id:
        clauses.append("business_id = %s")
        params.append(business_id)
    if conversation_id:
        clauses.append("conversation_id = %s")
        params.append(conversation_id)
    if lane:
        clauses.append("route_lane = %s")
        params.append(lane)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    with get_cursor() as cur:
        cur.execute(
            f"""SELECT * FROM ai_gateway_logs {where}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s""",
            params + [limit, offset],
        )
        return cur.fetchall()
