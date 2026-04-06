"""Golden path tests v2 — Winston behavior correctness across environments.

Tests the intent → skill mapping table, entity extraction, degradation contract,
and the remaining deterministic guardrails. Does NOT require a running LLM.

Architecture note: _deterministic_dispatch only fires for create/write intent,
identity questions, and ambiguous deictic references. All other routing goes
through the tiny router model; we validate that path via _map_intent_to_skill().
"""
from __future__ import annotations

import pytest

from app.assistant_runtime.dispatch_engine import (
    RouterIntent,
    _deterministic_dispatch,
    _map_intent_to_skill,
)
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

def _intent(*, entity_type="unknown", action="unknown", **kw) -> RouterIntent:
    defaults = dict(
        environment="repe", entity_name=None, metric="none",
        timeframe_type="none", timeframe_value=None,
        needs_clarification=False, clarification_field="none", confidence=0.9,
    )
    defaults.update(kw)
    return RouterIntent(entity_type=entity_type, action=action, **defaults)


# ── GP-1: Fund Summary ──────────────────────────────────────────────

class TestGP1FundSummary:
    @pytest.mark.parametrize("action", ["summary", "list", "detail"])
    def test_maps_to_fund_summary(self, action):
        skill_id, lane, needs_retrieval, write_intent = _map_intent_to_skill(
            _intent(entity_type="fund", action=action)
        )
        assert skill_id == "fund_summary"
        assert lane == Lane.B_LOOKUP
        assert needs_retrieval is True
        assert write_intent is False


# ── GP-2: Fund Metrics ──────────────────────────────────────────────

class TestGP2FundMetrics:
    def test_fund_metric_lookup_maps_to_explain_metric(self):
        skill_id, lane, needs_retrieval, _ = _map_intent_to_skill(
            _intent(entity_type="fund", action="metric_lookup")
        )
        assert skill_id == "explain_metric"
        assert needs_retrieval is True

    def test_asset_metric_lookup_maps_to_explain_metric(self):
        skill_id, lane, needs_retrieval, _ = _map_intent_to_skill(
            _intent(entity_type="asset", action="metric_lookup")
        )
        assert skill_id == "explain_metric"

    def test_wildcard_metric_lookup(self):
        skill_id, _, _, _ = _map_intent_to_skill(
            _intent(entity_type="unknown", action="metric_lookup")
        )
        assert skill_id == "explain_metric"


# ── GP-3: Asset Ranking ─────────────────────────────────────────────

class TestGP3AssetRanking:
    @pytest.mark.parametrize("entity_type", ["asset", "fund", "unknown"])
    def test_rank_maps_to_rank_metric(self, entity_type):
        skill_id, lane, needs_retrieval, _ = _map_intent_to_skill(
            _intent(entity_type=entity_type, action="rank")
        )
        assert skill_id == "rank_metric"
        assert lane == Lane.C_ANALYSIS
        assert needs_retrieval is True


# ── GP-4: Asset Metric Lookup ────────────────────────────────────────

class TestGP4AssetMetric:
    def test_asset_explain_maps_to_explain_metric(self):
        skill_id, _, _, _ = _map_intent_to_skill(
            _intent(entity_type="asset", action="explain")
        )
        assert skill_id == "explain_metric"

    def test_asset_metric_lookup(self):
        skill_id, _, _, _ = _map_intent_to_skill(
            _intent(entity_type="asset", action="metric_lookup")
        )
        assert skill_id == "explain_metric"


# ── GP-5: Budget Variance ───────────────────────────────────────────

class TestGP5BudgetVariance:
    @pytest.mark.parametrize("entity_type", ["fund", "asset", "unknown"])
    def test_variance_maps_to_explain_metric_variance(self, entity_type):
        skill_id, lane, _, _ = _map_intent_to_skill(
            _intent(entity_type=entity_type, action="variance")
        )
        assert skill_id == "explain_metric_variance"
        assert lane == Lane.C_ANALYSIS


# ── GP-6/7: Resume Queries ──────────────────────────────────────────

class TestGP67Resume:
    @pytest.mark.parametrize("action", ["explain", "summary", "detail", "search"])
    def test_person_maps_to_resume_qa(self, action):
        skill_id, lane, needs_retrieval, _ = _map_intent_to_skill(
            _intent(entity_type="person", action=action, environment="resume")
        )
        assert skill_id == "resume_qa"
        assert needs_retrieval is True


# ── GP-9: CRM Activity ──────────────────────────────────────────────

class TestGP9CRMActivity:
    @pytest.mark.parametrize("entity_type,action", [
        ("account", "list"),
        ("account", "search"),
        ("account", "summary"),
        ("opportunity", "list"),
        ("opportunity", "summary"),
    ])
    def test_crm_maps_to_lookup_entity(self, entity_type, action):
        skill_id, lane, needs_retrieval, _ = _map_intent_to_skill(
            _intent(entity_type=entity_type, action=action, environment="crm")
        )
        assert skill_id == "lookup_entity"
        assert needs_retrieval is True


# ── GP-10: Create Entity (still deterministic) ──────────────────────

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


# ── GP-11: Identity (still deterministic) ───────────────────────────

class TestGP11Identity:
    @pytest.mark.parametrize("message", [
        "what page is this",
        "what environment is this",
        "which fund am I looking at",
    ])
    def test_identity_routes_deterministically(self, message):
        trace = _deterministic_dispatch(message=message, context=_resolved_context())
        assert trace is not None, f"'{message}' should match identity guardrail"
        assert trace.normalized.skill_id == "lookup_entity"
        assert trace.normalized.lane == Lane.A_FAST
        assert trace.normalized.source == DispatchSource.DETERMINISTIC_GUARDRAIL


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
