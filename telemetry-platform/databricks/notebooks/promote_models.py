# Databricks notebook source
# MAGIC %md
# MAGIC # Telemetry — promotion gates + Model Registry
# MAGIC Reads the logged metrics from MLflow (not hand-passed numbers), applies the declared gates,
# MAGIC registers passing models to the Unity Catalog Model Registry, and records held-back models
# MAGIC honestly. This is the operated-platform step: the gate is enforced against the tracking store.

# COMMAND ----------
# ===== TEACHING NOTES =====
# WHAT THIS FILE DOES: This is the PROMOTION GATE. It reads the trained models' honest metrics (from
#   MLflow, never hand-typed), checks them against fixed pass/fail thresholds, and decides which model
#   becomes the "champion" (the one used live) vs which is held back. It is fail-closed: if a model
#   doesn't clearly clear every bar, it is NOT promoted.
# WHERE YOU SEE THIS: it drives the gate checks on the frontend "Registry Console"
#   (repo-b/src/components/telemetry/RegistryConsole.tsx) and the champion/challenger display on the
#   "Model Performance" page.
# INPUTS -> OUTPUT: logged metrics in MLflow -> a champion/held-back decision per model + (if promoted)
#   a registration into the Unity Catalog Model Registry with the alias "champion."
# HOW TO READ THE NUMBERS:
#   - champion = the model promoted to live use; challenger = a model that exists but did not win.
#   - "fail-closed" = a missing or borderline metric defaults to FAIL, never to pass.
#   - the anomaly gate uses the honest/affiliation thresholds; among passers it picks highest affiliation_f1.
#   - the RUL gate requires beating the naive baseline by a margin, a low enough "late rate," better PHM
#     than naive, and a passing leakage control; among passers it picks the SAFEST (lowest PHM).
# ===========================
import json
import mlflow
from mlflow.tracking import MlflowClient

EXPERIMENT_ID = "3740651530987773"
CATALOG, SCHEMA = "novendor_1", "telemetry"
client = MlflowClient()
mlflow.set_registry_uri("databricks-uc")   # Unity Catalog model registry

# Declared gates (must match train_anomaly.py).
# Track A: the anomaly promotion gate is now the honest/affiliation gate (range-aware + honest floor),
# fail-closed. Legacy point-adjusted F1 is kept for REFERENCE only (it inflates).
F1_GATE = 0.30  # reference only — NOT the gate
HONEST_GATE = {"f1_pointwise": 0.10, "event_recall": 0.50, "alarm_precision": 0.20, "affiliation_f1": 0.25}
RMSE_GATE = 25.0  # absolute cycles ceiling, kept

# RUL gate (PR-1): RMSE alone must NOT be able to promote a dangerous model. Conservative, declared
# thresholds — NOT tuned to force any model through. A RUL model is promotable only if it beats the
# strongest naive by a margin AND keeps the dangerous (late) mode in check AND clears the leakage control.
RUL_GATE = {
    "rmse_abs_max": RMSE_GATE,            # absolute ceiling (cycles)
    "max_rmse_ratio_vs_naive": 0.75,      # must beat strongest naive RMSE by >=25%
    "require_phm_better_than_naive": True,  # PHM must improve over naive (lower is better)
    "max_late_prediction_rate": 0.55,     # over-predicting remaining life is the unsafe mode
    "require_leakage_control_passed": True,
}


# Anomaly gate test: the detector must meet or beat EVERY honest threshold. One miss = held back.
def passes_honest_gate(m: dict) -> bool:
    """Fail-closed: every declared honest threshold must be met (missing metric -> 0 -> fail)."""
    return all(float(m.get(k, 0.0)) >= thr for k, thr in HONEST_GATE.items())


