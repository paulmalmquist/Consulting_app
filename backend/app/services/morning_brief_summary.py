"""Optional single-call LLM narration over the deterministic MorningBrief (plan PR 16b).

The model may write PROSE. It may not create facts. It receives only the structured brief
(cards/findings/memory citations already gathered deterministically in PR 16a) — no tools,
no data access, no new recommendations. The call is:

  - OPT-IN: disabled by default (MORNING_BRIEF_SUMMARY_ENABLED=false) and skipped when no
    provider key is configured → ZERO model calls, deterministic text used, null_reason set.
  - AT MOST ONE model call per brief generation.
  - FAIL-CLOSED: any error, or a validation failure (the narration introduces a number that
    is not in the brief's evidence), discards the narration and keeps the deterministic digest.
  - AUDITED: a receipt is written to ai_decision_audit_log via governance.record_decision.
"""
from __future__ import annotations

import re
import time
from uuid import UUID

from app.observability.logger import emit_log

_SYSTEM_PROMPT = (
    "You are narrating an executive morning brief. You will receive a STRUCTURED brief of "
    "findings that were already computed deterministically. Write 2-4 sentences of plain prose "
    "that summarize ONLY what the structured brief contains. Hard rules: do NOT invent any "
    "number, metric, percentage, date, or fact that is not present in the brief. Do NOT add "
    "recommendations beyond those listed. Do NOT call tools or claim to have queried data. If a "
    "section is empty or has a null_reason, you may say it was not available — never fill it in. "
    "Preserve any stated confidence and limitations. Output prose only."
)

# Tokens that look like numbers/percentages — used to verify the narration adds none.
_NUM_RE = re.compile(r"\d+(?:[.,]\d+)?%?")


def _evidence_numbers(brief: dict) -> set[str]:
    """Every numeric token the narration is allowed to use — drawn from the brief's text."""
    blob_parts: list[str] = []
    for item in brief.get("what_changed", []):
        blob_parts += [str(item.get("title", "")), str(item.get("priority_score", ""))]
    for item in brief.get("why_it_matters", []):
        blob_parts.append(str(item.get("reason", "")))
    for item in brief.get("what_to_watch", []):
        blob_parts += [str(item.get("title", "")), str(item.get("priority_score", ""))]
    blob_parts += [str(a) for a in brief.get("recommended_actions", [])]
    counts = brief.get("counts", {})
    blob_parts += [str(v) for v in counts.values()]
    blob_parts.append(str(brief.get("brief_date", "")))
    nums: set[str] = set()
    for part in blob_parts:
        nums.update(_NUM_RE.findall(part))
    return nums


def _narration_is_supported(text: str, brief: dict) -> bool:
    """Reject narration that introduces a numeric token absent from the brief's evidence."""
    allowed = _evidence_numbers(brief)
    for tok in _NUM_RE.findall(text or ""):
        if tok not in allowed:
            return False
    return True


def _brief_payload_for_model(brief: dict) -> dict:
    """The structured slice the model sees — facts only, no instructions to act."""
    return {
        "brief_date": brief.get("brief_date"),
        "confidence": brief.get("confidence"),
        "counts": brief.get("counts"),
        "what_changed": [{"title": i.get("title")} for i in brief.get("what_changed", [])],
        "why_it_matters": [{"reason": i.get("reason")} for i in brief.get("why_it_matters", [])],
        "what_to_watch": [{"title": i.get("title")} for i in brief.get("what_to_watch", [])],
        "recommended_actions": list(brief.get("recommended_actions", [])),
        "null_reasons": brief.get("null_reasons", []),
    }


def summarize_brief(brief: dict, *, env_id: str, business_id: str | UUID,
                    deterministic_digest: str) -> dict:
    """Return {summary_text, used_llm, model, null_reason}. At most one model call; never
    raises. Falls back to deterministic_digest on disable/no-provider/error/invalid."""
    from app import config

    if not getattr(config, "MORNING_BRIEF_SUMMARY_ENABLED", False):
        return {"summary_text": deterministic_digest, "used_llm": False,
                "model": None, "null_reason": "summary_disabled"}
    if not getattr(config, "OPENAI_API_KEY", ""):
        return {"summary_text": deterministic_digest, "used_llm": False,
                "model": None, "null_reason": "summary_provider_unavailable"}

    model = getattr(config, "OPENAI_CHAT_MODEL_FAST", "gpt-5-mini")
    started = time.monotonic()
    text = None
    prompt_tokens = completion_tokens = None
    error = None
    try:
        import json as _json

        import openai
        client = openai.OpenAI(api_key=config.OPENAI_API_KEY)
        resp = client.chat.completions.create(  # the ONE call
            model=model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": _json.dumps(_brief_payload_for_model(brief))},
            ],
        )
        text = (resp.choices[0].message.content or "").strip()
        usage = getattr(resp, "usage", None)
        if usage:
            prompt_tokens = getattr(usage, "prompt_tokens", None)
            completion_tokens = getattr(usage, "completion_tokens", None)
    except Exception as exc:  # noqa: BLE001 — model failure must not fail the brief
        error = str(exc)
        emit_log(level="warning", service="morning_brief_summary", action="model_call_failed",
                 message=error, error=exc)

    latency_ms = int((time.monotonic() - started) * 1000)

    # Validate: discard a narration that invents numbers, or an empty/errored result.
    used_text = deterministic_digest
    used_llm = False
    null_reason = None
    if text and _narration_is_supported(text, brief):
        used_text = text
        used_llm = True
    elif text:
        null_reason = "summary_unsupported_claim"   # narration introduced an uncited number
    elif error:
        null_reason = "summary_failed"

    # Audit receipt for the model call (best-effort, never raises). decision_type='response'
    # is an allowed value of the ai_decision_audit_log CHECK constraint.
    _record_receipt(env_id=env_id, business_id=business_id, model=model, used_llm=used_llm,
                    prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                    latency_ms=latency_ms, null_reason=null_reason, error=error,
                    brief_date=brief.get("brief_date"))

    return {"summary_text": used_text, "used_llm": used_llm,
            "model": model if used_llm else None, "null_reason": null_reason}


def _record_receipt(*, env_id, business_id, model, used_llm, prompt_tokens, completion_tokens,
                    latency_ms, null_reason, error, brief_date) -> None:
    try:
        from app.services import governance
        governance.record_decision(
            business_id=business_id, env_id=env_id,
            actor="autopilot", decision_type="response", tool_name="morning_brief_summary",
            input_summary={"brief_date": brief_date},
            output_summary={"used_llm": used_llm, "null_reason": null_reason},
            model_used=model, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
            latency_ms=latency_ms, success=(error is None), error_message=error,
            tags=["morning_brief", "summary"],
        )
    except Exception:  # noqa: BLE001 — receipt is best-effort; never blocks the brief
        pass
