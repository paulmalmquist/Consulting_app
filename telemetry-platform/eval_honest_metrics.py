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

Honest metrics (transparent):
  point-wise precision/recall/F1  (NO point adjustment — the defensible floor)
  event_recall                    (fraction of labeled anomaly segments with >=1 in-window alarm)
  alarm_precision                 (fraction of alarm ticks that fall inside a labeled window)

Track A additions (all on the SAME frozen-champion predictions — still no retrain):
  affiliation precision/recall/F1 — CAPPED temporal proximity, normalized to [0,1] by a FIXED tick
    budget D (AFFIL_CAP_D, NOT the window length), so long labeled windows cannot inflate the score.
    prox = max(0, 1 - dist/D); precision = mean prox over predicted positives (to nearest event);
    recall = mean prox over events (to nearest predicted positive). Distances are within-channel.
  conformal false-alarm DIAGNOSTIC — on a blocked/contiguous (NOT i.i.d.-shuffled) calibration slice of
    the nominal TRAIN residuals: at the frozen K, the measured false-alarm rate / coverage, plus the K
    that would bound false alarms at the declared alpha. This is a diagnostic, NOT a distribution-free
    guarantee (residuals are autocorrelated time-series; we use a blocked split but make no coverage
    guarantee claim).
  VUS-PR / VUS-ROC — computed ONLY if a vetted library (`vus` / `tsb-uad`) imports + runs cleanly;
    otherwise null with vus_status="pending: <reason>". No homegrown VUS.

Usage:  python telemetry-platform/eval_honest_metrics.py --data-dir <path-to>/databricks/data/smap_msl
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np

BASELINE_K = 4.0
AFFIL_CAP_D = 50      # fixed tick budget for affiliation proximity (NOT window length) — un-gameable cap
CONFORMAL_ALPHA = 0.05
CALIB_TAIL_FRAC = 0.20  # blocked/contiguous calibration slice = last 20% of each channel's train residuals


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


def _pt_to_intervals_dist(idx: np.ndarray, intervals: list[tuple[int, int]]) -> np.ndarray:
    """Min tick-distance from each position in `idx` to any inclusive [a,b] interval (0 if inside)."""
    if idx.size == 0:
        return np.empty(0, dtype=np.float64)
    if not intervals:
        return np.full(idx.shape, np.inf)
    d = np.full(idx.shape, np.inf)
    for a, b in intervals:
        dd = np.where(idx < a, a - idx, np.where(idx > b, idx - b, 0)).astype(np.float64)
        d = np.minimum(d, dd)
    return d


def affiliation_metrics(per_chan: list[dict], cap_d: int = AFFIL_CAP_D) -> dict:
    """Capped-proximity affiliation P/R/F1. Distances are WITHIN-channel; proximity = max(0, 1-dist/D),
    so a labeled window's length cannot inflate the score (each event contributes exactly one recall
    term; each predicted positive exactly one precision term)."""
    prec_prox_sum = 0.0
    prec_count = 0
    rec_prox_sum = 0.0
    rec_count = 0
    for ch in per_chan:
        events = ch["events"]            # list[(a,b)] inclusive, clipped to channel length
        pred_idx = ch["pred_idx"]        # np.ndarray of predicted-positive positions
        # precision: each predicted positive -> nearest event
        if pred_idx.size:
            d = _pt_to_intervals_dist(pred_idx, events)        # inf where channel has no events
            prox = np.clip(1.0 - d / cap_d, 0.0, 1.0)
            prox[~np.isfinite(d)] = 0.0
            prec_prox_sum += float(prox.sum())
            prec_count += int(pred_idx.size)
        # recall: each event -> nearest predicted positive
        for (a, b) in events:
            if pred_idx.size:
                dist = float(_pt_to_intervals_dist(pred_idx, [(a, b)]).min())
                prox = max(0.0, 1.0 - dist / cap_d) if np.isfinite(dist) else 0.0
            else:
                prox = 0.0
            rec_prox_sum += prox
            rec_count += 1
    p = prec_prox_sum / prec_count if prec_count else 0.0
    r = rec_prox_sum / rec_count if rec_count else 0.0
    f1 = 2 * p * r / (p + r) if (p + r) else 0.0
    return {"affiliation_precision": round(p, 6), "affiliation_recall": round(r, 6),
            "affiliation_f1": round(f1, 6), "cap_d_ticks": cap_d,
            "predicted_positives": prec_count, "events": rec_count}


