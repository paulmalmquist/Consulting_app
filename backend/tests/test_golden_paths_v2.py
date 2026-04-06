"""Golden path tests v2 — Winston behavior correctness across environments.

Tests the deterministic dispatch pipeline, entity resolution, structured
prechecks, and degradation behavior. Does NOT require a running LLM.
"""
from __future__ import annotations

import pytest

from app.assistant_runtime.dispatch_engine import _deterministic_dispatch
from app.assistant_runtime.turn_receipts import (
    ContextReceipt,
    ContextResolutionStatus,
    DegradedReason,
    DispatchSource,
    Lane,
    PendingActionStatus,
)
from app.assistant_runtime.degraded_responses import (
    _SKILL_FALLBACKS,
    degraded_message,
    empty_response_fallback,
)
from app.services.assistant_scope import _extract_entity_candidates


def _resolved_context(**kw) -> ContextReceipt:
    return ContextReceipt(resolution_status=ContextResolutionStatus.RESOLVED, **kw)

def _missing_context(**kw) -> ContextReceipt:
    return ContextReceipt(resolution_status=ContextResolutionStatus.MISSING_CONTEXT, **kw)


# ── GP-1: Fund Summary ──────────────────────────────────────────────

class TestGP1FundSummary:
    @pytest.mark.parametrize("message", [
        "give me a summary of the funds",
        "list all funds",
        "show me the funds",
        "what funds are in this portfolio",
        "fund summary",
        "portfolio overview",
        "how many funds do we have",
    ])
    def test_routes_deterministically(self, message):
        trace = _deterministic_dispatch(message=message, context=_missing_context())
        assert trace is not None, f"'{message}' should match fund summary guardrail"
        d = trace.normalized
        assert d.source == DispatchSource.DETERMINISTIC_GUARDRAIL
        assert d.skill_id == "lookup_entity"
        assert d.needs_retrieval is True
        assert d.confidence >= 0.95


# ── GP-2: Fund Metrics ──────────────────────────────────────────────

class TestGP2FundMetrics:
    @pytest.mark.parametrize("message", [
        "get fund metrics for Meridian Core-Plus Income",
        "fund metrics for Atlas Value-Add Fund IV",
        "show me metrics for the fund",
        "what are the fund metrics",
    ])
    def test_routes_deterministically(self, message):
        trace = _deterministic_dispatch(message=message, context=_missing_context())
        assert trace is not None, f"'{message}' should match fund metrics guardrail"
        d = trace.normalized
        assert d.source == DispatchSource.DETERMINISTIC_GUARDRAIL
        assert d.skill_id == "explain_metric"
        assert d.needs_retrieval is True


# ── GP-3: Asset Ranking ─────────────────────────────────────────────

class TestGP3AssetRanking:
    @pytest.mark.parametrize("message", [
        "best performing assets",
        "top 5 assets by NOI",
        "rank assets by occupancy",
        "worst performing properties",
        "highest NOI assets",
    ])
    def test_routes_deterministically_with_context(self, message):
        trace = _deterministic_dispatch(message=message, context=_resolved_context())
        assert trace is not None, f"'{message}' should match rank_metric guardrail"
        assert trace.normalized.skill_id == "rank_metric"
        assert trace.normalized.lane == Lane.C_ANALYSIS
        assert trace.normalized.needs_retrieval is True


# ── GP-4: Asset Metric Lookup ────────────────────────────────────────

class TestGP4AssetMetric:
    @pytest.mark.parametrize("message", [
        "what is the NOI for Parkview Gardens",
        "show me the IRR for Atlas Value-Add Fund IV",
        "occupancy for Midtown Crossing",
    ])
    def test_routes_to_explain_metric(self, message):
        trace = _deterministic_dispatch(message=message, context=_resolved_context())
        assert trace is not None, f"'{message}' should match metric guardrail"
        assert trace.normalized.skill_id == "explain_metric"
        assert trace.normalized.needs_retrieval is True


# ── GP-5: Budget Variance ───────────────────────────────────────────

