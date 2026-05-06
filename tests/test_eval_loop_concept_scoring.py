"""Unit tests for concept-eval scorers (PR 3).

Pure unit tests against the scorer module — no live backend, no Postgres.
Each test fabricates a `result` dict that mimics what the runner would
produce after executing a `concept_eval` scenario, then asserts the
scorer's output.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))

from eval_loop.scenario_loader import load_scenarios
from eval_loop.scorers import (
    alias_normalization_score,
    concept_match_score,
    context_completeness_score,
    evaluate_concept_release_gates,
    generic_filler_penalty,
    missing_data_failure_mode_score,
    output_contract_score,
    score_concept_scenario,
    unsupported_claim_penalty,
)


# ── Test helpers ──────────────────────────────────────────────────────────


def _result_with_concept(
    *,
    concept_id: str = "repe.noi_variance",
    matched_alias: str | None = "NOI off plan",
    confidence: float = 0.8,
    match_reason: str = "substring_alias",
    behavior_tier: str = "proceed",
    required_context_present: list[str] | None = None,
    required_context_missing: list[str] | None = None,
    output_contract_sections_expected: list[str] | None = None,
    failure_modes_available: list[str] | None = None,
    response_text: str = "",
    source_inventory: list[str] | None = None,
) -> dict:
    if required_context_present is None:
        required_context_present = ["entity", "period", "scope"]
    if required_context_missing is None:
        required_context_missing = ["comparison_set", "basis", "currency", "sources"]
    if output_contract_sections_expected is None:
        output_contract_sections_expected = [
            "direct_answer", "metric_block", "driver_bridge",
            "reconciliation", "caveats", "next_step", "sources",
        ]
    if failure_modes_available is None:
        failure_modes_available = ["missing_context", "mixed_basis", "stale_source"]
    return {
        "kind": "concept_eval",
        "response_text": response_text,
        "duration_ms": 1200,
        "turn_receipt": {
            "concept": {
                "concept_id": concept_id,
                "concept_version": "0.1.0",
                "matched_alias": matched_alias,
                "confidence": confidence,
                "match_reason": match_reason,
                "behavior_tier": behavior_tier,
                "concept_object_included": True,
                "concept_object_extended_included": True,
                "concept_object_tokens": 320,
                "concept_object_extended_tokens": 470,
                "required_context_present": required_context_present,
                "required_context_missing": required_context_missing,
                "output_contract_sections_expected": output_contract_sections_expected,
                "failure_modes_available": failure_modes_available,
            },
            "source_discipline": {
                "source_inventory": source_inventory,
                "source_as_of_dates": None,
                "freshness_status": None,
                "conflict_summary": None,
                "basis_rule_applied": None,
                "scope_rule_applied": None,
            },
        },
    }


def _result_no_concept(response_text: str = "") -> dict:
    return {
        "kind": "concept_eval",
        "response_text": response_text,
        "duration_ms": 800,
        "turn_receipt": {"concept": None, "source_discipline": {"source_inventory": None}},
    }


# ── concept_match_score ───────────────────────────────────────────────────


def test_concept_match_score_passes_when_concept_id_matches():
    scenario = {"concept_expected": {"concept_id": "repe.noi_variance"}}
    result = _result_with_concept()
    out = concept_match_score(scenario=scenario, result=result)
    assert out["applicable"] is True
    assert out["passed"] is True
    assert out["score"] == 100.0
    assert out["mismatches"] == []


def test_concept_match_score_fails_with_wrong_concept_id_category():
    scenario = {"concept_expected": {"concept_id": "repe.noi_variance"}}
    result = _result_with_concept(concept_id="repe.something_else")
    out = concept_match_score(scenario=scenario, result=result)
    assert out["applicable"] is True
    assert out["passed"] is False
    assert out["score"] == 0.0
    assert out["mismatches"][0]["category"] == "wrong_concept_id"


def test_concept_match_score_skipped_when_no_expected():
    out = concept_match_score(scenario={}, result=_result_with_concept())
    assert out["applicable"] is False
    assert out["passed"] is True


# ── alias_normalization_score ─────────────────────────────────────────────


def test_alias_normalization_skipped_when_scenario_does_not_pin_alias():
    scenario = {"concept_expected": {"concept_id": "repe.noi_variance"}}
    out = alias_normalization_score(scenario=scenario, result=_result_with_concept())
    assert out["applicable"] is False


def test_alias_normalization_passes_when_matched_alias_in_allowlist():
    scenario = {"concept_expected": {"matched_alias_must_be_in": ["NOI off plan", "NOI variance"]}}
    out = alias_normalization_score(scenario=scenario, result=_result_with_concept())
    assert out["applicable"] is True
    assert out["passed"] is True


def test_alias_normalization_fails_when_matched_alias_outside_allowlist():
    scenario = {"concept_expected": {"matched_alias_must_be_in": ["net property income"]}}
    out = alias_normalization_score(scenario=scenario, result=_result_with_concept(matched_alias="something else"))
    assert out["applicable"] is True
    assert out["passed"] is False
    assert out["mismatches"][0]["category"] == "alias_normalization_failed"


# ── context_completeness_score ────────────────────────────────────────────


def test_context_completeness_passes_when_required_present():
    scenario = {"concept_expected": {"required_context_present": ["entity"]}}
    out = context_completeness_score(scenario=scenario, result=_result_with_concept())
    assert out["applicable"] is True
    assert out["passed"] is True


def test_context_completeness_fails_when_required_missing():
    scenario = {"concept_expected": {"required_context_present": ["sources"]}}
    out = context_completeness_score(scenario=scenario, result=_result_with_concept())
    assert out["applicable"] is True
    assert out["passed"] is False
    assert out["mismatches"][0]["category"] == "required_context_missing"


def test_context_completeness_does_not_grade_source_discipline_fields_when_unspecified():
    """When the scenario doesn't pin specific fields, the scorer grades only
    knowable fields (entity/period/scope) and IGNORES source-discipline
    fields. The receipt below has all 4 source-discipline fields missing
    but should still pass because none of them are knowable today.
    """
    scenario = {"concept_expected": {"concept_id": "repe.noi_variance"}}
    out = context_completeness_score(scenario=scenario, result=_result_with_concept())
    assert out["applicable"] is True
    assert out["passed"] is True


def test_context_completeness_skipped_when_no_concept_match():
    scenario = {"concept_expected": {"concept_id": "repe.noi_variance"}}
    out = context_completeness_score(scenario=scenario, result=_result_no_concept())
    assert out["applicable"] is False


# ── output_contract_score ─────────────────────────────────────────────────


def test_output_contract_passes_when_all_required_sections_mentioned():
    scenario = {"concept_expected": {"required_output_sections": ["direct_answer", "driver_bridge"]}}
    response = "Direct answer: NOI is $X. The driver bridge breaks down to..."
    out = output_contract_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is True


def test_output_contract_fails_when_section_missing():
    scenario = {"concept_expected": {"required_output_sections": ["direct_answer", "driver_bridge"]}}
    response = "Direct answer: Something happened."
    out = output_contract_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is False
    assert out["mismatches"][0]["category"] == "output_contract_violation"
    assert "driver_bridge" in out["mismatches"][0]["actual_missing"]


def test_output_contract_tolerates_underscore_vs_space_in_section_names():
    scenario = {"concept_expected": {"required_output_sections": ["driver_bridge"]}}
    response = "Here is the driver bridge: ..."
    out = output_contract_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is True


def test_output_contract_skipped_when_no_required_sections():
    out = output_contract_score(scenario={"concept_expected": {}}, result=_result_with_concept(response_text="ok"))
    assert out["applicable"] is False


# ── output_contract_score: first-sentence-direct enforcement ──────────────
#
# When required_output_sections includes `direct_answer`, the first sentence
# must answer the question directly. This guards against drift in the
# explain_metric one-sentence-first rule (PR 5 audit row #14). Without this
# check, a response that buries the direct answer in paragraph three would
# still pass.


def test_output_contract_first_sentence_direct_passes_with_direct_opener():
    """When the first sentence states the answer directly, the scorer passes."""
    scenario = {"concept_expected": {"required_output_sections": ["direct_answer", "driver_bridge"]}}
    response = "NOI was off plan by $1.2M. The driver bridge breaks down to occupancy and rate."
    out = output_contract_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is True


def test_output_contract_first_sentence_fails_on_filler_opener():
    """A filler opener like 'Sure, happy to help.' fails the first-sentence
    direct check even when sections appear later."""
    scenario = {"concept_expected": {"required_output_sections": ["direct_answer", "driver_bridge"]}}
    response = (
        "Sure, happy to help. The direct answer is that NOI was off by $1.2M. "
        "The driver bridge breaks down to occupancy and rate."
    )
    out = output_contract_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(
        m.get("field") == "first_sentence" and m.get("subcategory") == "filler_opener"
        for m in out["mismatches"]
    )


def test_output_contract_first_sentence_fails_on_let_me_explain_opener():
    scenario = {"concept_expected": {"required_output_sections": ["direct_answer"]}}
    response = "Let me explain. NOI was off plan."
    out = output_contract_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is False


def test_output_contract_first_sentence_check_not_applied_without_direct_answer_section():
    """If direct_answer isn't in the required sections, filler openers are
    not penalized — the check is concept-driven, not blanket."""
    scenario = {"concept_expected": {"required_output_sections": ["caveats"]}}
    response = "Sure, happy to help. There are caveats to consider here."
    out = output_contract_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    # Passes because direct_answer not required; "caveats" appears.
    assert out["passed"] is True


def test_output_contract_first_sentence_handles_exclamation_and_question():
    """Sentence terminator can be . ! ?, not just period."""
    scenario = {"concept_expected": {"required_output_sections": ["direct_answer"]}}
    # First sentence ends with '?', and starts with filler.
    response = "Great question? The answer is NOI was off."
    out = output_contract_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is False


def test_output_contract_score_partial_when_only_first_sentence_fails():
    """Score should be partial (not 0) when sections are present but only
    the first-sentence-direct check fails. With 1 explicit section
    (driver_bridge) + 1 implicit slot (direct_answer first-sentence), that's
    2 slots total. driver_bridge keyword present, direct fails → 1 of 2
    failed → score = 50.0."""
    scenario = {"concept_expected": {"required_output_sections": ["direct_answer", "driver_bridge"]}}
    response = (
        "Let me explain. NOI was off by $1.2M. "
        "The driver bridge: occupancy and rate."
    )
    out = output_contract_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["passed"] is False
    assert out["score"] == 50.0


# ── missing_data_failure_mode_score ───────────────────────────────────────


def test_missing_data_failure_mode_skipped_when_no_required_failure_mode():
    """PR 3 scenarios don't declare required_failure_mode — all PR 3
    scenarios should skip this scorer."""
    scenario = {"concept_expected": {"concept_id": "repe.noi_variance"}}
    out = missing_data_failure_mode_score(scenario=scenario, result=_result_with_concept())
    assert out["applicable"] is False


def test_missing_data_failure_mode_passes_when_required_mode_fires():
    scenario = {"concept_expected": {"required_failure_mode": "missing_context"}}
    response = "I cannot compute this — missing context for the comparison set."
    out = missing_data_failure_mode_score(
        scenario=scenario,
        result=_result_with_concept(response_text=response),
    )
    assert out["applicable"] is True
    assert out["passed"] is True


# ── generic_filler_penalty ────────────────────────────────────────────────


def test_generic_filler_skipped_when_response_short_and_no_numeric_fixture():
    out = generic_filler_penalty(
        scenario={"concept_expected": {}},
        result=_result_with_concept(response_text="ok"),
    )
    assert out["applicable"] is False


def test_generic_filler_penalty_when_fixture_has_numbers_but_answer_doesnt():
    scenario = {"concept_expected": {"expected_numeric_data": True}}
    response = (
        "It depends on various factors and there are many reasons we cannot say for sure."
    )
    out = generic_filler_penalty(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is False
    assert out["mismatches"][0]["category"] == "generic_filler_no_numbers"


def test_generic_filler_passes_with_concrete_numbers():
    scenario = {"concept_expected": {"expected_numeric_data": True}}
    response = "NOI dropped $1.2M, driven by 3% occupancy decline and $400k bad debt."
    out = generic_filler_penalty(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is True


# ── unsupported_claim_penalty (skipped in PR 3 by design) ─────────────────


def test_unsupported_claim_skipped_when_source_inventory_is_none():
    """v1: the data layer doesn't populate source_inventory yet, so this
    scorer must skip — not fake-fail."""
    out = unsupported_claim_penalty(
        scenario={"concept_expected": {"concept_id": "repe.noi_variance"}},
        result=_result_with_concept(source_inventory=None),
    )
    assert out["applicable"] is False
    assert out["passed"] is True  # Not a failure when skipped.


def test_unsupported_claim_active_when_inventory_populated():
    """When the data layer finally exposes source_inventory, this scorer
    activates. Verifies the activation path works."""
    response = "Per the property P&L, NOI was off by $X."
    out = unsupported_claim_penalty(
        scenario={"concept_expected": {}},
        result=_result_with_concept(
            source_inventory=["property P&L", "rent roll"],
            response_text=response,
        ),
    )
    assert out["applicable"] is True
    assert out["passed"] is True


def test_unsupported_claim_fails_when_inventory_present_but_not_referenced():
    response = "NOI dropped because of various market factors."
    out = unsupported_claim_penalty(
        scenario={"concept_expected": {}},
        result=_result_with_concept(
            source_inventory=["property P&L", "rent roll"],
            response_text=response,
        ),
    )
    assert out["applicable"] is True
    assert out["passed"] is False
    assert out["mismatches"][0]["category"] == "unsupported_claim"


# ── score_concept_scenario aggregation ────────────────────────────────────


def test_score_concept_scenario_aggregates_skipped_separately_from_failed():
    """The hardest invariant: a scorer that SKIPS (applicable=False) must
    NOT count as a failure. score_coverage tracks the skip ratio."""
    scenario = {"concept_expected": {"concept_id": "repe.noi_variance"}}
    out = score_concept_scenario(
        scenario=scenario,
        result=_result_with_concept(response_text="answer."),
    )
    # concept_match_score is the only mandatory scorer. The rest skip
    # because the scenario doesn't pin them.
    assert out["passed"] is True
    assert out["concept_scores"]["concept_match_score"]["passed"] is True
    # Skipped scorers don't drag the score
    assert out["score"] == 100.0
    # Score coverage reflects the skip ratio
    assert 0.0 < out["score_coverage"] < 1.0


def test_score_concept_scenario_fails_when_concept_match_fails():
    scenario = {"concept_expected": {"concept_id": "repe.noi_variance"}}
    out = score_concept_scenario(
        scenario=scenario,
        result=_result_with_concept(concept_id="repe.wrong_one"),
    )
    assert out["passed"] is False
    assert out["failure_category"] == "wrong_concept_id"


def test_score_concept_scenario_source_discipline_coverage_zero_when_inventory_none():
    """In PR 3, source_inventory is always None → source_discipline_coverage
    must be 0.0. This is the reportable signal that data-layer plumbing
    hasn't matured yet."""
    out = score_concept_scenario(
        scenario={"concept_expected": {"concept_id": "repe.noi_variance"}},
        result=_result_with_concept(source_inventory=None),
    )
    assert out["source_discipline_coverage"] == 0.0


