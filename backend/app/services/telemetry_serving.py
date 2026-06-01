"""Telemetry Platform serving services (Phase 3).

Lean by design: the backend serves the operational contract and persists receipts. It does NOT import
databricks / mlflow / pyspark. The heavy training already happened in Databricks (Phase 2); the
promoted champion's metadata lives in tel_model_runs, and the anomaly champion is a cheap rule
(rolling-MAD dynamic threshold) re-implemented here so /score can run live without a model runtime.

Champion anomaly rule (matches the registered tel_anomaly_detector@champion):
    resid          = abs(value - rolling_mean)
    effective_scale = per-channel train scale if > 0 else global train scale
    fired          = resid > k * effective_scale         (k = 4)
For the demo channel D-4 the per-channel train scale is ~0 (near-constant during training), so the
registered model falls back to the global train scale; serving mirrors that fallback exactly.
"""
from __future__ import annotations

import statistics
from uuid import UUID

from app.db import get_cursor
from app.services.reporting_common import resolve_tenant_id

# Champion hyperparameters (frozen from the Phase 2 promoted model).
MAD_K = 4.0
GLOBAL_TRAIN_SCALE = 0.033866801182436346   # median abs residual across all SMAP/MSL train channels


def _champion(cur, env_id: str, business_id: UUID, model_kind: str) -> dict | None:
    cur.execute(
        """SELECT model_name, model_version, model_alias, mlflow_run_id, metrics, gate
           FROM tel_model_runs
           WHERE env_id = %s AND business_id = %s AND model_kind = %s
             AND promotion_state = 'promoted'
           ORDER BY created_at DESC LIMIT 1""",
        (env_id, str(business_id), model_kind),
    )
    return cur.fetchone()


