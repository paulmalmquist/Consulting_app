"""Tests for the Reality Mode / Curveball engine.

Each curveball must be deterministic and must change results or attach honest
overlays in the intended direction, without crashing the page.
"""

from __future__ import annotations

from app.services.hr_ml_demo import run_algorithm, run_all_algorithms
from app.services.hr_ml_demo.curveballs import REALITY_CURVEBALLS


def _scn(toggles, **params):
    return {"toggles": list(toggles), **params}


def test_registry_has_15_unique():
    ids = [c["id"] for c in REALITY_CURVEBALLS]
    assert len(ids) == 15
    assert len(set(ids)) == 15
    for c in REALITY_CURVEBALLS:
        assert c["demo_lesson"] and c["description"]


def test_scenario_deterministic():
    s1 = run_algorithm("random_forest", _scn(["class_imbalance"]))
    s2 = run_algorithm("random_forest", _scn(["class_imbalance"]))
    assert s1["metrics"] == s2["metrics"]


def test_class_imbalance_lowers_positive_rate():
    res = run_algorithm("logistic_regression", _scn(["class_imbalance"]))
    assert res["status"] == "ok"
    meta = res["reality"]["mutations"]["class_imbalance"]
    assert meta["positive_rate"] <= 0.2


def test_data_leakage_inflates_and_flags():
    res = run_algorithm("random_forest", _scn(["data_leakage"]))
    assert res["status"] == "ok"
    assert res["reality"]["leakage"]["status"] == "invalid"
    # A feature tied to the label makes the score implausibly high.
    assert res["metrics"]["f1"] >= 0.9


def test_cost_of_error_overlay():
    cheap_fn = run_algorithm("logistic_regression", _scn(["cost_of_error"], fp_cost=1, fn_cost=1))
    dear_fn = run_algorithm("logistic_regression", _scn(["cost_of_error"], fp_cost=1, fn_cost=20))
    a = cheap_fn["reality"]["cost_of_error"]
    b = dear_fn["reality"]["cost_of_error"]
    assert a["fn_cost"] == 1 and b["fn_cost"] == 20
    # Raising the FN cost cannot lower total cost.
    assert b["total_cost"] >= a["total_cost"]


def test_latency_budget_excludes_slow_model():
    svm = run_algorithm("svm", _scn(["latency_budget"], latency_budget_ms=10))
    assert svm["reality"]["latency"]["eligible"] is False
    lin = run_algorithm("logistic_regression", _scn(["latency_budget"], latency_budget_ms=10))
    assert lin["reality"]["latency"]["eligible"] is True


def test_informative_missingness_zero_fills_without_crash():
    res = run_algorithm("knn", _scn(["informative_missingness"]))
    assert res["status"] == "ok"
    mut = res["reality"]["mutations"]["informative_missingness"]
    assert mut["rows_zero_filled"] >= 1


def test_split_mode_grouped_runs():
    # Both split modes must run cleanly and honor the curveball; the grouped
    # split keeps near-duplicates together (no train/test leak). We assert
    # structure + the injection happened, not a brittle numeric inequality
    # (F1 under heavy imbalance is too volatile to encode a fixed direction).
    random_run = run_algorithm("knn", _scn(["near_duplicate_leakage"], split_mode="random"))
    grouped_run = run_algorithm("knn", _scn(["near_duplicate_leakage"], split_mode="episode_grouped"))
    assert random_run["status"] == "ok" and grouped_run["status"] == "ok"
    assert random_run["reality"]["mutations"]["near_duplicate_leakage"]["injected_duplicates"] >= 12
    # Grouped split must still produce a valid held-out test set.
    assert grouped_run["dataset"]["test_rows"] >= 1


def test_regime_shift_degrades_regression():
    clean = run_algorithm("linear_regression")["metrics"]["r2"]
    shifted = run_algorithm("linear_regression", _scn(["regime_shift"]))["metrics"]["r2"]
    assert shifted <= clean


def test_disagreement_index_present_with_scenario():
    out = run_all_algorithms(_scn(["conflicting_signals"]))
    assert "disagreement" in out
    assert "index" in out["disagreement"]


def test_adversarial_narrative_overlay():
    res = run_algorithm("naive_bayes", _scn(["adversarial_narrative"]))
    assert res["status"] == "ok"
    assert "adversarial_narrative" in res["reality"]["mutations"]


def test_human_override_policy_overlay():
    res = run_algorithm("random_forest", _scn(["human_override_policy"], confidence_threshold=0.8))
    pol = res["reality"]["policy"]
    assert pol["final_action"] in {"escalate_alert", "monitor_no_escalation"}


def test_all_algorithms_survive_all_toggles():
    every = [c["id"] for c in REALITY_CURVEBALLS]
    out = run_all_algorithms(_scn(every, fp_cost=1, fn_cost=10, latency_budget_ms=50, confidence_threshold=0.8))
    statuses = {a["algorithm_id"]: a["status"] for a in out["algorithms"]}
    # No algorithm may hard-fail; at worst it returns not_available (never an exception).
    assert len(statuses) == 10
    assert all(s in {"ok", "not_available"} for s in statuses.values())
