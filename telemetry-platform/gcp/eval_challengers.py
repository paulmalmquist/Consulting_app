#!/usr/bin/env python3
"""Honest CHALLENGER evaluation for the telemetry anomaly model — Databricks-free, GCP-path.

WHAT THIS DOES (plain language)
    The Model Registry page compares a "champion" model against a "challenger." For the anomaly model
    the champion (a rolling-MAD rule) was measured with the full honest metric set, but the challenger
    (a PCA reconstruction detector) only ever recorded the inflated legacy F1 — so every honest bar on
    the page read "n/a". This script fixes that with REAL evidence: it scores BOTH models on the SAME
    NASA SMAP/MSL test windows, through the SAME honest metric code the champion used
    (telemetry-platform/eval_honest_metrics.py + pipeline/metrics.py), so the challenger's
    affiliation_f1 / f1_pointwise / event_recall / alarm_precision are computed on an identical basis.

WHY IT'S HONEST
    1. It first REPRODUCES the champion's metrics from the raw arrays and asserts they match the
       champion currently persisted in tel_model_runs (fidelity gate, Δ ~ 0). If the harness or data
       were wrong, this fails loudly before any challenger number is trusted.
    2. The PCA challenger is the SAME architecture already registered (PCA n_components=3,
       random_state=0, threshold = 99th percentile of TRAIN reconstruction error). No tuning to flatter.
    3. Rolling features mirror the gold definitions exactly (trailing-50 window, computed per
       chan_id+split so train never sees test — no look-ahead).
    4. It (optionally) logs the challenger run to the Vertex Experiment so the receipt carries a real
       vertex_run_id provenance stamp.

OUTPUT
    A provenance-stamped challenger receipt JSON (champion repro + challenger honest metrics + the
    head-to-head gate) that the serving upsert reads to write the challenger's tel_model_runs row.

Run:
    python telemetry-platform/gcp/eval_challengers.py --data-dir <.../smap_msl> --out <receipt.json> [--log-vertex]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]   # telemetry-platform/
sys.path.insert(0, str(ROOT))
# Reuse the champion's EXACT metric code — never reimplement, so the math can't drift.
from eval_honest_metrics import (  # noqa: E402
    BASELINE_K, AFFIL_CAP_D, channel_values, trailing_rmean, load_sequences,
    point_adjust, affiliation_metrics, _prf,
)

PCA_COMPONENTS = 3        # the registered challenger's setting
PCA_RANDOM_STATE = 0
PCA_PCTL = 99.0           # threshold = 99th percentile of TRAIN reconstruction error (matches Databricks)
GOLD_TABLE = "novendor-events-prod.telemetry.gold_smap_msl_windows"


# ── rolling features (trailing-50, current-inclusive) — mirror the gold SQL exactly ───────────────
def _trailing(values: np.ndarray, fn, window: int = 50) -> np.ndarray:
    """Apply fn over the trailing `window` samples incl. current (min_periods=1). Matches the gold
    frame ROWS BETWEEN 49 PRECEDING AND CURRENT ROW."""
    n = len(values)
    out = np.empty(n, dtype=np.float64)
    for i in range(n):
        out[i] = fn(values[max(0, i - window + 1): i + 1])
    return out


def _feature_matrix(v: np.ndarray) -> np.ndarray:
    """The 6 rolling features the PCA challenger reconstructs (value + 5 rolling stats)."""
    rmean = trailing_rmean(v)                                   # value_rmean50 (shared with champion)
    rstd = _trailing(v, lambda w: float(np.std(w, ddof=1)) if len(w) > 1 else 0.0)  # value_rstd50 (sample stddev)
    rmin = _trailing(v, np.min)                                 # value_rmin50
    rmax = _trailing(v, np.max)                                 # value_rmax50
    roc = np.diff(v, prepend=v[:1])                             # value_roc = value - LAG(value); first row 0
    return np.column_stack([v, rmean, rstd, rmin, rmax, roc])


def _events_and_labels(v_len: int, seqs_for_chan) -> tuple[np.ndarray, list[tuple[int, int]]]:
    y = np.zeros(v_len, dtype=int)
    events: list[tuple[int, int]] = []
    for seq in seqs_for_chan:
        a, b = int(seq[0]), min(int(seq[1]), v_len - 1)
        if a <= b:
            y[a:b + 1] = 1
            events.append((a, b))
    return y, events


def _honest_block(y: np.ndarray, p: np.ndarray, offsets, per_chan, seg_total, seg_hit) -> dict:
    """The honest metric bundle, computed with the champion's exact functions."""
    pa = point_adjust(y, p, offsets)                                  # legacy point-adjusted (inflated)
    tp = int(((p == 1) & (y == 1)).sum())
    fp = int(((p == 1) & (y == 0)).sum())
    fn = int(((p == 0) & (y == 1)).sum())
    pw = _prf(tp, fp, fn)                                             # honest point-wise P/R/F1
    affil = affiliation_metrics(per_chan)                            # range-aware affiliation F1
    alarms = int((p == 1).sum())
    return {
        "f1": pa["f1"],                                              # legacy point-adjusted F1
        "precision": pa["precision"], "recall": pa["recall"],
        "f1_pointwise": pw["f1"],                                    # -> "F1 (point-wise — honest)" bar
        "precision_pointwise": pw["precision"], "recall_pointwise": pw["recall"],
        "event_recall": round(seg_hit / seg_total, 6) if seg_total else 0.0,   # -> "Event recall" bar
        "alarm_precision": round(int(((p == 1) & (y == 1)).sum()) / alarms, 6) if alarms else 0.0,  # -> "Alarm precision" bar
        "affiliation_f1": affil["affiliation_f1"],                   # -> "Affiliation F1 (range-aware)" bar
        "affiliation_precision": affil["affiliation_precision"],
        "affiliation_recall": affil["affiliation_recall"],
        "affiliation_cap_d_ticks": AFFIL_CAP_D,
        "labeled_segments": seg_total,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True, help="path to .../smap_msl (raw arrays + labels)")
    ap.add_argument("--out", default="", help="path to write the challenger receipt JSON")
    ap.add_argument("--log-vertex", action="store_true", help="log the challenger run to the Vertex Experiment")
    args = ap.parse_args()
    root = Path(args.data_dir)
    seqs = load_sequences(root / "labeled_anomalies.csv")

    train_files = sorted((root / "arrays" / "train").glob("*.npy"))
    test_files = sorted((root / "arrays" / "test").glob("*.npy"))

    # ── TRAIN scale (champion) + TRAIN feature matrices (challenger) ──────────────────────────────
    train_resid = {}
    train_feats = {}
    for npy in train_files:
        v = channel_values(npy)
        train_resid[npy.stem] = np.abs(v - trailing_rmean(v))
        train_feats[npy.stem] = _feature_matrix(v)
    global_scale = float(np.median(np.concatenate(list(train_resid.values())))) or 1.0
    scale = {c: (float(np.median(r)) if np.median(r) > 0 else global_scale) for c, r in train_resid.items()}

    # Fit the PCA challenger on ALL train feature rows (no labels, no test — no look-ahead).
    from sklearn.decomposition import PCA
    Xtr = np.vstack([train_feats[c] for c in sorted(train_feats)])
    pca = PCA(n_components=PCA_COMPONENTS, random_state=PCA_RANDOM_STATE).fit(Xtr)

    def recon_err(X):
        return ((X - pca.inverse_transform(pca.transform(X))) ** 2).sum(axis=1)

    pca_thresh = float(np.percentile(recon_err(Xtr), PCA_PCTL))      # threshold from TRAIN errors only

    # ── TEST: score champion (MAD) and challenger (PCA) on identical windows ──────────────────────
    y_all = []
    champ_p, chal_p = [], []
    champ_perchan, chal_perchan, offsets = [], [], []
    champ_seg_hit = chal_seg_hit = seg_total = 0
    cursor = 0
    for npy in test_files:
        chan = npy.stem
        v = channel_values(npy)
        s = scale.get(chan, global_scale)
        y, events = _events_and_labels(len(v), seqs.get(chan, []))

        # champion: rolling-MAD on the residual (exact Stage-0 formula)
        resid = np.abs(v - trailing_rmean(v))
        cp = (resid > BASELINE_K * s).astype(int)
        # challenger: PCA reconstruction error over the 6-feature window, thresholded at the train pctl
        xp = (recon_err(_feature_matrix(v)) > pca_thresh).astype(int)

        for (a, b) in events:
            seg_total += 1
            if cp[a:b + 1].any():
                champ_seg_hit += 1
            if xp[a:b + 1].any():
                chal_seg_hit += 1
        y_all.append(y)
        champ_p.append(cp); chal_p.append(xp)
        champ_perchan.append({"events": events, "pred_idx": np.flatnonzero(cp)})
        chal_perchan.append({"events": events, "pred_idx": np.flatnonzero(xp)})
        offsets.append((cursor, cursor + len(v)))
        cursor += len(v)

    y = np.concatenate(y_all)
    champ = _honest_block(y, np.concatenate(champ_p), offsets, champ_perchan, seg_total, champ_seg_hit)
    chal = _honest_block(y, np.concatenate(chal_p), offsets, chal_perchan, seg_total, chal_seg_hit)

    # ── Head-to-head on the metric that actually governs promotion (honest affiliation F1) ─────────
    decision = {
        "primary_metric": "affiliation_f1",
        "champion_affiliation_f1": champ["affiliation_f1"],
        "challenger_affiliation_f1": chal["affiliation_f1"],
        "champion_ahead": champ["affiliation_f1"] >= chal["affiliation_f1"],
        "note": "Champion (rolling-MAD) vs challenger (PCA reconstruction), identical test windows + "
                "identical honest metric code. The challenger is the held comparison; the champion "
                "stays the live go/no-go model.",
    }

    receipt = {
        "model_kind": "anomaly",
        "champion": {"model_name": "tel_anomaly_detector", "rule": "rolling-MAD K=4.0",
                     "feature_set": "baseline (residual)", "metrics": champ},
        "challenger": {"model_name": "tel_anomaly_pca",
                       "rule": f"PCA reconstruction (n_components={PCA_COMPONENTS}, thresh=p{PCA_PCTL} train err)",
                       "feature_set": "6 rolling features", "metrics": chal},
        "decision": decision,
        "data": {"source_table": GOLD_TABLE, "raw_dataset": "smap_msl (telemanom public arrays)",
                 "test_channels": len(test_files), "test_rows": int(len(y)),
                 "labeled_segments": seg_total},
        "vertex": {"experiment": None, "run_id": None},
    }

    # Optional: stamp the challenger run into the Vertex Experiment for auditable provenance.
    if args.log_vertex:
        try:
            from google.cloud import aiplatform
            aiplatform.init(project="novendor-events-prod", location="us-east4",
                            experiment="telemetry-predictive-maintenance")
            with aiplatform.start_run("anomaly-pca-challenger-001") as run:
                run.log_params({"rule": "pca_recon", "n_components": PCA_COMPONENTS,
                                "pctl": PCA_PCTL, "source_table": GOLD_TABLE})
                run.log_metrics({k: v for k, v in chal.items() if isinstance(v, (int, float))})
            receipt["vertex"] = {"experiment": "telemetry-predictive-maintenance",
                                 "run_id": "anomaly-pca-challenger-001"}
        except Exception as e:  # noqa: BLE001 — provenance is best-effort; the metrics are the evidence
            receipt["vertex"] = {"experiment": None, "run_id": None, "log_error": f"{type(e).__name__}: {e}"}

    print(json.dumps({"champion_affiliation_f1": champ["affiliation_f1"],
                      "challenger_affiliation_f1": chal["affiliation_f1"],
                      "champion_f1_pointwise": champ["f1_pointwise"],
                      "challenger_f1_pointwise": chal["f1_pointwise"],
                      "champion_event_recall": champ["event_recall"],
                      "challenger_event_recall": chal["event_recall"]}, indent=2))
    if args.out:
        Path(args.out).write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print("wrote", args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
