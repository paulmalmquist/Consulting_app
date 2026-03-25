"""Tests for investor / capital activity intent classification and MCP tool schemas."""
from __future__ import annotations

from app.schemas.ai_gateway import AssistantContextEnvelope, AssistantUiContext, ResolvedAssistantScope
from app.services.repe_intent import (
    classify_repe_intent,
    INTENT_LIST_INVESTORS,
    INTENT_LIST_CAPITAL_ACTIVITY,
    INTENT_NAV_ROLLFORWARD,
    INTENT_LP_SUMMARY,
    INTENT_CAPITAL_CALL_IMPACT,
)
from app.mcp.schemas.repe_investor_tools import (
    ListInvestorsInput,
    GetInvestorSummaryInput,
    ListCapitalActivityInput,
    NavRollforwardInput,
)


# ── Fixtures ────────────────────────────────────────────────────────────────

ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
BUS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
FUND_ID = "a1b2c3d4-0003-0030-0001-000000000001"


def _scope() -> ResolvedAssistantScope:
    return ResolvedAssistantScope(
        resolved_scope_type="environment",
        environment_id=ENV_ID,
        business_id=BUS_ID,
        schema_name="public",
        industry="real_estate",
        entity_type="fund",
        entity_id=FUND_ID,
        entity_name="Fund I",
        confidence=1.0,
        source="test",
    )


def _envelope(page_type: str = "fund") -> AssistantContextEnvelope:
    return AssistantContextEnvelope(
        ui=AssistantUiContext(page_entity_type=page_type, page_entity_id=FUND_ID, page_entity_name="Fund I"),
    )


def _classify(msg: str, page_type: str = "fund"):
    return classify_repe_intent(msg, _scope(), _envelope(page_type))


# ── Intent Classification Tests ────────────────────────────────────────────


class TestListInvestorsIntent:
    def test_show_investors(self):
        result = _classify("show me the investors", "environment")
        assert result is not None
        assert result.family == INTENT_LIST_INVESTORS
        assert result.confidence >= 0.85

    def test_list_lps(self):
        result = _classify("list all LPs", "environment")
        assert result is not None
        assert result.family == INTENT_LIST_INVESTORS
        assert result.confidence >= 0.85

    def test_who_are_investors(self):
        result = _classify("who are the limited partners", "environment")
        assert result is not None
        assert result.family == INTENT_LIST_INVESTORS
        assert result.confidence >= 0.85

    def test_investors_and_commitments(self):
        result = _classify("show me investors and commitments", "environment")
        assert result is not None
        assert result.family == INTENT_LIST_INVESTORS
        assert result.confidence >= 0.85

    def test_lp_summary_on_fund_page_wins(self):
        """On a fund page, 'LP summary' should win over 'list investors'."""
        result = _classify("LP summary", "fund")
        assert result is not None
        assert result.family == INTENT_LP_SUMMARY


class TestListCapitalActivityIntent:
    def test_show_capital_calls(self):
        result = _classify("show me recent capital calls")
        assert result is not None
        assert result.family == INTENT_LIST_CAPITAL_ACTIVITY
        assert result.confidence >= 0.85

    def test_what_distributions(self):
        result = _classify("what distributions have been made this quarter")
        assert result is not None
        assert result.family == INTENT_LIST_CAPITAL_ACTIVITY
        assert result.confidence >= 0.85

    def test_capital_activity_log(self):
        result = _classify("show the capital activity log")
        assert result is not None
        assert result.family == INTENT_LIST_CAPITAL_ACTIVITY
        assert result.confidence >= 0.85

    def test_summarize_distributions(self):
        result = _classify("summarize distributions by investor")
        assert result is not None
        assert result.family == INTENT_LIST_CAPITAL_ACTIVITY
        assert result.confidence >= 0.85

    def test_capital_call_impact_not_confused(self):
        """'what if we call additional capital' should be CAPITAL_CALL_IMPACT, not LIST."""
        result = _classify("what if we call additional capital")
        assert result is not None
        assert result.family == INTENT_CAPITAL_CALL_IMPACT


class TestNavRollforwardIntent:
    def test_nav_rollforward(self):
        result = _classify("show me the NAV rollforward")
        assert result is not None
        assert result.family == INTENT_NAV_ROLLFORWARD
        assert result.confidence >= 0.85

    def test_what_drove_nav(self):
        result = _classify("what drove NAV this quarter")
        assert result is not None
        assert result.family == INTENT_NAV_ROLLFORWARD
        assert result.confidence >= 0.85

    def test_nav_bridge(self):
        result = _classify("show the NAV bridge from last quarter")
        assert result is not None
        assert result.family == INTENT_NAV_ROLLFORWARD
        assert result.confidence >= 0.85

    def test_why_did_nav_change(self):
        result = _classify("why did NAV change from prior quarter")
        assert result is not None
        assert result.family == INTENT_NAV_ROLLFORWARD
        assert result.confidence >= 0.85


# ── Schema Validation Tests ────────────────────────────────────────────────


class TestSchemas:
    def test_list_investors_input(self):
        inp = ListInvestorsInput(env_id=ENV_ID, business_id=BUS_ID)
        assert inp.env_id == ENV_ID
        assert inp.fund_id is None
        assert inp.partner_type is None

    def test_list_investors_with_filters(self):
        inp = ListInvestorsInput(
            env_id=ENV_ID, business_id=BUS_ID,
            fund_id=FUND_ID, partner_type="lp",
        )
        assert str(inp.fund_id) == FUND_ID
        assert inp.partner_type == "lp"

    def test_get_investor_summary_input(self):
        inp = GetInvestorSummaryInput(
            partner_id="aaaaaaaa-0000-0000-0000-000000000001",
            quarter="2026Q1", env_id=ENV_ID, business_id=BUS_ID,
        )
        assert str(inp.partner_id) == "aaaaaaaa-0000-0000-0000-000000000001"
        assert inp.quarter == "2026Q1"

    def test_list_capital_activity_input(self):
        inp = ListCapitalActivityInput(env_id=ENV_ID, business_id=BUS_ID)
        assert inp.limit == 50
        assert inp.fund_id is None
        assert inp.entry_type is None

    def test_list_capital_activity_with_filters(self):
        inp = ListCapitalActivityInput(
            env_id=ENV_ID, business_id=BUS_ID,
            fund_id=FUND_ID, entry_type="distribution",
            quarter="2026Q1", limit=100,
        )
        assert inp.entry_type == "distribution"
        assert inp.limit == 100

    def test_nav_rollforward_input(self):
        inp = NavRollforwardInput(
            fund_id=FUND_ID,
            quarter_from="2025Q4", quarter_to="2026Q1",
            env_id=ENV_ID, business_id=BUS_ID,
        )
        assert inp.quarter_from == "2025Q4"
        assert inp.quarter_to == "2026Q1"
