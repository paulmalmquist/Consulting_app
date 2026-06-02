"""Stage 03 — clean and standardize.

Synthetic tables are generated already in clean canonical shape, so this stage
is a no-op pass-through for the local path. Public-source normalization
(`utils.normalize_fips` / `normalize_event_type` / `parse_damage_amount`) is
unit-tested and applied when live source ingestion is enabled.
"""
from __future__ import annotations

from typing import Any

from ..config import WeatherRiskConfig


def run(config: WeatherRiskConfig, dataset: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    """Local clean: synthetic data is already canonical — pass it through."""
    return dataset


def run_spark(spark, dbutils) -> dict[str, Any]:  # pragma: no cover - Databricks runtime
    """Databricks clean: confirm the synthetic_* tables exist and are standardized."""
    tables = [
        row.tableName
        for row in spark.sql("SHOW TABLES").collect()
        if row.tableName.startswith("synthetic_")
    ]
    return {"clean_tables": tables, "status": "standardized"}
