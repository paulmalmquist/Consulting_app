"""Auto-routing decision for the dual-runtime Winston chat surface.

Currently a deliberately dumb keyword heuristic. The router is OFF by default
(see `WINSTON_AUTO_ROUTER_ENABLED` in config); even when off, every routing
decision is logged into `ai_runtime_receipts` so we accumulate labelled
training data for a future smarter implementation.
"""
from __future__ import annotations

from app.config import WINSTON_AUTO_ROUTER_ENABLED


_OPERATOR_HINTS: tuple[str, ...] = (
    "run ", "create ", "update ", "delete ", "execute ", "kick off ",
    "analyze ", "generate ", "schedule ", "deploy ", "draft ",
    "send ", "publish ", "post ",
)


def infer_runtime_for_prompt(message: str, *, env_id: str | None = None) -> tuple[str, str]:
    """Returns (runtime, reason) where runtime ∈ {'gateway', 'managed_agent'}.

    Heuristic only: imperative-action verbs lean towards Operator (tool-running);
    everything else stays on the gateway. This is intentionally crude — it
    exists to populate routing decisions for analysis, not to be authoritative.
    """
    lowered = message.lower()
    for hint in _OPERATOR_HINTS:
        if hint in lowered:
            return "managed_agent", f"keyword_heuristic:{hint.strip()}"
    return "gateway", "default"


def resolve_runtime(
    *,
    requested: str,
    message: str,
    env_id: str | None = None,
) -> tuple[str, str]:
    """Resolve the final runtime + a routing-decision label for receipts.

    `requested` is whatever the client asked for: 'gateway' | 'managed_agent' | 'auto'.
    Output runtime is one of 'gateway' | 'managed_agent'.

    When auto-routing is disabled, 'auto' silently falls back to 'gateway' but
    is recorded as `auto_disabled_fallback_gateway` so we can measure how often
    it would have triggered.
    """
    if requested == "managed_agent":
        return "managed_agent", "manual_operator"
    if requested == "gateway":
        return "gateway", "manual_gateway"
    if requested == "auto":
        if not WINSTON_AUTO_ROUTER_ENABLED:
            inferred, _reason = infer_runtime_for_prompt(message, env_id=env_id)
            return "gateway", f"auto_disabled_fallback_gateway(would_be={inferred})"
        runtime, reason = infer_runtime_for_prompt(message, env_id=env_id)
        prefix = "auto_operator" if runtime == "managed_agent" else "auto_gateway"
        return runtime, f"{prefix}:{reason}"
    return "gateway", f"unknown_request:{requested}"
