"""
RS Demo PR 3 mirror — UC NCR pipeline outputs -> idempotent Supabase seed SQL.

Reads the Factory NCR Intelligence outputs (ncr_records + ncr_points + ncr_clusters +
ncr_backlog_weekly) from novendor_1.telemetry — or from ncr_pipeline_local_data.json when the last
driver run used RUNTIME=local — and emits seed_ncr_serving.sql for the telemetry-demo tenant:

  - tel_ncr_records        corpus rows + the model's cluster assignment + 2D coordinates
  - tel_ncr_clusters       cluster summaries (keywords, exemplars, trend, status)
  - tel_ncr_backlog_weekly weekly history + walk-forward forecast rows
  - tel_model_runs         2 rows (ncr_cluster, ncr_forecast) with REAL MLflow run ids + metrics,
                           so the Registry console shows the factory models

Idempotent: deletes only this batch's prior rows (batch_id scoped; model rows by name) and
re-inserts with deterministic uuid5 ids. provenance rides every row ('databricks' or
'local_fallback') so the UI labels where the model actually ran. If you ever bump BATCH_ID,
delete the prior batch's rows explicitly first — the batch-scoped DELETE here will skip them and
records dropped from the corpus would survive as orphans (surviving keys are fully overwritten by
the ON CONFLICT updates either way).

Apply:  cat telemetry-platform/databricks/seed_ncr_serving.sql | supabase db query --linked
Run:    python 16_mirror_ncr_serving.py     (after 15_run_ncr_pipeline.py)
"""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESULT_PATH = HERE / "ncr_pipeline_result.json"
LOCAL_DATA_PATH = HERE / "ncr_pipeline_local_data.json"
OUT = HERE / "seed_ncr_serving.sql"

ENV_ID = "telemetry-demo"
BUSINESS_ID = "7e1eb000-0000-4000-a000-000000000001"
BATCH_ID = "ncr-pipeline-v1"
EXPERIMENT_ID = "3740651530987773"
_NS = uuid.UUID("7e1e0000-0000-4000-a000-0000000000fe")  # deterministic uuid5 namespace (ncr)

TEL = "novendor_1.telemetry"


def sql_str(v) -> str:
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v) -> str:
    return "NULL" if v is None else str(v)


def sql_bool(v) -> str:
    return "true" if v else "false"


def _row(*parts) -> str:
    """Deterministic row id, scoped by tenant so a second env/business never collides on the PK."""
    return str(uuid.uuid5(_NS, "|".join(str(p) for p in (ENV_ID, BUSINESS_ID, *parts))))


def _fetch_all(client, sql: str):
    """execute_sql with chunked result fetch (the 13_backfill pattern)."""
    resp = client.execute_sql(sql, wait=True)
    state = resp.get("status", {}).get("state")
    if state not in ("SUCCEEDED", "FINISHED"):
        raise RuntimeError(f"SQL not OK ({state}): {sql[:120]} :: {resp.get('status')}")
    rows = resp.get("result", {}).get("data_array", []) or []
    total = resp.get("manifest", {}).get("total_row_count", len(rows))
    sid = resp.get("statement_id")
    chunks = resp.get("manifest", {}).get("chunks", [])
    if sid and len(rows) < total and len(chunks) > 1:
        for ch in chunks[1:]:
            more = client._request("GET", f"/api/2.0/sql/statements/{sid}/result/chunks/{ch['chunk_index']}")
            rows.extend(more.get("data_array", []) or [])
    return rows


