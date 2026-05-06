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
    assert len(concept_evals) == 10
    # All 10 target the same concept
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
    """All 10 PR 3 scenarios are tagged for both smoke and full."""
    smoke = load_scenarios(mode="smoke", environment="meridian")
    smoke_concept_evals = [s for s in smoke if s.get("kind") == "concept_eval"]
    assert len(smoke_concept_evals) == 10
