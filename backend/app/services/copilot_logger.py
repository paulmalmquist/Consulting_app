"""Single audit write-point for the Test Intelligence Copilot.

Every answer (grounded, fallback, or refusal) is logged twice: a structured app log via emit_log, and
a best-effort row in tel_copilot_interactions that the governance surface aggregates. Writes never
block or fail an answer — the copilot stays available even if logging hiccups.
"""
from __future__ import annotations

import json
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def emit_copilot_interaction(*, env_id: str, business_id: UUID, question: str | None,
                             result: dict, elapsed_ms: int) -> None:
    intent = result.get("intent")
    is_refusal = bool(result.get("is_refusal"))
    null_reason = result.get("null_reason")
    answer_source = result.get("answer_source")
    prompt_version = result.get("prompt_version")
    model = result.get("model")
    evidence = result.get("evidence") or []
    tool_trace = result.get("tool_trace") or []

    emit_log(level="info", service="telemetry_copilot", action="answer",
             message=f"copilot intent={intent} source={answer_source} refusal={is_refusal}",
             context={"intent": intent, "is_refusal": is_refusal, "null_reason": null_reason,
                      "answer_source": answer_source, "prompt_version": prompt_version,
                      "evidence_count": len(evidence), "tool_count": len(tool_trace),
                      "elapsed_ms": elapsed_ms},
             duration_ms=elapsed_ms)

    try:
        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO tel_copilot_interactions
                     (request_id, env_id, business_id, intent, is_refusal, null_reason,
                      answer_source, fallback_reason, prompt_version, model, evidence_count,
                      tool_trace, elapsed_ms, question, answer)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s)""",
                (str(result.get("request_id")), env_id, str(business_id), intent, is_refusal,
                 null_reason, answer_source, result.get("fallback_reason"), prompt_version, model,
                 len(evidence), json.dumps(tool_trace, default=str), elapsed_ms,
                 (question or "")[:2000], (result.get("answer") or "")[:8000]))
    except Exception as exc:  # noqa: BLE001 — never block the answer on an audit write
        emit_log(level="warning", service="telemetry_copilot", action="audit_write_failed",
                 message=str(exc), error=exc)