def load_databricks():
    from _bootstrap import get_client

    client = get_client()
    records = [
        {"ncr_key": r[0], "defect_family": r[1], "workcell": r[2], "severity": r[3],
         "summary": r[4], "opened_at": r[5], "closed_at": r[6],
         "reopened": str(r[7]).lower() == "true"}
        for r in _fetch_all(client,
            f"SELECT ncr_key, defect_family, workcell, severity, summary, opened_at, closed_at, "
            f"reopened FROM {TEL}.ncr_records ORDER BY ncr_key")
    ]
    points = {
        r[0]: {"umap_x": float(r[1]), "umap_y": float(r[2]), "cluster_id": int(r[3])}
        for r in _fetch_all(client,
            f"SELECT ncr_key, umap_x, umap_y, cluster_id FROM {TEL}.ncr_points ORDER BY ncr_key")
    }
    clusters = [
        {"cluster_id": int(r[0]), "label": r[1], "keywords": json.loads(r[2]),
         "exemplars": json.loads(r[3]), "n_records": int(r[4]), "status": r[5],
         "trend": json.loads(r[6]),
         "median_ttc_days": float(r[7]) if r[7] is not None else None,
         "reopen_rate": float(r[8]) if r[8] is not None else None,
         "mlflow_run_id": r[9]}
        for r in _fetch_all(client,
            f"SELECT cluster_id, label, keywords, exemplars, n_records, status, trend, "
            f"median_ttc_days, reopen_rate, mlflow_run_id FROM {TEL}.ncr_clusters ORDER BY cluster_id")
    ]
    backlog = [
        {"week_start": r[0], "kind": r[1],
         "opened": int(r[2]) if r[2] is not None else None,
         "closed": int(r[3]) if r[3] is not None else None,
         "backlog": int(r[4]) if r[4] is not None else None,
         "fc": float(r[5]) if r[5] is not None else None,
         "lo": float(r[6]) if r[6] is not None else None,
         "hi": float(r[7]) if r[7] is not None else None,
         "mlflow_run_id": r[8]}
        for r in _fetch_all(client,
            f"SELECT week_start, kind, opened, closed, backlog, fc, lo, hi, mlflow_run_id "
            f"FROM {TEL}.ncr_backlog_weekly ORDER BY week_start, kind")
    ]
    return records, points, clusters, backlog


def load_local():
    data = json.loads(LOCAL_DATA_PATH.read_text(encoding="utf-8"))
    points = {p["ncr_key"]: {"umap_x": p["umap_x"], "umap_y": p["umap_y"],
                             "cluster_id": p["cluster_id"]} for p in data["points"]}
    clusters = [{**c, "mlflow_run_id": None} for c in data["clusters"]]
    backlog = [{**b, "mlflow_run_id": None} for b in data["backlog_weekly"]]
    return data["records"], points, clusters, backlog


