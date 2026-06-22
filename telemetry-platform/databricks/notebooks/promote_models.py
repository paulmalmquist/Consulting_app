# Databricks notebook source
# MAGIC %md
# MAGIC # Telemetry — promotion gates + Model Registry
# MAGIC Reads the logged metrics from MLflow (not hand-passed numbers), applies the declared gates,
# MAGIC registers passing models to the Unity Catalog Model Registry, and records held-back models
# MAGIC honestly. This is the operated-platform step: the gate is enforced against the tracking store.

# COMMAND ----------
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
RMSE_GATE = 25.0


def passes_honest_gate(m: dict) -> bool:
    """Fail-closed: every declared honest threshold must be met (missing metric -> 0 -> fail)."""
    return all(float(m.get(k, 0.0)) >= thr for k, thr in HONEST_GATE.items())

# COMMAND ----------
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

# ---- Gate: RUL. Promote the lower-RMSE model IF it clears the RMSE gate. ----
rul_candidates = {
    "rul_linear_baseline": metrics["rul_linear_baseline"]["rmse"],
    "rul_gbm": metrics["rul_gbm"]["rmse"],
}
rul_winner = min(rul_candidates, key=rul_candidates.get)
rul_rmse = rul_candidates[rul_winner]
rul_decision = "promoted" if rul_rmse <= RMSE_GATE else "model_not_promoted"

print(f"anomaly winner={anom_winner} affiliation_f1={anom_aff_f1:.4f} (legacy f1={anom_f1:.4f} ref-only) "
      f"honest_gate={HONEST_GATE} -> {anom_decision}")
print(f"rul winner={rul_winner} rmse={rul_rmse:.4f} gate<={RMSE_GATE} -> {rul_decision}")

# COMMAND ----------
# Register promoted models to the Unity Catalog registry with an alias 'champion'.
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
            {"rmse": rul_rmse, "phm": metrics[rul_winner].get("phm")})
    except Exception as e:
        registry_status["rul"] = {"error": str(e)[:200], "note": "metrics logged; registry write failed"}
else:
    registry_status["rul"] = {"decision": "model_not_promoted", "rmse": rul_rmse}

# COMMAND ----------
result = {
    "run_ids": run_ids,
    "metrics": metrics,
    "gates": {"honest_gate": HONEST_GATE, "rmse_gate": RMSE_GATE, "f1_gate_reference_only": F1_GATE},
    "anomaly": {"winner": anom_winner, "decision": anom_decision,
                "affiliation_f1": anom_aff_f1, "f1_point_adjusted_reference": anom_f1,
                "honest_gate_pass": anom_pass,
                "baseline_affiliation_f1": float(metrics["anomaly_baseline_mad"].get("affiliation_f1", 0.0)),
                "pca_affiliation_f1": float(metrics["anomaly_pca_recon"].get("affiliation_f1", 0.0))},
    "rul": {"winner": rul_winner, "rmse": rul_rmse, "decision": rul_decision,
            "linear_rmse": metrics["rul_linear_baseline"]["rmse"],
            "gbm_rmse": metrics["rul_gbm"]["rmse"],
            "linear_phm": metrics["rul_linear_baseline"]["phm"],
            "gbm_phm": metrics["rul_gbm"]["phm"]},
    "registry": registry_status,
}
dbutils.notebook.exit(json.dumps(result))
