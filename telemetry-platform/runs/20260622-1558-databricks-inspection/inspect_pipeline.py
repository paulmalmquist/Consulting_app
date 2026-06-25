"""Telemetry ML inspector — READ-ONLY evidence consolidator.

Collects, across the novendor_1.telemetry pipeline:
  - MLflow latest run per run-name (metrics + params)
  - UC registered models, versions, champion alias + the run behind champion
  - feature/label/prediction table row counts, schemas, null counts, label balance
  - clustering + forecast summaries

Writes telemetry_ml_inspection_report.json (+ a readable .md) into this run dir.
No mutation: SELECT / SHOW / search / GET only. Never promotes, scores, or overwrites.

Usage: python inspect_pipeline.py
"""
from __future__ import annotations
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "databricks"))
from _bootstrap import get_client, TEL  # noqa: E402

RUN_NAMES = ["telemetry_probe", "anomaly_baseline_mad", "anomaly_pca_recon",
             "rul_linear_baseline", "rul_gbm", "fused_pca_256", "fused_autoencoder_256",
             "ncr_clustering", "ncr_backlog_forecast"]
MODELS = ["tel_anomaly_detector", "tel_rul_regressor"]


def sql(client, statement, timeout=120):
    r = client.execute_sql(statement)
    sid = r.get("statement_id")
    state = r.get("status", {}).get("state")
    t0 = time.time()
    while state in ("PENDING", "RUNNING") and time.time() - t0 < timeout:
        time.sleep(2)
        r = client._request("GET", f"/api/2.0/sql/statements/{sid}")
        state = r.get("status", {}).get("state")
    if state != "SUCCEEDED":
        return [["ERR", json.dumps(r.get("status"))[:200]]]
    return r.get("result", {}).get("data_array", []) or []


def one(client, statement):
    rows = sql(client, statement)
    return rows[0][0] if rows and rows[0] else None


