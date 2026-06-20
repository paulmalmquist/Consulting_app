"""Dispatch receipts — mapped onto the existing governance audit log.

Reuses ``governance.record_decision`` (and its redaction) rather than a new table.
``decision_type='provider_dispatch'`` requires migration 541; if that migration has
not applied, the Postgres CHECK rejects the row, ``record_decision`` returns ``None``,
and the supervisor reports ``receipt_status='failed'`` — never a phantom receipt id.
"""
from __future__ import annotations

from app.services.ai_dispatch.models import (
    AIRequest,
    DispatchStatus,
    ProviderName,
    Usage,
)
from app.services.governance import list_decisions, record_decision

DECISION_TYPE = "provider_dispatch"


def _provider_value(provider: ProviderName | str | None) -> str | None:
    if provider is None:
        return None
    return provider.value if isinstance(provider, ProviderName) else str(provider)


def build_input_summary(req: AIRequest) -> dict:
    """The redacted-before-storage input view. Secrets under redactable keys in
    ``metadata`` are removed by ``governance.redact_dict`` before insertion."""
    return {
        "mode": req.mode.value,
        "risk_level": req.risk_level.value,
        "privacy": req.privacy.value,
        "task": req.task,
        "forced_provider": _provider_value(req.forced_provider),
        "allow_fallback": req.allow_fallback,
        "require_citations": req.require_citations,
        "metadata": req.metadata,
    }


def build_output_summary(
    *,
    provider: ProviderName | str | None,
    model: str | None,
    status: DispatchStatus,
    routing_reason: str,
    usage: Usage | None,
    null_reason: str | None,
) -> dict:
    """Routing trace + usage only — never the raw model answer."""
    return {
        "provider": _provider_value(provider),
        "model": model,
        "status": status.value,
        "routing_reason": routing_reason,
        "null_reason": null_reason,
        "prompt_tokens": usage.prompt_tokens if usage else None,
        "completion_tokens": usage.completion_tokens if usage else None,
    }


def record_dispatch_receipt(
    *,
    req: AIRequest,
    provider: ProviderName | str | None,
    model: str | None,
    status: DispatchStatus,
    routing_reason: str,
    usage: Usage | None,
    latency_ms: int | None,
    success: bool,
    null_reason: str | None = None,
    error_message: str | None = None,
    confidence: float | None = None,
) -> str | None:
    """Persist a dispatch receipt. Returns the receipt id or ``None`` on failure."""
    tags = ["provider_dispatch", f"mode_{req.mode.value}", f"risk_{req.risk_level.value}", f"status_{status.value}"]
    pv = _provider_value(provider)
    if pv:
        tags.append(pv)

    return record_decision(
        business_id=req.business_id,
        env_id=req.env_id,
        actor="ai_dispatch",
        decision_type=DECISION_TYPE,
        tool_name=f"dispatch:{pv}:{model}" if pv else f"dispatch:{status.value}",
        input_summary=build_input_summary(req),
        output_summary=build_output_summary(
            provider=provider,
            model=model,
            status=status,
            routing_reason=routing_reason,
            usage=usage,
            null_reason=null_reason,
        ),
        model_used=model,
        prompt_tokens=usage.prompt_tokens if usage else None,
        completion_tokens=usage.completion_tokens if usage else None,
        latency_ms=latency_ms,
        confidence=confidence,
        success=success,
        error_message=error_message,
        tags=tags,
    )


def list_dispatch_runs(
    business_id: str,
    *,
    env_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Recent dispatch receipts, tenant-scoped. Fail-closed empty on read failure."""
    try:
        return list_decisions(
            business_id,
            env_id=env_id,
            decision_type=DECISION_TYPE,
            limit=limit,
            offset=offset,
        )
    except Exception:
        return []
