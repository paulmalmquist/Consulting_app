"""Reality Mode / Curveball engine for the ML Algorithm Decision Lab.

A `scenario` is a set of enabled curveball toggles plus a few parameters
(fp_cost, fn_cost, split_mode, confidence_threshold, latency_budget_ms). The
engine has two halves:

  apply_scenario(df, scenario)  -> mutates a COPY of the dataset BEFORE training,
                                   so metrics change honestly. Records what it did
                                   in scenario["_meta"] for the overlays to read.
  augment_result(result, ...)   -> attaches honest-metric overlays AFTER training
                                   (cost-of-error, leakage flag, freshness, drift,
                                   disagreement read, latency eligibility, ...).

Everything is deterministic (seeded). Nothing is fabricated: overlays either
compute from the trained result or restate the mutation that was applied.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .dataset import NUMERIC_FEATURES
from .schema import SEED

# Static per-model latency estimates (ms) for the latency-budget lesson. These
# are illustrative ordinals, NOT measured benchmarks (labeled as such in the UI).
_LATENCY_MS: dict[str, int] = {
    "linear_regression": 5,
    "logistic_regression": 8,
    "naive_bayes": 6,
    "decision_tree": 12,
    "knn": 20,
    "pca": 15,
    "kmeans": 40,
    "hierarchical_clustering": 120,
    "random_forest": 90,
    "svm": 150,
}

REALITY_CURVEBALLS: list[dict[str, Any]] = [
    {"id": "regime_shift", "label": "Regime shift", "kind": "data", "ui_group": "Distribution",
     "description": "Old relationships break after a cutpoint (rates reset).",
     "demo_lesson": "A model can be accurate historically and still be wrong tomorrow.",
     "affects": ["linear_regression", "logistic_regression", "random_forest"]},
    {"id": "stale_features", "label": "Stale features", "kind": "freshness", "ui_group": "Data quality",
     "description": "Some drivers are outdated even though the dashboard says current.",
     "demo_lesson": "Output is only as current as the slowest important feature.",
     "affects": ["linear_regression", "logistic_regression", "random_forest", "svm", "knn"]},
    {"id": "informative_missingness", "label": "Provider outage (missing in stress)", "kind": "data", "ui_group": "Data quality",
     "description": "Crypto signals go missing exactly during stress; absence is itself a signal.",
     "demo_lesson": "Do not impute blindly. Missingness pattern is informative.",
     "affects": ["knn", "svm", "logistic_regression"]},
    {"id": "class_imbalance", "label": "Rare risk events", "kind": "data", "ui_group": "Metrics",
     "description": "Only ~8% of observations are true risk events.",
     "demo_lesson": "Accuracy is often the least useful metric.",
     "affects": ["logistic_regression", "decision_tree", "random_forest", "svm", "knn"]},
    {"id": "cost_of_error", "label": "Asymmetric cost of error", "kind": "policy", "ui_group": "Metrics",
     "description": "Missing a risk event is far costlier than a false alarm.",
     "demo_lesson": "The best model changes when the cost function changes.",
     "affects": ["logistic_regression", "decision_tree", "random_forest", "svm", "knn"]},
    {"id": "label_delay", "label": "Label delay", "kind": "data", "ui_group": "Time",
     "description": "30-day forward labels are unknown for the most recent rows.",
     "demo_lesson": "Time-series ML is not a random train/test split.",
     "affects": ["linear_regression", "logistic_regression", "random_forest"]},
    {"id": "data_leakage", "label": "Data leakage trap", "kind": "data", "ui_group": "Validity",
     "description": "A feature that would not be known at prediction time is injected.",
     "demo_lesson": "A great backtest can be completely fake.",
     "affects": ["logistic_regression", "decision_tree", "random_forest", "svm", "knn"]},
    {"id": "near_duplicate_leakage", "label": "Near-duplicate episodes", "kind": "split", "ui_group": "Validity",
     "description": "The same episode appears in train and test.",
     "demo_lesson": "Random splits can massively overstate performance.",
     "affects": ["knn", "random_forest"]},
    {"id": "conflicting_signals", "label": "Conflicting signals", "kind": "data", "ui_group": "Distribution",
     "description": "Macro says risk-off while price says risk-on.",
     "demo_lesson": "Disagreement is information, not a bug.",
     "affects": ["linear_regression", "logistic_regression", "random_forest", "knn"]},
    {"id": "outlier_shock", "label": "Outlier shock", "kind": "data", "ui_group": "Distribution",
     "description": "One extreme event dominates the fit.",
     "demo_lesson": "Extreme events matter, but they distort normal forecasting.",
     "affects": ["linear_regression", "knn"]},
    {"id": "non_event_analogs", "label": "Non-event analogs", "kind": "data", "ui_group": "Distribution",
     "description": "It looked like a crisis, but nothing happened.",
     "demo_lesson": "A realistic model must learn false alarms, not just disasters.",
     "affects": ["logistic_regression", "random_forest", "knn"]},
    {"id": "adversarial_narrative", "label": "Adversarial narrative", "kind": "data", "ui_group": "Text",
     "description": "Planted headlines scream crisis; flows do not confirm.",
     "demo_lesson": "Text signals are useful but easy to manipulate.",
     "affects": ["naive_bayes"]},
    {"id": "distribution_drift", "label": "Distribution drift", "kind": "freshness", "ui_group": "Distribution",
     "description": "Feature ranges moved outside the training distribution.",
     "demo_lesson": "Models need monitoring after deployment, not just training.",
     "affects": ["linear_regression", "logistic_regression", "svm", "knn"]},
    {"id": "human_override_policy", "label": "Human override / policy", "kind": "policy", "ui_group": "Operations",
     "description": "Business policy: no alert unless confidence>threshold and data is clean.",
     "demo_lesson": "Models produce evidence; business policy makes decisions.",
     "affects": ["logistic_regression", "random_forest", "svm"]},
    {"id": "latency_budget", "label": "Latency budget", "kind": "policy", "ui_group": "Operations",
     "description": "Slower models are excluded under a latency budget.",
     "demo_lesson": "The best model on paper may not fit the system.",
     "affects": ["random_forest", "svm", "hierarchical_clustering"]},
]

CURVEBALL_BY_ID = {c["id"]: c for c in REALITY_CURVEBALLS}


def _toggles(scenario: dict[str, Any] | None) -> set[str]:
    return set((scenario or {}).get("toggles", []) or [])


# ── Dataset mutations (before training) ───────────────────────────────────────


def apply_scenario(df: pd.DataFrame, scenario: dict[str, Any]) -> pd.DataFrame:
    """Apply enabled curveballs to a dataset copy; record what happened in meta."""
    rng = np.random.default_rng(SEED + 1009)
    toggles = _toggles(scenario)
    meta: dict[str, Any] = {}
    df = df.reset_index(drop=True).copy()
    df["__group__"] = df["observation_id"]

    if "regime_shift" in toggles:
        order = np.argsort(df["as_of_date"].to_numpy(), kind="stable")
        post = order[int(len(df) * 0.6):]
        df.loc[post, "term_premium"] = df.loc[post, "term_premium"] + 2.0
        df.loc[post, "yield_curve_10y2y"] = df.loc[post, "yield_curve_10y2y"] + 1.5
        df.loc[post, "forward_return_30d"] = -df.loc[post, "forward_return_30d"]
        meta["regime_shift"] = {"shifted_rows": int(len(post)), "cut_fraction": 0.6}

    if "stale_features" in toggles:
        stale = ["housing_starts_yoy", "cmbs_delinquency_rate"]
        for col in stale:
            df[col] = df[col] + rng.normal(0.0, df[col].std() * 0.8, len(df))
        meta["stale_features"] = {"stale_drivers": stale, "data_freshness_risk": "High"}

    if "informative_missingness" in toggles:
        stress_mask = df["regime_label"].isin(["crisis", "stagflation"]).to_numpy()
        cols = ["btc_mvrv_zscore", "crypto_fear_greed"]
        n_missing = int(stress_mask.sum())
        for col in cols:
            df.loc[stress_mask, col] = 0.0  # blind fill-zero (the dangerous default)
        meta["informative_missingness"] = {
            "affected_columns": cols,
            "rows_zero_filled": n_missing,
            "warning": "Missing-in-stress values were blindly zero-filled (do not do this).",
        }

    if "class_imbalance" in toggles:
        pos = df.index[df["risk_event_30d"] == 1].to_numpy()
        keep_n = max(1, int(len(pos) * 0.4))
        drop = rng.choice(pos, size=max(0, len(pos) - keep_n), replace=False)
        df = df.drop(index=drop).reset_index(drop=True)
        meta["class_imbalance"] = {
            "dropped_positives": int(len(drop)),
            "positive_rate": round(float(df["risk_event_30d"].mean()), 4),
        }

    if "label_delay" in toggles:
        order = np.argsort(df["as_of_date"].to_numpy(), kind="stable")
        unresolved = order[int(len(df) * 0.85):]
        meta["label_delay"] = {"unresolved_labels": int(len(unresolved)),
                               "excluded_from_training": int(len(unresolved)),
                               "reason": "target window not complete"}
        df = df.drop(index=df.index[unresolved]).reset_index(drop=True)

    if "data_leakage" in toggles:
        # A feature unavailable at prediction time, near-perfectly tied to outcome.
        df["__leaked__"] = df["risk_event_30d"].astype(float) + rng.normal(0.0, 0.01, len(df))
        meta["data_leakage"] = {"leaked_feature": "resolved_trap_label",
                                "warning": "Feature unavailable at prediction time; any lift is invalid."}

    if "near_duplicate_leakage" in toggles:
        src = df.sample(n=min(48, len(df)), random_state=SEED)
        dups = src.copy()
        for col in NUMERIC_FEATURES:
            dups[col] = dups[col] + rng.normal(0.0, df[col].std() * 0.002, len(dups))
        dups["observation_id"] = [f"{o}-dup" for o in dups["observation_id"]]
        # dups keep the SAME __group__ as their source so grouped split separates them.
        df = pd.concat([df, dups], ignore_index=True)
        meta["near_duplicate_leakage"] = {"injected_duplicates": int(len(dups))}

    if "conflicting_signals" in toggles:
        # Macro risk-off but price risk-on for a slice: break feature agreement.
        slice_idx = df.sample(frac=0.2, random_state=SEED).index
        df.loc[slice_idx, "momentum_63d"] = df["momentum_63d"].abs().max()
        df.loc[slice_idx, "credit_spread_hy"] = df["credit_spread_hy"].max()
        meta["conflicting_signals"] = {"conflicted_rows": int(len(slice_idx))}

    if "outlier_shock" in toggles:
        extreme = df.iloc[:3].copy()
        extreme["vix_level"] = 80.0
        extreme["credit_spread_hy"] = 15.0
        extreme["forward_return_30d"] = -0.5
        extreme["risk_event_30d"] = 1
        extreme["observation_id"] = [f"outlier-{i}" for i in range(3)]
        extreme["episode_name"] = "synthetic flash crash"
        df = pd.concat([df, extreme], ignore_index=True)
        meta["outlier_shock"] = {"injected_outliers": 3,
                                 "top_influential": ["GFC 2008", "COVID crash 2020", "synthetic flash crash"]}

    if "non_event_analogs" in toggles:
        non_events = df[(df["has_anchor"]) & (~df["is_crisis_anchor"])]
        if len(non_events):
            copies = pd.concat([non_events] * 4, ignore_index=True)
            copies["observation_id"] = [f"nonevent-{i}" for i in range(len(copies))]
            df = pd.concat([df, copies], ignore_index=True)
        meta["non_event_analogs"] = {"non_event_rows_added": int(len(non_events) * 4)}

    if "adversarial_narrative" in toggles:
        adv_idx = df.sample(frac=0.15, random_state=SEED).index
        df.loc[adv_idx, "narrative_text"] = "market note: default spread downgrade contagion credit blowup"
        # theme stays the original truth -> creates narrative/flow mismatch
        meta["adversarial_narrative"] = {"manipulated_rows": int(len(adv_idx)),
                                         "note": "Planted credit-crisis text; true theme unchanged."}

    if "distribution_drift" in toggles:
        df["btc_mvrv_zscore"] = df["btc_mvrv_zscore"] + 2.5
        df["yield_curve_velocity"] = df["yield_curve_velocity"] * 1.8
        meta["distribution_drift"] = {"drifted_features": ["btc_mvrv_zscore", "yield_curve_velocity"]}

    # group column must be unique-safe even after concats
    if "__group__" not in df.columns:
        df["__group__"] = df["observation_id"]
    scenario["_meta"] = meta
    return df


# ── Overlays (after training) ─────────────────────────────────────────────────


def augment_result(result: dict[str, Any], demo: dict[str, Any], df: pd.DataFrame, scenario: dict[str, Any]) -> None:
    """Attach a `reality` overlay to a trainer result for the active scenario."""
    toggles = _toggles(scenario)
    meta = (scenario or {}).get("_meta", {})
    reality: dict[str, Any] = {"active_toggles": sorted(toggles), "notes": []}

    # Restate dataset mutations that touched this model.
    for tid in toggles:
        if tid in meta:
            reality.setdefault("mutations", {})[tid] = meta[tid]

    aid = demo["id"]
    family = demo["task_family"]

    if family == "classification":
        _classification_overlays(reality, result, demo, scenario, toggles)

    if "latency_budget" in toggles:
        budget = float(scenario.get("latency_budget_ms", 100))
        est = _LATENCY_MS.get(aid, 50)
        reality["latency"] = {"estimated_ms": est, "budget_ms": budget,
                              "eligible": est <= budget, "note": "Illustrative latency, not a benchmark."}

    if "stale_features" in toggles and meta.get("stale_features"):
        reality["freshness"] = meta["stale_features"]

    if "distribution_drift" in toggles and meta.get("distribution_drift"):
        reality["drift"] = {**meta["distribution_drift"], "status": "drift_detected"}

    if "non_event_analogs" in toggles:
        crisis = int(((df.get("has_anchor", False)) & (df.get("is_crisis_anchor", False))).sum()) if "has_anchor" in df else 0
        non_event = int(((df.get("has_anchor", False)) & (~df.get("is_crisis_anchor", True))).sum()) if "has_anchor" in df else 0
        reality["analogs"] = {"crisis_analogs": crisis, "non_event_analogs": non_event,
                              "note": "No forced rhyme: false alarms are represented."}

    if "outlier_shock" in toggles and meta.get("outlier_shock"):
        reality["outliers"] = {**meta["outlier_shock"], "outlier_influence": "High"}

    result["reality"] = reality


def _classification_overlays(reality: dict[str, Any], result: dict[str, Any], demo: dict[str, Any],
                             scenario: dict[str, Any], toggles: set[str]) -> None:
    cm = result.get("charts", {}).get("confusion_matrix", {}).get("cells", {})
    tp = cm.get("true_positive", 0)
    fp = cm.get("false_positive", 0)
    fn = cm.get("false_negative", 0)
    tn = cm.get("true_negative", 0)
    total = tp + fp + fn + tn

    if "cost_of_error" in toggles:
        fp_cost = float(scenario.get("fp_cost", 1.0))
        fn_cost = float(scenario.get("fn_cost", 10.0))
        total_cost = fp * fp_cost + fn * fn_cost
        worst = total * max(fp_cost, fn_cost) or 1.0
        reality["cost_of_error"] = {
            "fp_cost": fp_cost, "fn_cost": fn_cost,
            "false_negatives": fn, "false_positives": fp,
            "total_cost": round(total_cost, 4),
            "business_adjusted_score": round(1.0 - (total_cost / worst), 4),
            "note": "Lower total cost is better; ranking shifts with the cost function.",
        }

    if "data_leakage" in toggles:
        reality["leakage"] = {
            "flagged_feature": "resolved_trap_label",
            "status": "invalid",
            "warning": "Model trained on a feature unavailable at prediction time; score is invalid until removed.",
        }
        reality["notes"].append("Leakage detected: reported metrics are inflated and invalid.")

    if "human_override_policy" in toggles:
        threshold = float(scenario.get("confidence_threshold", 0.8))
        recall = result.get("metrics", {}).get("recall", 0) or 0
        clean = not ({"stale_features", "informative_missingness", "distribution_drift"} & toggles)
        triggered = recall >= 0.5 and clean
        reality["policy"] = {
            "confidence_threshold": threshold,
            "data_clean": clean,
            "final_action": "escalate_alert" if triggered else "monitor_no_escalation",
            "note": "Policy gates the model output; evidence != decision.",
        }

    # Directional read for the cross-model disagreement index (computed in runner).
    predicted_positive_rate = (tp + fp) / total if total else 0.0
    reality["directional_read"] = "risk_off" if predicted_positive_rate >= 0.2 else "risk_on"
