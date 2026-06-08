#!/usr/bin/env python3
"""Export weather-risk pipeline outputs into the HappyCo site artifact contract.

Reads the local-contract / Databricks pipeline outputs from ``--source`` and writes
the JSON + chart bundle the HappyCo site consumes from
``repo-b/public/happyco/weather-risk/latest/``.

The property-operations layer is synthetic, modeled after multifamily
inspection/work-order workflows and enriched with public NOAA/FEMA hazard concepts.
It is not HappyCo production data. This script never invents metrics and never
fabricates charts from empty data; missing inputs fail loudly.

Usage:
    python scripts/export_for_happyco_site.py \
        --source artifacts/happyco/weather-risk \
        --out repo-b/public/happyco/weather-risk/latest \
        [--job-id <id>] [--run-id <id>] [--run-url <url>]

When --run-id is supplied the receipt is marked a live Databricks run; otherwise it
is marked a local fallback export.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import shutil
from pathlib import Path

DISCLAIMER = (
    "Synthetic property-operations layer modeled after multifamily "
    "inspection/work-order workflows, enriched with real NOAA/FEMA public hazard "
    "data. Not HappyCo production data."
)

SOURCE_PREDICTIONS = "gold_property_maintenance_risk_predictions.csv"
SOURCE_FEATURES = "gold_property_weather_ops_features.csv"
SOURCE_MODEL_METRICS = "model_metrics.json"
REQUIRED_SOURCE = [SOURCE_PREDICTIONS, SOURCE_FEATURES, SOURCE_MODEL_METRICS]

# Charts surfaced on the site (a subset of the 12 the pipeline produces).
SITE_CHARTS = [
    "weather_ops_risk_by_market.png",
    "property_maintenance_surge_top_50.png",
    "inspection_failure_risk_by_asset_age.png",
    "make_ready_delay_risk_by_market.png",
    "feature_importance.png",
    "actual_vs_predicted_damage.png",
]

HIGH_RISK_THRESHOLD = 0.70
TOP_RISK_COUNT = 20

CLAIM_NOT_ALLOWED = [
    "real HappyCo production data was used",
    "a production HappyCo model was trained",
    "a production model serving endpoint was deployed",
    "a production deployment occurred",
]


def _read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _f(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _i(value, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _flag(value) -> bool:
    return str(value).strip().lower() in {"1", "1.0", "true", "yes"}


def _require_source(source: Path) -> None:
    if not source.exists():
        raise SystemExit(f"export_for_happyco_site: --source dir does not exist: {source}")
    missing = [name for name in REQUIRED_SOURCE if not (source / name).exists()]
    if missing:
        raise SystemExit(
            f"export_for_happyco_site: missing required source files in {source}: {missing}"
        )


def build_kpis(predictions: list[dict], features: list[dict], model_metrics: list[dict]) -> dict:
    n_props = len(predictions)
    units = sum(_i(row.get("unit_count")) for row in features)
    high_risk = sum(1 for row in predictions if _f(row.get("risk_score")) >= HIGH_RISK_THRESHOLD)
    surge = sum(1 for row in predictions if _flag(row.get("work_order_surge_prediction")))
    markets = sorted({row.get("market") for row in predictions if row.get("market")})
    best = next((m for m in model_metrics if m.get("is_best")), model_metrics[0] if model_metrics else {})
    return {
        "properties_analyzed": n_props,
        "units_analyzed": units,
        "markets_analyzed": len(markets),
        "high_risk_properties": high_risk,
        "high_risk_threshold": HIGH_RISK_THRESHOLD,
        "predicted_maintenance_surge_rate": round(surge / n_props, 4) if n_props else None,
        "best_model": best.get("model_name"),
        "model_metric_name": best.get("metric_name"),
        "model_metric_value": best.get("metric_value"),
        "model_metric_honesty_warning": best.get("metric_honesty_warning"),
        "disclaimer": DISCLAIMER,
    }


def _recommended_action(row: dict) -> str:
    options = [
        (_f(row.get("work_order_surge_probability")),
         "Pre-stage maintenance crews for a likely 14-day work-order surge."),
        (_f(row.get("inspection_failure_probability")),
         "Schedule a pre-emptive inspection to head off a likely failure."),
        (_f(row.get("resident_impact_probability")),
         "Prioritize resident-impact mitigation and proactive outreach."),
    ]
    options.sort(key=lambda item: item[0], reverse=True)
    return options[0][1]


def build_top_property_risks(predictions: list[dict]) -> dict:
    ranked = sorted(predictions, key=lambda row: _i(row.get("risk_rank"), 10 ** 9))[:TOP_RISK_COUNT]
    rows = [
        {
            "property_id": row.get("property_id"),
            "market": row.get("market"),
            "state": row.get("state"),
            "county_fips": row.get("county_fips"),
            "risk_rank": _i(row.get("risk_rank")),
            "risk_score": _f(row.get("risk_score")),
            "work_order_surge_probability": _f(row.get("work_order_surge_probability")),
            "inspection_failure_probability": _f(row.get("inspection_failure_probability")),
            "make_ready_delay_prediction_days": _f(row.get("make_ready_delay_prediction_days")),
            "resident_impact_probability": _f(row.get("resident_impact_probability")),
            "recommended_action": _recommended_action(row),
        }
        for row in ranked
    ]
    return {"count": len(rows), "rows": rows, "disclaimer": DISCLAIMER}


def build_market_summary(predictions: list[dict]) -> dict:
    by_market: dict[str, list[dict]] = {}
    for row in predictions:
        by_market.setdefault(row.get("market") or "Unknown", []).append(row)
    markets = []
    for market, rows in by_market.items():
        n = len(rows)
        markets.append({
            "market": market,
            "property_count": n,
            "avg_risk_score": round(sum(_f(r.get("risk_score")) for r in rows) / n, 4),
            "high_risk_properties": sum(
                1 for r in rows if _f(r.get("risk_score")) >= HIGH_RISK_THRESHOLD
            ),
            "avg_make_ready_delay_days": round(
                sum(_f(r.get("make_ready_delay_prediction_days")) for r in rows) / n, 2
            ),
            "avg_work_order_surge_probability": round(
                sum(_f(r.get("work_order_surge_probability")) for r in rows) / n, 4
            ),
        })
    markets.sort(key=lambda m: m["avg_risk_score"], reverse=True)
    return {"markets": markets, "disclaimer": DISCLAIMER}


def copy_charts(source: Path, out: Path) -> list[dict]:
    charts_out = out / "charts"
    charts_out.mkdir(parents=True, exist_ok=True)
    manifest = []
    for name in SITE_CHARTS:
        src = source / "charts" / name
        available = src.exists() and src.stat().st_size > 0
        if available:
            shutil.copyfile(src, charts_out / name)
        manifest.append({
            "artifact_name": name,
            "path": f"charts/{name}",
            "available": available,
            "source_table": "gold_property_weather_ops_features",
            "synthetic_data_flag": True,
            "caveat": DISCLAIMER,
        })
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Export weather-risk outputs for the HappyCo site.")
    parser.add_argument("--source", type=Path, required=True, help="Pipeline output directory.")
    parser.add_argument("--out", type=Path, required=True, help="Site artifact directory to write.")
    parser.add_argument("--job-id", default=None, help="Databricks job ID, if a live run produced --source.")
    parser.add_argument("--run-id", default=None, help="Databricks run ID, if a live run produced --source.")
    parser.add_argument("--run-url", default=None, help="Databricks run URL, if available.")
    args = parser.parse_args()

    source: Path = args.source.resolve()
    out: Path = args.out.resolve()
    _require_source(source)

    predictions = _read_csv(source / SOURCE_PREDICTIONS)
    features = _read_csv(source / SOURCE_FEATURES)
    model_metrics = json.loads((source / SOURCE_MODEL_METRICS).read_text(encoding="utf-8"))
    if not predictions or not features:
        raise SystemExit("export_for_happyco_site: source prediction/feature tables are empty.")

    out.mkdir(parents=True, exist_ok=True)
    generated_at = dt.datetime.now(dt.timezone.utc).isoformat()
    live = bool(args.run_id)

    receipt = {
        "mode": "live" if live else "local_fallback",
        "status": "databricks_run" if live else "local_contract_export",
        "generated_at": generated_at,
        "job_id": args.job_id,
        "run_id": args.run_id,
        "run_url": args.run_url,
        "source_dir": str(source),
        "row_counts": {"feature_rows": len(features), "prediction_rows": len(predictions)},
        "disclaimer": DISCLAIMER,
        "claim_allowed": (
            "Databricks ML training run executed on public weather and synthetic "
            "property operations data."
            if live
            else "Databricks-ready modular weather-risk pipeline with a locally "
            "exported sample bundle."
        ),
        "claim_not_allowed": CLAIM_NOT_ALLOWED,
    }

    chart_manifest = copy_charts(source, out)
    writes = {
        "run_receipt.json": receipt,
        "kpis.json": build_kpis(predictions, features, model_metrics),
        "top_property_risks.json": build_top_property_risks(predictions),
        "market_summary.json": build_market_summary(predictions),
        "model_metrics.json": {"models": model_metrics, "disclaimer": DISCLAIMER},
        "artifact_manifest.json": {
            "charts": chart_manifest,
            "json_artifacts": [
                "run_receipt.json", "kpis.json", "top_property_risks.json",
                "market_summary.json", "model_metrics.json", "artifact_manifest.json",
            ],
            "disclaimer": DISCLAIMER,
        },
    }
    for name, payload in writes.items():
        (out / name).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    missing_charts = [c["artifact_name"] for c in chart_manifest if not c["available"]]
    print(json.dumps({
        "ok": True,
        "out": str(out),
        "mode": receipt["mode"],
        "json_written": sorted(writes),
        "charts_copied": [c["artifact_name"] for c in chart_manifest if c["available"]],
        "charts_missing": missing_charts,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