def emit_sql(records, points, clusters, backlog, provenance: str, exits: dict) -> None:
    e, b, bf, pv = sql_str(ENV_ID), sql_str(BUSINESS_ID), sql_str(BATCH_ID), sql_str(provenance)
    cluster_run = exits.get("ncr_clustering", {}).get("mlflow_run_id")
    forecast_run = exits.get("ncr_backlog_forecast", {}).get("mlflow_run_id")

    L = []
    L.append("-- seed_ncr_serving.sql  (GENERATED by 16_mirror_ncr_serving.py — do not hand-edit)")
    L.append("-- Factory NCR Intelligence serving mirror for the telemetry-demo tenant.")
    L.append("-- Corpus: deterministic SYNTHETIC NCR narratives (SEED=20260609) — labeled in the UI.")
    L.append("-- Clustering/forecast outputs: REAL model runs"
             + (f" on Databricks (MLflow {cluster_run} / {forecast_run})." if provenance == "databricks"
                else " via the bounded local fallback (no MLflow run)."))
    L.append(f"-- provenance={provenance} on every row; idempotent per batch_id='{BATCH_ID}'.")
    L.append("BEGIN;")
    for t in ("tel_ncr_records", "tel_ncr_clusters", "tel_ncr_backlog_weekly"):
        L.append(f"DELETE FROM {t} WHERE env_id={e} AND business_id={b} AND batch_id={bf};")
    L.append(f"DELETE FROM tel_model_runs WHERE env_id={e} AND business_id={b} "
             f"AND model_name IN ('tel_ncr_cluster', 'tel_ncr_forecast');")

    for r in records:
        p = points.get(r["ncr_key"], {})
        L.append(
            "INSERT INTO tel_ncr_records (id,env_id,business_id,ncr_key,summary,defect_family,"
            "workcell,severity,opened_at,closed_at,reopened,cluster_id,umap_x,umap_y,provenance,"
            "batch_id) VALUES ("
            f"{sql_str(_row('rec', r['ncr_key']))},{e},{b},{sql_str(r['ncr_key'])},"
            f"{sql_str(r['summary'])},{sql_str(r['defect_family'])},{sql_str(r['workcell'])},"
            f"{sql_str(r['severity'])},{sql_str(r['opened_at'])},{sql_str(r['closed_at'])},"
            f"{sql_bool(r['reopened'])},{sql_num(p.get('cluster_id'))},{sql_num(p.get('umap_x'))},"
            f"{sql_num(p.get('umap_y'))},{pv},{bf}) "
            "ON CONFLICT (env_id,business_id,ncr_key) DO UPDATE SET "
            "summary=EXCLUDED.summary, defect_family=EXCLUDED.defect_family, "
            "workcell=EXCLUDED.workcell, severity=EXCLUDED.severity, "
            "opened_at=EXCLUDED.opened_at, closed_at=EXCLUDED.closed_at, "
            "reopened=EXCLUDED.reopened, cluster_id=EXCLUDED.cluster_id, "
            "umap_x=EXCLUDED.umap_x, umap_y=EXCLUDED.umap_y, "
            "provenance=EXCLUDED.provenance, batch_id=EXCLUDED.batch_id;")

    for c in clusters:
        L.append(
            "INSERT INTO tel_ncr_clusters (id,env_id,business_id,cluster_id,label,keywords,"
            "exemplars,n_records,status,trend,median_ttc_days,reopen_rate,mlflow_run_id,provenance,"
            "batch_id) VALUES ("
            f"{sql_str(_row('cluster', c['cluster_id']))},{e},{b},{c['cluster_id']},"
            f"{sql_str(c['label'])},{sql_str(json.dumps(c['keywords']))}::jsonb,"
            f"{sql_str(json.dumps(c['exemplars']))}::jsonb,{c['n_records']},{sql_str(c['status'])},"
            f"{sql_str(json.dumps(c['trend']))}::jsonb,{sql_num(c['median_ttc_days'])},"
            f"{sql_num(c['reopen_rate'])},{sql_str(c.get('mlflow_run_id'))},{pv},{bf}) "
            "ON CONFLICT (env_id,business_id,cluster_id) DO UPDATE SET "
            "label=EXCLUDED.label, keywords=EXCLUDED.keywords, exemplars=EXCLUDED.exemplars, "
            "n_records=EXCLUDED.n_records, status=EXCLUDED.status, trend=EXCLUDED.trend, "
            "median_ttc_days=EXCLUDED.median_ttc_days, reopen_rate=EXCLUDED.reopen_rate, "
            "mlflow_run_id=EXCLUDED.mlflow_run_id, provenance=EXCLUDED.provenance, "
            "batch_id=EXCLUDED.batch_id;")

    for r in backlog:
        L.append(
            "INSERT INTO tel_ncr_backlog_weekly (id,env_id,business_id,week_start,kind,opened,"
            "closed,backlog,fc,lo,hi,mlflow_run_id,provenance,batch_id) VALUES ("
            f"{sql_str(_row('wk', r['week_start'], r['kind']))},{e},{b},{sql_str(r['week_start'])},"
            f"{sql_str(r['kind'])},{sql_num(r['opened'])},{sql_num(r['closed'])},"
            f"{sql_num(r['backlog'])},{sql_num(r['fc'])},{sql_num(r['lo'])},{sql_num(r['hi'])},"
            f"{sql_str(r.get('mlflow_run_id'))},{pv},{bf}) "
            "ON CONFLICT (env_id,business_id,week_start,kind) DO UPDATE SET "
            "opened=EXCLUDED.opened, closed=EXCLUDED.closed, backlog=EXCLUDED.backlog, "
            "fc=EXCLUDED.fc, lo=EXCLUDED.lo, hi=EXCLUDED.hi, "
            "mlflow_run_id=EXCLUDED.mlflow_run_id, provenance=EXCLUDED.provenance, "
            "batch_id=EXCLUDED.batch_id;")

    # tel_model_runs rows so the Registry console shows the factory models. Metrics are the REAL
    # logged values from the notebook exits; gate documents the declared promotion criterion.
    cexit = exits.get("ncr_clustering", {})
    fexit = exits.get("ncr_backlog_forecast", {})
    cluster_metrics = {
        "n_docs": cexit.get("n_docs"), "n_clusters": cexit.get("n_clusters"),
        "noise_count": cexit.get("noise"), "provenance": provenance,
    }
    cluster_gate = {
        "metric": "n_clusters", "threshold": 2,
        "decision": "promoted" if (cexit.get("n_clusters") or 0) >= 2 else "model_not_promoted",
        "note": "embed -> UMAP -> HDBSCAN must discover >= 2 non-noise clusters",
    }
    forecast_metrics = {
        k: fexit.get(k) for k in
        ("mae", "mae_naive", "mape_pct", "mape_naive_pct", "skill_vs_naive", "backtest_folds")
    }
    forecast_metrics["provenance"] = provenance
    skill = fexit.get("skill_vs_naive") or 0.0
    forecast_gate = {
        "metric": "skill_vs_naive", "threshold": 0.0,
        "decision": "promoted" if skill > 0 else "model_not_promoted",
        "note": "walk-forward MAE must beat the naive last-value baseline",
    }
    for name, kind, run_id, metrics, gate in (
        ("tel_ncr_cluster", "ncr_cluster", cluster_run, cluster_metrics, cluster_gate),
        ("tel_ncr_forecast", "ncr_forecast", forecast_run, forecast_metrics, forecast_gate),
    ):
        L.append(
            "INSERT INTO tel_model_runs (id,env_id,business_id,model_name,model_kind,model_version,"
            "model_alias,mlflow_run_id,experiment_id,metrics,gate,promotion_state) VALUES ("
            f"{sql_str(_row('model', name))},{e},{b},{sql_str(name)},{sql_str(kind)},'1',NULL,"
            f"{sql_str(run_id or 'local_fallback')},{sql_str(EXPERIMENT_ID if run_id else None)},"
            f"{sql_str(json.dumps(metrics))}::jsonb,{sql_str(json.dumps(gate))}::jsonb,"
            f"{sql_str(gate['decision'])}) "
            "ON CONFLICT (env_id,business_id,model_name,model_version) DO UPDATE SET "
            "mlflow_run_id=EXCLUDED.mlflow_run_id, experiment_id=EXCLUDED.experiment_id, "
            "metrics=EXCLUDED.metrics, gate=EXCLUDED.gate, promotion_state=EXCLUDED.promotion_state;")

    L.append("COMMIT;")
    L.append(f"SELECT 'ncr seed applied' AS status, "
             f"(SELECT count(*) FROM tel_ncr_records WHERE env_id={e}) AS records, "
             f"(SELECT count(*) FROM tel_ncr_clusters WHERE env_id={e}) AS clusters, "
             f"(SELECT count(*) FROM tel_ncr_backlog_weekly WHERE env_id={e}) AS backlog_weeks, "
             f"(SELECT count(*) FROM tel_model_runs WHERE env_id={e} "
             f"AND model_name LIKE 'tel_ncr_%') AS ncr_models;")
    OUT.write_text("\n".join(L), encoding="utf-8")


def main() -> int:
    if not RESULT_PATH.exists():
        print("ncr_pipeline_result.json missing — run 15_run_ncr_pipeline.py first")
        return 2
    result = json.loads(RESULT_PATH.read_text(encoding="utf-8"))
    runtime = result.get("runtime", "databricks")
    if runtime == "local":
        records, points, clusters, backlog = load_local()
        provenance = "local_fallback"
    else:
        records, points, clusters, backlog = load_databricks()
        provenance = "databricks"
    emit_sql(records, points, clusters, backlog, provenance, result.get("exits", {}))
    n_clustered = sum(1 for r in records if points.get(r["ncr_key"], {}).get("cluster_id", -1) >= 0)
    print(f"[mirror] provenance={provenance} records={len(records)} (clustered={n_clustered}) "
          f"clusters={len(clusters)} backlog_rows={len(backlog)}")
    print(f"[mirror] wrote {OUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
