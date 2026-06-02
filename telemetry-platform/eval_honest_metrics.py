#!/usr/bin/env python3
"""Honest anomaly metrics for the FROZEN telemetry champion — evaluation only, no retrain.

Reproduces the promoted `tel_anomaly_detector` (rolling-MAD) predictions over the labeled SMAP/MSL
TEST split EXACTLY as the Databricks notebook does — locally, from the raw arrays + labels + the frozen
rule — so it touches no model, alias, gold table, or the live /score path. It then reports honest,
range-aware metrics BESIDE the legacy point-adjusted F1, and re-derives the point-adjusted F1 as a
fidelity check (should match the stored champion F1 ~0.6387).

Frozen rule (verified in notebooks/train_anomaly.py + 06_gold.py):
  value          = column 0 of each .npy (per chan_id, split, t = row index)
  value_rmean50  = trailing mean, window 50  (ROWS BETWEEN 49 PRECEDING AND CURRENT ROW), per chan/split
  resid          = |value - value_rmean50|
  scale[chan]    = median(resid over TRAIN for that chan); 0 -> global; missing -> global
  global_scale   = median(resid over ALL TRAIN)
  pred           = resid_test > 4.0 * scale            (BASELINE_K = 4.0)
  is_anomaly     = 1 if t in any inclusive [start,end] of the channel's labeled anomaly_sequences (test)

Honest metrics (transparent, no risky deps; VUS-PR/ROC + formal affiliation are deferred to Track A):
  point-wise precision/recall/F1  (NO point adjustment — the defensible floor)
  event_recall                    (fraction of labeled anomaly segments with >=1 in-window alarm)
  alarm_precision                 (fraction of alarm ticks that fall inside a labeled window)

Usage:  python telemetry-platform/eval_honest_metrics.py --data-dir <path-to>/databricks/data/smap_msl
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np

BASELINE_K = 4.0


def trailing_rmean(values: np.ndarray, window: int = 50) -> np.ndarray:
    """Mean of the trailing `window` samples incl. current (min_periods=1), matching the SQL frame."""
    n = len(values)
    csum = np.concatenate([[0.0], np.cumsum(values, dtype=np.float64)])
    out = np.empty(n, dtype=np.float64)
    for i in range(n):
        lo = max(0, i - window + 1)
        out[i] = (csum[i + 1] - csum[lo]) / (i + 1 - lo)
    return out


def load_sequences(labels_csv: Path) -> dict[str, list[list[int]]]:
    seqs: dict[str, list[list[int]]] = {}
    with labels_csv.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            seqs[row["chan_id"]] = json.loads(row["anomaly_sequences"])
    return seqs


def channel_values(npy: Path) -> np.ndarray:
    arr = np.load(npy)
    return (arr[:, 0] if arr.ndim == 2 else arr.ravel()).astype(np.float64)


def point_adjust(y: np.ndarray, p: np.ndarray, chan_offsets: list[tuple[int, int]]) -> dict:
    """Reproduce the notebook's point-adjusted P/R/F1 (segment-expansion per channel)."""
    adj = p.copy()
    for lo, hi in chan_offsets:
        yy, pp = y[lo:hi], p[lo:hi]
        i, n = 0, len(yy)
        while i < n:
            if yy[i] == 1:
                j = i
                while j < n and yy[j] == 1:
                    j += 1
                if pp[i:j].any():
                    adj[lo + i:lo + j] = 1
                i = j
            else:
                i += 1
    tp = int(((adj == 1) & (y == 1)).sum())
    fp = int(((adj == 1) & (y == 0)).sum())
    fn = int(((adj == 0) & (y == 1)).sum())
    return _prf(tp, fp, fn)


def _prf(tp: int, fp: int, fn: int) -> dict:
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    return {"precision": round(prec, 6), "recall": round(rec, 6), "f1": round(f1, 6),
            "tp": tp, "fp": fp, "fn": fn}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True, help="path to .../databricks/data/smap_msl")
    ap.add_argument("--out", default="", help="optional path to write the metrics JSON")
    args = ap.parse_args()
    root = Path(args.data_dir)
    seqs = load_sequences(root / "labeled_anomalies.csv")

    # TRAIN residual scale (per channel + global), no labels needed.
    train_resids: list[np.ndarray] = []
    scale: dict[str, float] = {}
    for npy in sorted((root / "arrays" / "train").glob("*.npy")):
        v = channel_values(npy)
        r = np.abs(v - trailing_rmean(v))
        train_resids.append(r)
        scale[npy.stem] = float(np.median(r))
    global_scale = float(np.median(np.concatenate(train_resids))) or 1.0
    scale = {c: (s if s and s > 0 else global_scale) for c, s in scale.items()}

    # TEST: reproduce champion predictions + labels, concatenated in chan order.
    y_all: list[np.ndarray] = []
    p_all: list[np.ndarray] = []
    offsets: list[tuple[int, int]] = []
    seg_total = seg_hit = 0
    cursor = 0
    for npy in sorted((root / "arrays" / "test").glob("*.npy")):
        chan = npy.stem
        v = channel_values(npy)
        r = np.abs(v - trailing_rmean(v))
        s = scale.get(chan, global_scale)
        pred = (r > BASELINE_K * s).astype(int)
        y = np.zeros(len(v), dtype=int)
        for seq in seqs.get(chan, []):
            a, b = int(seq[0]), int(seq[1])
            y[a:b + 1] = 1                     # inclusive, matches BETWEEN start AND end
            seg_total += 1
            if pred[a:b + 1].any():
                seg_hit += 1
        y_all.append(y)
        p_all.append(pred)
        offsets.append((cursor, cursor + len(v)))
        cursor += len(v)

    y = np.concatenate(y_all)
    p = np.concatenate(p_all)

    pa = point_adjust(y, p, offsets)                         # legacy reproduction (fidelity check)
    tp = int(((p == 1) & (y == 1)).sum())
    fp = int(((p == 1) & (y == 0)).sum())
    fn = int(((p == 0) & (y == 1)).sum())
    pw = _prf(tp, fp, fn)                                     # honest point-wise
    event_recall = round(seg_hit / seg_total, 6) if seg_total else 0.0
    alarms = int((p == 1).sum())
    alarm_precision = round(int(((p == 1) & (y == 1)).sum()) / alarms, 6) if alarms else 0.0

    summary = {
        "frozen_rule": "rolling-MAD, K=4.0, per-channel TRAIN-residual scale (global fallback)",
        "test_channels": len(offsets),
        "test_ticks": int(len(y)),
        "test_anomaly_rate": round(float(y.mean()), 6),
        "f1_point_adjusted_reproduced": pa["f1"],   # fidelity check vs stored champion f1 (~0.6387)
        "point_adjusted_detail": pa,
        "honest": {
            "f1_pointwise": pw["f1"],
            "precision_pointwise": pw["precision"],
            "recall_pointwise": pw["recall"],
            "event_recall": event_recall,
            "alarm_precision": alarm_precision,
            "labeled_segments": seg_total,
        },
        "note": "Point-adjusted F1 inflates by crediting a whole labeled segment for one in-window hit. "
                "Point-wise/event metrics are the honest floor. VUS-PR/VUS-ROC + formal affiliation "
                "metrics are deferred to Track A.",
    }
    print(json.dumps(summary, indent=2))
    if args.out:
        Path(args.out).write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
