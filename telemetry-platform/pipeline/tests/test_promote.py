"""Tests for the pure promotion decision brain — reproduces the real Databricks promote run (2026-06-22)."""
from pipeline import promote as P

# Real logged metrics from the runs that produced promote_models run 261177164841175.
ANOM = {
    "anomaly_baseline_mad": {"f1": 0.63866, "f1_pointwise": 0.30859, "event_recall": 0.76923,
                             "alarm_precision": 0.31869, "affiliation_f1": 0.46568},
    "anomaly_pca_recon": {"f1": 0.41962, "f1_pointwise": 0.02737, "event_recall": 0.48077,
                          "alarm_precision": 0.26353, "affiliation_f1": 0.36307},
}
RUL = {
    "rul_linear_baseline": {"rmse": 21.7024, "phm": 1036.14, "rul_model_vs_naive_rmse_ratio": 0.5204,
                            "rul_phm_improvement": 29717.17, "rul_late_prediction_rate": 0.59,
                            "rul_leakage_control_passed": 1.0},
    "rul_gbm": {"rmse": 20.3219, "phm": 1423.33, "rul_model_vs_naive_rmse_ratio": 0.4873,
                "rul_phm_improvement": 29329.98, "rul_late_prediction_rate": 0.58,
                "rul_leakage_control_passed": 1.0},
}


def test_decide_reproduces_real_run():
    d = P.decide(ANOM, RUL)
    # Anomaly: MAD promoted via honest gate; PCA rejected.
    assert d["anomaly"]["decision"] == "promoted"
    assert d["anomaly"]["winner"] == "anomaly_baseline_mad"
    assert d["anomaly"]["honest_gate_pass"] == {"anomaly_baseline_mad": True, "anomaly_pca_recon": False}
    # RUL: fail-closed (both miss late-rate); safest-by-PHM named for the record.
    assert d["rul"]["decision"] == "model_not_promoted"
    assert d["rul"]["winner"] == "rul_linear_baseline"
    assert d["rul"]["failed_checks"]["rul_gbm"] == ["late_rate_under_ceiling"]
    assert d["rul"]["failed_checks"]["rul_linear_baseline"] == ["late_rate_under_ceiling"]


def test_decide_is_pure_no_side_effects():
    # Calling decide twice on the same inputs yields identical decisions (no hidden state / I/O).
    assert P.decide(ANOM, RUL) == P.decide(ANOM, RUL)


def test_decide_promotes_when_a_safe_rul_model_exists():
    rul = dict(RUL)
    rul["rul_safe"] = {"rmse": 18.0, "phm": 800.0, "rul_model_vs_naive_rmse_ratio": 0.45,
                       "rul_phm_improvement": 30000.0, "rul_late_prediction_rate": 0.40,
                       "rul_leakage_control_passed": 1.0}
    d = P.decide(ANOM, rul)
    assert d["rul"]["decision"] == "promoted" and d["rul"]["winner"] == "rul_safe"
