"""Tests for the tiny router → deterministic skill mapping table.

Validates that RouterIntent objects map to correct skill_ids via
_map_intent_to_skill() — the core of the new dispatch architecture.
"""
from __future__ import annotations

import pytest

from app.assistant_runtime.dispatch_engine import (
    RouterIntent,
    _map_intent_to_skill,
    _deterministic_dispatch,
    _INTENT_MAP,
    _INTENT_WILDCARD,
)
from app.assistant_runtime.turn_receipts import (
    ContextReceipt,
    ContextResolutionStatus,
    Lane,
)


def _intent(*, entity_type="unknown", action="unknown", **kw) -> RouterIntent:
    defaults = dict(
        environment="repe", entity_name=None, metric="none",
        timeframe_type="none", timeframe_value=None,
        needs_clarification=False, clarification_field="none", confidence=0.92,
    )
    defaults.update(kw)
    return RouterIntent(entity_type=entity_type, action=action, **defaults)


# ════════════════════════════════════════════════════════════════════════
# Test the mapping table directly
# ════════════════════════════════════════════════════════════════════════

class TestIntentMapping:
    """Verify each key router output maps to the correct skill."""

    # REPE fund actions
    def test_fund_summary(self):
        skill, lane, *_ = _map_intent_to_skill(_intent(entity_type="fund", action="summary"))
        assert skill == "fund_summary"
        assert lane == Lane.B_LOOKUP

    def test_fund_detail(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="fund", action="detail"))
        assert skill == "fund_summary"

    def test_fund_holdings(self):
        skill, lane, *_ = _map_intent_to_skill(_intent(entity_type="fund", action="holdings"))
        assert skill == "fund_holdings"
        assert lane == Lane.C_ANALYSIS

    def test_fund_metric_lookup(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="fund", action="metric_lookup"))
        assert skill == "explain_metric"

    def test_fund_rank(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="fund", action="rank"))
        assert skill == "rank_metric"

    def test_fund_trend(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="fund", action="trend"))
        assert skill == "trend_metric"

    # REPE asset actions
    def test_asset_metric_lookup(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="asset", action="metric_lookup"))
        assert skill == "explain_metric"

    def test_asset_rank(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="asset", action="rank"))
        assert skill == "rank_metric"

    def test_asset_trend(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="asset", action="trend"))
        assert skill == "trend_metric"

    def test_asset_detail(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="asset", action="detail"))
        assert skill == "lookup_entity"

    # Resume / person actions
    def test_person_explain(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="person", action="explain"))
        assert skill == "resume_qa"

    def test_person_summary(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="person", action="summary"))
        assert skill == "resume_qa"

    def test_person_draft_email(self):
        skill, lane, retrieval, write = _map_intent_to_skill(_intent(entity_type="person", action="draft_email"))
        assert skill == "draft_email"
        assert write is True

    # Count (fast path)
    def test_asset_count(self):
        skill, lane, *_ = _map_intent_to_skill(_intent(entity_type="asset", action="count"))
        assert skill == "lookup_entity"
        assert lane == Lane.B_LOOKUP

    def test_fund_count(self):
        skill, lane, *_ = _map_intent_to_skill(_intent(entity_type="fund", action="count"))
        assert skill == "lookup_entity"
        assert lane == Lane.B_LOOKUP

    def test_wildcard_count(self):
        skill, lane, *_ = _map_intent_to_skill(_intent(entity_type="unknown", action="count"))
        assert skill == "lookup_entity"
        assert lane == Lane.B_LOOKUP

    # Wildcards
    def test_wildcard_variance(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="asset", action="variance"))
        assert skill == "explain_metric_variance"

    def test_wildcard_compare(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="fund", action="compare"))
        assert skill == "compare_entities"

    def test_wildcard_create(self):
        skill, lane, retrieval, write = _map_intent_to_skill(_intent(action="create"))
        assert skill == "create_entity"
        assert write is True

    def test_wildcard_unknown(self):
        skill, *_ = _map_intent_to_skill(_intent(action="unknown"))
        assert skill == "run_analysis"

    # CRM / PDS
    def test_account_list(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="account", action="list"))
        assert skill == "lookup_entity"

    def test_project_summary(self):
        skill, *_ = _map_intent_to_skill(_intent(entity_type="project", action="summary"))
        assert skill == "lookup_entity"


