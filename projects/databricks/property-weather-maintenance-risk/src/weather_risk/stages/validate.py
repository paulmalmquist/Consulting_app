"""Stage 07 — validate and receipt.

Local path: explicit checks that every required output and chart exists and is
non-empty (Track E hardening). Spark path: confirms required tables are
non-empty and writes the run receipt table.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import WeatherRiskConfig
from ..contracts import DEMO_CAVEAT, REQUIRED_CHARTS, REQUIRED_OUTPUTS


def validate_output_dir(out_dir: Path) -> dict[str, Any]:
    """Track E: explicit required-output and chart checks. Fails closed.

    Returns an ok dict on success; raises RuntimeError listing every problem
    otherwise.
    """
    out_dir = Path(out_dir)
    missing_outputs = [name for name in REQUIRED_OUTPUTS if not (out_dir / name).exists()]
    missing_charts = [
        name for name in REQUIRED_CHARTS if not (out_dir / "charts" / name).exists()
    ]
    empty_charts = [
        name
        for name in REQUIRED_CHARTS
        if (out_dir / "charts" / name).exists()
        and (out_dir / "charts" / name).stat().st_size == 0
    ]
    empty_outputs = [
        name
        for name in REQUIRED_OUTPUTS
        if (out_dir / name).exists() and (out_dir / name).stat().st_size == 0
    ]
    problems = {
        "missing_outputs": missing_outputs,
        "missing_charts": missing_charts,
        "empty_charts": empty_charts,
        "empty_outputs": empty_outputs,
    }
    if any(problems.values()):
        raise RuntimeError(f"Output validation failed: {problems}")
    return {
        "ok": True,
        "required_outputs": len(REQUIRED_OUTPUTS),
        "required_charts": len(REQUIRED_CHARTS),
        "out_dir": str(out_dir),
    }


def run(config: WeatherRiskConfig, out_dir: Path) -> dict[str, Any]:
    """Local validate stage: assert the output directory satisfies the contract."""
    return validate_output_dir(out_dir)


def run_spark(spark, dbutils) -> dict[str, Any]:  # pragma: no cover - Databricks runtime
    """Databricks validate stage: check required tables and write run_receipt."""
    import json

    required_tables = [
        "gold_property_weather_ops_features",
        "gold_property_maintenance_risk_predictions",
        "model_metrics",
        "run_config",
        "source_status",
    ]
    rows = []
    for table in required_tables:
        count = spark.table(table).count()
        if count == 0:
            raise RuntimeError(f"Required table {table} is empty.")
        rows.append({"table": table, "row_count": count})

    receipt = {
        "status": "success",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "tables_json": json.dumps(rows),
        "caveat": DEMO_CAVEAT,
        "claim_allowed": (
            "Databricks ML training run executed on public weather and "
            "synthetic property operations data."
        ),
        "claim_not_allowed": "Production HappyCo model trained/deployed.",
    }
    spark.createDataFrame([receipt]).write.mode("overwrite").saveAsTable("run_receipt")
    return receipt
