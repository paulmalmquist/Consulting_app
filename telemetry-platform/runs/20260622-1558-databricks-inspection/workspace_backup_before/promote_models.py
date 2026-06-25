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

# Declared gates (must match architecture.md).
F1_GATE = 0.30
RMSE_GATE = 25.0

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
# ---- Gate: anomaly. Promote the higher-F1 model IF it clears the F1 gate. ----
anom_candidates = {
    "anomaly_baseline_mad": metrics["anomaly_baseline_mad"]["f1"],
    "anomaly_pca_recon": metrics["anomaly_pca_recon"]["f1"],
}
anom_winner = max(anom_candidates, key=anom_candidates.get)
anom_f1 = anom_candidates[anom_winner]
anom_decision = "promoted" if anom_f1 >= F1_GATE else "model_not_promoted"

# ---- Gate: RUL. Promote the lower-RMSE model IF it clears the RMSE gate. ----
rul_candidates = {
    "rul_linear_baseline": metrics["rul_linear_baseline"]["rmse"],
    "rul_gbm": metrics["rul_gbm"]["rmse"],
}
rul_winner = min(rul_candidates, key=rul_candidates.get)
rul_rmse = rul_candidates[rul_winner]
rul_decision = "promoted" if rul_rmse <= RMSE_GATE else "model_not_promoted"

print(f"anomaly winner={anom_winner} f1={anom_f1:.4f} gate>={F1_GATE} -> {anom_decision}")
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
            {"f1": anom_f1, "selected_over": "pca" if anom_winner.endswith("mad") else "baseline"})
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
    "gates": {"f1_gate": F1_GATE, "rmse_gate": RMSE_GATE},
    "anomaly": {"winner": anom_winner, "f1": anom_f1, "decision": anom_decision,
                "baseline_f1": metrics["anomaly_baseline_mad"]["f1"],
                "pca_f1": metrics["anomaly_pca_recon"]["f1"]},
    "rul": {"winner": rul_winner, "rmse": rul_rmse, "decision": rul_decision,
            "linear_rmse": metrics["rul_linear_baseline"]["rmse"],
            "gbm_rmse": metrics["rul_gbm"]["rmse"],
            "linear_phm": metrics["rul_linear_baseline"]["phm"],
            "gbm_phm": metrics["rul_gbm"]["phm"]},
    "registry": registry_status,
}
dbutils.notebook.exit(json.dumps(result))