def main() -> int:
    c = get_client()
    rpt: dict = {"schema": TEL, "generated_by": "inspect_pipeline.py (read-only)"}

    # ── MLflow latest run per name ──────────────────────────────────────────
    runs = c.search_mlflow_runs(max_results=400).get("runs", [])
    latest: dict = {}
    for r in runs:
        name = next((t["value"] for t in r["data"].get("tags", []) if t["key"] == "mlflow.runName"), None)
        if name not in RUN_NAMES:
            continue
        st = r["info"].get("start_time", 0)
        if name not in latest or st > latest[name]["start_time"]:
            latest[name] = {
                "run_id": r["info"]["run_id"], "start_time": st, "status": r["info"].get("status"),
                "metrics": {m["key"]: m["value"] for m in r["data"].get("metrics", [])},
                "params": {p["key"]: p["value"] for p in r["data"].get("params", [])},
            }
    rpt["mlflow_latest"] = latest
    rpt["mlflow_total_runs"] = len(runs)

    # ── UC models, versions, champion alias ─────────────────────────────────
    rpt["models"] = {}
    for m in MODELS:
        full = f"{TEL}.{m}"
        vers = c._request("GET", f"/api/2.1/unity-catalog/models/{full}/versions").get("model_versions", [])
        champ = None
        try:
            champ = c._request("GET", f"/api/2.1/unity-catalog/models/{full}/aliases/champion")
        except Exception:  # noqa: BLE001
            champ = None
        rpt["models"][m] = {
            "versions": [{"version": v.get("version"), "run_id": v.get("run_id")} for v in vers],
            "champion_version": (champ or {}).get("version") if isinstance(champ, dict) else None,
            "champion_run_id": (champ or {}).get("run_id") if isinstance(champ, dict) else None,
        }

    # ── Table inventory + targeted data-quality probes ──────────────────────
    def cnt(t):
        return one(c, f"SELECT COUNT(*) FROM {TEL}.{t}")

    rpt["tables"] = {}

    # gold_smap_msl_windows: split + label balance + null residual feature
    rpt["tables"]["gold_smap_msl_windows"] = {
        "rows": cnt("gold_smap_msl_windows"),
        "by_split_label": sql(c, f"SELECT split, is_anomaly, COUNT(*) FROM {TEL}.gold_smap_msl_windows GROUP BY split, is_anomaly ORDER BY split, is_anomaly"),
        "null_value_rmean50": one(c, f"SELECT SUM(CASE WHEN value_rmean50 IS NULL THEN 1 ELSE 0 END) FROM {TEL}.gold_smap_msl_windows"),
        "n_channels": one(c, f"SELECT COUNT(DISTINCT chan_id) FROM {TEL}.gold_smap_msl_windows"),
    }
    # gold_cmapss_features: split + rul_target distribution + nulls
    rpt["tables"]["gold_cmapss_features"] = {
        "rows": cnt("gold_cmapss_features"),
        "by_split": sql(c, f"SELECT split, COUNT(*) FROM {TEL}.gold_cmapss_features GROUP BY split ORDER BY split"),
        "rul_target_stats": sql(c, f"SELECT MIN(rul_target), MAX(rul_target), ROUND(AVG(rul_target),2), SUM(CASE WHEN rul_target IS NULL THEN 1 ELSE 0 END) FROM {TEL}.gold_cmapss_features"),
        "n_units": one(c, f"SELECT COUNT(DISTINCT unit) FROM {TEL}.gold_cmapss_features"),
    }
    # gold_replay_feed_scored: label vs model agreement
    rpt["tables"]["gold_replay_feed_scored"] = {
        "rows": cnt("gold_replay_feed_scored"),
        "label_ticks": one(c, f"SELECT SUM(is_anomaly) FROM {TEL}.gold_replay_feed_scored"),
        "model_fired": one(c, f"SELECT SUM(model_pred) FROM {TEL}.gold_replay_feed_scored"),
        "agreement": one(c, f"SELECT SUM(CASE WHEN is_anomaly=1 AND model_pred=1 THEN 1 ELSE 0 END) FROM {TEL}.gold_replay_feed_scored"),
        "false_positive": one(c, f"SELECT SUM(CASE WHEN is_anomaly=0 AND model_pred=1 THEN 1 ELSE 0 END) FROM {TEL}.gold_replay_feed_scored"),
        "false_negative": one(c, f"SELECT SUM(CASE WHEN is_anomaly=1 AND model_pred=0 THEN 1 ELSE 0 END) FROM {TEL}.gold_replay_feed_scored"),
    }
    # gold_fused_state_vectors: label balance
    rpt["tables"]["gold_fused_state_vectors"] = {
        "rows": cnt("gold_fused_state_vectors"),
        "by_split_label": sql(c, f"SELECT split, label_any_anomaly, COUNT(*) FROM {TEL}.gold_fused_state_vectors GROUP BY split, label_any_anomaly ORDER BY split, label_any_anomaly"),
    }
    # ncr_records: family distribution
    rpt["tables"]["ncr_records"] = {
        "rows": cnt("ncr_records"),
        "by_family": sql(c, f"SELECT defect_family, COUNT(*) FROM {TEL}.ncr_records GROUP BY defect_family ORDER BY COUNT(*) DESC"),
        "open_unclosed": one(c, f"SELECT SUM(CASE WHEN closed_at IS NULL THEN 1 ELSE 0 END) FROM {TEL}.ncr_records"),
    }
    # ncr_clusters: sizes + statuses + trend
    rpt["tables"]["ncr_clusters"] = {
        "rows": cnt("ncr_clusters"),
        "detail": sql(c, f"SELECT cluster_id, label, n_records, status, ROUND(slope_per_week,3), median_ttc_days, ROUND(reopen_rate,3) FROM {TEL}.ncr_clusters ORDER BY cluster_id"),
        "noise_points": one(c, f"SELECT COUNT(*) FROM {TEL}.ncr_points WHERE cluster_id = -1"),
    }
    # ncr_backlog_weekly: history vs forecast
    rpt["tables"]["ncr_backlog_weekly"] = {
        "rows": cnt("ncr_backlog_weekly"),
        "by_kind": sql(c, f"SELECT kind, COUNT(*) FROM {TEL}.ncr_backlog_weekly GROUP BY kind"),
        "forecast": sql(c, f"SELECT week_start, ROUND(fc,2), ROUND(lo,2), ROUND(hi,2) FROM {TEL}.ncr_backlog_weekly WHERE kind='forecast' ORDER BY week_start"),
    }

    out_json = HERE / "telemetry_ml_inspection_report.json"
    out_json.write_text(json.dumps(rpt, indent=2), encoding="utf-8")
    print("wrote", out_json)
    # brief console summary
    print("MLflow latest runs:", list(latest.keys()))
    print("Models:", {k: v["champion_version"] for k, v in rpt["models"].items()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
