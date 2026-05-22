# Databricks notebook source
# MAGIC %md
# MAGIC # 00 Setup (thin adapter)
# MAGIC Validates Databricks runtime, widgets, MLflow, and target namespace.
# MAGIC All business logic lives in `weather_risk.stages.setup`.

# COMMAND ----------

import os
import sys

# Make the repo's src/ importable from the deployed bundle.
_here = os.path.dirname(os.path.abspath("__file__")) if "__file__" not in dir() else os.path.dirname(__file__)
_src = os.path.normpath(os.path.join(_here, "..", "src"))
if _src not in sys.path:
    sys.path.insert(0, _src)

try:
    import mlflow
except Exception as exc:  # pragma: no cover - Databricks runtime path
    raise RuntimeError(f"MLflow unavailable: {exc}") from exc

try:
    dbutils.widgets.text("catalog", "main")
    dbutils.widgets.text("schema", "property_ops_risk_ml")
    dbutils.widgets.text("experiment_name", "/Shared/property_ops_weather_maintenance_risk_ml")
    dbutils.widgets.text("start_year", "2015")
    dbutils.widgets.text("end_year", "2025")
    dbutils.widgets.text("holdout_year", "2025")
    dbutils.widgets.text("event_types", "tornado,hail,thunderstorm wind,flash flood,flood,hurricane/typhoon,winter storm,wildfire,drought")
    dbutils.widgets.text("sample_frac", "1.0")
    dbutils.widgets.text("damage_threshold", "25000")
    dbutils.widgets.text("synthetic_property_ops_enabled", "true")
    dbutils.widgets.text("synthetic_property_count", "250")
    dbutils.widgets.text("synthetic_unit_count", "25000")
    dbutils.widgets.text("random_seed", "42")
except NameError as exc:
    raise RuntimeError("Databricks dbutils context is required for notebook execution.") from exc

# COMMAND ----------

from weather_risk.stages import setup

payload = setup.run_spark(spark, dbutils, mlflow)
display(payload)