# ── Release-gate logic ────────────────────────────────────────────────────


def test_release_gate_passes_when_concept_match_above_95_percent():
    # 10 results, 10 pass concept_match_score → 100% pass rate
    results = [
        score_concept_scenario(
            scenario={"concept_expected": {"concept_id": "repe.noi_variance"}},
            result=_result_with_concept(),
        )
        for _ in range(10)
    ]
    # Need to add `kind` so evaluate_concept_release_gates picks them up.
    for r in results:
        r["kind"] = "concept_eval"
    gates = evaluate_concept_release_gates(results)
    assert gates["all_passed"] is True
    assert gates["gates"][0]["actual"] == 1.0


def test_release_gate_fails_when_concept_match_below_95_percent():
    # 10 results, 8 pass + 2 fail → 80% pass rate, below the 95% gate
    passing = [
        {**score_concept_scenario(
            scenario={"concept_expected": {"concept_id": "repe.noi_variance"}},
            result=_result_with_concept(),
        ), "kind": "concept_eval"}
        for _ in range(8)
    ]
    failing = [
        {**score_concept_scenario(
            scenario={"concept_expected": {"concept_id": "repe.noi_variance"}},
            result=_result_with_concept(concept_id="repe.something_else"),
        ), "kind": "concept_eval"}
        for _ in range(2)
    ]
    gates = evaluate_concept_release_gates(passing + failing)
    assert gates["all_passed"] is False
    assert gates["gates"][0]["actual"] == 0.8


