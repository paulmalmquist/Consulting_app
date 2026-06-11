#!/usr/bin/env python3
"""Export the factory-ml dashboard JSON from gold tables + MLflow.

Serving path decision: static, committed JSON. The seed is deterministic and
the medallion rebuilds from a pinned manifest sha, so the exports diff cleanly
in review; a live Databricks read path adds a deploy and a failure mode a demo
does not need (documented follow-up: backend/app/data/databricks_source.py).

Writes repo-b/public/labs/factory-ml/:
  readiness.json            per-vehicle rollup (VEH-TR-003 anchor preserved)
  layer_heatmap.json        run x layer-window z-scores, SCN-005 pair included
  feature_importance.json   SHAP top drivers + headline metrics from MLflow
  model_registry.json       seed registry (champion/challenger) + the real run
  ncr_clusters.json         defect-code clusters with trends and exemplars
  train_metadata.json       provenance: run id, build sha, row counts
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from databricks_client import RsFactoryClient

OUT_DIR = Path(__file__).resolve().parents[3] / "repo-b" / "public" / "labs" / "factory-ml"
HEATMAP_RUNS = 40


def write(name: str, payload: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    path.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"  wrote {path.name} ({path.stat().st_size:,} bytes)")


def export_readiness(client: RsFactoryClient) -> None:
    rows = client.sql_dicts(
        f"SELECT * FROM {client.qualified_schema}.gold_readiness_summary ORDER BY vehicle_id"
    )
    write("readiness.json", {
        "anchor_vehicle": "VEH-TR-003",
        "vehicles": [{
            "vehicle_id": r["vehicle_id"],
            "vehicle_name": r["vehicle_name"],
            "target_launch_date": r["target_launch_date"],
            "status": r["status_hint"],
            "readiness_score": float(r["readiness_score"]),
            "open_ncrs": int(r["open_ncr_count"]),
            "scenario_open_ncrs": int(r["scenario_open_ncr_count"]),
            "inconclusive_tests": int(r["inconclusive_test_count"]),
            "unresolved_anomalies": int(r["unresolved_anomaly_count"]),
            "missing_signoffs": int(r["missing_inspection_signoff_count"]),
        } for r in rows],
    })


def export_heatmap(client: RsFactoryClient) -> None:
    q = client.qualified_schema
    runs = client.sql_dicts(f"""
        WITH ranked AS (
          SELECT run_id, MAX(ABS(std_z)) AS peak, MAX(pattern) AS pattern,
                 MAX(scenario_id) AS scenario_id,
                 (MAX(scenario_id) = 'SCN-005-HOTFIRE-ANOMALY-SIMILARITY') AS anchor
          FROM {q}.gold_layer_heatmap GROUP BY run_id
        )
        SELECT run_id FROM ranked
        ORDER BY anchor DESC, peak DESC LIMIT {HEATMAP_RUNS}
    """)
    run_ids = ", ".join(f"'{r['run_id']}'" for r in runs)
    cells = client.sql_dicts(f"""
        SELECT run_id, window_index, ROUND(std_z, 4) AS std_z, pattern, scenario_id
        FROM {q}.gold_layer_heatmap WHERE run_id IN ({run_ids})
        ORDER BY run_id, window_index
    """)
    by_run: dict[str, dict] = {}
    for c in cells:
        entry = by_run.setdefault(c["run_id"], {
            "run_id": c["run_id"], "pattern": c["pattern"],
            "scenario_id": c["scenario_id"], "cells": [],
        })
        entry["cells"].append({"w": int(c["window_index"]), "z": float(c["std_z"] or 0)})
    write("layer_heatmap.json", {
        "anchor_pair": ["TEST-HOTFIRE-2026-00041", "TEST-HOTFIRE-2026-00088"],
        "runs": sorted(by_run.values(), key=lambda r: r["run_id"]),
    })


def export_training(client: RsFactoryClient) -> dict:
    exp_id = client.ensure_experiment()
    run = client.latest_run(
        exp_id, "attributes.run_name = 'rs_print_quality_v1' and attributes.status = 'FINISHED'"
    )
    if not run:
        raise RuntimeError("no finished rs_print_quality_v1 run - run the training notebook first")
    info = run["info"]
    metrics = {m["key"]: m["value"] for m in run["data"].get("metrics", [])}
    params = {p["key"]: p["value"] for p in run["data"].get("params", [])}
    # Drivers come from the gold table the notebook writes (this workspace
    # blocks DBFS artifact download, so tables are the one serving path).
    driver_rows = client.sql_dicts(
        f"SELECT model, method, rank, feature, impact "
        f"FROM {client.qualified_schema}.gold_feature_importance "
        f"WHERE run_id = '{info['run_id']}' ORDER BY model, rank"
    )
    drivers: dict[str, list] = {}
    methods: dict[str, str] = {}
    for row in driver_rows:
        drivers.setdefault(row["model"], []).append(
            {"feature": row["feature"], "impact": float(row["impact"])})
        methods[row["model"]] = row["method"]
    write("feature_importance.json", {
        "run_id": info["run_id"],
        "drivers": drivers,
        "driver_methods": methods,
        "headline_metrics": {
            k: round(v, 4) for k, v in metrics.items() if k.startswith("mean_")
        },
        "params": params,
    })
    return {"run_id": info["run_id"], "metrics": metrics, "params": params}


def export_registry(client: RsFactoryClient, training: dict) -> None:
    q = client.qualified_schema
    versions = client.sql_dicts(f"""
        SELECT model_key, version, is_champion, stage, primary_metric,
               primary_metric_value, eval_metrics_json, training_rows,
               model_card_summary
        FROM {q}.bronze_dim_model_version ORDER BY model_key, version
    """)
    models: dict[str, dict] = {}
    for v in versions:
        m = models.setdefault(v["model_key"], {"model_key": v["model_key"], "versions": []})
        entry = {
            "version": int(v["version"]),
            "stage": v["stage"],
            "is_champion": str(v["is_champion"]).lower() == "true",
            "primary_metric": v["primary_metric"],
            "primary_metric_value": float(v["primary_metric_value"]),
            "eval_metrics": json.loads(v["eval_metrics_json"] or "{}"),
            "training_rows": int(v["training_rows"]),
            "model_card_summary": v["model_card_summary"],
        }
        m["versions"].append(entry)
        if entry["is_champion"]:
            m["champion"] = entry
    write("model_registry.json", {
        "seed_registry": sorted(models.values(), key=lambda m: m["model_key"]),
        "live_mlflow_run": {
            "run_id": training["run_id"],
            "experiment": client.experiment_path,
            "registered_models": [f"{q}.rs_print_strength", f"{q}.rs_print_passfail",
                                  f"{q}.rs_run_failure"],
            "headline_metrics": {
                k: round(v, 4) for k, v in training["metrics"].items() if k.startswith("mean_")
            },
        },
    })


def export_ncr_clusters(client: RsFactoryClient) -> None:
    q = client.qualified_schema
    clusters = client.sql_dicts(f"""
        SELECT defect_code,
               COUNT(*) AS n,
               SUM(CASE WHEN status IN ('open', 'in_review') THEN 1 ELSE 0 END) AS open_n,
               ROUND(AVG(DATEDIFF(COALESCE(closed_date, CURRENT_DATE()), opened_date)), 1) AS avg_age_days
        FROM {q}.bronze_raw_qms_ncrs GROUP BY defect_code ORDER BY n DESC
    """)
    trends = client.sql_dicts(f"""
        SELECT defect_code, SUBSTRING(opened_date, 1, 7) AS month, COUNT(*) AS n
        FROM {q}.bronze_raw_qms_ncrs GROUP BY defect_code, month ORDER BY month
    """)
    exemplars = client.sql_dicts(f"""
        SELECT defect_code, ncr_id, part_id, disposition, status, opened_date,
               ROW_NUMBER() OVER (PARTITION BY defect_code ORDER BY opened_date DESC) AS rn
        FROM {q}.bronze_raw_qms_ncrs QUALIFY rn <= 3
    """)
    trend_map: dict[str, list] = {}
    for t in trends:
        trend_map.setdefault(t["defect_code"], []).append(
            {"month": t["month"], "n": int(t["n"])})
    ex_map: dict[str, list] = {}
    for e in exemplars:
        ex_map.setdefault(e["defect_code"], []).append({
            "ncr_id": e["ncr_id"], "part_id": e["part_id"],
            "disposition": e["disposition"], "status": e["status"],
            "opened_date": e["opened_date"],
        })
    write("ncr_clusters.json", {
        "clusters": [{
            "defect_code": c["defect_code"],
            "n": int(c["n"]),
            "open_n": int(c["open_n"]),
            "avg_age_days": float(c["avg_age_days"] or 0),
            "trend": trend_map.get(c["defect_code"], []),
            "exemplars": ex_map.get(c["defect_code"], []),
        } for c in clusters],
    })


def export_metadata(client: RsFactoryClient, training: dict) -> None:
    q = client.qualified_schema
    build_sha = client.sql_scalar(f"SELECT MAX(_build_sha) FROM {q}.bronze_raw_test_runs")
    counts = client.sql_dicts(f"""
        SELECT 'gold_print_quality_train' AS t, COUNT(*) AS n FROM {q}.gold_print_quality_train
        UNION ALL SELECT 'silver_layer_features', COUNT(*) FROM {q}.silver_layer_features
        UNION ALL SELECT 'bronze_raw_iot_telemetry_samples', COUNT(*) FROM {q}.bronze_raw_iot_telemetry_samples
    """)
    write("train_metadata.json", {
        "mlflow_run_id": training["run_id"],
        "mlflow_experiment": client.experiment_path,
        "seed_build_sha": build_sha,
        "schema": q,
        "row_counts": {c["t"]: int(c["n"]) for c in counts},
        "target_note": "min_strength_margin is a tolerance-margin stand-in for tensile strength (synthetic seed)",
    })


def main() -> int:
    client = RsFactoryClient()
    client.start_warehouse()
    client.wait_for_warehouse()
    print(f"exporting to {OUT_DIR}")
    export_readiness(client)
    export_heatmap(client)
    training = export_training(client)
    export_registry(client, training)
    export_ncr_clusters(client)
    export_metadata(client, training)
    print("export complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
