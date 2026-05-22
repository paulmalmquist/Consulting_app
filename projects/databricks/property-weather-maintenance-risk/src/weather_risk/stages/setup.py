"""Stage 00 — setup.

Local path: allocate the run_id and assemble the run_config payload.
Spark path: create/USE the target schema, set the MLflow experiment, and write
the initial run_config + empty source_status tables.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from ..config import WeatherRiskConfig


def new_run_id(prefix: str = "local") -> str:
    """Return a timestamp-based run id. Stable within a run, unique across runs."""
    return f"{prefix}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"


def run(config: WeatherRiskConfig, *, run_id: str | None = None) -> dict[str, Any]:
    """Local setup: allocate run_id and return setup context for later stages."""
    run_id = run_id or new_run_id()
    return {
        "run_id": run_id,
        "config": config,
        "catalog": config.catalog,
        "schema": config.schema,
        "started_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }


def run_spark(spark, dbutils, mlflow) -> dict[str, Any]:  # pragma: no cover - Databricks runtime
    """Databricks setup: schema bootstrap, MLflow experiment, run_config table."""
    run_id = str(uuid.uuid4())
    requested_catalog = dbutils.widgets.get("catalog")
    schema = dbutils.widgets.get("schema")
    experiment_name = dbutils.widgets.get("experiment_name")
    fallback_used = False
    error_message = None

    try:
        spark.sql(f"CREATE SCHEMA IF NOT EXISTS {requested_catalog}.{schema}")
        spark.sql(f"USE {requested_catalog}.{schema}")
        catalog = requested_catalog
    except Exception as exc:
        fallback_used = True
        error_message = (
            f"Requested catalog {requested_catalog} unavailable; fell back to "
            f"hive_metastore.{schema}: {type(exc).__name__}"
        )
        catalog = "hive_metastore"
        spark.sql(f"CREATE DATABASE IF NOT EXISTS {schema}")
        spark.sql(f"USE {schema}")

    mlflow.set_experiment(experiment_name)

    payload = {
        "run_id": run_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "started",
        "requested_catalog": requested_catalog,
        "catalog": catalog,
        "schema": schema,
        "fallback_used": fallback_used,
        "experiment_name": experiment_name,
        "synthetic_property_ops_enabled": dbutils.widgets.get("synthetic_property_ops_enabled"),
        "error_message": error_message,
    }
    spark.createDataFrame([payload]).write.mode("overwrite").option(
        "overwriteSchema", "true"
    ).saveAsTable("run_config")
    spark.createDataFrame(
        [],
        "run_id string, source_name string, source_url string, status string, "
        "error_message string, downloaded_at string",
    ).write.mode("overwrite").option("overwriteSchema", "true").saveAsTable("source_status")
    dbutils.jobs.taskValues.set(key="run_id", value=run_id)
    dbutils.jobs.taskValues.set(key="catalog", value=catalog)
    dbutils.jobs.taskValues.set(key="schema", value=schema)
    return payload
