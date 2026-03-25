"""Governance service — AI decision audit trail and accuracy stats."""
from __future__ import annotations

import json
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.audit import redact_dict


def record_decision(
    *,
    business_id: str | UUID | None,
    env_id: str | None = None,
    conversation_id: str | UUID | None = None,
    message_id: str | UUID | None = None,
    actor: str = "winston",
    decision_type: str = "tool_call",
    tool_name: str | None = None,
    input_summary: dict | None = None,
    output_summary: dict | None = None,
    model_used: str | None = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    latency_ms: int | None = None,
    confidence: float | None = None,
    success: bool = True,
    error_message: str | None = None,
    tags: list[str] | None = None,
) -> str | None:
    """Persist a decision to ai_decision_audit_log. Best-effort — never raises."""
    try:
        input_redacted = redact_dict(input_summary or {})
        output_redacted = redact_dict(output_summary or {})

        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO ai_decision_audit_log
                   (business_id, env_id, conversation_id, message_id,
                    actor, decision_type, tool_name,
                    input_summary, output_summary,
                    model_used, prompt_tokens, completion_tokens,
                    latency_ms, confidence, success, error_message, tags)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (
                    str(business_id) if business_id else None,
                    env_id,
                    str(conversation_id) if conversation_id else None,
                    str(message_id) if message_id else None,
                    actor,
                    decision_type,
                    tool_name,
                    json.dumps(input_redacted),
                    json.dumps(output_redacted),
                    model_used,
                    prompt_tokens,
                    completion_tokens,
                    latency_ms,
                    confidence,
                    success,
                    error_message,
                    tags or [],
                ),
            )
            row = cur.fetchone()
            return str(row["id"]) if row else None
    except Exception as exc:
        emit_log(
            level="warning",
            service="backend",
            action="governance.record_decision",
            message=f"Failed to persist decision audit: {exc}",
        )
        return None


def list_decisions(
    business_id: str | UUID,
    *,
    env_id: str | None = None,
    decision_type: str | None = None,
    tool_name: str | None = None,
    success: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Query ai_decision_audit_log with optional filters."""
    conditions: list[str] = ["business_id = %s"]
    params: list = [str(business_id)]

    if env_id:
        conditions.append("env_id = %s")
        params.append(env_id)
    if decision_type:
        conditions.append("decision_type = %s")
        params.append(decision_type)
    if tool_name:
        conditions.append("tool_name = %s")
        params.append(tool_name)
    if success is not None:
        conditions.append("success = %s")
        params.append(success)

    where = " AND ".join(conditions)
    params.extend([limit, offset])

    with get_cursor() as cur:
        cur.execute(
            f"""SELECT id, business_id, env_id, conversation_id, message_id,
                       actor, decision_type, tool_name,
                       input_summary, output_summary,
                       model_used, latency_ms, confidence,
                       grounding_score, success, error_message,
                       tags, created_at
                FROM ai_decision_audit_log
                WHERE {where}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s""",
            params,
        )
        return cur.fetchall()


def get_decision(decision_id: str | UUID) -> dict | None:
    """Fetch a single decision record."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM ai_decision_audit_log WHERE id = %s",
            (str(decision_id),),
        )
        return cur.fetchone()


def compute_audit_stats(
    business_id: str | UUID,
    *,
    env_id: str | None = None,
) -> dict:
    """Aggregate stats for the governance dashboard."""
    conditions = ["business_id = %s"]
    params: list = [str(business_id)]
    if env_id:
        conditions.append("env_id = %s")
        params.append(env_id)
    where = " AND ".join(conditions)

    with get_cursor() as cur:
        cur.execute(
            f"""SELECT
                    COUNT(*)::int AS total_decisions,
                    COUNT(*) FILTER (WHERE success = true)::int AS successful,
                    COUNT(*) FILTER (WHERE success = false)::int AS failed,
                    ROUND(AVG(latency_ms))::int AS avg_latency_ms,
                    ROUND(AVG(grounding_score)::numeric, 3) AS avg_grounding_score,
                    COUNT(*) FILTER (WHERE grounding_score >= 0.8)::int AS high_grounding,
                    COUNT(*) FILTER (WHERE grounding_score >= 0.5 AND grounding_score < 0.8)::int AS mixed_grounding,
                    COUNT(*) FILTER (WHERE grounding_score < 0.5 AND grounding_score IS NOT NULL)::int AS low_grounding
                FROM ai_decision_audit_log
                WHERE {where}""",
            params,
        )
        stats = cur.fetchone() or {}

        # Top tools by frequency
        cur.execute(
            f"""SELECT tool_name, COUNT(*)::int AS call_count,
                       ROUND(AVG(latency_ms))::int AS avg_latency
                FROM ai_decision_audit_log
                WHERE {where} AND tool_name IS NOT NULL
                GROUP BY tool_name
                ORDER BY call_count DESC
                LIMIT 10""",
            params,
        )
        top_tools = cur.fetchall()

    return {
        "total_decisions": stats.get("total_decisions", 0),
        "successful": stats.get("successful", 0),
        "failed": stats.get("failed", 0),
        "avg_latency_ms": stats.get("avg_latency_ms"),
        "avg_grounding_score": float(stats["avg_grounding_score"]) if stats.get("avg_grounding_score") is not None else None,
        "high_grounding": stats.get("high_grounding", 0),
        "mixed_grounding": stats.get("mixed_grounding", 0),
        "low_grounding": stats.get("low_grounding", 0),
        "top_tools": top_tools,
    }


def update_grounding_score(
    decision_id: str | UUID,
    *,
    grounding_score: float,
    grounding_sources: list[dict] | None = None,
) -> None:
    """Update grounding score on an existing decision record. Best-effort."""
    try:
        with get_cursor() as cur:
            cur.execute(
                """UPDATE ai_decision_audit_log
                   SET grounding_score = %s, grounding_sources = %s
                   WHERE id = %s""",
                (
                    grounding_score,
                    json.dumps(grounding_sources) if grounding_sources else None,
                    str(decision_id),
                ),
            )
    except Exception as exc:
        emit_log(
            level="warning",
            service="backend",
            action="governance.update_grounding",
            message=f"Failed to update grounding score: {exc}",
        )
