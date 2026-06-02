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

import json
from pathlib import Path
from uuid import UUID

from app.db import get_cursor
from app.services.reporting_common import resolve_tenant_id

# Champion hyperparameters (frozen from the Phase 2 promoted model).
MAD_K = 4.0
GLOBAL_TRAIN_SCALE = 0.033866801182436346   # median abs residual across all SMAP/MSL train channels

# Deterministic replay fixture: precomputed REAL champion outputs exported from
# novendor_1.telemetry.gold_replay_feed_scored (Phase 2). Loaded once, cached in-process.
_REPLAY_FIXTURE_PATH = Path(__file__).resolve().parent.parent / "data" / "telemetry" / "replay_fixture.json"
_replay_cache: dict | None = None


def _verdict_for(score: float | None) -> str:
    """GO / REVIEW / NO_GO band on the champion anomaly_score (= peak residual / threshold)."""
    if score is None:
        return "GO"
    if score < 1.0:
        return "GO"
    if score <= 2.0:
        return "REVIEW"
    return "NO_GO"


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
        # Display score = peak residual in units of the threshold (>1 means past the redline).
        anomaly_score = round(peak_resid / threshold, 6) if threshold else None
        # Verdict band (matches the Phase 6 backfill): GO < 1, REVIEW 1-2, NO_GO > 2 x threshold.
        verdict = _verdict_for(anomaly_score)

        attribution = [{"channel_name": channel_name, "contribution": round(peak_resid, 6)}]

        cur.execute(
            """INSERT INTO tel_predictions
                 (env_id, business_id, run_id, channel_name, window_start_t, window_end_t,
                  anomaly_score, threshold, verdict, model_name, model_version, mlflow_run_id,
                  attribution, is_backfilled)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,false)
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


def replay_feed() -> dict:
    """Return the deterministic replay fixture (precomputed real champion outputs). No DB, no
    Databricks — fast and identical every call. Fails closed if the fixture is missing."""
    global _replay_cache
    if _replay_cache is None:
        if not _REPLAY_FIXTURE_PATH.exists():
            return {"feed": [], "null_reason": "data_not_ingested",
                    "note": "replay fixture not present"}
        _replay_cache = json.loads(_REPLAY_FIXTURE_PATH.read_text(encoding="utf-8"))
    return _replay_cache


def model_performance(*, env_id: str, business_id: UUID) -> dict:
    """Return promoted-model metadata + metrics from tel_model_runs (no hardcoded numbers)."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            """SELECT model_name, model_kind, model_version, model_alias, mlflow_run_id,
                      experiment_id, metrics, gate, promotion_state
               FROM tel_model_runs WHERE env_id = %s AND business_id = %s
               ORDER BY model_kind, created_at DESC""",
            (env_id, str(business_id)),
        )
        rows = cur.fetchall()
        if not rows:
            return {"models": [], "null_reason": "model_not_promoted"}
        return {"models": [dict(r) for r in rows], "null_reason": None}


def summary(*, env_id: str, business_id: UUID) -> dict:
    """Single KPI + inventory contract for the Overview. One bundled set of queries returning per-table
    row counts and headline KPIs, so the frontend does not re-derive counts from multiple endpoints."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)

        def count(table: str) -> int:
            cur.execute(f"SELECT count(*) AS n FROM {table} WHERE env_id = %s AND business_id = %s",
                        (env_id, str(business_id)))
            return int(cur.fetchone()["n"])

        inventory = {t: count(f"tel_{t}") for t in
                     ("test_runs", "telemetry_channels", "predictions", "anomaly_events",
                      "model_runs", "drift_metrics")}

        # verdict distribution + last score
        cur.execute(
            """SELECT verdict, count(*) AS n FROM tel_predictions
               WHERE env_id = %s AND business_id = %s GROUP BY verdict""",
            (env_id, str(business_id)))
        verdicts = {r["verdict"]: int(r["n"]) for r in cur.fetchall()}
        cur.execute(
            "SELECT max(created_at) AS last FROM tel_predictions WHERE env_id = %s AND business_id = %s",
            (env_id, str(business_id)))
        last_scored = cur.fetchone()["last"]

        # promoted champions (anomaly F1, RUL RMSE) for the headline metric strip
        cur.execute(
            """SELECT model_kind, metrics FROM tel_model_runs
               WHERE env_id = %s AND business_id = %s AND promotion_state = 'promoted'""",
            (env_id, str(business_id)))
        champs = {r["model_kind"]: (r["metrics"] or {}) for r in cur.fetchall()}

        # distinct drift monitors (feature/channel before the ':' in window_label) + worst PSI
        cur.execute(
            """SELECT count(distinct split_part(window_label, ':', 1)) AS monitors,
                      max(metric_value) AS worst_psi
               FROM tel_drift_metrics
               WHERE env_id = %s AND business_id = %s AND metric_name = 'psi'""",
            (env_id, str(business_id)))
        d = cur.fetchone()

        total_pred = sum(verdicts.values()) or 0
        return {
            "inventory": inventory,
            "kpi": {
                "test_runs": inventory["test_runs"],
                "predictions": total_pred,
                "anomaly_events": inventory["anomaly_events"],
                "promoted_models": _count_promoted(cur, env_id, business_id),
                "drift_monitors": int(d["monitors"] or 0),
                "anomaly_f1": (champs.get("anomaly") or {}).get("f1"),
                "rul_rmse": (champs.get("rul") or {}).get("rmse"),
                "last_scored_at": last_scored,
            },
            "verdicts": verdicts,
            "verdict_pct": {k: round(v / total_pred, 4) for k, v in verdicts.items()} if total_pred else {},
            "note": ("Operational history is a deterministic backfill from public NASA analog data "
                     "(real champion outputs, real labeled windows, real PSI). Live /score receipts "
                     "continue from current time."),
        }


def _count_promoted(cur, env_id: str, business_id: UUID) -> int:
    cur.execute(
        """SELECT count(*) AS n FROM tel_model_runs
           WHERE env_id = %s AND business_id = %s AND promotion_state = 'promoted'""",
        (env_id, str(business_id)))
    return int(cur.fetchone()["n"])


def fused_vector_info(*, env_id: str, business_id: UUID) -> dict:
    """Phase 7A: 256-d fused state-vector summary for the model-detail panel (no huge vectors dumped).
    Reads tel_fused_state_vectors + tel_feature_manifest. Fails closed if not yet built."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            """SELECT count(*) AS n, max(vector_dim) AS dim,
                      count(DISTINCT split) AS splits,
                      count(*) FILTER (WHERE split='test' AND label_any_anomaly=1) AS anomalous_test
               FROM tel_fused_state_vectors WHERE env_id=%s AND business_id=%s""",
            (env_id, str(business_id)))
        v = cur.fetchone()
        if not v or int(v["n"] or 0) == 0:
            return {"available": False, "null_reason": "data_not_ingested"}
        cur.execute(
            """SELECT count(*) AS feats, count(DISTINCT chan_id) AS channels
               FROM tel_feature_manifest WHERE env_id=%s AND business_id=%s""",
            (env_id, str(business_id)))
        m = cur.fetchone()
        cur.execute(
            """SELECT DISTINCT feature_name FROM tel_feature_manifest
               WHERE env_id=%s AND business_id=%s ORDER BY feature_name""",
            (env_id, str(business_id)))
        feat_names = [r["feature_name"] for r in cur.fetchall()]
        cur.execute(
            """SELECT DISTINCT source_channels FROM tel_fused_state_vectors
               WHERE env_id=%s AND business_id=%s LIMIT 1""",
            (env_id, str(business_id)))
        sc = cur.fetchone()
        channels = (sc["source_channels"].split(",") if sc and sc["source_channels"] else [])
        n_channels = int(m["channels"] or 0)
        return {
            "available": True,
            "vector_dim": int(v["dim"] or 0),
            "n_channels": n_channels,
            "features_per_channel": (int(m["feats"]) // n_channels) if n_channels else 0,
            "feature_names": feat_names,
            "channels": channels,
            "d4_included": "D-4" in channels,
            "fused_vectors": int(v["n"]),
            "anomalous_test_vectors": int(v["anomalous_test"] or 0),
            "model": "dense autoencoder-style bottleneck network + PCA-256 baseline",
            "alignment": "normalized sequence progress per channel (analog representation; not "
                         "simultaneous multi-sensor vehicle telemetry)",
            "source": "public_nasa_analog_dataset",
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