class TestGP5BudgetVariance:
    @pytest.mark.parametrize("message", [
        "compare actual vs budget",
        "explain the variance",
        "why is NOI below plan",
    ])
    def test_routes_to_variance(self, message):
        trace = _deterministic_dispatch(message=message, context=_resolved_context())
        assert trace is not None, f"'{message}' should match variance guardrail"
        assert trace.normalized.skill_id == "explain_metric_variance"


# ── GP-6/7: Resume Queries ──────────────────────────────────────────

class TestGP67Resume:
    @pytest.mark.parametrize("message", [
        "when did Paul start at JLL",
        "summarize Paul's experience at Kayne Anderson",
        "what did Paul do at Novendor",
        "Paul's career timeline",
    ])
    def test_routes_deterministically_with_retrieval(self, message):
        trace = _deterministic_dispatch(message=message, context=_missing_context())
        assert trace is not None, f"'{message}' should match resume guardrail"
        d = trace.normalized
        assert d.source == DispatchSource.DETERMINISTIC_GUARDRAIL
        assert d.skill_id == "run_analysis"
        assert d.needs_retrieval is True
        assert d.confidence >= 0.95


# ── GP-9: CRM Activity ──────────────────────────────────────────────

class TestGP9CRMActivity:
    @pytest.mark.parametrize("message", [
        "who should I follow up with today",
        "show my leads",
        "list accounts",
        "pipeline summary",
    ])
    def test_routes_deterministically(self, message):
        trace = _deterministic_dispatch(message=message, context=_missing_context())
        assert trace is not None, f"'{message}' should match CRM activity guardrail"
        assert trace.normalized.source == DispatchSource.DETERMINISTIC_GUARDRAIL
        assert trace.normalized.needs_retrieval is True


# ── GP-10: Create Entity ────────────────────────────────────────────

class TestGP10CreateEntity:
    @pytest.mark.parametrize("message", [
        "create a new opportunity",
        "create a new fund",
        "add a new account",
        "set up a new deal",
        "create a new lead",
    ])
    def test_routes_to_create_entity(self, message):
        trace = _deterministic_dispatch(message=message, context=_missing_context())
        assert trace is not None, f"'{message}' should match create entity guardrail"
        assert trace.normalized.skill_id == "create_entity"
        assert trace.normalized.write_intent is True
        assert trace.normalized.confidence >= 0.95


# ── Entity Name Extraction ──────────────────────────────────────────

class TestEntityNameExtraction:
    def test_for_pattern(self):
        c = _extract_entity_candidates("get fund metrics for Meridian Core-Plus Income")
        assert any("Meridian Core-Plus Income" in x for x in c)

    def test_of_pattern(self):
        c = _extract_entity_candidates("what is the NOI of Parkview Gardens")
        assert any("Parkview Gardens" in x for x in c)

    def test_at_pattern(self):
        c = _extract_entity_candidates("when did Paul start at JLL")
        assert any("JLL" in x for x in c)

    def test_full_message_always_fallback(self):
        msg = "something without a clear entity"
        assert msg in _extract_entity_candidates(msg)


# ── Minimum Response Contract ────────────────────────────────────────

class TestMinimumResponseContract:
    def test_core_skills_have_fallbacks(self):
        for skill_id in ["lookup_entity", "explain_metric", "rank_metric",
                         "explain_metric_variance", "run_analysis", "create_entity"]:
            assert skill_id in _SKILL_FALLBACKS, f"Missing fallback for '{skill_id}'"

    def test_empty_fallback_returns_blocks(self):
        blocks, msg = empty_response_fallback(skill_id="explain_metric")
        assert blocks
        assert msg

    def test_no_response_degraded_reason(self):
        assert degraded_message(DegradedReason.NO_RESPONSE)


# ── Pending Action Statuses ──────────────────────────────────────────

class TestPendingActionStatuses:
    def test_executed_exists(self):
        assert PendingActionStatus.EXECUTED == "executed"

    def test_failed_exists(self):
        assert PendingActionStatus.FAILED == "failed"
