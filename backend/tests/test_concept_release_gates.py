"""Unit tests for concept-eval release gates (PR 4).

Tests cover:
  - evaluate_concept_release_gates() threshold enforcement
  - Vacuous (no applicable scenarios) gates always pass
  - Hard-gate failures count correctly
  - Receipt completeness gate
  - _summarize_concept_eval() aggregation (via reporters module)
  - Concept-score fields propagated on runner records (structural check only —
    no live backend call)
"""
from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pytest  # noqa: E402

from eval_loop.scorers import (  # noqa: E402
    ARITHMETIC_CLOSURE_GATE_THRESHOLD,
    BRIDGE_CLOSURE_GATE_THRESHOLD,
    RECEIPT_COMPLETENESS_GATE_THRESHOLD,
    evaluate_concept_release_gates,
)
from eval_loop.reporters import _summarize_concept_eval  # noqa: E402


# ── helpers ────────────────────────────────────────────────────────────────


def _passing_result(
    scenario_id: str = "test_scenario",
    concept_id: str = "repe.noi_variance",
    concept_match_passed: bool = True,
    output_contract_passed: bool = True,
    arithmetic_closure_passed: bool = True,
    arithmetic_closure_applicable: bool = True,
    has_hard_failure: bool = False,
    receipt_completeness: float = 1.0,
) -> dict:
    mismatches = []
    if has_hard_failure:
        mismatches.append({
            "category": "wrong_concept_id",
            "field": "concept_id",
            "scorer": "concept_match_score",
        })
    return {
        "scenario_id": scenario_id,
        "kind": "concept_eval",
        "receipt_completeness": receipt_completeness,
        "mismatches": mismatches,
        "concept_scores": {
            "concept_match_score": {
                "applicable": True,
                "passed": concept_match_passed,
                "score": 100.0 if concept_match_passed else 0.0,
            },
            "output_contract_score": {
                "applicable": True,
                "passed": output_contract_passed,
                "score": 100.0 if output_contract_passed else 0.0,
            },
            "arithmetic_closure_score": {
                "applicable": arithmetic_closure_applicable,
                "passed": arithmetic_closure_passed,
                "score": 100.0 if arithmetic_closure_passed else 0.0,
            },
            "alias_normalization_score": {"applicable": False, "passed": True, "score": 0.0},
            "context_completeness_score": {"applicable": True, "passed": True, "score": 100.0},
            "missing_data_failure_mode_score": {"applicable": False, "passed": True, "score": 0.0},
            "generic_filler_penalty": {"applicable": True, "passed": True, "score": 100.0},
            "unsupported_claim_penalty": {"applicable": False, "passed": True, "score": 0.0},
            "source_discipline_score": {"applicable": False, "passed": True, "score": 0.0},
            "freshness_score": {"applicable": False, "passed": True, "score": 0.0},
            "conflict_handling_score": {"applicable": False, "passed": True, "score": 0.0},
            "basis_fidelity_score": {"applicable": False, "passed": True, "score": 0.0},
            "scope_fidelity_score": {"applicable": False, "passed": True, "score": 0.0},
            "driver_attribution_score": {"applicable": False, "passed": True, "score": 0.0},
        },
        "score_coverage": 0.3,
        "source_discipline_coverage": 0.0,
    }


def _twenty_passing_results() -> list[dict]:
    return [_passing_result(scenario_id=f"scenario_{i}") for i in range(20)]


# ── evaluate_concept_release_gates ─────────────────────────────────────────


def test_all_gates_pass_on_clean_results():
    results = _twenty_passing_results()
    gates = evaluate_concept_release_gates(results)
    assert gates["all_passed"] is True
    for g in gates["gates"]:
        assert g["passed"] is True, f"gate {g['name']} failed unexpectedly"


def test_vacuous_gates_pass_when_no_concept_results():
    gates = evaluate_concept_release_gates([])
    assert gates["all_passed"] is True
    assert gates["concept_eval_total"] == 0


