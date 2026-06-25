"""Telemetry ML — promotion gate contract (PRODUCTION source of truth).

The governed promotion thresholds + fail-closed gate evaluators. The promotion path imports these so
the gate that GOVERNS promotion is declared once, here — not duplicated across training and promotion
notebooks (which is how silent drift happens). Experimental notebooks may carry scratch copies; this
module is authoritative for production.
"""
from __future__ import annotations

# ── Anomaly (SMAP/MSL): honest/affiliation gate (range-aware + honest floor), fail-closed. ──────────
# Legacy point-adjusted F1 is REFERENCE ONLY (it inflates ~2x) and is not a gate input.
HONEST_GATE = {"f1_pointwise": 0.10, "event_recall": 0.50, "alarm_precision": 0.20, "affiliation_f1": 0.25}
F1_GATE_REFERENCE_ONLY = 0.30

# ── RUL (C-MAPSS): RMSE alone must NOT promote a dangerous model. Conservative, declared thresholds —
# ── NOT tuned to force any model through. ──────────────────────────────────────────────────────────
RMSE_GATE = 25.0  # absolute cycles ceiling
RUL_GATE = {
    "rmse_abs_max": RMSE_GATE,                 # absolute ceiling (cycles)
    "max_rmse_ratio_vs_naive": 0.75,           # must beat strongest-naive RMSE by >=25%
    "require_phm_better_than_naive": True,     # PHM must improve over naive (lower is better)
    "max_late_prediction_rate": 0.55,          # over-stating remaining life is the unsafe mode
    "require_leakage_control_passed": True,
}


def passes_honest_gate(m: dict) -> bool:
    """Fail-closed: every declared honest threshold must be met (missing metric -> 0 -> fail)."""
    return all(float(m.get(k, 0.0)) >= thr for k, thr in HONEST_GATE.items())


def rul_gate_eval(m: dict, gate: dict = RUL_GATE) -> dict:
    """Fail-closed RUL gate. Reads metrics logged by training (a missing metric fails that check)."""
    rmse = float(m.get("rmse", 1e9))
    ratio = float(m.get("rul_model_vs_naive_rmse_ratio", 1e9))
    phm_improve = float(m.get("rul_phm_improvement", -1e9))   # naive_phm - model_phm (>0 = better)
    late_rate = float(m.get("rul_late_prediction_rate", 1.0))
    leak_ok = float(m.get("rul_leakage_control_passed", 0.0)) >= 1.0
    checks = {
        "rmse_under_abs_ceiling": rmse <= gate["rmse_abs_max"],
        "beats_naive_rmse_by_margin": ratio <= gate["max_rmse_ratio_vs_naive"],
        "phm_better_than_naive": (phm_improve > 0.0) if gate["require_phm_better_than_naive"] else True,
        "late_rate_under_ceiling": late_rate <= gate["max_late_prediction_rate"],
        "leakage_control_passed": leak_ok if gate["require_leakage_control_passed"] else True,
    }
    return {"passed": all(checks.values()), "checks": checks,
            "rmse": rmse, "phm": float(m.get("phm", 0.0)), "late_rate": late_rate,
            "rmse_ratio_vs_naive": ratio, "phm_improvement": phm_improve}


def select_rul_winner(eval_by_name: dict) -> tuple[str | None, str]:
    """Among gate-passers pick the SAFEST (lowest PHM, then late-rate, then RMSE). Fail-closed: if none
    pass, return the safest-by-PHM candidate but a 'model_not_promoted' decision."""
    eligible = [n for n, e in eval_by_name.items() if e["passed"]]
    if eligible:
        winner = min(eligible, key=lambda n: (eval_by_name[n]["phm"], eval_by_name[n]["late_rate"], eval_by_name[n]["rmse"]))
        return winner, "promoted"
    if not eval_by_name:
        return None, "model_not_promoted"
    winner = min(eval_by_name, key=lambda n: (eval_by_name[n]["phm"], eval_by_name[n]["rmse"]))
    return winner, "model_not_promoted"
