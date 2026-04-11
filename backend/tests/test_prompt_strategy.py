"""Unit tests for the Prompt Strategy Engine (Layer 1)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest

from app.services.prompt_strategy import (
    COMPOSITION_PROFILES,
    classify_profile,
    decompose_scope,
    derive_intent_hint,
    extract_thread_goal,
    pick_summary_strategy,
    resolve_deictics,
    select_skill,
    strategize,
)


# ── Minimal dataclass shims so we don't depend on the pydantic runtime schemas ─


@dataclass
class _ShimScope:
    resolved_scope_type: str = "environment"
    environment_id: str | None = None
    business_id: str | None = None
    schema_name: str | None = None
    industry: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    entity_name: str | None = None
    confidence: float = 1.0
    source: str = "test"


@dataclass
class _ShimPage:
    title: str | None = None
    route: str | None = None
    visible_widgets: list[str] | None = None


@dataclass
class _ShimFilters:
    quarter: str | None = None
    scenario: str | None = None
    date_range: str | None = None


@dataclass
class _ShimEnvelope:
    page: _ShimPage | None = None
    filters: _ShimFilters | None = None
    environment_name: str | None = None
    visible_records: Any = None
    quarter: str | None = None


def _fund_scope(label: str = "Meridian Value Fund I") -> _ShimScope:
    return _ShimScope(
        environment_id="env-1",
        business_id="biz-1",
        entity_type="fund",
        entity_id="fund-meridian-1",
        entity_name=label,
    )


def _envelope(
    *, page_title: str = "Fund Detail", quarter: str | None = "2025Q4"
) -> _ShimEnvelope:
    return _ShimEnvelope(
        page=_ShimPage(title=page_title, route="/lab/env/x/re/funds/1", visible_widgets=["kpi_strip"]),
        filters=_ShimFilters(quarter=quarter) if quarter else None,
        environment_name="Meridian Capital Management",
        visible_records=None,
    )


# ── 1. classify_profile ───────────────────────────────────────────────────


def test_classify_profile_explain_metric_returns_entity_question():
    profile = classify_profile("explain_metric.irr", "B")
    assert profile.name == "entity_question"
    assert profile.require_scope_entity is True


def test_classify_profile_lookup_returns_simple_lookup_with_lane_A():
    profile = classify_profile("lookup_status", "C")
    assert profile.name == "simple_lookup"
    assert profile.force_lane == "A"
    assert profile.force_no_rag is True


def test_classify_profile_unknown_falls_back_to_default():
    profile = classify_profile("something_weird", "B")
    assert profile.name == "default"


def test_classify_profile_none_intent_returns_default():
    profile = classify_profile(None, "B")
    assert profile.name == "default"


# ── 2. resolve_deictics ───────────────────────────────────────────────────


def test_resolve_deictics_rewrites_this_fund():
    scope_hint = {
        "entity_label": "Meridian Value Fund I",
        "entity_type": "fund",
        "page_title": "Fund Detail",
        "quarter": "2025Q4",
    }
    out, rewrites = resolve_deictics("what is the IRR of this fund", scope_hint)
    assert "Meridian Value Fund I" in out
    assert "[context anchor:" in out
    assert any(rw["kind"] == "entity_label" for rw in rewrites)


def test_resolve_deictics_rewrites_here_to_page_for_entity():
    scope_hint = {
        "entity_label": "Meridian Value Fund I",
        "entity_type": "fund",
        "page_title": "Fund Detail",
        "quarter": None,
    }
    out, rewrites = resolve_deictics("why here", scope_hint)
    assert "Fund Detail page" in out
    assert any(rw["kind"] == "page_anchor" for rw in rewrites)


def test_resolve_deictics_no_scope_only_appends_nothing_special():
    out, rewrites = resolve_deictics("hello", {"entity_label": None, "page_title": None, "quarter": None})
    # No rewrites, no anchor appended (no scope to anchor to)
    assert "[context anchor:" not in out
    assert rewrites == []


def test_resolve_deictics_it_only_rewritten_when_no_other_noun():
    scope_hint = {
        "entity_label": "Fund A",
        "entity_type": "fund",
        "page_title": None,
        "quarter": None,
    }
    # "it" alone → rewrite
    out, rewrites = resolve_deictics("check it", scope_hint)
    assert '"Fund A"' in out
    assert any(rw["kind"] == "entity_label_conservative" for rw in rewrites)

    # "the fund" already present → don't rewrite "it"
    out2, rewrites2 = resolve_deictics("does the fund own it", scope_hint)
    # 'the fund' gets rewritten (entity_label pattern) but bare 'it' should not
    assert '"Fund A"' in out2
    assert not any(rw["from"].strip().lower() == "it" for rw in rewrites2)


# ── 3. extract_thread_goal ────────────────────────────────────────────────


def test_extract_thread_goal_finds_action_verb_in_recent_history():
    history = [
        {"role": "user", "content": "show me the fund overview"},
        {"role": "assistant", "content": "ok"},
        {"role": "user", "content": "validate fund returns for IGF VII"},
    ]
    goal = extract_thread_goal(history, summary=None)
    assert goal is not None
    assert "validate" in goal.lower()
    assert "IGF" in goal


def test_extract_thread_goal_falls_back_to_summary_first_sentence():
    goal = extract_thread_goal(
        [{"role": "user", "content": "hi"}],
        summary="User is reviewing Q4 carry. Numbers were confirmed.",
    )
    assert goal is not None
    assert goal.lower().startswith("thread goal:")
    assert "reviewing Q4 carry" in goal


def test_extract_thread_goal_none_when_no_signal():
    assert extract_thread_goal([], summary=None) is None
    assert extract_thread_goal([{"role": "user", "content": "ok"}], summary=None) is None


# ── 4. pick_summary_strategy ──────────────────────────────────────────────


def test_pick_summary_strategy_replace_history_when_long():
    profile = COMPOSITION_PROFILES["analysis"]
    strategy = pick_summary_strategy(
        profile=profile,
        summary_available=True,
        history_count=20,
        history_tokens_estimate=4000,
        max_history_turns=6,
    )
    assert strategy == "replace_history"


def test_pick_summary_strategy_none_when_short():
    profile = COMPOSITION_PROFILES["entity_question"]
    strategy = pick_summary_strategy(
        profile=profile,
        summary_available=True,
        history_count=2,
        history_tokens_estimate=100,
        max_history_turns=4,
    )
    assert strategy == "none"


def test_pick_summary_strategy_never_when_profile_forbids():
    profile = COMPOSITION_PROFILES["simple_lookup"]  # summary_mode="never"
    strategy = pick_summary_strategy(
        profile=profile,
        summary_available=True,
        history_count=20,
        history_tokens_estimate=5000,
        max_history_turns=2,
    )
    assert strategy == "none"


def test_pick_summary_strategy_complement_in_middle():
    profile = COMPOSITION_PROFILES["analysis"]
    strategy = pick_summary_strategy(
        profile=profile,
        summary_available=True,
        history_count=8,
        history_tokens_estimate=1200,
        max_history_turns=6,
    )
    assert strategy == "complement"


# ── 5. select_skill ───────────────────────────────────────────────────────


def test_select_skill_profile_override_wins_over_router():
    # Only run this if skill files exist in the runtime registry.
    from app.assistant_runtime.prompt_registry import SKILL_PROMPT_FILES

    if "run_analysis" not in SKILL_PROMPT_FILES:
        pytest.skip("run_analysis skill not registered")

    profile = COMPOSITION_PROFILES["analysis"]  # force_skill="run_analysis"
    skill_id, source = select_skill(
        profile=profile,
        router_skill_id="explain_metric",
        intent="explain_metric.irr",
        entity_type="fund",
        lane="C",
    )
    assert skill_id == "run_analysis"
    assert source == "profile"


def test_select_skill_router_wins_when_no_profile_force():
    from app.assistant_runtime.prompt_registry import SKILL_PROMPT_FILES

    if "explain_metric" not in SKILL_PROMPT_FILES:
        pytest.skip("explain_metric skill not registered")

    profile = COMPOSITION_PROFILES["default"]
    skill_id, source = select_skill(
        profile=profile,
        router_skill_id="explain_metric",
        intent="something_else",
        entity_type="fund",
        lane="B",
    )
    assert skill_id == "explain_metric"
    assert source == "router"


# ── 6. decompose_scope ────────────────────────────────────────────────────


def test_decompose_scope_splits_into_sections():
    scope = _fund_scope()
    envelope = _envelope()
    structured = decompose_scope(scope, envelope)

    assert structured.entity_label == "Meridian Value Fund I"
    assert structured.entity_type == "fund"
    assert structured.entity_id == "fund-meridian-1"
    assert structured.page_title == "Fund Detail"
    assert structured.quarter == "2025Q4"
    assert "Meridian Value Fund I" in structured.entity_text
    assert "Fund Detail" in structured.page_text
    assert "2025Q4" in structured.filters_text
    assert structured.short_label != ""


def test_decompose_scope_handles_missing_page_and_filters():
    scope = _fund_scope()
    envelope = _ShimEnvelope(page=None, filters=None, environment_name=None)
    structured = decompose_scope(scope, envelope)
    assert structured.page_text == ""
    assert structured.filters_text == ""
    assert structured.entity_text  # still populated


# ── 7. strategize (end-to-end plan construction) ──────────────────────────


def test_strategize_explain_metric_forces_entity_question_lane_B():
    plan = strategize(
        router_lane="C",
        router_skill_id="explain_metric",
        router_intent="explain_metric.irr",
        resolved_scope=_fund_scope(),
        context_envelope=_envelope(),
        history_messages=[{"role": "user", "content": "hi"}],
        summary_text=None,
        summary_version=None,
        user_message="what is the IRR of this fund",
    )
    assert plan.profile.name == "entity_question"
    assert plan.lane == "B"  # profile override
    assert plan.skill_id == "explain_metric"
    assert "Meridian Value Fund I" in plan.resolved_user_text
    assert plan.deictic_rewrites  # at least one rewrite
    assert plan.is_minimal is False


def test_strategize_lookup_enters_minimal_mode():
    plan = strategize(
        router_lane="C",
        router_skill_id=None,
        router_intent="lookup_status",
        resolved_scope=_fund_scope(),
        context_envelope=_envelope(),
        history_messages=[],
        summary_text=None,
        summary_version=None,
        user_message="is this fund closed",
    )
    assert plan.profile.name == "simple_lookup"
    assert plan.lane == "A"
    assert plan.is_minimal is True


def test_strategize_scope_downgrade_when_entity_required_but_missing():
    empty_scope = _ShimScope()  # no entity_name
    plan = strategize(
        router_lane="C",
        router_skill_id=None,
        router_intent="explain_metric.irr",
        resolved_scope=empty_scope,
        context_envelope=_ShimEnvelope(),
        history_messages=[],
        summary_text=None,
        summary_version=None,
        user_message="what is the IRR",
    )
    # Profile required an entity but none present → downgrade to default.
    assert plan.profile.name == "default"
    assert plan.diagnostics.get("scope_downgrade_applied") is True


# ── 8. derive_intent_hint ────────────────────────────────────────────────


def test_derive_intent_hint_combines_skill_and_message_keywords():
    hint = derive_intent_hint(router_skill_id="explain_metric", message="what is the IRR")
    assert hint is not None
    assert "explain_metric" in hint
    assert "what_is" in hint


def test_derive_intent_hint_none_when_no_signal():
    assert derive_intent_hint(router_skill_id=None, message="hello") is None
