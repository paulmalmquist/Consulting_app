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

from app.db import get_telemetry_cursor as get_cursor
from app.services.reporting_common import resolve_tenant_id

# Champion hyperparameters (frozen from the Phase 2 promoted model).
MAD_K = 4.0
GLOBAL_TRAIN_SCALE = 0.033866801182436346   # median abs residual across all SMAP/MSL train channels
# Frozen champion detector threshold in residual units (MAD rule: resid > k*scale; D-4 uses the global
# scale fallback). This is the SAME threshold /score applies — exposed for the replay forensics surface
# so the per-tick honest score/margin can be shown instead of the degenerate fixture score.
DETECTOR_THRESHOLD = MAD_K * GLOBAL_TRAIN_SCALE   # 0.13546720472974538

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


def _conformal_budget(metrics: dict | None) -> dict | None:
    """Surface-only conformal false-alarm DIAGNOSTIC stored on the champion row (Track A). Returns None
    if the champion has no conformal fields. Status compares the measured calibration false-alarm rate to
    the declared alpha (NOT a guarantee; the live verdict bands are unchanged)."""
    if not metrics or metrics.get("conformal_alpha") is None:
        return None
    alpha = metrics.get("conformal_alpha")
    far = metrics.get("conformal_measured_false_alarm_rate")
    status = None
    if isinstance(far, (int, float)) and isinstance(alpha, (int, float)):
        status = "within" if far <= alpha else ("approaching" if far <= 1.5 * alpha else "over")
    return {
        "alpha": alpha,
        "measured_false_alarm_rate": far,
        "calib_coverage": metrics.get("conformal_calib_coverage"),
        "threshold_quantile": metrics.get("conformal_threshold_quantile"),
        "frozen_k": metrics.get("conformal_frozen_k"),
        "status": status,
    }


def _stream_block(cur, env_id: str, business_id: UUID) -> dict | None:
    """RS Demo streaming slice summary for /monitoring. Returns None when the streaming tables are
    absent (pre-migration) or empty — additive, never breaks existing monitoring."""
    try:
        cur.execute(
            """SELECT status, as_of_ts, reason FROM tel_pipeline_status
               WHERE env_id = %s AND business_id = %s AND surface = 'stream_ingest'""",
            (env_id, str(business_id)))
        st = cur.fetchone()
        if st is None:
            return None
        cur.execute(
            """SELECT max(ts_source) AS last_frame,
                      count(*) FILTER (WHERE ts_ingest > now() - interval '1 minute') AS rpm
               FROM tel_stream_readings_bronze WHERE env_id = %s AND business_id = %s""",
            (env_id, str(business_id)))
        agg = cur.fetchone() or {}
        cur.execute(
            """SELECT count(*) AS n FROM tel_dq_assertions
               WHERE env_id = %s AND business_id = %s AND passed = false
                 AND run_ts > now() - interval '15 minutes'""",
            (env_id, str(business_id)))
        failing = int(cur.fetchone()["n"])
        return {
            "status": st["status"], "as_of_ts": st["as_of_ts"], "reason": st["reason"],
            "last_frame_at": agg.get("last_frame"),
            "rows_per_min": int(agg.get("rpm") or 0),
            "failing_assertions": failing,
        }
    except Exception:  # noqa: BLE001 — streaming tables not migrated yet
        return None


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
            """SELECT model_name, model_version, model_alias, metrics
               FROM tel_model_runs WHERE env_id = %s AND business_id = %s AND model_kind = 'anomaly'
                 AND promotion_state = 'promoted'
               ORDER BY created_at DESC LIMIT 1""",
            (env_id, str(business_id)),
        )
        champ = cur.fetchone()
        conformal_budget = _conformal_budget(champ.get("metrics") if champ else None)
        cur.execute(
            """SELECT metric_value FROM tel_drift_metrics
               WHERE env_id = %s AND business_id = %s AND metric_name = 'psi'
               ORDER BY computed_at DESC LIMIT 1""",
            (env_id, str(business_id)),
        )
        psi_row = cur.fetchone()

        n = int(agg["n"] or 0)

    # Stream block in its OWN cursor: an UndefinedTable (pre-migration) must not abort the main
    # monitoring transaction above.
    stream_block = None
    try:
        with get_cursor() as cur2:
            stream_block = _stream_block(cur2, env_id, business_id)
    except Exception:  # noqa: BLE001
        stream_block = None

    if n == 0:
        return {"prediction_count": 0, "rolling_anomaly_rate": None,
                "latest_model_name": champ["model_name"] if champ else None,
                "latest_model_version": champ["model_version"] if champ else None,
                "latest_model_alias": champ["model_alias"] if champ else None,
                "last_scored_at": None, "psi": None, "window_label": "recent",
                "conformal_budget": conformal_budget,
                "stream": stream_block,
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
        "conformal_budget": conformal_budget,
        "stream": stream_block,
        "null_reason": None,
    }


