"""Telemetry ML — promotion DECISION brain (PRODUCTION source of truth).

`decide()` is PURE: it takes the metrics dicts that training logged to MLflow and returns the full
promotion decision by applying the governed `gates` contract. It performs NO I/O — no MLflow reads,
no registry writes — so it is fully unit-testable without a cluster and cannot accidentally mutate
the registry. A thin adapter (notebook today, a local runner next slice) supplies metrics and applies
the decision's registry side-effect; the GOVERNANCE lives here.
"""
from __future__ import annotations

from . import gates as G


def decide(anomaly_metrics: dict, rul_metrics: dict) -> dict:
    """Pure promotion decision.

    anomaly_metrics: {run_name: metrics_dict} for the anomaly candidates.
    rul_metrics:     {run_name: metrics_dict} for the RUL candidates.
    Returns a decision dict (winner/decision/why per family) — the caller does the registry write.
    """
    # ── Anomaly: fail-closed honest gate; among passers pick highest affiliation_f1 (range-aware). ──
    anom_pass = {n: G.passes_honest_gate(m) for n, m in anomaly_metrics.items()}
    anom_eligible = [n for n, ok in anom_pass.items() if ok]
    if anom_eligible:
        anom_winner = max(anom_eligible, key=lambda n: float(anomaly_metrics[n].get("affiliation_f1", 0.0)))
        anom_decision = "promoted"
    else:
        anom_winner = max(anomaly_metrics, key=lambda n: float(anomaly_metrics[n].get("affiliation_f1", 0.0))) \
            if anomaly_metrics else None
        anom_decision = "model_not_promoted"

    # ── RUL: PHM-/late-/naive-/leakage-aware fail-closed gate; safest-by-PHM among passers. ──
    rul_eval = {n: G.rul_gate_eval(m) for n, m in rul_metrics.items()}
    rul_winner, rul_decision = G.select_rul_winner(rul_eval)

    return {
        "anomaly": {
            "winner": anom_winner, "decision": anom_decision, "honest_gate_pass": anom_pass,
            "affiliation_f1": float(anomaly_metrics.get(anom_winner, {}).get("affiliation_f1", 0.0)) if anom_winner else None,
            "f1_point_adjusted_reference": float(anomaly_metrics.get(anom_winner, {}).get("f1", 0.0)) if anom_winner else None,
        },
        "rul": {
            "winner": rul_winner, "decision": rul_decision, "gate_eval": rul_eval,
            "failed_checks": {n: [k for k, ok in e["checks"].items() if not ok] for n, e in rul_eval.items()},
        },
        "gates": {"honest_gate": G.HONEST_GATE, "rul_gate": G.RUL_GATE, "rmse_gate": G.RMSE_GATE},
    }