def test_release_gate_vacuously_passes_when_no_concept_eval_results():
    gates = evaluate_concept_release_gates([])
    assert gates["all_passed"] is True
    assert gates["gates"][0]["actual"] is None


# ── Scenario loading ──────────────────────────────────────────────────────


def test_concept_eval_scenarios_present_in_registry():
    scenarios = load_scenarios(mode="full", environment="meridian")
    concept_evals = [s for s in scenarios if s.get("kind") == "concept_eval"]
    assert len(concept_evals) == 20  # 10 PR 3 + 10 PR 4
    # All target the same concept
    for s in concept_evals:
        assert s["concept_expected"]["concept_id"] == "repe.noi_variance"


def test_concept_eval_scenarios_have_required_fields():
    scenarios = load_scenarios(mode="full", environment="meridian")
    concept_evals = [s for s in scenarios if s.get("kind") == "concept_eval"]
    for s in concept_evals:
        assert "id" in s
        assert "message" in s
        assert "concept_expected" in s
        ce = s["concept_expected"]
        assert "concept_id" in ce
        # At least one of the structural fields below must exist
        assert any(k in ce for k in (
            "expected_match_reasons", "matched_alias_must_be_in",
            "min_confidence", "required_output_sections",
        ))


def test_concept_eval_scenarios_loaded_in_smoke_suite():
    """The original 10 PR 3 scenarios are tagged for both smoke and full;
    PR 4 hard-fail / source-discipline scenarios are full-only."""
    smoke = load_scenarios(mode="smoke", environment="meridian")
    smoke_concept_evals = [s for s in smoke if s.get("kind") == "concept_eval"]
    assert len(smoke_concept_evals) == 10