# RUL gate test: RMSE alone must NOT be able to promote a dangerous model. Each named check below is a
# safety condition; the model passes only if ALL of them are true. Returns the per-check breakdown that
# the Registry Console shows when explaining why a model passed or was held back.
def rul_gate_eval(m: dict) -> dict:
    """Fail-closed RUL gate. Reads metrics logged by train_rul.py. Missing metric -> fails that check."""
    rmse = float(m.get("rmse", 1e9))
    ratio = float(m.get("rul_model_vs_naive_rmse_ratio", 1e9))
    phm_improve = float(m.get("rul_phm_improvement", -1e9))   # naive_phm - model_phm (>0 = better)
    late_rate = float(m.get("rul_late_prediction_rate", 1.0))
    leak_ok = float(m.get("rul_leakage_control_passed", 0.0)) >= 1.0
    checks = {
        "rmse_under_abs_ceiling": rmse <= RUL_GATE["rmse_abs_max"],
        "beats_naive_rmse_by_margin": ratio <= RUL_GATE["max_rmse_ratio_vs_naive"],
        "phm_better_than_naive": (phm_improve > 0.0) if RUL_GATE["require_phm_better_than_naive"] else True,
        "late_rate_under_ceiling": late_rate <= RUL_GATE["max_late_prediction_rate"],
        "leakage_control_passed": leak_ok if RUL_GATE["require_leakage_control_passed"] else True,
    }
    return {"passed": all(checks.values()), "checks": checks,
            "rmse": rmse, "phm": float(m.get("phm", 0.0)), "late_rate": late_rate,
            "rmse_ratio_vs_naive": ratio, "phm_improvement": phm_improve}

# COMMAND ----------
# Pull the most recent MLflow run for each model name. The gate reads metrics from the tracking store,
# not from numbers passed by hand — so what gets gated is exactly what was logged during training.
def latest_run(run_name: str):
    runs = client.search_runs([EXPERIMENT_ID], filter_string=f"tags.mlflow.runName = '{run_name}'",
                              order_by=["attributes.start_time DESC"], max_results=1)
    return runs[0] if runs else None

names = ["anomaly_baseline_mad", "anomaly_pca_recon", "rul_linear_baseline", "rul_gbm"]
runs = {n: latest_run(n) for n in names}
for n, r in runs.items():
    if r is None:
        raise RuntimeError(f"no MLflow run found for {n}")
metrics = {n: dict(r.data.metrics) for n, r in runs.items()}
run_ids = {n: r.info.run_id for n, r in runs.items()}
print(json.dumps(metrics, indent=2))

# COMMAND ----------
# ---- Gate: anomaly (Track A). Fail-closed honest/affiliation gate; among models that CLEAR it, promote
# the one with the highest affiliation_f1 (range-aware). Legacy F1 is reported for reference only. ----
# Run both anomaly detectors through the gate; keep only the ones that cleared it; the champion is the
# eligible model with the best (highest) affiliation_f1. -> this choice is the champion on Model Performance.
anom_names = ["anomaly_baseline_mad", "anomaly_pca_recon"]
anom_pass = {n: passes_honest_gate(metrics[n]) for n in anom_names}
anom_eligible = [n for n in anom_names if anom_pass[n]]
if anom_eligible:
    anom_winner = max(anom_eligible, key=lambda n: float(metrics[n].get("affiliation_f1", 0.0)))
    anom_decision = "promoted"
else:
    # nothing clears the gate -> fail-closed; still name the best-affiliation model for the record.
    anom_winner = max(anom_names, key=lambda n: float(metrics[n].get("affiliation_f1", 0.0)))
    anom_decision = "model_not_promoted"
anom_aff_f1 = float(metrics[anom_winner].get("affiliation_f1", 0.0))
anom_f1 = float(metrics[anom_winner].get("f1", 0.0))  # legacy point-adjusted — reference only

# ---- Gate: RUL (PR-1). PHM-/late-rate-aware + beats-naive + leakage-control, fail-closed. Among models
# ---- that CLEAR the gate, promote the SAFEST (lowest PHM — i.e. least dangerous late behavior), then
# ---- lowest late-rate, then lowest RMSE. RMSE alone can no longer promote a model. ----
# Same for the RUL models: gate each one, keep the passers, and among passers promote the SAFEST
# (lowest PHM, then lowest late-rate, then lowest RMSE). A low RMSE on its own cannot win here.
rul_names = ["rul_linear_baseline", "rul_gbm"]
rul_eval = {n: rul_gate_eval(metrics[n]) for n in rul_names}
rul_eligible = [n for n in rul_names if rul_eval[n]["passed"]]
if rul_eligible:
    rul_winner = min(rul_eligible, key=lambda n: (rul_eval[n]["phm"], rul_eval[n]["late_rate"], rul_eval[n]["rmse"]))
    rul_decision = "promoted"
else:
    # Fail-closed: nothing clears the safety gate. Name the safest-by-PHM candidate for the record only.
    rul_winner = min(rul_names, key=lambda n: (rul_eval[n]["phm"], rul_eval[n]["rmse"]))
    rul_decision = "model_not_promoted"
rul_rmse = rul_eval[rul_winner]["rmse"]

print(f"anomaly winner={anom_winner} affiliation_f1={anom_aff_f1:.4f} (legacy f1={anom_f1:.4f} ref-only) "
      f"honest_gate={HONEST_GATE} -> {anom_decision}")