def conformal_diagnostic(calib_norm_scores: np.ndarray, frozen_k: float = BASELINE_K,
                         alpha: float = CONFORMAL_ALPHA) -> dict:
    """DIAGNOSTIC (not a guarantee): on a blocked nominal-train calibration slice of normalized scores
    (resid/scale, i.e. the same quantity the rule thresholds at K), report the measured false-alarm rate
    & coverage at the frozen K, and the K that would bound false alarms at `alpha`."""
    n = int(calib_norm_scores.size)
    if n == 0:
        return {"conformal_alpha": alpha, "conformal_threshold_quantile": None,
                "conformal_calib_coverage": None, "conformal_measured_false_alarm_rate": None,
                "conformal_frozen_k": frozen_k, "calib_block_n": 0}
    far = float(np.mean(calib_norm_scores > frozen_k))   # nominal calib => exceedances are false alarms
    k_for_alpha = float(np.quantile(calib_norm_scores, 1.0 - alpha))
    return {
        "conformal_alpha": alpha,
        "conformal_threshold_quantile": round(k_for_alpha, 6),   # the K that bounds FA at alpha
        "conformal_calib_coverage": round(1.0 - far, 6),
        "conformal_measured_false_alarm_rate": round(far, 6),
        "conformal_frozen_k": frozen_k,
        "calib_block_n": n,
        "method": "blocked (contiguous per-channel train tail), not i.i.d. shuffle; diagnostic only",
    }