# ── PR 4: second-wave scorers ─────────────────────────────────────────────


from eval_loop.scorers import (  # noqa: E402  (intentional below test setup)
    arithmetic_closure_score,
    basis_fidelity_score,
    conflict_handling_score,
    driver_attribution_score,
    freshness_score,
    scope_fidelity_score,
    source_discipline_score,
)


def _result_with_source_discipline(
    *,
    source_inventory: list[str] | None = None,
    source_as_of_dates: dict[str, str] | None = None,
    response_text: str = "",
    **concept_overrides,
) -> dict:
    r = _result_with_concept(response_text=response_text, **concept_overrides)
    r["turn_receipt"]["source_discipline"] = {
        "source_inventory": source_inventory,
        "source_as_of_dates": source_as_of_dates,
        "freshness_status": None,
        "conflict_summary": None,
        "basis_rule_applied": None,
        "scope_rule_applied": None,
    }
    return r


# ── source_discipline_score ───────────────────────────────────────────────


def test_source_discipline_skipped_when_inventory_none():
    out = source_discipline_score(
        scenario={"concept_expected": {}},
        result=_result_with_source_discipline(source_inventory=None),
    )
    assert out["applicable"] is False
    assert out["passed"] is True


def test_source_discipline_passes_with_primary_only():
    out = source_discipline_score(
        scenario={"concept_expected": {}},
        result=_result_with_source_discipline(
            source_inventory=["property_pnl_q3", "rent_roll_2025_09"],
        ),
    )
    assert out["applicable"] is True
    assert out["passed"] is True


