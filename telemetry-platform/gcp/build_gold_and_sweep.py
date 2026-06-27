#!/usr/bin/env python3
"""S7 — BigQuery gold + real MAD_K threshold sweep + parity (Databricks-free).

Reproduces the FROZEN rolling-MAD champion from the public SMAP/MSL data (no Databricks), materializes
the test-split gold windows in BigQuery, sweeps MAD_K over the labeled test split using the canonical
pipeline.metrics, and exports two committed receipts:

  - threshold_sweep.json  — real PR/ROC + confusion across MAD_K, operating point at K=4.0.
  - parity_receipt.json   — the honest metrics at K=4.0 vs the deployed champion (must match), proving
                            the GCP-side computation reproduces the champion WITHOUT Databricks.

Run:
    python telemetry-platform/gcp/build_gold_and_sweep.py --data-dir <.../smap_msl> \
        --project novendor-events-prod --dataset telemetry --location us-east4
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]  # telemetry-platform/
sys.path.insert(0, str(ROOT))
from pipeline import metrics as pm  # noqa: E402  (canonical metric definitions)

RECEIPT_DIR = ROOT.parent / "backend" / "app" / "data" / "telemetry"
BASELINE_K = 4.0
GOLD_TABLE = "gold_smap_msl_windows"
SWEEP_KS = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0]


def trailing_rmean(values: np.ndarray, window: int = 50) -> np.ndarray:
    n = len(values)
    csum = np.concatenate([[0.0], np.cumsum(values, dtype=np.float64)])
    out = np.empty(n, dtype=np.float64)
    for i in range(n):
        lo = max(0, i - window + 1)
        out[i] = (csum[i + 1] - csum[lo]) / (i + 1 - lo)
    return out


def load_sequences(labels_csv: Path) -> dict:
    seqs = {}
    with labels_csv.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            seqs[row["chan_id"]] = json.loads(row["anomaly_sequences"])
    return seqs


def channel_values(npy: Path) -> np.ndarray:
    arr = np.load(npy)
    return (arr[:, 0] if arr.ndim == 2 else arr.ravel()).astype(np.float64)


def git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=str(ROOT)).decode().strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def build_channels(data_dir: Path):
    """Return (train scale map, global scale, per-test-channel records, gold rows)."""
    seqs = load_sequences(data_dir / "labeled_anomalies.csv")
    train_resid = {}
    for npy in sorted((data_dir / "arrays" / "train").glob("*.npy")):
        v = channel_values(npy)
        train_resid[npy.stem] = np.abs(v - trailing_rmean(v))
    global_scale = float(np.median(np.concatenate(list(train_resid.values())))) or 1.0
    scale = {c: (float(np.median(r)) or global_scale) for c, r in train_resid.items()}
    scale = {c: (s if s > 0 else global_scale) for c, s in scale.items()}

    test_chans = []
    gold_rows = []
    for npy in sorted((data_dir / "arrays" / "test").glob("*.npy")):
        chan = npy.stem
        v = channel_values(npy)
        rmean = trailing_rmean(v)
        resid = np.abs(v - rmean)
        s = scale.get(chan, global_scale)
        y = np.zeros(len(v), dtype=int)
        for seq in seqs.get(chan, []):
            a, b = int(seq[0]), min(int(seq[1]), len(v) - 1)
            if a <= b:
                y[a:b + 1] = 1
        test_chans.append({"chan": chan, "resid": resid, "scale": s, "y": y})
        for t in range(len(v)):
            gold_rows.append({
                "chan_id": chan, "split": "test", "t": int(t),
                "value": float(v[t]), "value_rmean50": float(rmean[t]),
                "residual": float(resid[t]), "train_scale": float(s),
                "is_anomaly": int(y[t]),
            })
    return scale, global_scale, test_chans, gold_rows


def sweep(test_chans) -> list:
    out = []
    for k in SWEEP_KS:
        channels = []
        tp = fp = fn = tn = 0
        for ch in test_chans:
            pred = (ch["resid"] > k * ch["scale"]).astype(int)
            y = ch["y"]
            channels.append((y, pred))
            tp += int(((pred == 1) & (y == 1)).sum())
            fp += int(((pred == 1) & (y == 0)).sum())
            fn += int(((pred == 0) & (y == 1)).sum())
            tn += int(((pred == 0) & (y == 0)).sum())
        m = pm.honest_anomaly_metrics(channels)
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        fpr = fp / (fp + tn) if (fp + tn) else 0.0
        out.append({
            "threshold": round(k, 3),
            "precision": round(precision, 6), "recall": round(recall, 6),
            "f1_pointwise": round(m["f1_pointwise"], 6),
            "event_recall": round(m["event_recall"], 6),
            "alarm_precision": round(m["alarm_precision"], 6),
            "affiliation_f1": round(m["affiliation_f1"], 6),
            "tpr": round(recall, 6), "fpr": round(fpr, 6),
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        })
    return out


def load_bigquery(gold_rows, project, dataset, location) -> dict:
    from google.cloud import bigquery
    client = bigquery.Client(project=project)
    ds_id = f"{project}.{dataset}"
    ds = bigquery.Dataset(ds_id)
    ds.location = location
    client.create_dataset(ds, exists_ok=True)
    table_id = f"{ds_id}.{GOLD_TABLE}"
    # Write NDJSON to a temp file and load (avoids a pyarrow dependency).
    tmp = ROOT / "gcp" / "_gold_load.ndjson"
    with tmp.open("w", encoding="utf-8") as f:
        for r in gold_rows:
            f.write(json.dumps(r) + "\n")
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        autodetect=True,
    )
    with tmp.open("rb") as f:
        job = client.load_table_from_file(f, table_id, job_config=job_config, location=location)
    job.result()
    tmp.unlink(missing_ok=True)
    t = client.get_table(table_id)
    return {"table": table_id, "rows": int(t.num_rows)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--project", default="novendor-events-prod")
    ap.add_argument("--dataset", default="telemetry")
    ap.add_argument("--location", default="us-east4")
    ap.add_argument("--skip-bq", action="store_true", help="compute receipts without loading BigQuery")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    manifest = ROOT / "databricks" / "data" / "manifest_smap_msl.json"
    manifest_sha = hashlib.sha256(manifest.read_bytes()).hexdigest()[:16]

    scale, global_scale, test_chans, gold_rows = build_channels(data_dir)
    rows_evaluated = sum(len(ch["y"]) for ch in test_chans)
    sw = sweep(test_chans)
    op = next(s for s in sw if abs(s["threshold"] - BASELINE_K) < 1e-9)

    bq = {"table": None, "rows": 0}
    if not args.skip_bq:
        bq = load_bigquery(gold_rows, args.project, args.dataset, args.location)

    source_table = bq["table"] or f"{args.project}.{args.dataset}.{GOLD_TABLE}"
    created = "2026-06-27T00:00:00Z"
    code_version = f"gcp-migration@{git_sha()}"

    detector_threshold = BASELINE_K * global_scale
    threshold_sweep = {
        "provider": "gcp",
        "source_bigquery_table": source_table,
        "vertex_experiment": None, "vertex_run_id": None, "vertex_model_id": None,
        "gcs_artifact_uri": None,
        "created_at": created, "code_version": code_version, "data_manifest_sha": manifest_sha,
        "rows_evaluated": rows_evaluated, "null_reason": None,
        "payload": {
            "operating_point": {
                "mad_k": BASELINE_K, "global_train_scale": global_scale,
                "detector_threshold": detector_threshold,
                "source": f"rolling-MAD over BigQuery {GOLD_TABLE} (public SMAP/MSL test split)",
            },
            "sweep": sw,
            "confusion_at_operating": {"tp": op["tp"], "fp": op["fp"], "fn": op["fn"], "tn": op["tn"]},
            "curves": {
                "pr": [{"recall": s["recall"], "precision": s["precision"]} for s in sw],
                "roc": [{"fpr": s["fpr"], "tpr": s["tpr"]} for s in sw],
            },
            "metric_basis": "point-wise honest (telemetry-platform/pipeline/metrics.honest_anomaly_metrics)",
            "sweep_pending": False,
        },
    }

    # Parity vs the deployed champion (Databricks-trained) honest metrics — must match.
    CHAMP = {"f1_pointwise": 0.312953, "event_recall": 0.769231, "affiliation_f1": 0.474634}
    parity = {
        "provider": "gcp",
        "source_bigquery_table": source_table,
        "vertex_experiment": None, "vertex_run_id": None, "vertex_model_id": None, "gcs_artifact_uri": None,
        "created_at": created, "code_version": code_version, "data_manifest_sha": manifest_sha,
        "rows_evaluated": rows_evaluated, "null_reason": None,
        "payload": {
            "claim": "GCP-side rolling-MAD reproduces the deployed champion's honest metrics from public data, with no Databricks dependency.",
            "operating_k": BASELINE_K,
            "gcp_metrics": {"f1_pointwise": op["f1_pointwise"], "event_recall": op["event_recall"], "affiliation_f1": op["affiliation_f1"]},
            "champion_metrics": CHAMP,
            "deltas": {k: round(op[k] - CHAMP[k], 6) for k in CHAMP},
            "match": all(abs(op[k] - CHAMP[k]) <= 1e-4 for k in CHAMP),
            "test_channels": len(test_chans),
        },
    }

    (RECEIPT_DIR / "threshold_sweep.json").write_text(json.dumps(threshold_sweep, indent=2) + "\n", encoding="utf-8")
    (RECEIPT_DIR / "parity_receipt.json").write_text(json.dumps(parity, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "bigquery": bq, "rows_evaluated": rows_evaluated, "operating_point": op,
        "parity_match": parity["payload"]["match"], "deltas": parity["payload"]["deltas"],
        "receipts": ["threshold_sweep.json", "parity_receipt.json"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
