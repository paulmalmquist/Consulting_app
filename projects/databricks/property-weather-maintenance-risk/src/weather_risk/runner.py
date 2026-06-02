"""Pipeline runner — chains the local-path stages into one run.

`run_pipeline(config)` is the package entrypoint for a local (no Spark) run. It
carries a single `run_id` through setup -> ingest -> property_ops -> clean ->
features -> train -> score -> validate, fails closed on any stage error, and
writes the full REQUIRED_OUTPUTS + REQUIRED_CHARTS contract to `out_dir`.

Parity contract: the bytes written here for `gold_*.csv` and
`model_metrics.json` must match the captured baseline. `pipeline.generate_local_outputs`
delegates to this function so the legacy import surface stays behavior-identical.
"""
from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import DEFAULT_CONFIG, WeatherRiskConfig
from .contracts import DEMO_CAVEAT, REQUIRED_CHARTS, REQUIRED_OUTPUTS
from .stages import clean, features, ingest, property_ops, score, setup, train, validate


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = sorted({key for row in rows for key in row})
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_minimal_png(path: Path) -> None:
    # A valid 1x1 transparent PNG. Databricks notebooks replace this with real charts.
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
            "0000000a49444154789c6360000002000100ff0ff30d0000000049454e44ae426082"
        )
    )


# Stages the local runner executes, in order. Setup/clean/validate are handled
# inline because they are pass-through or terminal in the local path.
LOCAL_STAGE_SEQUENCE = ("setup", "ingest", "property_ops", "clean", "features", "train", "score", "validate")


def run_stage(stage_name: str, config: WeatherRiskConfig, out_dir: Path) -> Any:
    """Run a single named local-path stage in isolation (for `--stage`).

    Builds whatever upstream state the requested stage needs, then runs it. Used
    by the CLI for targeted debugging; the full run goes through `run_pipeline`.
    """
    if stage_name not in LOCAL_STAGE_SEQUENCE:
        raise ValueError(
            f"Unknown stage '{stage_name}'. Valid stages: {', '.join(LOCAL_STAGE_SEQUENCE)}"
        )
    ctx = setup.run(config)
    run_id = ctx["run_id"]
    if stage_name == "setup":
        return ctx
    if stage_name == "ingest":
        return ingest.run(config, run_id)
    dataset = property_ops.run(config)
    if stage_name == "property_ops":
        return {"tables": list(dataset.keys()), "row_counts": {k: len(v) for k, v in dataset.items()}}
    dataset = clean.run(config, dataset)
    if stage_name == "clean":
        return {"status": "standardized", "tables": list(dataset.keys())}
    feature_rows = features.run(config, dataset, run_id)
    if stage_name == "features":
        return {"feature_rows": len(feature_rows)}
    if stage_name == "train":
        return train.run(config, feature_rows, run_id)
    prediction_rows = score.run(config, feature_rows, run_id)
    if stage_name == "score":
        return {"prediction_rows": len(prediction_rows)}
    # validate: needs a fully materialized output dir.
    return run_pipeline(config, out_dir=out_dir)


def run_pipeline(
    config: WeatherRiskConfig = DEFAULT_CONFIG,
    *,
    out_dir: Path | str,
) -> dict[str, Any]:
    """Run the full local pipeline and write the REQUIRED_OUTPUTS contract.

    Fails closed: any stage exception aborts the run. The same `run_id` (built
    by the setup stage) flows through every output.
    """
    out_dir = Path(out_dir)

    # --- setup ---
    ctx = setup.run(config)
    run_id = ctx["run_id"]

    # --- ingest (local: source_status rows) ---
    source_status = ingest.run(config, run_id)

    # --- property_ops (generate synthetic dataset) ---
    dataset = property_ops.run(config)

    # --- clean (pass-through for synthetic data) ---
    dataset = clean.run(config, dataset)

    # ingest stage left rows_read None; fill it now that the dataset exists.
    for row in source_status:
        if row["source_name"] == "synthetic_property_ops":
            row["rows_read"] = sum(len(value) for value in dataset.values())

    # --- features ---
    feature_rows = features.run(config, dataset, run_id)

    # --- train (leakage guard + metric block) ---
    metrics = train.run(config, feature_rows, run_id)

    # --- score ---
    prediction_rows = score.run(config, feature_rows, run_id)

    # Write gold tables.
    _write_csv(out_dir / "gold_property_weather_ops_features.csv", feature_rows)
    _write_csv(out_dir / "gold_property_maintenance_risk_predictions.csv", prediction_rows)
    _write_json(out_dir / "model_metrics.json", metrics)

    # Write run_config + source_status.
    run_config = {
        "run_id": run_id,
        "started_at": _utc_now(),
        "completed_at": _utc_now(),
        "status": "local_contract_success",
        "catalog": config.catalog,
        "schema": config.schema,
        "start_year": config.start_year,
        "end_year": config.end_year,
        "holdout_year": config.holdout_year,
        "event_types": list(config.event_types),
        "sample_frac": config.sample_frac,
        "damage_threshold": config.damage_threshold,
        "synthetic_property_ops_enabled": config.synthetic_property_ops_enabled,
        "synthetic_property_count": config.synthetic_property_count,
        "synthetic_unit_count": config.synthetic_unit_count,
        "experiment_name": config.experiment_name,
        "databricks_job_run_id": None,
        "error_message": None,
    }
    _write_json(out_dir / "run_config.json", run_config)
    _write_json(out_dir / "source_status.json", source_status)

    # Charts + manifest. Track E: each manifest entry records source table + row count.
    chart_dir = out_dir / "charts"
    manifest = []
    for chart in REQUIRED_CHARTS:
        path = chart_dir / chart
        _write_minimal_png(path)
        manifest.append(
            {
                "artifact_name": chart,
                "source_table": "gold_property_weather_ops_features",
                "row_count_used": len(feature_rows),
                "created_at": _utc_now(),
                "path": str(path),
                "synthetic_data_flag": True,
            }
        )
    _write_json(out_dir / "artifact_manifest.json", manifest)

    # Run receipt. Track E: explicit synthetic-data disclaimer block.
    receipt = "\n".join(
        [
            "# Property Weather Maintenance Risk Run Receipt",
            "",
            "Status: local_contract_success",
            f"Run ID: {run_id}",
            "",
            "## Claim Boundary",
            "",
            "Local contract outputs generated from deterministic synthetic property operations data.",
            "This is not a Databricks execution receipt.",
            "",
            "## Caveat",
            "",
            DEMO_CAVEAT,
            "",
            "## Outputs",
            "",
            f"- Feature rows: {len(feature_rows)}",
            f"- Prediction rows: {len(prediction_rows)}",
            f"- Chart artifacts: {len(manifest)}",
            "",
        ]
    )
    (out_dir / "run_receipt.md").write_text(receipt, encoding="utf-8")

    # --- validate (Track E: explicit required-output checks) ---
    validate.run(config, out_dir)

    return {
        "ok": True,
        "run_id": run_id,
        "out_dir": str(out_dir),
        "required_outputs": REQUIRED_OUTPUTS,
    }
