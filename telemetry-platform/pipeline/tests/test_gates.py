"""Local unit tests for the promotion gate contract — the governed logic, tested without a cluster.

Includes regression fixtures from the real Databricks runs (2026-06-22): the deployed RUL champion
(GBM) must FAIL the hardened gate on late-rate, and MAD must pass the honest gate while PCA fails.
"""
import pytest

from pipeline import gates as G


# ── Anomaly honest gate ─────────────────────────────────────────────────────
MAD = {"f1_pointwise": 0.30859, "event_recall": 0.76923, "alarm_precision": 0.31869, "affiliation_f1": 0.46568}
PCA = {"f1_pointwise": 0.02737, "event_recall": 0.48077, "alarm_precision": 0.26353, "affiliation_f1": 0.36307}


def test_honest_gate_passes_mad_fails_pca():
    assert G.passes_honest_gate(MAD) is True
    assert G.passes_honest_gate(PCA) is False  # fails f1_pointwise (0.027<0.10) and event_recall (0.48<0.50)


def test_honest_gate_fail_closed_on_missing_metric():
    assert G.passes_honest_gate({"f1_pointwise": 0.9}) is False  # missing keys -> 0 -> fail


# ── RUL gate (regression fixtures from the real runs) ───────────────────────
GBM = {"rmse": 20.3219, "phm": 1423.33, "rul_model_vs_naive_rmse_ratio": 0.4873,
       "rul_phm_improvement": 29329.98, "rul_late_prediction_rate": 0.58, "rul_leakage_control_passed": 1.0}
LINEAR = {"rmse": 21.7024, "phm": 1036.14, "rul_model_vs_naive_rmse_ratio": 0.5204,
          "rul_phm_improvement": 29717.17, "rul_late_prediction_rate": 0.59, "rul_leakage_control_passed": 1.0}


def test_real_champion_gbm_fails_on_late_rate():
    e = G.rul_gate_eval(GBM)
    assert e["passed"] is False
    # all checks pass EXCEPT the late-rate ceiling — this is the whole point of PR-1
    assert e["checks"]["late_rate_under_ceiling"] is False
    assert all(v for k, v in e["checks"].items() if k != "late_rate_under_ceiling")


def test_real_linear_also_fails_on_late_rate():
    e = G.rul_gate_eval(LINEAR)
    assert e["passed"] is False
    assert e["checks"]["late_rate_under_ceiling"] is False


def test_rul_gate_fail_closed_selection_keeps_safest_by_phm():
    evals = {"rul_gbm": G.rul_gate_eval(GBM), "rul_linear_baseline": G.rul_gate_eval(LINEAR)}
    winner, decision = G.select_rul_winner(evals)
    assert decision == "model_not_promoted"          # nothing passed -> fail-closed
    assert winner == "rul_linear_baseline"           # safest-by-PHM (1036 < 1423) named for the record


def test_rul_gate_promotes_a_safe_model():
    # A hypothetical model that clears every check (incl. late-rate) should pass and be promotable.
    SAFE = {"rmse": 18.0, "phm": 900.0, "rul_model_vs_naive_rmse_ratio": 0.45,
            "rul_phm_improvement": 30000.0, "rul_late_prediction_rate": 0.40, "rul_leakage_control_passed": 1.0}
    e = G.rul_gate_eval(SAFE)
    assert e["passed"] is True
    winner, decision = G.select_rul_winner({"rul_gbm": G.rul_gate_eval(GBM), "rul_safe": e})
    assert decision == "promoted" and winner == "rul_safe"


def test_rul_gate_fail_closed_on_missing_metrics():
    assert G.rul_gate_eval({"rmse": 10.0})["passed"] is False  # missing ratio/phm/late/leakage -> fails


def test_leakage_failure_blocks_promotion():
    LEAKY = dict(GBM, rul_late_prediction_rate=0.40, rul_leakage_control_passed=0.0)  # good late, leak FAIL
    e = G.rul_gate_eval(LEAKY)
    assert e["passed"] is False
    assert e["checks"]["leakage_control_passed"] is False