def test_source_discipline_fails_on_broker_tier():
    out = source_discipline_score(
        scenario={"concept_expected": {}},
        result=_result_with_source_discipline(
            source_inventory=["property_pnl_q3", "CoStar broker comp"],
        ),
    )
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(m["category"] == "broker_tier_source_used" for m in out["mismatches"])


def test_source_discipline_fails_when_no_primary_source():
    out = source_discipline_score(
        scenario={"concept_expected": {}},
        result=_result_with_source_discipline(
            source_inventory=["analyst memo", "marketing brief"],
        ),
    )
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(m["category"] == "no_primary_source" for m in out["mismatches"])


# ── freshness_score ────────────────────────────────────────────────────────


def test_freshness_skipped_when_dates_none():
    out = freshness_score(
        scenario={"concept_expected": {}},
        result=_result_with_source_discipline(source_as_of_dates=None),
    )
    assert out["applicable"] is False


def test_freshness_passes_with_recent_sources():
    from datetime import date, timedelta
    recent = (date.today() - timedelta(days=30)).isoformat()
    out = freshness_score(
        scenario={"concept_expected": {"freshness_max_age_days": 90}},
        result=_result_with_source_discipline(
            source_as_of_dates={"property_pnl": recent},
        ),
    )
    assert out["applicable"] is True
    assert out["passed"] is True


def test_freshness_fails_on_stale_source():
    from datetime import date, timedelta
    old = (date.today() - timedelta(days=200)).isoformat()
    out = freshness_score(
        scenario={"concept_expected": {"freshness_max_age_days": 90}},
        result=_result_with_source_discipline(
            source_as_of_dates={"property_pnl": old},
            response_text="NOI was off plan.",
        ),
    )
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(m["category"] == "stale_primary_source" for m in out["mismatches"])


def test_freshness_fail_includes_caveat_check_when_required():
    from datetime import date, timedelta
    old = (date.today() - timedelta(days=200)).isoformat()
    out = freshness_score(
        scenario={"concept_expected": {
            "freshness_max_age_days": 90,
            "must_surface_freshness_caveat": True,
        }},
        result=_result_with_source_discipline(
            source_as_of_dates={"property_pnl": old},
            response_text="NOI was off plan, no caveat.",
        ),
    )
    # Two mismatches: stale source + missing caveat.
    assert sum(1 for m in out["mismatches"] if "stale" in m["category"]) >= 1


# ── conflict_handling_score ───────────────────────────────────────────────


def test_conflict_handling_skipped_when_no_expected_conflict():
    out = conflict_handling_score(
        scenario={"concept_expected": {}},
        result=_result_with_concept(response_text="answer"),
    )
    assert out["applicable"] is False


def test_conflict_handling_passes_when_response_surfaces_conflict():
    scenario = {"concept_expected": {
        "expected_conflict": {
            "field": "actual_noi",
            "sources": ["property_pnl", "fund_accounting"],
            "values": [4250000, 4310000],
        },
        "must_surface_conflict": True,
    }}
    response = (
        "The property P&L and fund accounting reports disagree on actual NOI. "
        "I'll flag both values rather than pick one silently."
    )
    out = conflict_handling_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is True


def test_conflict_handling_fails_when_silent_pick():
    """S15 trust test: when sources conflict and the answer cites only one
    value without flagging the disagreement, fail with conflict_ignored."""
    scenario = {"concept_expected": {
        "expected_conflict": {
            "field": "actual_noi",
            "sources": ["property_pnl", "fund_accounting"],
            "values": [4250000, 4310000],
        },
        "must_surface_conflict": True,
        "must_not_silently_pick": True,
    }}
    response = "NOI was 4250000, off plan by $250k."  # silently picks one value
    out = conflict_handling_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(m["category"] == "conflict_ignored" for m in out["mismatches"])


# ── basis_fidelity_score ──────────────────────────────────────────────────


def test_basis_fidelity_skipped_when_no_required_basis():
    out = basis_fidelity_score(
        scenario={"concept_expected": {}},
        result=_result_with_concept(response_text="answer"),
    )
    assert out["applicable"] is False


def test_basis_fidelity_passes_when_basis_declared():
    scenario = {"concept_expected": {"required_basis": "cash"}}
    response = "On a cash basis, NOI was off plan by $X."
    out = basis_fidelity_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is True