# ════════════════════════════════════════════════════════════════════════
# Test coverage: every entry in _INTENT_MAP resolves to a valid skill
# ════════════════════════════════════════════════════════════════════════

class TestMappingTableIntegrity:
    def test_all_skills_exist_in_registry(self):
        from app.assistant_runtime.skill_registry import SKILL_BY_ID
        all_skills = set()
        for skill_id, *_ in _INTENT_MAP.values():
            all_skills.add(skill_id)
        for skill_id, *_ in _INTENT_WILDCARD.values():
            all_skills.add(skill_id)
        missing = all_skills - set(SKILL_BY_ID.keys())
        assert not missing, f"Skills in mapping table but not in registry: {missing}"


# ════════════════════════════════════════════════════════════════════════
# Fast-path guardrails still work
# ════════════════════════════════════════════════════════════════════════

class TestFastPathGuardrails:
    def test_create_entity_fires(self):
        ctx = ContextReceipt(resolution_status=ContextResolutionStatus.MISSING_CONTEXT)
        trace = _deterministic_dispatch(message="create a new fund", context=ctx)
        assert trace is not None
        assert trace.normalized.skill_id == "create_entity"

    def test_identity_fires(self):
        ctx = ContextReceipt(resolution_status=ContextResolutionStatus.RESOLVED)
        trace = _deterministic_dispatch(message="what page is this", context=ctx)
        assert trace is not None
        assert trace.normalized.skill_id == "lookup_entity"
        assert trace.normalized.lane == Lane.A_FAST

    def test_generic_query_falls_through_to_router(self):
        ctx = ContextReceipt(resolution_status=ContextResolutionStatus.RESOLVED)
        trace = _deterministic_dispatch(message="give me a rundown of the funds", context=ctx)
        assert trace is None, "Generic query should fall through to router model"

    def test_holdings_falls_through_to_router(self):
        ctx = ContextReceipt(resolution_status=ContextResolutionStatus.RESOLVED)
        trace = _deterministic_dispatch(message="breakdown of current holdings", context=ctx)
        assert trace is None, "Holdings should go to router model now"

    def test_resume_falls_through_to_router(self):
        ctx = ContextReceipt(resolution_status=ContextResolutionStatus.MISSING_CONTEXT)
        trace = _deterministic_dispatch(message="when did Paul start at JLL", context=ctx)
        assert trace is None, "Resume query should go to router model"


# ════════════════════════════════════════════════════════════════════════
# End-to-end: simulated router output → skill mapping
# ════════════════════════════════════════════════════════════════════════

class TestSimulatedRouterToSkill:
    """Simulate what the router model would return for each test case."""

    @pytest.mark.parametrize("prompt,entity_type,action,expected_skill", [
        ("give me a rundown of the funds", "fund", "summary", "fund_summary"),
        ("tell me about IGF VII", "fund", "detail", "fund_summary"),
        ("yes breakdown of current holdings", "fund", "holdings", "fund_holdings"),
        ("best performing assets by NOI", "asset", "rank", "rank_metric"),
        ("what is the NOI for Riverfront", "asset", "metric_lookup", "explain_metric"),
        ("when did Paul start at JLL", "person", "explain", "resume_qa"),
        ("compare actual vs budget", "unknown", "variance", "explain_metric_variance"),
        ("create a new fund", "fund", "create", "create_entity"),
        ("who should I follow up with", "account", "search", "lookup_entity"),
        ("draft an outreach email", "person", "draft_email", "draft_email"),
        ("how many assets do we own", "asset", "count", "lookup_entity"),
        ("how many funds", "fund", "count", "lookup_entity"),
    ])
    def test_router_output_maps_correctly(self, prompt, entity_type, action, expected_skill):
        intent = _intent(entity_type=entity_type, action=action)
        skill, *_ = _map_intent_to_skill(intent)
        assert skill == expected_skill, f"'{prompt}' → ({entity_type}, {action}) should map to {expected_skill}, got {skill}"