def _scoring_diagnostics(feed: list | None) -> dict:
    """Honest, DB-free scoring provenance for the replay forensics surface. Exposes the frozen serving
    threshold (the global-scale fallback /score applies) AND, computed from the committed fixture, whether
    that threshold actually reproduces the champion's firing. For D-4 it does NOT: every fired tick sits
    below the global threshold, so the champion must fire on a tighter per-channel scale the serving
    constants do not carry. We surface that divergence honestly rather than invent a per-tick verdict that
    would contradict model_pred. feed[].score stays degenerate (~1e12) and display-only."""
    feed = feed or []
    fired_resid = [abs(p["value"] - p["rmean"]) for p in feed if p.get("model_pred") == 1]
    fired_above = sum(1 for r in fired_resid if r > DETECTOR_THRESHOLD)
    diverges = len(fired_resid) > 0 and fired_above == 0
    max_fired = max(fired_resid) if fired_resid else None
    return {
        "mad_k": MAD_K,
        "global_train_scale": GLOBAL_TRAIN_SCALE,
        "threshold_residual_units": DETECTOR_THRESHOLD,
        "threshold_source": "serving global-scale fallback (the frozen MAD threshold /score applies)",
        "residual_definition": "residual = abs(value - rmean) — the quantity the MAD rule thresholds",
        "fired_ticks": len(fired_resid),
        "fired_ticks_above_threshold": fired_above,
        "max_fired_residual": max_fired,
        "threshold_reproduces_firing": fired_above > 0,
        "per_channel_caveat": (
            "The serving global-scale fallback threshold does NOT reproduce the champion's D-4 firing — "
            f"0 of {len(fired_resid)} fired ticks exceed it (max fired residual {max_fired:.4f}). The "
            "champion fired on a tighter per-channel D-4 scale the serving constants do not carry; "
            "model_pred is authoritative, and a per-tick GO/REVIEW/NO_GO cannot be derived from this "
            "threshold for D-4."
        ) if diverges else None,
        "fixture_score_degenerate": True,
        "note": "feed[].score is degenerate (~1e12), display-only. Residual = abs(value - rmean).",
    }


def _replay_lineage(prov: dict) -> dict:
    """Reproducibility chain for the replay verdict (DB-free; ids from the committed fixture provenance
    + the known Unity Catalog coordinates). The run id here is the fixture's RECORDED champion run; the
    live model registry may hold a different run id (the frontend surfaces both, never reconciles)."""
    return {
        "databricks_catalog": "novendor_1.telemetry",
        "source_table": prov.get("source_table"),
        "champion_model": prov.get("champion_model"),
        "champion_mlflow_run_id_fixture": prov.get("champion_mlflow_run_id"),
        "scoring_notebook": "telemetry-platform/databricks/11_score_replay_feed.py -> gold_replay_feed_scored",
        "backend_route": "GET /api/telemetry/replay",
    }


def replay_feed() -> dict:
    """Return the deterministic replay fixture (precomputed real champion outputs). No DB, no
    Databricks — fast and identical every call. Fails closed if the fixture is missing.

    ADDITIVE diagnostics (backward-compatible): `scoringDiagnostics` (the frozen detector threshold +
    the honest score/margin definitions; pure constants, no DB) and `lineage` (the reproducibility chain
    from the fixture provenance). Existing top-level keys and feed[] rows are unchanged; the degenerate
    feed[].score is kept verbatim and never reinterpreted."""
    global _replay_cache
    if _replay_cache is None:
        if not _REPLAY_FIXTURE_PATH.exists():
            return {"feed": [], "null_reason": "data_not_ingested",
                    "note": "replay fixture not present",
                    "scoringDiagnostics": _scoring_diagnostics(None)}
        fixture = json.loads(_REPLAY_FIXTURE_PATH.read_text(encoding="utf-8"))
        fixture["scoringDiagnostics"] = _scoring_diagnostics(fixture.get("feed") or [])
        fixture["lineage"] = _replay_lineage(fixture.get("provenance") or {})
        _replay_cache = fixture
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


# ── Phase 6 copilot read-only tools ───────────────────────────────────────────
# Thin SQL reads that back the Test Intelligence Copilot's fixed tool allow-list. No ML deps. Every
# function is RLS-scoped by env_id + business_id and returns plain dicts/lists (or a null_reason).

_PRED_COLS = ("id, run_id, channel_name, window_start_t, window_end_t, anomaly_score, threshold, "
              "verdict, model_name, model_version, mlflow_run_id, attribution, created_at")


def _run_id_for_key(cur, env_id: str, business_id: UUID, run_key: str):
    cur.execute(
        "SELECT id FROM tel_test_runs WHERE env_id = %s AND business_id = %s AND run_key = %s",
        (env_id, str(business_id), run_key))
    row = cur.fetchone()
    return row["id"] if row else None