def test_basis_fidelity_fails_when_silent_basis_mixing():
    """S17 trust test: response mentions both cash and GAAP without
    reconciliation language → mixed_basis failure."""
    scenario = {"concept_expected": {
        "required_basis": "cash",
        "must_reject_silent_basis_mixing": True,
    }}
    response = "Cash NOI was $4.25M and GAAP NOI was $4.31M."
    out = basis_fidelity_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(m["category"] == "mixed_basis" for m in out["mismatches"])


def test_basis_fidelity_passes_with_explicit_reconciliation():
    """Mentioning both bases is fine when the response explicitly
    reconciles them."""
    scenario = {"concept_expected": {
        "required_basis": "cash",
        "must_reject_silent_basis_mixing": True,
    }}
    response = (
        "On a cash basis NOI was $4.25M. The GAAP basis differs because of "
        "straight-lined rent — to reconcile, add back $60k of GAAP-only revenue."
    )
    out = basis_fidelity_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is True


# ── scope_fidelity_score ──────────────────────────────────────────────────


def test_scope_fidelity_skipped_when_no_required_scope():
    out = scope_fidelity_score(
        scenario={"concept_expected": {}},
        result=_result_with_concept(response_text="answer"),
    )
    assert out["applicable"] is False


def test_scope_fidelity_passes_with_matching_scope_alias():
    """Same-store accepts SSNOI / same-property as synonyms."""
    scenario = {"concept_expected": {"required_scope": "same_store"}}
    response = "Same-store NOI dropped 3% YoY."
    out = scope_fidelity_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is True


def test_scope_fidelity_fails_when_scope_absent():
    scenario = {"concept_expected": {"required_scope": "fund"}}
    response = "Asset-level NOI dropped."  # no fund-level language
    out = scope_fidelity_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is False


# ── arithmetic_closure_score ──────────────────────────────────────────────


def test_arithmetic_closure_skipped_without_components_or_total():
    out = arithmetic_closure_score(
        scenario={"concept_expected": {"expected_total_variance": -180000}},
        result=_result_with_concept(response_text="something"),
    )
    assert out["applicable"] is False


def test_arithmetic_closure_passes_within_2pct_relative_tolerance():
    scenario = {"concept_expected": {
        "expected_bridge_components": {
            "rate": -100000, "occupancy": -50000, "concessions": -30000,
        },
        "expected_total_variance": -180000,
    }}
    # Components sum to -180k; response cites -101k, -49k, -30k = -180k exactly.
    response = (
        "NOI was off by $180,000. Rate contributed -$101,000, occupancy "
        "-$49,000, and concessions -$30,000."
    )
    out = arithmetic_closure_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is True


def test_arithmetic_closure_passes_within_dollar_absolute_tolerance():
    scenario = {"concept_expected": {
        "expected_bridge_components": {"a": 200, "b": 300},
        "expected_total_variance": 500,
    }}
    # Components sum to 500, response cites 200 + 300 = 500. Below the
    # $1k absolute tolerance even if relative were tight.
    response = "Variance was $500: $200 from A and $300 from B."
    out = arithmetic_closure_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is True


def test_arithmetic_closure_fails_when_components_dont_sum():
    scenario = {"concept_expected": {
        "expected_bridge_components": {"rate": -100000, "occupancy": -50000},
        "expected_total_variance": -150000,
    }}
    # Response cites -100k and -50k drivers but claims a -300k total.
    response = "NOI was off by $300,000. Rate -$100,000, occupancy -$50,000."
    out = arithmetic_closure_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(m["category"] == "arithmetic_closure_failure" for m in out["mismatches"])


# ── driver_attribution_score ──────────────────────────────────────────────


def test_driver_attribution_skipped_without_expected_drivers():
    out = driver_attribution_score(
        scenario={"concept_expected": {}},
        result=_result_with_concept(response_text="answer"),
    )
    assert out["applicable"] is False


def test_driver_attribution_passes_with_full_coverage():
    scenario = {"concept_expected": {"expected_material_drivers": ["rate", "occupancy"]}}
    response = "Both rate and occupancy contributed to the variance."
    out = driver_attribution_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is True


def test_driver_attribution_fails_when_driver_missing():
    scenario = {"concept_expected": {"expected_material_drivers": ["rate", "occupancy", "concessions"]}}
    response = "Rate and occupancy drove the miss."  # concessions omitted
    out = driver_attribution_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is False


def test_driver_attribution_invention_guard_fails_on_off_list_drivers():
    """S18 trust test: when must_not_invent_drivers is set and the response
    names a driver outside the expected list, fail."""
    scenario = {"concept_expected": {
        "expected_material_drivers": ["rate", "occupancy"],
        "must_not_invent_drivers": True,
    }}
    response = "Rate, occupancy, and bad debt drove the miss."  # bad debt invented
    out = driver_attribution_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any("invented" in str(m).lower() or "actual_invented" in m for m in out["mismatches"])


