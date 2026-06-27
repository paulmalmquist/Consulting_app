#!/usr/bin/env python3
"""Vertex Custom Training Job entrypoint — anomaly champion (rolling-MAD), Databricks-free.

Runs INSIDE a Vertex CustomJob. Reads the BigQuery gold (test windows carry the per-channel train scale
+ residual + label), materializes the champion model (the per-channel MAD scale map) to GCS, evaluates
honest metrics, and logs params + metrics to the Vertex Experiment `telemetry-predictive-maintenance`.
No online endpoint is created. Metrics are inlined (the prebuilt container has no pipeline.metrics) but
mirror telemetry-platform/pipeline/metrics.py exactly.
"""
from __future__ import annotations

import json
import os
import tempfile
from collections import defaultdict

import numpy as np

PROJECT = os.environ.get("GCP_PROJECT", "novendor-events-prod")
LOCATION = os.environ.get("GCP_LOCATION", "us-east4")
EXPERIMENT = os.environ.get("EXPERIMENT", "telemetry-predictive-maintenance")
RUN_NAME = os.environ.get("RUN_NAME", "anomaly-mad-baseline-001")
TABLE = os.environ.get("GOLD_TABLE", "novendor-events-prod.telemetry.gold_smap_msl_windows")
BUCKET = os.environ.get("ARTIFACT_BUCKET", "novendor-events-prod-telemetry-ml")
MAD_K = float(os.environ.get("MAD_K", "4.0"))
AFFIL_D = 50


def _dist_to_events(idx: np.ndarray, events) -> np.ndarray:
    if idx.size == 0:
        return np.empty(0)
    if not events:
        return np.full(idx.shape, np.inf)
    d = np.full(idx.shape, np.inf)
    for a, b in events:
        dd = np.where(idx < a, a - idx, np.where(idx > b, idx - b, 0)).astype(float)
        d = np.minimum(d, dd)
    return d


def main() -> int:
    from google.cloud import aiplatform, bigquery, storage

    bq = bigquery.Client(project=PROJECT)
    q = f"SELECT chan_id, t, residual, train_scale, is_anomaly FROM `{TABLE}` ORDER BY chan_id, t"
    chans = defaultdict(lambda: {"resid": [], "y": [], "scale": None})
    for r in bq.query(q).result():
        c = chans[r["chan_id"]]
        c["resid"].append(float(r["residual"]))
        c["y"].append(int(r["is_anomaly"]))
        c["scale"] = float(r["train_scale"])

    scale_map = {c: chans[c]["scale"] for c in chans}
    yall, pall, per_chan = [], [], []
    seg_total = seg_hit = 0
    for c, d in chans.items():
        resid = np.array(d["resid"]); y = np.array(d["y"])
        pred = (resid > MAD_K * d["scale"]).astype(int)
        yall.append(y); pall.append(pred)
        ev = []
        i = 0
        while i < len(y):
            if y[i] == 1:
                j = i
                while j + 1 < len(y) and y[j + 1] == 1:
                    j += 1
                ev.append((i, j)); seg_total += 1
                if pred[i:j + 1].any():
                    seg_hit += 1
                i = j + 1
            else:
                i += 1
        per_chan.append({"events": ev, "pred_idx": np.flatnonzero(pred)})

    y = np.concatenate(yall); p = np.concatenate(pall)
    tp = int(((p == 1) & (y == 1)).sum()); fp = int(((p == 1) & (y == 0)).sum()); fn = int(((p == 0) & (y == 1)).sum())
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    event_recall = seg_hit / seg_total if seg_total else 0.0
    alarms = int((p == 1).sum())
    alarm_prec = (int(((p == 1) & (y == 1)).sum()) / alarms) if alarms else 0.0
    ps = rs = 0.0; pc = rc = 0
    for ch in per_chan:
        pi = ch["pred_idx"]; ev = ch["events"]
        if pi.size:
            dd = _dist_to_events(pi, ev); prox = np.clip(1 - dd / AFFIL_D, 0, 1); prox[~np.isfinite(dd)] = 0
            ps += float(prox.sum()); pc += int(pi.size)
        for (a, b) in ev:
            if pi.size:
                dmin = float(_dist_to_events(pi, [(a, b)]).min())
                prox = max(0.0, 1 - dmin / AFFIL_D) if np.isfinite(dmin) else 0.0
            else:
                prox = 0.0
            rs += prox; rc += 1
    ap = ps / pc if pc else 0.0; ar = rs / rc if rc else 0.0
    aff_f1 = 2 * ap * ar / (ap + ar) if (ap + ar) else 0.0
    metrics = {
        "f1_pointwise": round(f1, 6), "precision_pointwise": round(prec, 6), "recall_pointwise": round(rec, 6),
        "event_recall": round(event_recall, 6), "alarm_precision": round(alarm_prec, 6),
        "affiliation_f1": round(aff_f1, 6),
    }

    # Write the champion model artifact + card to GCS (no online endpoint).
    import joblib
    gcs = storage.Client(project=PROJECT)
    tmp = tempfile.mkdtemp()
    model_path = os.path.join(tmp, "model.joblib")
    joblib.dump({"rule": "rolling_mad", "mad_k": MAD_K, "scale_map": scale_map}, model_path)
    art = f"telemetry/anomaly-mad/{RUN_NAME}"
    bucket = gcs.bucket(BUCKET)
    bucket.blob(f"{art}/model.joblib").upload_from_filename(model_path)
    card = {"model": "tel_anomaly_detector", "rule": "rolling-MAD K=4.0", "feature_set": "baseline",
            "n_channels": len(scale_map), "metrics": metrics, "source_table": TABLE}
    bucket.blob(f"{art}/model_card.json").upload_from_string(json.dumps(card, indent=2))
    gcs_uri = f"gs://{BUCKET}/{art}"

    # Log to Vertex Experiments (the run is the authoritative provenance record).
    aiplatform.init(project=PROJECT, location=LOCATION, experiment=EXPERIMENT)
    with aiplatform.start_run(RUN_NAME) as run:
        run.log_params({"mad_k": MAD_K, "n_channels": len(scale_map), "feature_set": "baseline", "source_table": TABLE})
        run.log_metrics(metrics)

    print("DONE " + json.dumps({"metrics": metrics, "gcs_uri": gcs_uri, "run_name": RUN_NAME, "experiment": EXPERIMENT}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
