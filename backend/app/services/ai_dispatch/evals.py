"""Routing-policy eval suite — in-process, read-only, prod-safe.

Runs deterministic routing cases through ``select_provider`` only. No model calls,
no DB writes, no external files (the cases are inline so the deployed container does
not depend on the repo-root ``evals/`` directory). These four cases assert policy
denials and the Gemma fail-closed path, so they hold regardless of which provider
credentials are configured.
"""
from __future__ import annotations

from app.services.ai_dispatch.models import (
    AIRequest,
    Privacy,
    ProviderName,
    RiskLevel,
    TaskMode,
)
from app.services.ai_dispatch.policy import select_provider

# Mirrors evals/ai_dispatch/routing_policy.jsonl, inlined for prod safety.
ROUTING_EVAL_CASES: list[dict] = [
    {
        "name": "forced gemma + high-risk code is blocked on risk",
        "mode": "code",
        "risk": "high",
        "forced_provider": "gemma_gcp",
        "expect_status": "blocked",
        "expect_null_reason": "risk_tier_forbidden",
    },
    {
        "name": "forced gemma + code is blocked on capability",
        "mode": "code",
        "risk": "low",
        "forced_provider": "gemma_gcp",
        "expect_status": "blocked",
        "expect_null_reason": "capability_unavailable",
    },
    {
        "name": "summarization fails closed to gemma without fallback",
        "mode": "summarization",
        "risk": "low",
        "expect_status": "unavailable",
        "expect_null_reason": "provider_not_configured",
    },
    {
        "name": "telemetry narrative fails closed to gemma",
        "mode": "telemetry_narrative",
        "risk": "low",
        "expect_status": "unavailable",
        "expect_null_reason": "provider_not_configured",
    },
]


def _run_case(case: dict) -> dict:
    req = AIRequest(
        task=case.get("task", "eval"),
        mode=TaskMode(case["mode"]),
        risk_level=RiskLevel(case.get("risk", "low")),
        privacy=Privacy(case.get("privacy", "internal")),
        allow_fallback=case.get("allow_fallback", False),
        forced_provider=ProviderName(case["forced_provider"]) if case.get("forced_provider") else None,
    )
    decision = select_provider(req)
    got_status = decision.status.value
    got_null = decision.null_reason.value if decision.null_reason else None
    got_provider = decision.selected_provider.value if decision.selected_provider else None

    ok = True
    if "expect_status" in case and got_status != case["expect_status"]:
        ok = False
    if "expect_null_reason" in case and got_null != case["expect_null_reason"]:
        ok = False
    if "expect_provider" in case and got_provider != case["expect_provider"]:
        ok = False

    return {
        "name": case["name"],
        "mode": case["mode"],
        "risk": case.get("risk", "low"),
        "expect_status": case.get("expect_status"),
        "expect_null_reason": case.get("expect_null_reason"),
        "got_status": got_status,
        "got_provider": got_provider,
        "got_null_reason": got_null,
        "passed": ok,
    }


def run_routing_evals() -> dict:
    """Run the routing-policy suite. Pure: no model calls, no receipts, no DB."""
    cases = [_run_case(c) for c in ROUTING_EVAL_CASES]
    passed = sum(1 for c in cases if c["passed"])
    return {
        "suite": "routing_policy",
        "total": len(cases),
        "passed": passed,
        "failed": len(cases) - passed,
        "cases": cases,
        "note": "deterministic routing-policy checks via select_provider; no model calls, no receipts",
    }