def get_triggering_prediction(*, env_id: str, business_id: UUID, run_key: str,
                              fire_tick: int) -> dict:
    """The receipt that explains a NO_GO verdict: the NO_GO prediction whose window brackets the first
    fire tick, choosing the TIGHTEST window (so we cite the precise trigger, not a broad GO aggregate
    that also spans the tick). Fails closed when the run or a bracketing NO_GO row is absent."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        run_id = _run_id_for_key(cur, env_id, business_id, run_key)
        if run_id is None:
            return {"prediction": None, "run": None, "null_reason": "missing_run"}
        cur.execute(
            f"""SELECT {_PRED_COLS} FROM tel_predictions
                WHERE env_id = %s AND business_id = %s AND run_id = %s
                  AND verdict = 'NO_GO'
                  AND window_start_t <= %s AND window_end_t >= %s
                ORDER BY (window_end_t - window_start_t) ASC, anomaly_score DESC NULLS LAST
                LIMIT 1""",
            (env_id, str(business_id), str(run_id), fire_tick, fire_tick))
        pred = cur.fetchone()
        if pred is None:
            return {"prediction": None, "run": None, "null_reason": "no_prediction_rows"}
        cur.execute(
            """SELECT id, run_key, dataset, unit_or_channel, spacecraft, row_count, status, created_at
               FROM tel_test_runs WHERE env_id = %s AND business_id = %s AND id = %s""",
            (env_id, str(business_id), str(run_id)))
        run = cur.fetchone()
        return {"prediction": dict(pred), "run": dict(run) if run else None, "null_reason": None}


def get_prediction(*, env_id: str, business_id: UUID, receipt_id: UUID) -> dict:
    """A single prediction receipt by id (the canonical 'evidence' object)."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            f"""SELECT {_PRED_COLS} FROM tel_predictions
                WHERE env_id = %s AND business_id = %s AND id = %s""",
            (env_id, str(business_id), str(receipt_id)))
        row = cur.fetchone()
        if row is None:
            return {"prediction": None, "null_reason": "insufficient_evidence"}
        return {"prediction": dict(row), "null_reason": None}


def get_predictions_by_window(*, env_id: str, business_id: UUID, run_key: str,
                              t_start: int, t_end: int, channel_name: str | None = None) -> dict:
    """Prediction receipts overlapping [t_start, t_end] for a run (evidence + point/contextual)."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        run_id = _run_id_for_key(cur, env_id, business_id, run_key)
        if run_id is None:
            return {"predictions": [], "null_reason": "missing_run"}
        params = [env_id, str(business_id), str(run_id), t_end, t_start]
        chan_clause = ""
        if channel_name:
            chan_clause = " AND channel_name = %s"
            params.append(channel_name)
        cur.execute(
            f"""SELECT {_PRED_COLS} FROM tel_predictions
                WHERE env_id = %s AND business_id = %s AND run_id = %s
                  AND window_start_t <= %s AND window_end_t >= %s{chan_clause}
                ORDER BY window_start_t""",
            tuple(params))
        rows = [dict(r) for r in cur.fetchall()]
        return {"predictions": rows, "null_reason": None if rows else "no_prediction_rows"}


def get_model_run_detail(*, env_id: str, business_id: UUID, model_name: str,
                         model_version: str | None = None) -> dict:
    """A single tel_model_runs row (champion metadata + metrics). Latest version when unspecified."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        params = [env_id, str(business_id), model_name]
        ver_clause = ""
        if model_version:
            ver_clause = " AND model_version = %s"
            params.append(str(model_version))
        cur.execute(
            f"""SELECT model_name, model_kind, model_version, model_alias, mlflow_run_id,
                       experiment_id, metrics, gate, promotion_state, created_at
                FROM tel_model_runs
                WHERE env_id = %s AND business_id = %s AND model_name = %s{ver_clause}
                ORDER BY created_at DESC LIMIT 1""",
            tuple(params))
        row = cur.fetchone()
        if row is None:
            return {"model": None, "null_reason": "model_not_promoted"}
        return {"model": dict(row), "null_reason": None}


def get_anomaly_events_in_window(*, env_id: str, business_id: UUID, run_key: str,
                                 t_start: int, t_end: int) -> dict:
    """Labeled / detected anomaly events overlapping [t_start, t_end] (point vs contextual class)."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        run_id = _run_id_for_key(cur, env_id, business_id, run_key)
        if run_id is None:
            return {"events": [], "null_reason": "missing_run"}
        cur.execute(
            """SELECT channel_name, start_t, end_t, anomaly_class, confidence, source
               FROM tel_anomaly_events
               WHERE env_id = %s AND business_id = %s AND run_id = %s
                 AND start_t <= %s AND end_t >= %s
               ORDER BY start_t""",
            (env_id, str(business_id), str(run_id), t_end, t_start))
        rows = [dict(r) for r in cur.fetchall()]
        return {"events": rows, "null_reason": None if rows else "no_anomaly_label"}


def health() -> dict:
    """Lean health check: confirm the serving tables are reachable and report promoted-model count."""
    with get_cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM tel_model_runs WHERE promotion_state = 'promoted'")
        promoted = int(cur.fetchone()["n"])
    return {"status": "ok", "promoted_models": promoted, "module": "telemetry"}


def _json(obj) -> str:
    import json
    return json.dumps(obj)
