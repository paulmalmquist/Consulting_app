"""Control-Tower-scoped model routing (ITAR-aware posture).

Reuses the governed ``ai_dispatch`` router wholesale. The only thing this module adds is a *scoped
provider registry* with an inverted privacy posture for the demo:

  * Gemma-on-Vertex (self-hosted, in-boundary) -> may handle SENSITIVE data (``max_privacy=SENSITIVE``).
  * OpenAI / Anthropic (external APIs)          -> capped at INTERNAL (barred from SENSITIVE data).

So a sensitive / ITAR-demo-tagged request is eligible ONLY for the in-boundary Gemma tier; if that tier
is cold/unconfigured the dispatch fails closed (``UNAVAILABLE / provider_not_configured``) rather than
leaking sensitive data to an external API. Non-sensitive triage routes to the frontier reasoning tier.

This is an ITAR-AWARE ROUTING POSTURE for the demo, **not** a compliance claim. Actual ITAR compliance
requires a separately-verified GCP workload boundary, region, access controls, data residency, support
posture, and Assured Workloads configuration.

The production ``ai_dispatch.provider_registry`` is left untouched — ``run_dispatch`` / ``route_only``
both accept a ``registry`` parameter, so the scoped posture never changes production routing.
"""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.services import cost_tracker
from app.services.ai_dispatch.models import (
    AIRequest,
    DispatchResult,
    Privacy,
    ProviderDef,
    ProviderName,
    RiskLevel,
    RoutingDecision,
    TaskMode,
)
from app.services.ai_dispatch.registry import ProviderRegistry
from app.services.ai_dispatch.supervisor import route_only, run_dispatch

# Sensitive / ITAR-demo triage uses the telemetry-narrative mode (Gemma is eligible for it).
# Non-sensitive triage uses a frontier-reasoning mode that Gemma is structurally barred from, so it
# routes to Claude/OpenAI.
_PRIVATE_MODE = TaskMode.TELEMETRY_NARRATIVE
_FRONTIER_MODE = TaskMode.RESEARCH_SYNTHESIS

# Default model id for the staged Gemma endpoint (see scripts/gemma_vertex_stage/deploy.py).
_GEMMA_DEFAULT_MODEL = "gemma-3-1b-it"


def control_tower_registry() -> ProviderRegistry:
    """A scoped provider registry with the ITAR-aware posture. Built fresh per call (cheap, stateless);
    never mutates the global production registry."""
    reg = ProviderRegistry()
    reg.register(
        ProviderDef(
            name=ProviderName.OPENAI,
            display_name="OpenAI (frontier)",
            default_model="gpt-5-mini",
            allowed_modes=frozenset(
                {
                    TaskMode.RESEARCH_SYNTHESIS,
                    TaskMode.PLANNING,
                    TaskMode.ADVERSARIAL_REVIEW,
                    TaskMode.SUMMARIZATION,
                    TaskMode.CLASSIFICATION,
                    TaskMode.LOG_EXPLANATION,
                    TaskMode.TELEMETRY_NARRATIVE,
                }
            ),
            max_risk=RiskLevel.HIGH,
            max_privacy=Privacy.INTERNAL,  # external API → barred from SENSITIVE
            fallback_allowed=True,
            requires_env=("OPENAI_API_KEY",),
        )
    )
    reg.register(
        ProviderDef(
            name=ProviderName.ANTHROPIC,
            display_name="Claude (frontier)",
            default_model="claude-opus-4",
            allowed_modes=frozenset(
                {
                    TaskMode.RESEARCH_SYNTHESIS,
                    TaskMode.PLANNING,
                    TaskMode.ADVERSARIAL_REVIEW,
                    TaskMode.SUMMARIZATION,
                    TaskMode.LOG_EXPLANATION,
                }
            ),
            max_risk=RiskLevel.HIGH,
            max_privacy=Privacy.INTERNAL,  # external API → barred from SENSITIVE
            fallback_allowed=True,
            requires_env=("ANTHROPIC_API_KEY",),
        )
    )
    reg.register(
        ProviderDef(
            name=ProviderName.GEMMA_GCP,
            display_name="Gemma-on-Vertex (private tier)",
            default_model=_GEMMA_DEFAULT_MODEL,
            allowed_modes=frozenset(
                {
                    TaskMode.TELEMETRY_NARRATIVE,
                    TaskMode.SUMMARIZATION,
                    TaskMode.CLASSIFICATION,
                    TaskMode.LOW_RISK_RAG,
                    TaskMode.LOG_EXPLANATION,
                }
            ),
            max_risk=RiskLevel.HIGH,  # in-boundary tier may handle high-risk sensitive triage
            max_privacy=Privacy.SENSITIVE,  # in-boundary → may handle SENSITIVE data
            fallback_allowed=False,  # never fall away from the private tier for sensitive data
            requires_env=("GEMMA_VERTEX_PROJECT_ID", "GEMMA_VERTEX_ENDPOINT_ID"),
        )
    )
    return reg