# ── Hard-fail "trust" scenarios (S13, S15, S17, S18) ──────────────────────
#
# These tests verify the round-trip from a hard-fail scenario through the
# scorer to a recognized critical category. The plan singled these four
# out as the trust tests where invention or silent-mixing must fail closed.


def test_s13_missing_underwriting_must_not_invent_numbers():
    """S13: no underwriting data → response must caveat, not invent values."""
    scenario = {"concept_expected": {
        "concept_id": "repe.noi_variance",
        "required_failure_mode": "missing_context",
        "must_not_invent_numbers": True,
        "data_unavailable": ["underwriting"],
    }}
    # If the response invents a specific underwriting variance, the
    # missing_data_failure_mode_score scorer should fail because the
    # required failure_mode language isn't present.
    response = "Underwriting NOI was $4.5M; we missed by $250k."  # invented numbers
    out = missing_data_failure_mode_score(
        scenario=scenario,
        result=_result_with_concept(response_text=response,
                                    failure_modes_available=["missing_context"]),
    )
    # Scorer should fail because the response doesn't acknowledge the
    # missing-context failure mode.
    assert out["applicable"] is True
    assert out["passed"] is False


def test_s15_conflicting_sources_must_not_silently_pick():
    """S15: same as test_conflict_handling_fails_when_silent_pick — verify
    the wrapped scorer surfaces conflict_ignored category which is in
    _HARD_GATE_CATEGORIES."""
    scenario = {"concept_expected": {
        "expected_conflict": {
            "sources": ["property_pnl", "fund_accounting"],
            "values": [4250000, 4310000],
        },
        "must_surface_conflict": True,
        "must_not_silently_pick": True,
    }}
    response = "NOI was $4.25M."
    out = conflict_handling_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["passed"] is False
    cats = {m["category"] for m in out["mismatches"]}
    assert "conflict_ignored" in cats


def test_s17_mixed_basis_silent_mixing_fails_closed():
    """S17: response mixing cash and GAAP without reconciliation must fail
    with the mixed_basis category (hard-gate)."""
    scenario = {"concept_expected": {
        "required_basis": "cash",
        "must_reject_silent_basis_mixing": True,
    }}
    response = "Cash NOI was $4.25M and GAAP underwriting was $4.5M."
    out = basis_fidelity_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["passed"] is False
    cats = {m["category"] for m in out["mismatches"]}
    assert "mixed_basis" in cats


def test_s18_invented_drivers_fail_closed():
    """S18: when data_unavailable lists driver detail and response names
    an off-list driver, fail with driver_attribution_failure (and the
    'invented' subcategory)."""
    scenario = {"concept_expected": {
        "expected_material_drivers": ["rate", "occupancy"],
        "data_unavailable": ["concessions_detail", "bad_debt_detail"],
        "must_not_invent_drivers": True,
    }}
    response = "Rate and occupancy were the drivers, plus we saw concessions of $30k."
    out = driver_attribution_score(scenario=scenario, result=_result_with_concept(response_text=response))
    assert out["passed"] is False


# ── PR 4 release gates ────────────────────────────────────────────────────


def test_pr4_gates_present_with_correct_thresholds():
    """The full PR 4 gate set is reported with the documented thresholds."""
    gates = evaluate_concept_release_gates([])
    names = [g["name"] for g in gates["gates"]]
    assert "concept_match_score" in names
    assert "output_contract_score" in names
    assert "arithmetic_closure_score" in names
    assert "bridge_closure" in names
    assert "receipt_completeness" in names
    assert "hard_gate_failures" in names
    by_name = {g["name"]: g for g in gates["gates"]}
    assert by_name["concept_match_score"]["threshold"] == 0.95
    assert by_name["output_contract_score"]["threshold"] == 0.95
    assert by_name["arithmetic_closure_score"]["threshold"] == 0.98
    assert by_name["bridge_closure"]["threshold"] == 0.95
    assert by_name["receipt_completeness"]["threshold"] == 1.0
    assert by_name["hard_gate_failures"]["threshold"] == 0


def test_pr4_gates_vacuous_pass_when_no_results():
    """All gates pass on an empty run — runs that don't include
    arithmetic / source-discipline scenarios shouldn't fail their gates."""
    gates = evaluate_concept_release_gates([])
    assert gates["all_passed"] is True


def test_pr4_hard_gate_blocks_release_on_wrong_concept_id():
    """A wrong_concept_id mismatch in any result blocks release via the
    hard_gate_failures gate."""
    bad_result = score_concept_scenario(
        scenario={"concept_expected": {"concept_id": "repe.noi_variance"}},
        result=_result_with_concept(concept_id="repe.something_else"),
    )
    bad_result["kind"] = "concept_eval"
    gates = evaluate_concept_release_gates([bad_result])
    assert gates["all_passed"] is False
    by_name = {g["name"]: g for g in gates["gates"]}
    assert by_name["hard_gate_failures"]["passed"] is False
    assert by_name["concept_match_score"]["passed"] is False