print(f"rul winner={rul_winner} rmse={rul_rmse:.4f} phm={rul_eval[rul_winner]['phm']:.1f} "
      f"late_rate={rul_eval[rul_winner]['late_rate']:.3f} gate={rul_eval[rul_winner]['checks']} -> {rul_decision}")

# COMMAND ----------
# Register promoted models to the Unity Catalog registry with an alias 'champion'.
# "Registering with alias champion" = stamping this exact trained model as the live one, so downstream
# jobs (like score_replay_feed.py) can load "@champion" and always get the promoted model.
def register(model_name: str, run_id: str, metric_tags: dict) -> dict:
    full = f"{CATALOG}.{SCHEMA}.{model_name}"
    try:
        client.create_registered_model(full)
    except Exception:
        pass  # already exists
    # Log a tiny model artifact reference: we register the run's URI as the source.
    mv = client.create_model_version(name=full, source=f"runs:/{run_id}/model", run_id=run_id)
    client.set_registered_model_alias(full, "champion", mv.version)
    for k, v in metric_tags.items():
        client.set_model_version_tag(full, mv.version, k, str(v))
    return {"registered_model": full, "version": mv.version, "alias": "champion"}

registry_status = {}
if anom_decision == "promoted":
    try:
        registry_status["anomaly"] = register(
            "tel_anomaly_detector", run_ids[anom_winner],
            {"affiliation_f1": anom_aff_f1, "f1_point_adjusted_reference": anom_f1,
             "gate": "honest", "selected_over": "pca" if anom_winner.endswith("mad") else "baseline"})
    except Exception as e:
        registry_status["anomaly"] = {"error": str(e)[:200], "note": "metrics logged; registry write failed"}
else:
    registry_status["anomaly"] = {"decision": "model_not_promoted", "f1": anom_f1}

if rul_decision == "promoted":
    try:
        registry_status["rul"] = register(
            "tel_rul_regressor", run_ids[rul_winner],
            {"rmse": rul_rmse, "phm": metrics[rul_winner].get("phm"),
             "late_prediction_rate": metrics[rul_winner].get("rul_late_prediction_rate"),
             "rmse_ratio_vs_naive": metrics[rul_winner].get("rul_model_vs_naive_rmse_ratio"),
             "leakage_control_passed": metrics[rul_winner].get("rul_leakage_control_passed"),
             "gate": "phm_late_naive_leakage", "selected_for": "lowest_phm_among_gate_passers"})
    except Exception as e:
        registry_status["rul"] = {"error": str(e)[:200], "note": "metrics logged; registry write failed"}
else:
    registry_status["rul"] = {"decision": "model_not_promoted", "rmse": rul_rmse,
                              "failed_checks": {n: [k for k, ok in rul_eval[n]["checks"].items() if not ok]
                                                for n in rul_names}}

# COMMAND ----------
result = {
    "run_ids": run_ids,
    "metrics": metrics,
    "gates": {"honest_gate": HONEST_GATE, "rmse_gate": RMSE_GATE, "f1_gate_reference_only": F1_GATE,
              "rul_gate": RUL_GATE},
    "anomaly": {"winner": anom_winner, "decision": anom_decision,
                "affiliation_f1": anom_aff_f1, "f1_point_adjusted_reference": anom_f1,
                "honest_gate_pass": anom_pass,
                "baseline_affiliation_f1": float(metrics["anomaly_baseline_mad"].get("affiliation_f1", 0.0)),
                "pca_affiliation_f1": float(metrics["anomaly_pca_recon"].get("affiliation_f1", 0.0))},
    "rul": {"winner": rul_winner, "rmse": rul_rmse, "decision": rul_decision,
            "gate_eval": rul_eval,
            "linear_rmse": metrics["rul_linear_baseline"]["rmse"],
            "gbm_rmse": metrics["rul_gbm"]["rmse"],
            "linear_phm": metrics["rul_linear_baseline"]["phm"],
            "gbm_phm": metrics["rul_gbm"]["phm"],
            "linear_late_rate": metrics["rul_linear_baseline"].get("rul_late_prediction_rate"),
            "gbm_late_rate": metrics["rul_gbm"].get("rul_late_prediction_rate"),
            "naive_rmse": metrics[rul_winner].get("rul_naive_rmse"),
            "leakage_control_passed": metrics[rul_winner].get("rul_leakage_control_passed")},
    "registry": registry_status,
}
dbutils.notebook.exit(json.dumps(result))
