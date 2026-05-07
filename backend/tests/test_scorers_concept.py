"""Unit tests for concept-aware scorers (PR 3).

These tests fabricate scenario dicts and result dicts — no live backend call.
They verify:
  - Each scorer fires correctly on a positive fixture.
  - Each scorer skips (applicable=False) when required inputs are absent.
  - Hard-fail categories register correctly in the mismatch list.
  - score_concept_scenario aggregates correctly: coverage, passed, mismatches.
"""
from __future__ import annotations

import sys
from pathlib import Path

# ── ensure eval_loop is importable without a full install ──────────────────
_REPO_ROOT = Path(__file__).parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pytest

from eval_loop.scorers import (
    alias_normalization_score,
    arithmetic_closure_score,
    basis_fidelity_score,
    concept_match_score,
    conflict_handling_score,
    context_completeness_score,
    driver_attribution_score,
    freshness_score,
    generic_filler_penalty,
    missing_data_failure_mode_score,
    output_contract_score,
    scope_fidelity_score,
    score_concept_scenario,
    source_discipline_score,
    unsupported_claim_penalty,
)


# ── fixture helpers ────────────────────────────────────────────────────────


def _scenario(concept_expected: dict | None = None, **kwargs) -> dict:
    s: dict = {"id": "test_scenario", "kind": "concept_eval", "environment": "meridian"}
    if concept_expected is not None:
        s["concept_expected"] = concept_expected
    s.update(kwargs)
    return s


def _result(
    concept_id: str | None = "repe.noi_variance",
    matched_alias: str | None = "NOI variance",
    match_reason: str | None = "substring_alias",
    behavior_tier: str | None = "proceed",
    required_context_present: list[str] | None = None,
    required_context_missing: list[str] | None = None,
    failure_modes_available: list[str] | None = None,
    source_inventory: list[str] | None = None,
    source_as_of_dates: dict | None = None,
    response_text: str = "NOI declined $420k vs budget driven by lower occupancy and concessions.",
    source_discipline_extra: dict | None = None,
) -> dict:
    concept: dict = {}
    if concept_id is not None:
        concept["concept_id"] = concept_id
    concept["matched_alias"] = matched_alias
    concept["match_reason"] = match_reason
    concept["behavior_tier"] = behavior_tier
    concept["required_context_present"] = required_context_present or ["entity"]
    concept["required_context_missing"] = required_context_missing or ["comparison_set", "basis"]
    concept["failure_modes_available"] = failure_modes_available or ["missing_context", "mixed_basis"]

    sd: dict = {}
    if source_inventory is not None:
        sd["source_inventory"] = source_inventory
    if source_as_of_dates is not None:
        sd["source_as_of_dates"] = source_as_of_dates
    if source_discipline_extra:
        sd.update(source_discipline_extra)

    return {
        "response_text": response_text,
        "turn_receipt": {
            "concept": concept,
            "source_discipline": sd,
        },
    }


# ── concept_match_score ────────────────────────────────────────────────────


def test_concept_match_score_passes_on_correct_id():
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance"})
    r = _result(concept_id="repe.noi_variance")
    out = concept_match_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True
    assert out["score"] == 100.0


def test_concept_match_score_fails_wrong_id():
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance"})
    r = _result(concept_id="repe.other_metric")
    out = concept_match_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False
    assert out["mismatches"][0]["category"] == "wrong_concept_id"


def test_concept_match_score_skips_when_no_expected_id():
    s = _scenario(concept_expected={})
    r = _result()
    out = concept_match_score(scenario=s, result=r)
    assert out["applicable"] is False
    assert out["passed"] is True


# ── alias_normalization_score ──────────────────────────────────────────────


def test_alias_normalization_passes_when_in_allowlist():
    s = _scenario(concept_expected={"matched_alias_must_be_in": ["net property income", "NOI variance"]})
    r = _result(matched_alias="noi variance")
    out = alias_normalization_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_alias_normalization_fails_not_in_allowlist():
    s = _scenario(concept_expected={"matched_alias_must_be_in": ["net property income"]})
    r = _result(matched_alias="revenue miss")
    out = alias_normalization_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False


