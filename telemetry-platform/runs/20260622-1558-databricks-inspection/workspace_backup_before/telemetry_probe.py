# Databricks notebook source
import mlflow, sklearn, numpy as np, pandas as pd
spark.sql("SELECT 1")
n = spark.table("novendor_1.telemetry.gold_replay_feed").count()
with mlflow.start_run(run_name="telemetry_probe") as run:
    mlflow.log_param("probe", "true")
    mlflow.log_metric("replay_rows", float(n))
    rid = run.info.run_id
import json
dbutils.notebook.exit(json.dumps({"run_id": rid, "replay_rows": n,
    "sklearn": sklearn.__version__, "numpy": np.__version__}))
