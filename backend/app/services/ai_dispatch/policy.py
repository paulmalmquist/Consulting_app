"""Routing policy — selects a provider for a request, transparently.

Rules enforced here:
  * A provider is eligible only if the mode is in its ``allowed_modes`` and the
    request's risk/privacy do not exceed its ceilings.
  * Gemma is structurally barred from code/tool/sql, HIGH risk, and SENSITIVE
    data (it never lists those modes and its ceilings stop the rest).
  * The preferred provider per mode is chosen first; if it is eligible but not
    available, we fall back to another eligible+available provider ONLY when the
    request opts in (``allow_fallback``). Otherwise we fail closed.
  * Every non-selected provider is recorded in ``rejected`` with its reason — the
    router never silently drops a provider.
"""
from __future__ import annotations

from app.services.ai_dispatch.models import (
    AIRequest,
    DispatchNullReason,
    DispatchStatus,
    ProviderDef,
    ProviderName,
    RoutingDecision,
    privacy_rank,
    risk_rank,
)
from app.services.ai_dispatch.registry import ProviderRegistry, provider_registry

# Preference order per mode. Eligibility still filters these; a provider listed
# here that cannot serve the mode is simply skipped (and recorded as rejected).
_PREFERENCE: dict[str, list[ProviderName]] = {
    "code": [ProviderName.OPENAI],
    "tool_execution": [ProviderName.OPENAI],
    "sql_draft": [ProviderName.OPENAI],
    "eval_grading": [ProviderName.OPENAI, ProviderName.ANTHROPIC],
    "planning": [ProviderName.ANTHROPIC, ProviderName.OPENAI],
    "adversarial_review": [ProviderName.ANTHROPIC, ProviderName.OPENAI],
    "research_synthesis": [ProviderName.ANTHROPIC, ProviderName.OPENAI],
    "summarization": [ProviderName.GEMMA_GCP, ProviderName.OPENAI, ProviderName.ANTHROPIC],
    "classification": [ProviderName.GEMMA_GCP, ProviderName.OPENAI],
    "low_risk_rag": [ProviderName.GEMMA_GCP, ProviderName.OPENAI],
    "log_explanation": [ProviderName.GEMMA_GCP, ProviderName.OPENAI, ProviderName.ANTHROPIC],
    "telemetry_narrative": [ProviderName.GEMMA_GCP, ProviderName.OPENAI],
}

_ALL_ORDER = [ProviderName.OPENAI, ProviderName.ANTHROPIC, ProviderName.GEMMA_GCP]


def _ineligibility_reason(prov: ProviderDef, req: AIRequest) -> DispatchNullReason | None:
    """Return why ``prov`` cannot serve ``req`` (risk first, then privacy, then mode), or None."""
    if risk_rank(req.risk_level) > risk_rank(prov.max_risk):
        return DispatchNullReason.RISK_TIER_FORBIDDEN
    if privacy_rank(req.privacy) > privacy_rank(prov.max_privacy):
        return DispatchNullReason.PRIVACY_FORBIDDEN
    if req.mode not in prov.allowed_modes:
        return DispatchNullReason.CAPABILITY_UNAVAILABLE
    return None


def _preference_order(req: AIRequest) -> list[ProviderName]:
    order = list(_PREFERENCE.get(req.mode.value, []))
    for name in _ALL_ORDER:
        if name not in order:
            order.append(name)
    return order


def select_provider(
    req: AIRequest, registry: ProviderRegistry = provider_registry
) -> RoutingDecision:
    rejected: dict[str, str] = {}

    # ── Forced provider: honor only if eligible; never fall back. ──
    if req.forced_provider is not None:
        prov = registry.get(req.forced_provider)
        if prov is None:
            return RoutingDecision(
                status=DispatchStatus.BLOCKED,
                routing_reason=f"forced provider '{req.forced_provider}' is not registered",
                null_reason=DispatchNullReason.NO_ELIGIBLE_PROVIDER,
            )
        reason = _ineligibility_reason(prov, req)
        if reason is not None:
            rejected[prov.name.value] = reason.value
            return RoutingDecision(
                status=DispatchStatus.BLOCKED,
                routing_reason=f"forced provider '{prov.name.value}' cannot serve this request ({reason.value})",
                rejected=rejected,
                null_reason=reason,
            )
        if registry.available(prov.name):
            return RoutingDecision(
                status=DispatchStatus.SUCCESS,
                selected_provider=prov.name,
                selected_model=prov.default_model,
                routing_reason=f"forced provider '{prov.name.value}' is eligible and available",
                eligible=[prov.name],
            )
        rejected[prov.name.value] = DispatchNullReason.PROVIDER_NOT_CONFIGURED.value
        return RoutingDecision(
            status=DispatchStatus.UNAVAILABLE,
            routing_reason=f"forced provider '{prov.name.value}' is eligible but not configured; no fallback for a forced provider",
            eligible=[prov.name],
            rejected=rejected,
            null_reason=DispatchNullReason.PROVIDER_NOT_CONFIGURED,
        )

    # ── Normal path: build the eligible set in preference order. ──
    eligible: list[ProviderName] = []
    for name in _preference_order(req):
        prov = registry.get(name)
        if prov is None:
            continue
        reason = _ineligibility_reason(prov, req)
        if reason is not None:
            rejected[name.value] = reason.value
        else:
            eligible.append(name)

    if not eligible:
        return RoutingDecision(
            status=DispatchStatus.BLOCKED,
            routing_reason=f"no provider can serve mode '{req.mode.value}' at risk '{req.risk_level.value}' / privacy '{req.privacy.value}'",
            rejected=rejected,
            null_reason=DispatchNullReason.NO_ELIGIBLE_PROVIDER,
        )

    preferred = eligible[0]
    preferred_def = registry.get(preferred)
    assert preferred_def is not None  # eligible implies registered

    if registry.available(preferred):
        return RoutingDecision(
            status=DispatchStatus.SUCCESS,
            selected_provider=preferred,
            selected_model=preferred_def.default_model,
            routing_reason=f"'{preferred.value}' is the preferred, eligible, available provider for mode '{req.mode.value}'",
            eligible=eligible,
            rejected=rejected,
        )

    # Preferred is eligible but not available.
    if req.allow_fallback:
        for name in eligible[1:]:
            prov = registry.get(name)
            if prov is not None and prov.fallback_allowed and registry.available(name):
                return RoutingDecision(
                    status=DispatchStatus.SUCCESS,
                    selected_provider=name,
                    selected_model=prov.default_model,
                    routing_reason=f"preferred '{preferred.value}' unavailable; fell back to '{name.value}'",
                    eligible=eligible,
                    rejected=rejected,
                    fallback_used=True,
                    fallback_reason=f"{preferred.value}_unavailable",
                )

    # No fallback taken — fail closed, naming the intended provider.
    rejected.setdefault(preferred.value, DispatchNullReason.PROVIDER_NOT_CONFIGURED.value)
    fb = "no eligible+available fallback" if req.allow_fallback else "fallback disabled"
    return RoutingDecision(
        status=DispatchStatus.UNAVAILABLE,
        routing_reason=f"'{preferred.value}' is the home for mode '{req.mode.value}' but is not configured; {fb}",
        eligible=eligible,
        rejected=rejected,
        null_reason=DispatchNullReason.PROVIDER_NOT_CONFIGURED,
    )