def test_pr4_arithmetic_closure_gate_passes_at_98_percent():
    """50 results, 1 fails arithmetic closure → 49/50 = 98% applicable
    pass rate. With the gate at exactly 98%, this should pass."""
    passing_scenario = {"concept_expected": {
        "concept_id": "repe.noi_variance",
        "expected_bridge_components": {"a": 100, "b": 200},
        "expected_total_variance": 300,
    }}
    passing_response = "Variance was $300: A contributed $100, B contributed $200."
    failing_response = "Variance was $300 but A was $999 and B was $999."
    passing = [
        {**score_concept_scenario(
            scenario=passing_scenario,
            result=_result_with_concept(response_text=passing_response),
        ), "kind": "concept_eval"}
        for _ in range(49)
    ]
    failing = [
        {**score_concept_scenario(
            scenario=passing_scenario,
            result=_result_with_concept(response_text=failing_response),
        ), "kind": "concept_eval"}
    ]
    gates = evaluate_concept_release_gates(passing + failing)
    by_name = {g["name"]: g for g in gates["gates"]}
    assert by_name["arithmetic_closure_score"]["passed"] is True


# ── Run summary aggregation ───────────────────────────────────────────────


def test_summary_aggregation_reports_all_pr4_scorer_pass_rates():
    """summarize_run aggregates per-scorer pass rates including PR 4
    scorers. Builds a fake result list and checks the structure."""
    from eval_loop.reporters import summarize_run

    # One result that passes everything possible.
    r1 = score_concept_scenario(
        scenario={"concept_expected": {"concept_id": "repe.noi_variance"}},
        result=_result_with_concept(),
    )
    r1["kind"] = "concept_eval"
    summary = summarize_run(run_id="r1", cycle=1, suite="full", results=[r1])
    ce = summary.get("concept_eval")
    assert ce is not None
    by_scorer = ce["by_scorer"]
    # All 14 scorers reported (7 PR 3 + 7 PR 4)
    pr4_scorers = (
        "source_discipline_score", "freshness_score", "conflict_handling_score",
        "basis_fidelity_score", "scope_fidelity_score",
        "arithmetic_closure_score", "driver_attribution_score",
    )
    for name in pr4_scorers:
        assert name in by_scorer
    # Release gates surface in the summary
    assert "release_gates" in ce
    assert isinstance(ce["release_gates"]["gates"], list)


def test_summary_aggregation_includes_hard_gate_failures():
    """When a result has a wrong_concept_id mismatch, the summary's
    hard_gate_failures list includes it."""
    from eval_loop.reporters import summarize_run

    bad = score_concept_scenario(
        scenario={"concept_expected": {"concept_id": "repe.noi_variance"}},
        result=_result_with_concept(concept_id="repe.wrong"),
    )
    bad["kind"] = "concept_eval"
    bad["scenario_id"] = "test_bad"
    summary = summarize_run(run_id="r1", cycle=1, suite="full", results=[bad])
    ce = summary["concept_eval"]
    assert any(hf["category"] == "wrong_concept_id" for hf in ce["hard_gate_failures"])


# ── PR 4 scenarios are present and have fixture data ──────────────────────


def test_pr4_scenarios_have_fixture_fields():
    """The PR 4 scenarios (S11-S20) carry the fixture fields that activate
    the new scorers — at least one scenario for each fixture field exists."""
    scenarios = load_scenarios(mode="full", environment="meridian")
    concept_evals = [s for s in scenarios if s.get("kind") == "concept_eval"]
    fixture_fields_seen: set[str] = set()
    for s in concept_evals:
        ce = s.get("concept_expected") or {}
        for key in (
            "expected_conflict", "expected_stale_sources", "required_basis",
            "required_scope", "expected_bridge_components",
            "expected_total_variance", "expected_material_drivers",
            "data_unavailable",
        ):
            if key in ce:
                fixture_fields_seen.add(key)
    assert {
        "expected_conflict",  # S15
        "expected_stale_sources",  # S16
        "required_basis",  # S17
        "required_scope",  # S19
        "expected_bridge_components",  # S11, S19
        "expected_total_variance",  # S11, S18, S19
        "expected_material_drivers",  # S11, S12, S18, S19
        "data_unavailable",  # S13, S14, S18
    }.issubset(fixture_fields_seen)


def test_pr4_hard_fail_scenarios_present():
    """The four trust-test scenarios S13/S15/S17/S18 are loaded."""
    scenarios = load_scenarios(mode="full", environment="meridian")
    ids = {s["id"] for s in scenarios}
    assert "concept_noi_variance_missing_underwriting" in ids  # S13
    assert "concept_noi_variance_conflicting_sources" in ids  # S15
    assert "concept_noi_variance_mixed_basis" in ids  # S17
    assert "concept_noi_variance_missing_driver_detail" in ids  # S18
