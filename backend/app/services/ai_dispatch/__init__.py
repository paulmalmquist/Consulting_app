"""AI provider dispatch — a governed model router (standalone).

Selects a provider and model per request by task mode, risk, and privacy; records
an immutable receipt through the existing governance audit log; and fails closed
with a ``null_reason`` rather than substituting a provider silently. This package
is independent of the production ``ai_gateway`` path and never imports it.

Public surface:
    from app.services.ai_dispatch import run_dispatch, route_only
    from app.services.ai_dispatch.registry import provider_registry
"""
from __future__ import annotations

from app.services.ai_dispatch.models import (
    AIRequest,
    DispatchNullReason,
    DispatchResult,
    DispatchStatus,
    Privacy,
    ProviderName,
    RiskLevel,
    RoutingDecision,
    TaskMode,
)
from app.services.ai_dispatch.supervisor import route_only, run_dispatch

__all__ = [
    "AIRequest",
    "DispatchNullReason",
    "DispatchResult",
    "DispatchStatus",
    "Privacy",
    "ProviderName",
    "RiskLevel",
    "RoutingDecision",
    "TaskMode",
    "route_only",
    "run_dispatch",
]