def build_triage_task(*, verdict: str, channel_name: str,
                      anomaly_score: float | None, threshold: float | None) -> str:
    return (
        f"Anomaly triage for telemetry channel '{channel_name}'. "
        f"Champion verdict={verdict}, anomaly_score={anomaly_score}, threshold={threshold}. "
        "Summarize the most likely cause and recommend a go/no-go rationale for human review. "
        "Ground every statement in the provided telemetry; do not speculate beyond it."
    )


@dataclass(frozen=True)
class TriageOutcome:
    """Normalized routing/triage result the orchestration runner persists onto a decision row."""

    privacy: str
    mode: str
    itar_tagged: bool
    selected_provider: str | None
    selected_model: str | None
    routing_reason: str
    rejected: dict[str, str]
    dispatch_status: str
    dispatch_request_id: str | None
    triage_summary: str | None
    cost_estimate_usd: float | None
    executed: bool


def _token_cost(model: str | None, prompt_tokens: int, completion_tokens: int) -> float:
    if not model:
        return 0.0
    return cost_tracker.estimate_cost(
        model=model, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens
    )["total_cost"]


def _cost_for_provider(provider: str | None, model: str | None,
                       prompt_tokens: int, completion_tokens: int) -> float | None:
    """Per-token cost estimate. The self-hosted Gemma tier has no per-token charge — its cost is the
    GPU node ($/hr), surfaced in the lifecycle panel, not here."""
    if provider == ProviderName.GEMMA_GCP.value:
        return 0.0
    if provider is None:
        return None
    return _token_cost(model, prompt_tokens, completion_tokens)


def run_triage(
    *,
    verdict: str,
    channel_name: str,
    anomaly_score: float | None,
    threshold: float | None,
    env_id: str,
    business_id: str | UUID,
    itar_tagged: bool,
    execute: bool = False,
    max_tokens: int = 512,
) -> TriageOutcome:
    """Route (or run) sensitivity-aware triage for a verdict.

    ``execute=False`` (default) does routing only — no provider call, no cost, no receipt. This is the
    safe default: it surfaces the routing decision (selected provider + why each lost) which is the
    demo's core value, and it never incurs API/GPU cost or requires live keys. ``execute=True`` makes a
    real governed dispatch call for a triage narrative (operator opt-in via config).
    """
    privacy = Privacy.SENSITIVE if itar_tagged else Privacy.INTERNAL
    mode = _PRIVATE_MODE if itar_tagged else _FRONTIER_MODE
    risk = RiskLevel.HIGH if verdict == "NO_GO" else RiskLevel.MEDIUM
    req = AIRequest(
        task=build_triage_task(
            verdict=verdict, channel_name=channel_name,
            anomaly_score=anomaly_score, threshold=threshold,
        ),
        mode=mode,
        risk_level=risk,
        privacy=privacy,
        env_id=env_id,
        business_id=str(business_id),
        max_tokens=max_tokens,
    )
    reg = control_tower_registry()

    if execute:
        result: DispatchResult = run_dispatch(req, registry=reg)
        provider = result.provider.value if result.provider else None
        return TriageOutcome(
            privacy=privacy.value,
            mode=mode.value,
            itar_tagged=itar_tagged,
            selected_provider=provider,
            selected_model=result.model,
            routing_reason=result.routing_reason,
            rejected=dict(result.rejected),
            dispatch_status=result.status.value,
            dispatch_request_id=result.request_id,
            triage_summary=result.answer,
            cost_estimate_usd=_cost_for_provider(
                provider, result.model,
                result.usage.prompt_tokens or 0, result.usage.completion_tokens or 0,
            ),
            executed=True,
        )

    decision: RoutingDecision = route_only(req, reg)
    provider = decision.selected_provider.value if decision.selected_provider else None
    # Representative "cost if executed" for the routing-only view: nominal prompt + the request's
    # completion budget.
    cost = _cost_for_provider(provider, decision.selected_model, 256, max_tokens)
    return TriageOutcome(
        privacy=privacy.value,
        mode=mode.value,
        itar_tagged=itar_tagged,
        selected_provider=provider,
        selected_model=decision.selected_model,
        routing_reason=decision.routing_reason,
        rejected=dict(decision.rejected),
        dispatch_status=decision.status.value,
        dispatch_request_id=None,
        triage_summary=None,
        cost_estimate_usd=cost,
        executed=False,
    )
