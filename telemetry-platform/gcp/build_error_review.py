#!/usr/bin/env python3
"""S9 — real FP / FN / borderline review from the BigQuery gold (Databricks-free).

Reads novendor-events-prod.telemetry.gold_smap_msl_windows, applies the frozen champion (residual >
4.0 * per-channel train scale), classifies each tick, and exports a small set of REAL representative
cases (no fabrication) for the Workbench FP/FN review. Each case answers: what did the model see, what
was the true label, which feature pushed it, was the miss operationally acceptable, what might fix it.

Run:
    python telemetry-platform/gcp/build_error_review.py
"""
from __future__ import annotations

import json
import subprocess
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RECEIPT = ROOT.parent / "backend" / "app" / "data" / "telemetry" / "error_review.json"
TABLE = "novendor-events-prod.telemetry.gold_smap_msl_windows"
MAD_K = 4.0


def git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=str(ROOT)).decode().strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def main() -> int:
    from google.cloud import bigquery
    bq = bigquery.Client(project="novendor-events-prod")
    q = (f"SELECT chan_id, t, value, value_rmean50, residual, train_scale, is_anomaly "
         f"FROM `{TABLE}` ORDER BY chan_id, t")
    chans = defaultdict(lambda: {"t": [], "value": [], "rmean": [], "resid": [], "scale": None, "y": []})
    for r in bq.query(q).result():
        c = chans[r["chan_id"]]
        c["t"].append(int(r["t"])); c["value"].append(float(r["value"])); c["rmean"].append(float(r["value_rmean50"]))
        c["resid"].append(float(r["residual"])); c["y"].append(int(r["is_anomaly"])); c["scale"] = float(r["train_scale"])

    fps, fns, borderline = [], [], []
    chan_fp_count = {}
    longest_missed = {"len": 0, "chan": None, "t": None}
    earliest_tp = {"t": 10 ** 12, "chan": None}
    for chan, d in chans.items():
        resid = np.array(d["resid"]); y = np.array(d["y"]); scale = d["scale"]; thr = MAD_K * scale
        pred = (resid > thr).astype(int)
        chan_fp_count[chan] = int(((pred == 1) & (y == 0)).sum())
        # earliest correct warning
        tp_idx = np.flatnonzero((pred == 1) & (y == 1))
        if tp_idx.size and d["t"][tp_idx[0]] < earliest_tp["t"]:
            earliest_tp = {"t": d["t"][tp_idx[0]], "chan": chan}
        # worst false positive on this channel (highest residual, y=0)
        fp_idx = np.flatnonzero((pred == 1) & (y == 0))
        if fp_idx.size:
            k = fp_idx[np.argmax(resid[fp_idx])]
            fps.append((float(resid[k]), chan, d["t"][k], thr))
        # missed anomaly segments (labeled, no pred) — longest
        i = 0
        while i < len(y):
            if y[i] == 1:
                j = i
                while j + 1 < len(y) and y[j + 1] == 1:
                    j += 1
                if not pred[i:j + 1].any():
                    seg_len = j - i + 1
                    # representative FN tick: highest residual within the missed segment (closest miss)
                    seg = resid[i:j + 1]
                    k = i + int(np.argmax(seg))
                    fns.append((seg_len, float(resid[k]), chan, d["t"][k], thr))
                    if seg_len > longest_missed["len"]:
                        longest_missed = {"len": seg_len, "chan": chan, "t": d["t"][i]}
                i = j + 1
            else:
                i += 1
        # borderline (residual within 0.9..1.1 x threshold)
        bd = np.flatnonzero((resid > 0.9 * thr) & (resid < 1.1 * thr))
        for k in bd[:1]:
            borderline.append((abs(resid[k] - thr), chan, d["t"][k], thr, int(y[k]), float(resid[k])))

    fps.sort(reverse=True)            # most egregious false alarms first
    fns.sort(reverse=True)            # longest missed segments first
    worst_chan = max(chan_fp_count, key=chan_fp_count.get) if chan_fp_count else None

    cases = []
    for resid, chan, t, thr in fps[:4]:
        cases.append({
            "id": f"fp-{chan}-{t}", "kind": "false_positive", "channel": chan, "window": f"t={t}",
            "model_saw": f"residual {resid:.4f} > threshold {thr:.4f}",
            "true_label": "nominal",
            "feature_pushed": "residual = |value - rolling_mean_50| (single-tick spike)",
            "acceptable": "Low-cost false alarm in isolation, but adds operator review load on a noisy channel.",
            "suggested_fix": "Temporal context (residual_slope / duration_above_band, feature set B) would separate a transient spike from sustained drift.",
        })
    for seg_len, resid, chan, t, thr in fns[:4]:
        cases.append({
            "id": f"fn-{chan}-{t}", "kind": "false_negative", "channel": chan,
            "window": f"t={t} (missed segment len {seg_len})",
            "model_saw": f"peak residual {resid:.4f} <= threshold {thr:.4f} across the labeled segment",
            "true_label": "anomaly",
            "feature_pushed": "no feature crossed the frozen threshold",
            "acceptable": "Unsafe if sustained — a missed anomaly segment; the operational cost is higher than a false alarm.",
            "suggested_fix": "A lower operating threshold raises recall but degrades alarm precision (see the sweep); per-channel scale or temporal features are the safer lever.",
        })
    for _, chan, t, thr, ylab, resid in sorted(borderline, reverse=True)[:2]:
        cases.append({
            "id": f"bd-{chan}-{t}", "kind": "borderline", "channel": chan, "window": f"t={t}",
            "model_saw": f"residual {resid:.4f} ~ threshold {thr:.4f}",
            "true_label": "anomaly" if ylab else "nominal",
            "feature_pushed": "residual sits within ±10% of the threshold",
            "acceptable": "Sensitive to the exact operating point — exactly what the threshold sweep is for.",
            "suggested_fix": "Pick the operating K from the sweep's precision/recall tradeoff, not a single guess.",
        })

    highlights = []
    if worst_chan is not None:
        highlights.append({"label": "Worst noisy channel", "value": f"{worst_chan} ({chan_fp_count[worst_chan]} FPs)"})
    if longest_missed["chan"]:
        highlights.append({"label": "Longest missed anomaly", "value": f"{longest_missed['chan']} (len {longest_missed['len']})"})
    if earliest_tp["chan"]:
        highlights.append({"label": "Earliest correct warning", "value": f"{earliest_tp['chan']} @ t={earliest_tp['t']}"})

    receipt = {
        "provider": "gcp",
        "source_bigquery_table": TABLE,
        "vertex_experiment": None, "vertex_run_id": None, "vertex_model_id": None, "gcs_artifact_uri": None,
        "created_at": "2026-06-27T00:00:00Z", "code_version": f"gcp-migration@{git_sha()}",
        "data_manifest_sha": None, "rows_evaluated": sum(len(d["y"]) for d in chans.values()),
        "null_reason": None,
        "payload": {
            "operating_k": MAD_K,
            "cases": cases,
            "highlights": highlights,
            "note": "Real cases from the frozen champion over the BigQuery gold test split. Lowering the "
                    "threshold raises recall but degrades alarm precision — the honest operating-point tradeoff.",
        },
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"cases": len(cases), "fps": len(fps), "fns": len(fns),
                      "worst_chan": worst_chan, "highlights": highlights, "receipt": str(RECEIPT.name)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