def test_alias_normalization_skips_when_no_allowlist():
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance"})
    r = _result()
    out = alias_normalization_score(scenario=s, result=r)
    assert out["applicable"] is False


# ── context_completeness_score ─────────────────────────────────────────────


def test_context_completeness_passes_when_required_fields_present():
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance",
                                    "required_context_present": ["entity"]})
    r = _result(required_context_present=["entity", "period"])
    out = context_completeness_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_context_completeness_fails_when_required_field_missing():
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance",
                                    "required_context_present": ["entity", "period"]})
    r = _result(required_context_present=["entity"], required_context_missing=["period"])
    out = context_completeness_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False


def test_context_completeness_skips_when_no_concept_receipt():
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance"})
    r = {"response_text": "answer", "turn_receipt": {}}
    out = context_completeness_score(scenario=s, result=r)
    assert out["applicable"] is False


def test_context_completeness_knowable_gate_fails_on_missing_entity():
    # Scenario doesn't pin specific fields — falls through to knowable gate.
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance"})
    r = _result(
        required_context_present=[],
        required_context_missing=["entity", "comparison_set"],  # entity is knowable
    )
    out = context_completeness_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False


def test_context_completeness_knowable_gate_ignores_source_discipline_fields():
    # comparison_set and basis are source-discipline fields — not graded at knowable gate.
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance"})
    r = _result(
        required_context_present=["entity", "period"],
        required_context_missing=["comparison_set", "basis"],
    )
    out = context_completeness_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True  # no knowable fields missing


# ── output_contract_score ──────────────────────────────────────────────────


def test_output_contract_score_passes_sections_found():
    s = _scenario(concept_expected={
        "concept_id": "repe.noi_variance",
        "required_output_sections": ["direct_answer", "driver_bridge"],
    })
    r = _result(response_text=(
        "NOI declined $420k vs budget, primarily due to lower occupancy. "
        "Driver bridge: rate -$60k, occupancy -$360k. "
        "Provenance: property P&L Q2 2025."
    ))
    out = output_contract_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_output_contract_score_fails_missing_section():
    s = _scenario(concept_expected={
        "concept_id": "repe.noi_variance",
        "required_output_sections": ["direct_answer", "reconciliation"],
    })
    r = _result(response_text="NOI declined $420k due to occupancy.")
    out = output_contract_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(m.get("field") == "answer_sections" for m in out["mismatches"])


def test_output_contract_score_fails_filler_opener():
    s = _scenario(concept_expected={
        "concept_id": "repe.noi_variance",
        "required_output_sections": ["direct_answer"],
    })
    r = _result(response_text="Sure, happy to help explain NOI variance for you.")
    out = output_contract_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False
    filler_mismatch = next((m for m in out["mismatches"] if m.get("subcategory") == "filler_opener"), None)
    assert filler_mismatch is not None


def test_output_contract_score_skips_when_no_concept_receipt():
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance",
                                    "required_output_sections": ["direct_answer"]})
    r = {"response_text": "answer", "turn_receipt": {}}
    out = output_contract_score(scenario=s, result=r)
    assert out["applicable"] is False


# ── missing_data_failure_mode_score ───────────────────────────────────────


def test_missing_data_failure_mode_skips_when_not_declared():
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance"})
    r = _result()
    out = missing_data_failure_mode_score(scenario=s, result=r)
    assert out["applicable"] is False


