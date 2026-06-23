"""Factory & NCR Intelligence serving read (RS Demo PR 3) — display-only.

One payload for the factory page, mirrored from the Databricks NCR pipeline
(telemetry-platform/databricks/15_run_ncr_pipeline.py + 16_mirror_ncr_serving.py):

  - points    REAL per-record UMAP coordinates + HDBSCAN cluster labels (never render-time jitter)
  - clusters  cluster summaries (c-TF-IDF keywords, centroid exemplars, 8-week trend + status)
  - pareto    derived from the MODEL's cluster sizes (plus the noise bucket) — not ground truth
  - backlog   weekly history + walk-forward forecast rows, with the REAL backtest metrics
              (MAE beside MAPE, skill vs naive) from the tel_ncr_forecast tel_model_runs row
  - kpis      open backlog, 8-week delta, median time-to-close, reopen rate, clusters rising

The corpus is synthetic and labeled as such in the UI; the analytics are real model runs with
provenance ('databricks' | 'local_fallback') on every row. Fail-closed: no ingested rows ->
null_reason='data_not_ingested', never a seeded-looking dashboard.
"""
from __future__ import annotations

from uuid import UUID

from app.db import get_telemetry_cursor as get_cursor
from app.services.reporting_common import resolve_tenant_id

NCR_MODEL_NAMES = ("tel_ncr_cluster", "tel_ncr_forecast")


def pareto_from_clusters(clusters: list[dict], noise_count: int) -> list[dict]:
    """Pareto by discovered cluster (model output), largest first, noise bucket last; cumulative %
    over all records including noise. Pure so the derivation is unit-testable."""
    ordered = sorted(clusters, key=lambda c: -c["n_records"])
    rows = [{"family": c["label"], "cluster_id": c["cluster_id"], "n": c["n_records"]}
            for c in ordered]
    if noise_count:
        rows.append({"family": "noise / unclustered", "cluster_id": -1, "n": noise_count})
    total = sum(r["n"] for r in rows)
    cum = 0
    for r in rows:
        cum += r["n"]
        r["cum_pct"] = round(100 * cum / total, 1) if total else 0.0
    return rows


def backlog_delta(history: list[dict], weeks_back: int = 8) -> tuple[int | None, int | None]:
    """(current open backlog, backlog weeks_back ago) from history rows ordered by week_start."""
    if not history:
        return None, None
    now = history[-1].get("backlog")
    past = history[-1 - weeks_back].get("backlog") if len(history) > weeks_back else None
    return now, past


def ncr_intelligence(*, env_id: str, business_id: UUID) -> dict:
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)

        cur.execute(
            """SELECT ncr_key, cluster_id, umap_x, umap_y, severity
               FROM tel_ncr_records
               WHERE env_id = %s AND business_id = %s
               ORDER BY ncr_key""",
            (env_id, str(business_id)))
        point_rows = cur.fetchall()

        if not point_rows:
            return {
                "kpis": None, "clusters": [], "points": [], "pareto": [],
                "backlog": {"history": [], "forecast": [], "backtest": None},
                "provenance": None,
                "null_reason": "data_not_ingested",
            }

        cur.execute(
            """SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (closed_at - opened_at))
                          FILTER (WHERE closed_at IS NOT NULL) AS median_ttc_days,
                      avg(reopened::int) AS reopen_rate,
                      max(batch_id) AS batch_id,
                      max(provenance) AS provenance
               FROM tel_ncr_records
               WHERE env_id = %s AND business_id = %s""",
            (env_id, str(business_id)))
        agg = cur.fetchone() or {}

        cur.execute(
            """SELECT cluster_id, label, keywords, exemplars, n_records, status, trend,
                      median_ttc_days, reopen_rate, mlflow_run_id, provenance
               FROM tel_ncr_clusters
               WHERE env_id = %s AND business_id = %s
               ORDER BY n_records DESC""",
            (env_id, str(business_id)))
        clusters = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """SELECT week_start, kind, opened, closed, backlog, fc, lo, hi
               FROM tel_ncr_backlog_weekly
               WHERE env_id = %s AND business_id = %s
               ORDER BY week_start, kind""",
            (env_id, str(business_id)))
        backlog_rows = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """SELECT model_name, model_kind, mlflow_run_id, experiment_id, metrics,
                      promotion_state
               FROM tel_model_runs
               WHERE env_id = %s AND business_id = %s AND model_name = ANY(%s)""",
            (env_id, str(business_id), list(NCR_MODEL_NAMES)))
        model_rows = {r["model_name"]: dict(r) for r in cur.fetchall()}

    points = [
        {"ncr_key": r["ncr_key"], "x": float(r["umap_x"]) if r["umap_x"] is not None else None,
         "y": float(r["umap_y"]) if r["umap_y"] is not None else None,
         "cluster_id": r["cluster_id"], "severity": r["severity"]}
        for r in point_rows
    ]
    noise_count = sum(1 for p in points if p["cluster_id"] is None or p["cluster_id"] < 0)

    history = [r for r in backlog_rows if r["kind"] == "history"]
    forecast = [r for r in backlog_rows if r["kind"] == "forecast"]
    open_now, open_past = backlog_delta(history)

    forecast_model = model_rows.get("tel_ncr_forecast")
    backtest = None
    if forecast_model:
        m = forecast_model.get("metrics") or {}
        backtest = {
            "mae": m.get("mae"), "mae_naive": m.get("mae_naive"),
            "mape_pct": m.get("mape_pct"), "mape_naive_pct": m.get("mape_naive_pct"),
            "skill_vs_naive": m.get("skill_vs_naive"), "backtest_folds": m.get("backtest_folds"),
        }

    kpis = {
        "open_now": open_now,
        "open_weeks_ago": open_past,
        "median_ttc_days": float(agg["median_ttc_days"]) if agg.get("median_ttc_days") is not None else None,
        "reopen_rate": float(agg["reopen_rate"]) if agg.get("reopen_rate") is not None else None,
        "clusters_rising": sum(1 for c in clusters if c.get("status") == "rising"),
        "rising_labels": [c["label"] for c in clusters if c.get("status") == "rising"],
        "n_records": len(points),
    }

    return {
        "kpis": kpis,
        "clusters": clusters,
        "points": points,
        "pareto": pareto_from_clusters(clusters, noise_count),
        "backlog": {"history": history, "forecast": forecast, "backtest": backtest},
        "provenance": {
            "provenance": agg.get("provenance"),
            "batch_id": agg.get("batch_id"),
            "cluster_mlflow_run_id": (model_rows.get("tel_ncr_cluster") or {}).get("mlflow_run_id"),
            "forecast_mlflow_run_id": (forecast_model or {}).get("mlflow_run_id"),
            "experiment_id": (forecast_model or {}).get("experiment_id"),
        },
        "null_reason": None,
    }