def test_concept_match_gate_fails_below_threshold():
    # 18 pass + 2 fail = 90% < 95% threshold
    results = _twenty_passing_results()
    for r in results[:2]:
        r["concept_scores"]["concept_match_score"]["passed"] = False
        r["mismatches"].append({
            "category": "wrong_concept_id",
            "field": "concept_id",
            "scorer": "concept_match_score",
        })
    gates = evaluate_concept_release_gates(results)
    cms_gate = next(g for g in gates["gates"] if g["name"] == "concept_match_score")
    assert cms_gate["passed"] is False
    assert cms_gate["actual"] == pytest.approx(0.9, abs=0.01)
    assert gates["all_passed"] is False


def test_concept_match_gate_passes_at_threshold():
    # Exactly 95%: 19/20 passing
    results = _twenty_passing_results()
    results[0]["concept_scores"]["concept_match_score"]["passed"] = False
    gates = evaluate_concept_release_gates(results)
    cms_gate = next(g for g in gates["gates"] if g["name"] == "concept_match_score")
    # 19/20 = 0.95 — exact boundary, should pass (>= threshold)
    assert cms_gate["passed"] is True


def test_output_contract_gate_fails_below_threshold():
    results = _twenty_passing_results()
    for r in results[:2]:
        r["concept_scores"]["output_contract_score"]["passed"] = False
    gates = evaluate_concept_release_gates(results)
    oc_gate = next(g for g in gates["gates"] if g["name"] == "output_contract_score")
    assert oc_gate["passed"] is False
    assert gates["all_passed"] is False


def test_arithmetic_closure_vacuous_when_not_applicable():
    results = _twenty_passing_results()
    for r in results:
        r["concept_scores"]["arithmetic_closure_score"]["applicable"] = False
    gates = evaluate_concept_release_gates(results)
    ac_gate = next(g for g in gates["gates"] if g["name"] == "arithmetic_closure_score")
    # Vacuous — no applicable scenarios
    assert ac_gate["passed"] is True
    assert ac_gate["actual"] is None
    assert ac_gate["applicable_count"] == 0


def test_arithmetic_closure_gate_threshold():
    # Need >= 98% to pass. 19/20 = 95% — should FAIL.
    results = _twenty_passing_results()
    results[0]["concept_scores"]["arithmetic_closure_score"]["passed"] = False
    gates = evaluate_concept_release_gates(results)
    ac_gate = next(g for g in gates["gates"] if g["name"] == "arithmetic_closure_score")
    assert ac_gate["threshold"] == ARITHMETIC_CLOSURE_GATE_THRESHOLD
    assert ac_gate["passed"] is False


def test_bridge_closure_gate_threshold_looser():
    # bridge_closure reads the same scorer at 95%. 19/20 = 95% — should PASS.
    results = _twenty_passing_results()
    results[0]["concept_scores"]["arithmetic_closure_score"]["passed"] = False
    gates = evaluate_concept_release_gates(results)
    bc_gate = next(g for g in gates["gates"] if g["name"] == "bridge_closure")
    assert bc_gate["threshold"] == BRIDGE_CLOSURE_GATE_THRESHOLD
    assert bc_gate["passed"] is True


def test_hard_gate_failures_blocks_promotion():
    results = _twenty_passing_results()
    results[0]["mismatches"].append({
        "category": "wrong_concept_id",
        "field": "concept_id",
        "scorer": "concept_match_score",
    })
    gates = evaluate_concept_release_gates(results)
    hg = next(g for g in gates["gates"] if g["name"] == "hard_gate_failures")
    assert hg["passed"] is False
    assert hg["actual"] >= 1
    assert gates["all_passed"] is False


