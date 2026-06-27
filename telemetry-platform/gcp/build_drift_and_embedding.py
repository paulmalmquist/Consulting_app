#!/usr/bin/env python3
"""S11 — real statistical drift + 2-D latent projection from public SMAP/MSL data (Databricks-free).

drift_feature_stats.json: PSI + KS + Wasserstein per feature (train reference vs test), pooled across
channels, plus the top-drifted channels by residual PSI. All computed in numpy (no scipy dependency).

embedding_projection.json: per-(channel, bucket) feature vectors PCA'd to 2-D, colored by anomaly label,
with reconstruction error. Honest caveat: diagnostic projection only, NOT a trust gate; alignment is by
normalized progress, not physical simultaneity.

factory_local_shap stays fail-closed (the factory tree models are not part of this migration).

Run:  python telemetry-platform/gcp/build_drift_and_embedding.py --data-dir <.../smap_msl>
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT.parent / "backend" / "app" / "data" / "telemetry"
TABLE = "novendor-events-prod.telemetry.gold_smap_msl_windows"


def git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=str(ROOT)).decode().strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def trailing_rmean(values: np.ndarray, window: int = 50) -> np.ndarray:
    n = len(values); cs = np.concatenate([[0.0], np.cumsum(values, dtype=np.float64)])
    out = np.empty(n)
    for i in range(n):
        lo = max(0, i - window + 1)
        out[i] = (cs[i + 1] - cs[lo]) / (i + 1 - lo)
    return out


def channel_values(npy: Path) -> np.ndarray:
    a = np.load(npy)
    return (a[:, 0] if a.ndim == 2 else a.ravel()).astype(np.float64)


def psi(ref: np.ndarray, cur: np.ndarray, bins: int = 10) -> float:
    edges = np.quantile(ref, np.linspace(0, 1, bins + 1))
    edges[0], edges[-1] = -np.inf, np.inf
    r = np.histogram(ref, edges)[0] / max(len(ref), 1)
    c = np.histogram(cur, edges)[0] / max(len(cur), 1)
    r = np.clip(r, 1e-6, None); c = np.clip(c, 1e-6, None)
    return float(np.sum((c - r) * np.log(c / r)))


def ks(ref: np.ndarray, cur: np.ndarray) -> float:
    grid = np.sort(np.concatenate([ref, cur]))
    cr = np.searchsorted(np.sort(ref), grid, side="right") / max(len(ref), 1)
    cc = np.searchsorted(np.sort(cur), grid, side="right") / max(len(cur), 1)
    return float(np.max(np.abs(cr - cc)))


def wasserstein(ref: np.ndarray, cur: np.ndarray, q: int = 200) -> float:
    qs = np.linspace(0, 1, q)
    return float(np.mean(np.abs(np.quantile(ref, qs) - np.quantile(cur, qs))))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    args = ap.parse_args()
    root = Path(args.data_dir)

    # Load train + test per channel; features = value, residual.
    train = {"value": [], "residual": []}
    test = {"value": [], "residual": []}
    per_chan_resid = {}
    bucket_rows, bucket_labels = [], []
    import csv
    seqs = {}
    with (root / "labeled_anomalies.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            seqs[row["chan_id"]] = json.loads(row["anomaly_sequences"])

    for npy in sorted((root / "arrays" / "train").glob("*.npy")):
        v = channel_values(npy); r = np.abs(v - trailing_rmean(v))
        train["value"].append(v); train["residual"].append(r)
    for npy in sorted((root / "arrays" / "test").glob("*.npy")):
        chan = npy.stem
        v = channel_values(npy); r = np.abs(v - trailing_rmean(v))
        test["value"].append(v); test["residual"].append(r)
        per_chan_resid[chan] = r
        # anomaly label per tick
        y = np.zeros(len(v), dtype=int)
        for seq in seqs.get(chan, []):
            a, b = int(seq[0]), min(int(seq[1]), len(v) - 1)
            if a <= b:
                y[a:b + 1] = 1
        # 16 buckets per channel -> 6-d feature vector + label
        n_buckets = 16
        idx = np.array_split(np.arange(len(v)), n_buckets)
        for chunk in idx:
            if len(chunk) < 3:
                continue
            vv, rr = v[chunk], r[chunk]
            slope = float(np.polyfit(np.arange(len(vv)), vv, 1)[0]) if len(vv) > 1 else 0.0
            bucket_rows.append([vv.mean(), vv.std(), rr.mean(), rr.max(), rr.std(), slope])
            bucket_labels.append(int(y[chunk].any()))

    # ── Drift per feature (pooled train vs test) ──
    feats = []
    for fname in ("value", "residual"):
        ref = np.concatenate(train[fname]); cur = np.concatenate(test[fname])
        # subsample for stable + fast stats
        rng = np.random.default_rng(0)
        ref_s = rng.choice(ref, size=min(len(ref), 50000), replace=False)
        cur_s = rng.choice(cur, size=min(len(cur), 50000), replace=False)
        p = psi(ref_s, cur_s); k = ks(ref_s, cur_s); w = wasserstein(ref_s, cur_s)
        feats.append({"feature": fname, "psi": round(p, 4), "ks_stat": round(k, 4),
                      "wasserstein": round(w, 4), "drifted": bool(p > 0.2),
                      "stability": "stable" if p < 0.1 else ("watch" if p < 0.2 else "drift")})

    # top drifted channels by residual PSI (train residual pooled as reference)
    ref_resid = np.concatenate(train["residual"])
    rng = np.random.default_rng(1)
    ref_rs = rng.choice(ref_resid, size=min(len(ref_resid), 50000), replace=False)
    chan_psi = []
    for chan, r in per_chan_resid.items():
        if len(r) >= 50:
            chan_psi.append({"channel": chan, "psi": round(psi(ref_rs, r), 4)})
    chan_psi.sort(key=lambda x: x["psi"], reverse=True)

    drift = {
        "provider": "gcp", "source_bigquery_table": TABLE,
        "vertex_experiment": None, "vertex_run_id": None, "vertex_model_id": None, "gcs_artifact_uri": None,
        "created_at": "2026-06-27T00:00:00Z", "code_version": f"gcp-migration@{git_sha()}",
        "data_manifest_sha": None, "rows_evaluated": int(sum(len(x) for x in test["value"])),
        "null_reason": None,
        "payload": {
            "reference_window": "train", "comparison_window": "test",
            "features": feats,
            "top_drifted_channels": chan_psi[:8],
            "summary": {"n_features": len(feats), "n_drifted": sum(1 for f in feats if f["drifted"]),
                        "max_psi": max(f["psi"] for f in feats)},
            "thresholds": {"psi_watch": 0.1, "psi_drift": 0.2},
            "note": "PSI/KS/Wasserstein per feature, train reference vs test (public SMAP/MSL).",
        },
    }
    (DATA / "drift_feature_stats.json").write_text(json.dumps(drift, indent=2) + "\n", encoding="utf-8")

    # ── Embedding: PCA-2 of per-bucket feature vectors ──
    X = np.array(bucket_rows, dtype=np.float64)
    labels = np.array(bucket_labels, dtype=int)
    mu, sd = X.mean(0), X.std(0); sd[sd == 0] = 1.0
    Xs = (X - mu) / sd
    pca = PCA(n_components=2, random_state=0).fit(Xs)
    coords = pca.transform(Xs)
    recon = pca.inverse_transform(coords)
    recon_err = np.sum((Xs - recon) ** 2, axis=1)
    # cap points in the fixture for size
    n = len(coords)
    sel = np.arange(n)
    if n > 600:
        rng = np.random.default_rng(2); sel = rng.choice(n, size=600, replace=False)
    points = [{"x": round(float(coords[i, 0]), 4), "y": round(float(coords[i, 1]), 4),
               "label_any_anomaly": int(labels[i]), "recon_error": round(float(recon_err[i]), 4)} for i in sel]
    embedding = {
        "provider": "gcp", "source_bigquery_table": TABLE,
        "vertex_experiment": None, "vertex_run_id": None, "vertex_model_id": None, "gcs_artifact_uri": None,
        "created_at": "2026-06-27T00:00:00Z", "code_version": f"gcp-migration@{git_sha()}",
        "data_manifest_sha": None, "rows_evaluated": n, "null_reason": None,
        "payload": {
            "method": "pca", "n_components": 2, "fit_on": "test buckets",
            "explained_variance": [round(float(v), 4) for v in pca.explained_variance_ratio_],
            "feature_order": ["value_mean", "value_std", "residual_mean", "residual_max", "residual_std", "value_slope"],
            "points": points,
            "non_goal_note": "Diagnostic projection only — NOT a trust gate. The killed embedding-distance trust thesis stays dead.",
            "alignment_note": "Aligned by normalized sequence progress per channel, not physical simultaneity.",
        },
    }
    (DATA / "embedding_projection.json").write_text(json.dumps(embedding, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"drift_features": feats, "top_drift_chan": chan_psi[:3],
                      "embedding_points": len(points), "explained_variance": embedding["payload"]["explained_variance"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