def try_vus(score: np.ndarray, label: np.ndarray) -> dict:
    """Compute VUS-PR/VUS-ROC ONLY via a vetted library if it imports + runs cleanly; else pending."""
    try:
        from vus.metrics import get_range_vus_roc  # type: ignore
    except Exception as e:  # not installed / import error
        return {"vus_pr": None, "vus_roc": None, "vus_status": f"pending: import failed ({type(e).__name__}: {e})"}
    try:
        res = get_range_vus_roc(score.astype(float), label.astype(int), AFFIL_CAP_D)
        if isinstance(res, dict):
            vroc = res.get("VUS_ROC") or res.get("R_AUC_ROC")
            vpr = res.get("VUS_PR") or res.get("R_AUC_PR")
        else:
            vroc, vpr = (res[0], res[1]) if len(res) >= 2 else (None, None)
        return {"vus_pr": (round(float(vpr), 6) if vpr is not None else None),
                "vus_roc": (round(float(vroc), 6) if vroc is not None else None),
                "vus_status": "computed via vus package"}
    except Exception as e:
        return {"vus_pr": None, "vus_roc": None, "vus_status": f"pending: run failed ({type(e).__name__}: {e})"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True, help="path to .../databricks/data/smap_msl")
    ap.add_argument("--out", default="", help="optional path to write the metrics JSON")
    args = ap.parse_args()
    root = Path(args.data_dir)
    seqs = load_sequences(root / "labeled_anomalies.csv")

    # TRAIN residual scale (per channel + global), no labels needed. Keep per-channel residuals for the
    # blocked conformal calibration split.
    train_resid_by_chan: dict[str, np.ndarray] = {}
    scale: dict[str, float] = {}
    for npy in sorted((root / "arrays" / "train").glob("*.npy")):
        v = channel_values(npy)
        r = np.abs(v - trailing_rmean(v))
        train_resid_by_chan[npy.stem] = r
        scale[npy.stem] = float(np.median(r))
    global_scale = float(np.median(np.concatenate(list(train_resid_by_chan.values())))) or 1.0
    scale = {c: (s if s and s > 0 else global_scale) for c, s in scale.items()}

    # TEST: reproduce champion predictions + labels, concatenated in chan order. Retain per-channel
    # structures (events, predicted-positive positions, normalized scores) for affiliation + VUS.
    y_all: list[np.ndarray] = []
    p_all: list[np.ndarray] = []
    score_all: list[np.ndarray] = []
    per_chan: list[dict] = []
    offsets: list[tuple[int, int]] = []
    seg_total = seg_hit = 0
    cursor = 0
    for npy in sorted((root / "arrays" / "test").glob("*.npy")):
        chan = npy.stem
        v = channel_values(npy)
        r = np.abs(v - trailing_rmean(v))
        s = scale.get(chan, global_scale)
        norm = r / s                              # normalized score (for affiliation/conformal/VUS only)
        pred = (r > BASELINE_K * s).astype(int)   # EXACT Stage-0 formula — preserve champion parity
        y = np.zeros(len(v), dtype=int)
        events: list[tuple[int, int]] = []
        for seq in seqs.get(chan, []):
            a, b = int(seq[0]), int(seq[1])
            b = min(b, len(v) - 1)
            if a > b:
                continue
            y[a:b + 1] = 1                        # inclusive, matches BETWEEN start AND end
            events.append((a, b))
            seg_total += 1
            if pred[a:b + 1].any():
                seg_hit += 1
        y_all.append(y)
        p_all.append(pred)
        score_all.append(norm)
        per_chan.append({"events": events, "pred_idx": np.flatnonzero(pred)})
        offsets.append((cursor, cursor + len(v)))
        cursor += len(v)

    y = np.concatenate(y_all)
    p = np.concatenate(p_all)
    score = np.concatenate(score_all)

    pa = point_adjust(y, p, offsets)                         # legacy reproduction (fidelity check)
    tp = int(((p == 1) & (y == 1)).sum())
    fp = int(((p == 1) & (y == 0)).sum())
    fn = int(((p == 0) & (y == 1)).sum())
    pw = _prf(tp, fp, fn)                                     # honest point-wise
    event_recall = round(seg_hit / seg_total, 6) if seg_total else 0.0
    alarms = int((p == 1).sum())
    alarm_precision = round(int(((p == 1) & (y == 1)).sum()) / alarms, 6) if alarms else 0.0

    affil = affiliation_metrics(per_chan)

    # Blocked conformal calibration: last CALIB_TAIL_FRAC (contiguous) of each channel's nominal TRAIN
    # normalized residuals (resid/scale). Time order preserved within channel; no i.i.d. shuffle.
    calib_blocks: list[np.ndarray] = []
    for chan, r in train_resid_by_chan.items():
        s = scale.get(chan, global_scale)
        nrm = r / s
        k = int(len(nrm) * CALIB_TAIL_FRAC)
        if k:
            calib_blocks.append(nrm[-k:])
    calib_norm = np.concatenate(calib_blocks) if calib_blocks else np.empty(0)
    conformal = conformal_diagnostic(calib_norm)

    vus = try_vus(score, y)

    honest = {
        "f1_pointwise": pw["f1"],
        "precision_pointwise": pw["precision"],
        "recall_pointwise": pw["recall"],
        "event_recall": event_recall,
        "alarm_precision": alarm_precision,
        "labeled_segments": seg_total,
    }

    # Declared gate — thresholds fixed BEFORE this recompute (see plan / docs). Fail-closed.
    gate_thresholds = {
        "f1_pointwise": 0.10, "event_recall": 0.50,
        "alarm_precision": 0.20, "affiliation_f1": 0.25,
    }
    gate_values = {
        "f1_pointwise": honest["f1_pointwise"], "event_recall": honest["event_recall"],
        "alarm_precision": honest["alarm_precision"], "affiliation_f1": affil["affiliation_f1"],
    }
    gate_checks = {k: bool(gate_values[k] >= thr) for k, thr in gate_thresholds.items()}
    honest_gate = {
        "thresholds": gate_thresholds,
        "values": gate_values,
        "checks": gate_checks,
        "passed": all(gate_checks.values()),
        "declared_before_recompute": True,
    }

    summary = {
        "frozen_rule": "rolling-MAD, K=4.0, per-channel TRAIN-residual scale (global fallback)",
        "test_channels": len(offsets),
        "test_ticks": int(len(y)),
        "test_anomaly_rate": round(float(y.mean()), 6),
        "f1_point_adjusted_reproduced": pa["f1"],   # fidelity check vs stored champion f1 (~0.6387)
        "point_adjusted_detail": pa,
        "honest": honest,
        "affiliation": affil,
        "conformal": conformal,
        "vus": vus,
        "honest_gate": honest_gate,
        "note": "Point-adjusted F1 inflates by crediting a whole labeled segment for one in-window hit. "
                "Point-wise/event/affiliation metrics are the honest floor. Affiliation uses a fixed cap "
                "D so long windows can't inflate it. Conformal is a blocked-calibration DIAGNOSTIC, not a "
                "distribution-free guarantee. VUS only if a vetted library runs cleanly.",
    }
    print(json.dumps(summary, indent=2))
    if args.out:
        Path(args.out).write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