def test_hard_gate_passes_when_zero_failures():
    results = _twenty_passing_results()
    gates = evaluate_concept_release_gates(results)
    hg = next(g for g in gates["gates"] if g["name"] == "hard_gate_failures")
    assert hg["passed"] is True
    assert hg["actual"] == 0


def test_receipt_completeness_gate_fails_below_100():
    results = _twenty_passing_results()
    # Make one matched scenario have incomplete receipt
    results[0]["receipt_completeness"] = 0.5
    gates = evaluate_concept_release_gates(results)
    rc_gate = next(g for g in gates["gates"] if g["name"] == "receipt_completeness")
    assert rc_gate["threshold"] == RECEIPT_COMPLETENESS_GATE_THRESHOLD
    assert rc_gate["passed"] is False
    assert gates["all_passed"] is False


def test_receipt_completeness_vacuous_when_no_concept_matches():
    # All concept_match_score.passed = False → rc_applicable = 0 → vacuous
    results = _twenty_passing_results()
    for r in results:
        r["concept_scores"]["concept_match_score"]["passed"] = False
    gates = evaluate_concept_release_gates(results)
    rc_gate = next(g for g in gates["gates"] if g["name"] == "receipt_completeness")
    assert rc_gate["passed"] is True
    assert rc_gate["applicable_count"] == 0


def test_gates_list_has_expected_names():
    results = _twenty_passing_results()
    gates = evaluate_concept_release_gates(results)
    names = {g["name"] for g in gates["gates"]}
    assert "concept_match_score" in names
    assert "output_contract_score" in names
    assert "arithmetic_closure_score" in names
    assert "bridge_closure" in names
    assert "receipt_completeness" in names
    assert "hard_gate_failures" in names


# ── _summarize_concept_eval (reporters integration) ────────────────────────


def test_summarize_returns_none_when_no_concept_results():
    results = [{"score": 100.0, "passed": True, "kind": "assistant_turn"}]
    summary = _summarize_concept_eval(results)
    assert summary is None


def test_summarize_aggregates_by_scorer():
    results = _twenty_passing_results()
    summary = _summarize_concept_eval(results)
    assert summary is not None
    assert summary["scenario_count"] == 20
    by_scorer = summary["by_scorer"]
    cms = by_scorer["concept_match_score"]
    assert cms["applicable"] == 20
    assert cms["passed"] == 20
    assert cms["pass_rate"] == 1.0


def test_summarize_includes_release_gates():
    results = _twenty_passing_results()
    summary = _summarize_concept_eval(results)
    assert "release_gates" in summary
    assert summary["release_gates"]["all_passed"] is True


def test_summarize_score_coverage_avg():
    results = _twenty_passing_results()
    # All results have score_coverage=0.3
    summary = _summarize_concept_eval(results)
    assert summary["score_coverage_avg"] == pytest.approx(0.3, abs=0.01)


def test_summarize_source_discipline_coverage_zero():
    results = _twenty_passing_results()
    summary = _summarize_concept_eval(results)
    assert summary["source_discipline_coverage_avg"] == 0.0


def test_summarize_hard_gate_failures_collected():
    results = _twenty_passing_results()
    results[0]["mismatches"].append({
        "category": "hallucinated_number",
        "field": "response_text",
        "scorer": "generic_filler_penalty",
    })
    summary = _summarize_concept_eval(results)
    assert len(summary["hard_gate_failures"]) == 1
    hf = summary["hard_gate_failures"][0]
    assert hf["category"] == "hallucinated_number"
    assert hf["scenario_id"] == "scenario_0"


# ── record propagation (structural) ────────────────────────────────────────


def test_concept_score_fields_in_passing_result():
    r = _passing_result()
    assert "concept_scores" in r
    assert "score_coverage" in r
    assert "source_discipline_coverage" in r
    # These are the fields the runner record must carry for summarize to work
    assert isinstance(r["concept_scores"], dict)
    assert isinstance(r["score_coverage"], float)
    assert isinstance(r["source_discipline_coverage"], float)
