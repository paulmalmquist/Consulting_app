from __future__ import annotations

import pytest

from app.schemas.ai_gateway import AssistantContextEnvelope, AssistantUiContext, ResolvedAssistantScope
from app.services.re_scenario_templates import resolve_template
from app.services.repe_intent import (
    INTENT_CAPITAL_CALL_IMPACT,
    INTENT_CLAWBACK_RISK,
    INTENT_CONSTRUCTION_IMPACT,
    INTENT_MONTE_CARLO_WATERFALL,
    INTENT_PIPELINE_RADAR,
    INTENT_PORTFOLIO_WATERFALL,
    INTENT_SENSITIVITY,
    INTENT_SESSION_WATERFALL_QUERY,
    INTENT_UW_VS_ACTUAL,
    classify_repe_intent,
)
from app.services.repe_session import get_session, summarize_waterfall_run, update_session

pytestmark = pytest.mark.usefixtures("fake_cursor")


def _scope() -> ResolvedAssistantScope:
    return ResolvedAssistantScope(
        resolved_scope_type="environment",
        environment_id="env-1",
        business_id="biz-1",
        schema_name="public",
        industry="real_estate",
        entity_type="fund",
        entity_id="fund-1",
        entity_name="Fund I",
        confidence=1.0,
        source="test",
    )


def _envelope() -> AssistantContextEnvelope:
    return AssistantContextEnvelope(ui=AssistantUiContext(page_entity_type="fund", page_entity_id="fund-1", page_entity_name="Fund I"))


INTENT_CASES = {
    INTENT_MONTE_CARLO_WATERFALL: {
        "positive": [
            "run a monte carlo waterfall",
            "show the probability waterfall",
            "use the simulation distribution in the waterfall",
            "take p10 p90 waterfall outcomes",
            "monte carlo waterfall for this fund",
        ],
        "negative": [
            "run the waterfall",
            "show fund metrics",
            "update the pipeline",
        ],
    },
    INTENT_PORTFOLIO_WATERFALL: {
        "positive": [
            "show the portfolio waterfall",
            "aggregate carry across funds",
            "cross fund waterfall view",
            "what is total carry exposure",
            "portfolio waterfall for all funds",
        ],
        "negative": [
            "show the deal radar",
            "run a single fund waterfall",
            "list scenario templates",
        ],
    },
    INTENT_PIPELINE_RADAR: {
        "positive": [
            "open the deal radar",
            "rank deals in the pipeline",
            "score the pipeline",
            "show best opportunities",
            "pipeline score for all deals",
        ],
        "negative": [
            "show waterfall scenarios",
            "calculate clawback",
            "monte carlo waterfall",
        ],
    },
    INTENT_CAPITAL_CALL_IMPACT: {
        "positive": [
            "what if we call another $10 million",
            "capital call impact for this fund",
            "call additional capital",
            "run a capital call what-if",
            "what if we call 2500000",
        ],
        "negative": [
            "capital account summary",
            "show carry",
            "rank deals",
        ],
    },
    INTENT_CLAWBACK_RISK: {
        "positive": [
            "is there clawback risk",
            "show promote risk",
            "gp liability in the downside",
            "calculate clawback",
            "what is our clawback exposure",
        ],
        "negative": [
            "what is lp return",
            "show portfolio waterfall",
            "run sensitivity table",
        ],
    },
    INTENT_UW_VS_ACTUAL: {
        "positive": [
            "uw vs actual waterfall",
            "underwriting versus actual performance",
            "thesis variance on this fund",
            "how are we tracking vs underwriting",
            "compare to underwriting",
        ],
        "negative": [
            "show actual waterfall",
            "pipeline score",
            "what if we call capital",
        ],
    },
    INTENT_SENSITIVITY: {
        "positive": [
            "build a waterfall sensitivity matrix",
            "show a data table for waterfall scenarios",
            "grid the scenarios for waterfall sensitivity",
            "waterfall sensitivity table",
            "matrix for cap rate and noi stress waterfall",
        ],
        "negative": [
            "construction waterfall",
            "show lp summary",
            "uw versus actual",
        ],
    },
    INTENT_CONSTRUCTION_IMPACT: {
        "positive": [
            "construction waterfall impact",
            "development waterfall timing",
            "show stabilization impact",
            "draw schedule impact on the waterfall",
            "construction timing for this fund",
        ],
        "negative": [
            "sensitivity matrix",
            "clawback risk",
            "portfolio waterfall",
        ],
    },
    INTENT_SESSION_WATERFALL_QUERY: {
        "positive": [
            "which scenario had the best lp return",
            "compare all runs",
            "best scenario so far",
            "worst scenario in this session",
            "summary of runs",
        ],
        "negative": [
            "run a new waterfall",
            "show portfolio waterfall",
            "deal radar score",
        ],
    },
}


def test_scenario_template_resolution():
    template = resolve_template("COVID stress")
    assert template is not None
    assert template["name"] == "covid_stress"
    assert template["cap_rate_delta_bps"] == 150


def test_session_waterfall_run_memory():
    summary = summarize_waterfall_run(
        result={
            "run_id": "run-1",
            "summary": {"nav": 100, "net_irr": 0.16, "net_tvpi": 1.8, "gp_carry": 12},
            "scenario_name": "Base",
            "quarter": "2026Q1",
        },
        fund_id="fund-1",
        fund_name="Fund I",
        scenario_name="Base",
        quarter="2026Q1",
    )
    assert summary is not None
    update_session("conv-1", waterfall_run=summary)
    session = get_session("conv-1")
    assert session is not None
    assert len(session.waterfall_runs) == 1
    assert session.waterfall_runs[0]["run_id"] == "run-1"


def test_new_intent_patterns_positive_and_negative():
    scope = _scope()
    envelope = _envelope()

    for intent, cases in INTENT_CASES.items():
        for message in cases["positive"]:
            classified = classify_repe_intent(message, scope, envelope)
            assert classified is not None, message
            assert classified.family == intent, message
        for message in cases["negative"]:
            classified = classify_repe_intent(message, scope, envelope)
            assert classified is None or classified.family != intent, message