def score_window(*, env_id: str, business_id: UUID, run_key: str, channel_name: str,
                 window: list[dict]) -> dict:
    """Score a window of readings with the promoted anomaly champion, persist a receipt, return the
    verdict. Fails closed (verdict NOT_AVAILABLE + null_reason) when prerequisites are missing."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)   # validates the business exists (fail closed otherwise)

        champ = _champion(cur, env_id, business_id, "anomaly")
        if champ is None:
            return {"verdict": "NOT_AVAILABLE", "null_reason": "model_not_promoted"}

        cur.execute(
            "SELECT id FROM tel_test_runs WHERE env_id = %s AND business_id = %s AND run_key = %s",
            (env_id, str(business_id), run_key),
        )
        run_row = cur.fetchone()
        if run_row is None:
            return {"verdict": "NOT_AVAILABLE", "null_reason": "missing_run",
                    "model_name": champ["model_name"], "model_version": champ["model_version"]}
        run_id = run_row["id"]

        # Champion rule. Use caller-supplied rolling mean if present, else compute over the window.
        values = [float(r["value"]) for r in window]
        rmeans = [r.get("value_rmean50") for r in window]
        if any(m is None for m in rmeans):
            running = []
            rmeans = []
            for v in values:
                running.append(v)
                rmeans.append(sum(running) / len(running))
        resids = [abs(v - float(m)) for v, m in zip(values, rmeans)]
        peak_resid = max(resids)
        threshold = MAD_K * GLOBAL_TRAIN_SCALE
        fired = peak_resid > threshold
        # Display score = peak residual in units of the threshold (>1 means past the redline).
        anomaly_score = round(peak_resid / threshold, 6) if threshold else None
        verdict = "NO_GO" if fired else "GO"

        attribution = [{"channel_name": channel_name, "contribution": round(peak_resid, 6)}]

        cur.execute(
            """INSERT INTO tel_predictions
                 (env_id, business_id, run_id, channel_name, window_start_t, window_end_t,
                  anomaly_score, threshold, verdict, model_name, model_version, mlflow_run_id, attribution)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
               RETURNING id""",
            (env_id, str(business_id), run_id, channel_name,
             window[0]["t"], window[-1]["t"], anomaly_score, threshold, verdict,
             champ["model_name"], champ["model_version"], champ["mlflow_run_id"],
             _json(attribution)),
        )
        receipt_id = cur.fetchone()["id"]

        return {
            "verdict": verdict,
            "anomaly_score": anomaly_score,
            "threshold": threshold,
            "model_name": champ["model_name"],
            "model_version": champ["model_version"],
            "model_alias": champ["model_alias"],
            "mlflow_run_id": champ["mlflow_run_id"],
            "attribution": attribution,
            "receipt_id": receipt_id,
        }


def list_runs(*, env_id: str, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            """SELECT id, run_key, dataset, unit_or_channel, spacecraft, row_count,
                      ingest_at, status, created_at
               FROM tel_test_runs WHERE env_id = %s AND business_id = %s
               ORDER BY created_at DESC""",
            (env_id, str(business_id)),
        )
        return cur.fetchall()


def get_run(*, env_id: str, business_id: UUID, run_id: UUID) -> dict:
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            """SELECT id, run_key, dataset, unit_or_channel, spacecraft, row_count,
                      ingest_at, status, created_at
               FROM tel_test_runs WHERE env_id = %s AND business_id = %s AND id = %s""",
            (env_id, str(business_id), str(run_id)),
        )
        run = cur.fetchone()
        if run is None:
            return {"run": None, "channels": [], "recent_predictions": [], "anomaly_events": [],
                    "null_reason": "missing_run"}
        cur.execute(
            """SELECT channel_name, unit, redline_low, redline_high
               FROM tel_telemetry_channels
               WHERE env_id = %s AND business_id = %s AND run_id = %s ORDER BY channel_name""",
            (env_id, str(business_id), str(run_id)),
        )
        channels = cur.fetchall()
        cur.execute(
            """SELECT channel_name, anomaly_score, threshold, verdict, created_at
               FROM tel_predictions
               WHERE env_id = %s AND business_id = %s AND run_id = %s
               ORDER BY created_at DESC LIMIT 20""",
            (env_id, str(business_id), str(run_id)),
        )
        preds = cur.fetchall()
        cur.execute(
            """SELECT channel_name, start_t, end_t, anomaly_class, confidence, source
               FROM tel_anomaly_events
               WHERE env_id = %s AND business_id = %s AND run_id = %s ORDER BY start_t""",
            (env_id, str(business_id), str(run_id)),
        )
        events = cur.fetchall()
        return {"run": run, "channels": channels,
                "recent_predictions": [dict(p) for p in preds],
                "anomaly_events": events, "null_reason": None}


def monitoring(*, env_id: str, business_id: UUID) -> dict:
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            """SELECT count(*) AS n,
                      avg(CASE WHEN verdict = 'NO_GO' THEN 1.0 ELSE 0.0 END) AS rate,
                      max(created_at) AS last_at
               FROM tel_predictions WHERE env_id = %s AND business_id = %s""",
            (env_id, str(business_id)),
        )
        agg = cur.fetchone()
        cur.execute(
            """SELECT model_name, model_version, model_alias
               FROM tel_model_runs WHERE env_id = %s AND business_id = %s AND model_kind = 'anomaly'
                 AND promotion_state = 'promoted'
               ORDER BY created_at DESC LIMIT 1""",
            (env_id, str(business_id)),
        )
        champ = cur.fetchone()
        cur.execute(
            """SELECT metric_value FROM tel_drift_metrics
               WHERE env_id = %s AND business_id = %s AND metric_name = 'psi'
               ORDER BY computed_at DESC LIMIT 1""",
            (env_id, str(business_id)),
        )
        psi_row = cur.fetchone()

        n = int(agg["n"] or 0)
        if n == 0:
            return {"prediction_count": 0, "rolling_anomaly_rate": None,
                    "latest_model_name": champ["model_name"] if champ else None,
                    "latest_model_version": champ["model_version"] if champ else None,
                    "latest_model_alias": champ["model_alias"] if champ else None,
                    "last_scored_at": None, "psi": None, "window_label": "recent",
                    "null_reason": "no_prediction_rows"}
        return {
            "prediction_count": n,
            "rolling_anomaly_rate": round(float(agg["rate"]), 6) if agg["rate"] is not None else None,
            "latest_model_name": champ["model_name"] if champ else None,
            "latest_model_version": champ["model_version"] if champ else None,
            "latest_model_alias": champ["model_alias"] if champ else None,
            "last_scored_at": agg["last_at"],
            "psi": float(psi_row["metric_value"]) if psi_row else None,
            "window_label": "recent",
            "null_reason": None,
        }


def health() -> dict:
    """Lean health check: confirm the serving tables are reachable and report promoted-model count."""
    with get_cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM tel_model_runs WHERE promotion_state = 'promoted'")
        promoted = int(cur.fetchone()["n"])
    return {"status": "ok", "promoted_models": promoted, "module": "telemetry"}


def _json(obj) -> str:
    import json
    return json.dumps(obj)