def test_missing_data_failure_mode_passes_when_mode_fires():
    s = _scenario(concept_expected={
        "concept_id": "repe.noi_variance",
        "required_failure_mode": "missing_context",
    })
    r = _result(
        failure_modes_available=["missing_context"],
        response_text="Cannot compute: missing context — entity not resolved.",
    )
    out = missing_data_failure_mode_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_missing_data_failure_mode_fails_when_mode_not_in_response():
    s = _scenario(concept_expected={
        "concept_id": "repe.noi_variance",
        "required_failure_mode": "missing_context",
    })
    # failure mode is in available but NOT mentioned in the response text.
    r = _result(
        failure_modes_available=["missing_context"],
        response_text="NOI declined $420k due to occupancy.",
    )
    out = missing_data_failure_mode_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False


# ── generic_filler_penalty ─────────────────────────────────────────────────


def test_generic_filler_penalty_skips_short_response_no_fixture():
    s = _scenario(concept_expected={})
    r = _result(response_text="OK")
    out = generic_filler_penalty(scenario=s, result=r)
    assert out["applicable"] is False


def test_generic_filler_penalty_passes_specific_answer():
    s = _scenario(concept_expected={})
    r = _result(response_text=(
        "NOI missed budget by $420k in Q2, driven by lower occupancy ($320k impact) "
        "and higher concessions ($100k). The rate component was flat vs budget."
    ))
    out = generic_filler_penalty(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_generic_filler_penalty_fails_filler_without_numbers():
    s = _scenario(concept_expected={})
    r = _result(response_text=(
        "I'm not sure exactly what happened. Various factors may have contributed "
        "to the NOI variance. It depends on many reasons including market conditions."
    ))
    out = generic_filler_penalty(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False


# ── unsupported_claim_penalty ──────────────────────────────────────────────


def test_unsupported_claim_penalty_skips_when_inventory_none():
    s = _scenario(concept_expected={})
    r = _result(source_inventory=None)
    out = unsupported_claim_penalty(scenario=s, result=r)
    assert out["applicable"] is False


def test_unsupported_claim_penalty_passes_when_source_mentioned():
    s = _scenario(concept_expected={})
    r = _result(
        source_inventory=["property_pnl"],
        response_text="Per property_pnl, NOI declined $420k vs budget.",
    )
    out = unsupported_claim_penalty(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


# ── source_discipline_score ────────────────────────────────────────────────


def test_source_discipline_skips_when_inventory_none():
    s = _scenario(concept_expected={})
    r = _result(source_inventory=None)
    out = source_discipline_score(scenario=s, result=r)
    assert out["applicable"] is False


def test_source_discipline_passes_with_primary_source():
    s = _scenario(concept_expected={})
    r = _result(source_inventory=["property_pnl", "rent_roll"])
    out = source_discipline_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_source_discipline_fails_on_broker_tier_source():
    s = _scenario(concept_expected={})
    r = _result(source_inventory=["costar", "property_pnl"])
    out = source_discipline_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(m["category"] == "broker_tier_source_used" for m in out["mismatches"])


# ── freshness_score ────────────────────────────────────────────────────────


def test_freshness_score_skips_when_as_of_none():
    s = _scenario(concept_expected={})
    r = _result(source_as_of_dates=None)
    out = freshness_score(scenario=s, result=r)
    assert out["applicable"] is False


def test_freshness_score_passes_fresh_sources():
    from datetime import date, timedelta
    recent = str(date.today() - timedelta(days=10))
    s = _scenario(concept_expected={})
    r = _result(source_as_of_dates={"property_pnl": recent})
    out = freshness_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_freshness_score_fails_stale_source():
    from datetime import date, timedelta
    stale = str(date.today() - timedelta(days=180))
    s = _scenario(concept_expected={"freshness_max_age_days": 90})
    r = _result(source_as_of_dates={"property_pnl": stale})
    out = freshness_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(m["category"] == "stale_primary_source" for m in out["mismatches"])


# ── conflict_handling_score ────────────────────────────────────────────────


def test_conflict_handling_skips_when_not_declared():
    s = _scenario(concept_expected={})
    r = _result()
    out = conflict_handling_score(scenario=s, result=r)
    assert out["applicable"] is False


def test_conflict_handling_passes_when_conflict_surfaced():
    s = _scenario(concept_expected={
        "must_surface_conflict": True,
        "expected_conflict": {"sources": ["property_pnl", "operator_statement"]},
    })
    r = _result(response_text=(
        "There is a conflict between property_pnl and operator_statement. "
        "Both sources differ on the Q2 revenue figure."
    ))
    out = conflict_handling_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_conflict_handling_fails_when_conflict_ignored():
    s = _scenario(concept_expected={
        "must_surface_conflict": True,
        "expected_conflict": {"sources": ["property_pnl", "operator_statement"]},
    })
    r = _result(response_text="NOI declined $420k due to occupancy headwinds.")
    out = conflict_handling_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(m["category"] == "conflict_ignored" for m in out["mismatches"])


# ── basis_fidelity_score ───────────────────────────────────────────────────


def test_basis_fidelity_skips_when_not_declared():
    s = _scenario(concept_expected={})
    r = _result()
    out = basis_fidelity_score(scenario=s, result=r)
    assert out["applicable"] is False


def test_basis_fidelity_passes_when_basis_declared():
    s = _scenario(concept_expected={"required_basis": "cash"})
    r = _result(response_text="On a cash basis, NOI declined $420k vs budget.")
    out = basis_fidelity_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_basis_fidelity_fails_missing_basis_declaration():
    s = _scenario(concept_expected={"required_basis": "cash"})
    r = _result(response_text="NOI declined $420k due to occupancy headwinds.")
    out = basis_fidelity_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False
    assert any(m["category"] == "mixed_basis" for m in out["mismatches"])


def test_basis_fidelity_fails_silent_mixing():
    s = _scenario(concept_expected={
        "required_basis": "cash",
        "must_reject_silent_basis_mixing": True,
    })
    r = _result(response_text=(
        "On a cash basis NOI declined. However, GAAP revenue was higher. "
        "Both figures reflect different treatment."
    ))
    out = basis_fidelity_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False


# ── scope_fidelity_score ───────────────────────────────────────────────────


def test_scope_fidelity_skips_when_not_declared():
    s = _scenario(concept_expected={})
    r = _result()
    out = scope_fidelity_score(scenario=s, result=r)
    assert out["applicable"] is False


def test_scope_fidelity_passes_same_store_variant():
    s = _scenario(concept_expected={"required_scope": "same_store"})
    r = _result(response_text="On a same-store basis, NOI declined $420k.")
    out = scope_fidelity_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_scope_fidelity_passes_ssnoi_abbreviation():
    s = _scenario(concept_expected={"required_scope": "same_store"})
    r = _result(response_text="SSNOI declined $420k vs budget for the comparable pool.")
    out = scope_fidelity_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_scope_fidelity_fails_missing_scope_language():
    s = _scenario(concept_expected={"required_scope": "same_store"})
    r = _result(response_text="NOI declined $420k vs budget.")
    out = scope_fidelity_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False


# ── arithmetic_closure_score ───────────────────────────────────────────────


def test_arithmetic_closure_skips_when_no_bridge_declared():
    s = _scenario(concept_expected={})
    r = _result(response_text=(
        "Revenue miss -$200k, expense overrun -$220k, total NOI variance -$420k. "
        "Rate: $-150k, occupancy: -$50k, payroll: -$120k, R&M: -$100k."
    ))
    out = arithmetic_closure_score(scenario=s, result=r)
    assert out["applicable"] is False


def test_arithmetic_closure_passes_exact_sum():
    # Components: -200k + -220k = -420k. Absolute tolerance $1k.
    s = _scenario(concept_expected={
        "expected_bridge_components": {"rate": -200000, "payroll": -220000},
        "expected_total_variance": -420000,
    })
    r = _result(response_text=(
        "Rate: -$200,000. Payroll: -$220,000. Total variance: -$420,000."
    ))
    out = arithmetic_closure_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_arithmetic_closure_passes_within_relative_tolerance():
    # Components sum to -415k, total declared as -420k. Diff = $5k.
    # Relative: $5k / $420k = 1.19% < 2% → pass.
    s = _scenario(concept_expected={
        "expected_bridge_components": {"rate": -200000, "payroll": -215000},
        "expected_total_variance": -420000,
    })
    r = _result(response_text=(
        "Rate: -$200,000. Payroll: -$215,000. Total: -$420,000."
    ))
    out = arithmetic_closure_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_arithmetic_closure_fails_large_mismatch():
    # Components sum to -100k but declared total is -420k.
    # Absolute diff = $320k >> $1k; relative = 76% >> 2%.
    s = _scenario(concept_expected={
        "expected_bridge_components": {"rate": -50000, "payroll": -50000},
        "expected_total_variance": -420000,
    })
    r = _result(response_text=(
        "Rate: -$50,000. Payroll: -$50,000. Total: -$420,000."
    ))
    out = arithmetic_closure_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False


# ── driver_attribution_score ───────────────────────────────────────────────


def test_driver_attribution_skips_when_not_declared():
    s = _scenario(concept_expected={})
    r = _result()
    out = driver_attribution_score(scenario=s, result=r)
    assert out["applicable"] is False


def test_driver_attribution_passes_all_drivers_present():
    s = _scenario(concept_expected={
        "expected_material_drivers": ["occupancy", "concessions"],
    })
    r = _result(response_text=(
        "The NOI decline was driven by occupancy loss (-$320k) and concessions (-$100k)."
    ))
    out = driver_attribution_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is True


def test_driver_attribution_fails_missing_driver():
    s = _scenario(concept_expected={
        "expected_material_drivers": ["occupancy", "concessions", "bad_debt"],
    })
    r = _result(response_text=(
        "The NOI decline was driven by occupancy loss (-$320k) and concessions (-$100k)."
    ))
    out = driver_attribution_score(scenario=s, result=r)
    assert out["applicable"] is True
    assert out["passed"] is False


# ── score_concept_scenario aggregator ─────────────────────────────────────


def test_aggregate_passes_all_applicable_pass():
    s = _scenario(concept_expected={
        "concept_id": "repe.noi_variance",
        "required_output_sections": ["direct_answer", "driver_bridge"],
    })
    r = _result(
        concept_id="repe.noi_variance",
        response_text=(
            "NOI declined $420k vs budget in Q2. "
            "Driver bridge: occupancy -$320k, concessions -$100k. "
            "Provenance: property P&L Q2 2025."
        ),
    )
    out = score_concept_scenario(scenario=s, result=r)
    assert out["passed"] is True
    assert "concept_scores" in out
    assert "score_coverage" in out
    assert out["score_coverage"] > 0.0


def test_aggregate_fails_when_concept_id_wrong():
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance"})
    r = _result(concept_id="repe.other_metric")
    out = score_concept_scenario(scenario=s, result=r)
    assert out["passed"] is False
    assert out["failure_category"] == "wrong_concept_id"


def test_aggregate_score_coverage_is_fraction():
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance"})
    r = _result()
    out = score_concept_scenario(scenario=s, result=r)
    cov = out["score_coverage"]
    assert 0.0 <= cov <= 1.0


def test_aggregate_source_discipline_coverage_zero_when_none():
    # No source_inventory or source_as_of_dates → all source-discipline
    # scorers skip → sd_coverage = 0.
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance"})
    r = _result(source_inventory=None, source_as_of_dates=None)
    out = score_concept_scenario(scenario=s, result=r)
    assert out["source_discipline_coverage"] == 0.0


def test_aggregate_receipt_completeness_zero_when_no_concept():
    s = _scenario(concept_expected={"concept_id": "repe.noi_variance"})
    r = {"response_text": "answer", "turn_receipt": {}}
    out = score_concept_scenario(scenario=s, result=r)
    assert out["receipt_completeness"] == 0.0
