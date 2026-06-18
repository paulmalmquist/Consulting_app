"""Supervisor — validates, routes, dispatches, and records a receipt. Never raises.

``run_dispatch`` is the single governed entrypoint. It calls ``select_provider``
for the routing decision, dispatches to the chosen adapter only when the decision
is SUCCESS, and always attempts a receipt. A failed receipt is surfaced honestly
(``receipt_status='failed'`` + ``receipt_write_failed``), never hidden.
"""
from __future__ import annotations

import time
import uuid

from app.services.ai_dispatch.models import (
    AIRequest,
    DispatchNullReason,
    DispatchResult,
    DispatchStatus,
    ProviderName,
    RoutingDecision,
    Usage,
)
from app.services.ai_dispatch.policy import select_provider
from app.services.ai_dispatch.providers import (
    Provider,
    ProviderCallError,
    ProviderUnavailable,
    default_adapters,
)
from app.services.ai_dispatch.receipts import record_dispatch_receipt
from app.services.ai_dispatch.registry import ProviderRegistry, provider_registry


def _new_request_id() -> str:
    return uuid.uuid4().hex


def _resolve_model(provider: ProviderName, fallback: str) -> str:
    """Pick the concrete model id for a provider from config, else the registry default."""
    from app import config

    if provider == ProviderName.OPENAI:
        return getattr(config, "OPENAI_CHAT_MODEL", "") or fallback
    if provider == ProviderName.ANTHROPIC:
        return getattr(config, "AI_DISPATCH_ANTHROPIC_MODEL", "") or fallback
    return fallback


def route_only(
    req: AIRequest, registry: ProviderRegistry = provider_registry
) -> RoutingDecision:
    """Dry-run routing — no provider call, no receipt."""
    return select_provider(req, registry)


def _finalize(
    *,
    request_id: str,
    req: AIRequest,
    provider: ProviderName | None,
    model: str | None,
    status: DispatchStatus,
    routing_reason: str,
    rejected: dict[str, str],
    answer: str | None,
    usage: Usage,
    latency_ms: int | None,
    fallback_used: bool,
    null_reason: DispatchNullReason | None,
    error_message: str | None,
    write_receipt: bool,
) -> DispatchResult:
    receipt_id: str | None = None
    receipt_status = "skipped"

    if write_receipt:
        rid = record_dispatch_receipt(
            req=req,
            provider=provider,
            model=model,
            status=status,
            routing_reason=routing_reason,
            usage=usage,
            latency_ms=latency_ms,
            success=(status == DispatchStatus.SUCCESS),
            null_reason=null_reason.value if null_reason else None,
            error_message=error_message,
        )
        if rid:
            receipt_id = rid
            receipt_status = "written"
        else:
            receipt_status = "failed"
            # Never claim a receipt that did not write. A successful dispatch with a
            # failed receipt is ungoverned → downgrade to DEGRADED and surface why.
            if status == DispatchStatus.SUCCESS:
                status = DispatchStatus.DEGRADED
                null_reason = DispatchNullReason.RECEIPT_WRITE_FAILED

    return DispatchResult(
        request_id=request_id,
        status=status,
        routing_reason=routing_reason,
        provider=provider,
        model=model,
        answer=answer,
        usage=usage,
        latency_ms=latency_ms,
        fallback_used=fallback_used,
        rejected=rejected,
        receipt_id=receipt_id,
        receipt_status=receipt_status,
        null_reason=null_reason,
    )


def run_dispatch(
    req: AIRequest,
    *,
    adapters: dict[ProviderName, Provider] | None = None,
    registry: ProviderRegistry = provider_registry,
    write_receipt: bool = True,
) -> DispatchResult:
    """Route, dispatch (only on SUCCESS), and record a receipt. Never raises."""
    request_id = _new_request_id()

    if not req.task or not req.task.strip():
        return _finalize(
            request_id=request_id,
            req=req,
            provider=None,
            model=None,
            status=DispatchStatus.BLOCKED,
            routing_reason="request task is empty",
            rejected={},
            answer=None,
            usage=Usage(),
            latency_ms=0,
            fallback_used=False,
            null_reason=DispatchNullReason.INVALID_INPUTS,
            error_message=None,
            write_receipt=write_receipt,
        )

    decision = select_provider(req, registry)

    # Routing did not yield a dispatchable provider — record the blocked/unavailable
    # decision with a receipt, but never call a provider.
    if decision.status != DispatchStatus.SUCCESS or decision.selected_provider is None:
        return _finalize(
            request_id=request_id,
            req=req,
            provider=decision.selected_provider,
            model=None,
            status=decision.status,
            routing_reason=decision.routing_reason,
            rejected=decision.rejected,
            answer=None,
            usage=Usage(),
            latency_ms=0,
            fallback_used=decision.fallback_used,
            null_reason=decision.null_reason,
            error_message=None,
            write_receipt=write_receipt,
        )

    provider = decision.selected_provider
    prov_def = registry.get(provider)
    fallback_model = decision.selected_model or (prov_def.default_model if prov_def else provider.value)
    model = _resolve_model(provider, fallback_model)
    adapter = (adapters if adapters is not None else default_adapters()).get(provider)

    status = DispatchStatus.SUCCESS
    answer: str | None = None
    usage = Usage()
    null_reason: DispatchNullReason | None = None
    error_message: str | None = None

    start = time.monotonic()
    if adapter is None:
        status = DispatchStatus.UNAVAILABLE
        null_reason = DispatchNullReason.PROVIDER_NOT_CONFIGURED
        error_message = f"no adapter registered for provider '{provider.value}'"
    else:
        try:
            completion = adapter.complete(req, model)
            answer = completion.text
            usage = completion.usage
            model = completion.model or model
        except ProviderUnavailable as exc:
            status = DispatchStatus.UNAVAILABLE
            null_reason = DispatchNullReason.PROVIDER_NOT_CONFIGURED
            error_message = str(exc)
        except ProviderCallError as exc:
            status = DispatchStatus.DEGRADED
            null_reason = DispatchNullReason.PROVIDER_CALL_FAILED
            error_message = str(exc)
        except Exception as exc:  # noqa: BLE001 — the supervisor must never raise
            status = DispatchStatus.DEGRADED
            null_reason = DispatchNullReason.PROVIDER_CALL_FAILED
            error_message = f"unexpected provider error: {exc}"
    latency_ms = int((time.monotonic() - start) * 1000)

    return _finalize(
        request_id=request_id,
        req=req,
        provider=provider,
        model=model,
        status=status,
        routing_reason=decision.routing_reason,
        rejected=decision.rejected,
        answer=answer,
        usage=usage,
        latency_ms=latency_ms,
        fallback_used=decision.fallback_used,
        null_reason=null_reason,
        error_message=error_message,
        write_receipt=write_receipt,
    )
