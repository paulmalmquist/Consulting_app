# Databricks notebook source
# MAGIC %md
# MAGIC # Telemetry — score the deterministic replay feed with the promoted anomaly model
# MAGIC Loads the champion anomaly model from the Unity Catalog registry, scores the fixed T-1 replay
# MAGIC sequence, and writes gold_replay_feed_scored: the same ordered ticks with the model's score +
# MAGIC predicted flag ALONGSIDE the NASA label. Deterministic (same input, same model -> same output).
# MAGIC The flag the demo flips on is the model's output, not a hand-authored value.

# COMMAND ----------
import json
import numpy as np
import pandas as pd
import mlflow

CATALOG, SCHEMA = "novendor_1", "telemetry"
TEL = f"{CATALOG}.{SCHEMA}"
mlflow.set_registry_uri("databricks-uc")

# COMMAND ----------
feed = spark.table(f"{TEL}.gold_replay_feed").toPandas().sort_values("t").reset_index(drop=True)
print("replay feed rows", len(feed), "label anomaly ticks", int(feed.is_anomaly.sum()))

# Load the promoted MAD detector (champion). It expects columns chan_id, value, value_rmean50.
model = mlflow.pyfunc.load_model(f"models:/{TEL}.tel_anomaly_detector@champion")
pred = np.asarray(model.predict(feed[["chan_id", "value", "value_rmean50"]])).astype(int)
feed["model_pred"] = pred

# A continuous score for the trace overlay = standardized residual (the quantity the rule thresholds).
resid = (feed["value"] - feed["value_rmean50"]).abs()
scale = resid.median() or 1.0
feed["anomaly_score"] = (resid / scale).round(6)

# COMMAND ----------
sdf = spark.createDataFrame(
    feed[["chan_id", "spacecraft", "t", "value", "value_rmean50", "anomaly_score",
          "model_pred", "is_anomaly"]]
)
sdf.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{TEL}.gold_replay_feed_scored")
spark.sql(f"COMMENT ON TABLE {TEL}.gold_replay_feed_scored IS "
          f"'Gold: deterministic T-1 replay feed scored by the promoted champion anomaly model "
          f"(tel_anomaly_detector@champion). model_pred is the model output; is_anomaly is the NASA "
          f"label. The demo flips on model_pred, not a hand-authored flag. Telemetry Platform.'")

# COMMAND ----------
# Determinism + agreement evidence: first model-fired tick, and overlap with the labeled region.
fired = feed.index[feed.model_pred == 1].tolist()
first_fire = int(feed.loc[fired[0], "t"]) if fired else None
agree = int(((feed.model_pred == 1) & (feed.is_anomaly == 1)).sum())
result = {
    "rows": int(len(feed)),
    "label_anomaly_ticks": int(feed.is_anomaly.sum()),
    "model_fired_ticks": int(feed.model_pred.sum()),
    "first_model_fire_t": first_fire,
    "model_label_agreement_ticks": agree,
    "champion": f"{TEL}.tel_anomaly_detector@champion",
}
dbutils.notebook.exit(json.dumps(result))
