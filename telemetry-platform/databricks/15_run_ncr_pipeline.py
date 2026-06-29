"""
RS Demo PR 3 driver — run the Factory NCR Intelligence pipeline.

===== TEACHING NOTES (plain language) =====
WHAT THIS FILE DOES: this is the ORCHESTRATOR — the conductor that runs the three pipeline stages in
order: ncr_corpus (make the demo tickets) -> ncr_clustering (group them + lay out the scatter plot)
-> ncr_backlog_forecast (predict the backlog). It doesn't do the ML math itself; it kicks off the
three notebooks and collects their results into one file for the next step (16_mirror_ncr_serving.py)
to ship to the serving database.

WHERE YOU SEE THIS: indirectly, the whole FactoryNcrIntelligence page —
repo-b/src/components/telemetry/FactoryNcrIntelligence.tsx — exists because this script ran the
pipeline that produced its data.

TWO WAYS TO RUN:
  - DATABRICKS (the real path, default): log in, upload the three notebooks, run each on a cloud
    cluster, and gather the results. This is the genuine model run with sentence embeddings, UMAP,
    HDBSCAN, and MLflow tracking — the story we actually demo.
  - LOCAL FALLBACK (RUNTIME=local): a smaller stand-in that runs entirely on this laptop when the
    Databricks login is down, so the demo page never shows up empty. It uses the SAME made-up tickets
    and the SAME forecast logic, but swaps the heavy ML libraries for lighter math: TF-IDF instead of
    neural embeddings, a plain SVD projection instead of UMAP, and k-means instead of HDBSCAN. Every
    row it produces is stamped provenance='local_fallback' so the UI is honest about where it ran.

INPUTS -> OUTPUT: nothing in (it generates its own corpus) -> ncr_pipeline_result.json (the combined
results), plus ncr_pipeline_local_data.json in local mode.

Run:  python 15_run_ncr_pipeline.py            (Databricks)
      RUNTIME=local python 15_run_ncr_pipeline.py
"""
from __future__ import annotations

import importlib.util
import json
import os
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESULT_PATH = HERE / "ncr_pipeline_result.json"
LOCAL_DATA_PATH = HERE / "ncr_pipeline_local_data.json"
NOTEBOOKS = ["ncr_corpus", "ncr_clustering", "ncr_backlog_forecast"]

SEED = 20260609
ANCHOR = date(2026, 6, 8)
N_WEEKS = 16
TREND_WEEKS = 8


def _load_corpus_module():
    spec = importlib.util.spec_from_file_location("ncr_corpus", HERE / "notebooks" / "ncr_corpus.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run_databricks() -> int:
    # The real path: connect to Databricks, then run the three notebooks in order on cloud clusters.
    from _bootstrap import get_client
    from _jobs import ensure_dir, upload_notebook, run_notebook_and_wait, get_notebook_output, WORKSPACE_DIR

    client = get_client()
    client.execute_sql("SELECT 1")  # auth preflight: a tiny query to confirm we're actually logged in
    ensure_dir(client)

    # Run each notebook, wait for it to finish, and stash its JSON exit payload keyed by name.
    exits: dict[str, dict] = {}
    for name in NOTEBOOKS:
        wp = upload_notebook(client, str(HERE / "notebooks" / f"{name}.py"), f"{WORKSPACE_DIR}/{name}")
        print(f"[ncr] uploaded {wp}")
        res = run_notebook_and_wait(client, wp, f"telemetry_{name}", timeout=2400)
        print(f"[ncr] {name}: result_state={res['result_state']} url={res['run_page_url']}")
        if res["result_state"] != "SUCCESS":
            print(f"[ncr] {name} FAILED — {res.get('state_message')}")
            return 2
        exits[name] = json.loads(get_notebook_output(client, res["run_id"]).get("result", "{}"))
        print(json.dumps(exits[name], indent=2))

    RESULT_PATH.write_text(json.dumps({"runtime": "databricks", "exits": exits}, indent=2),
                           encoding="utf-8")
    print(f"[ncr] wrote {RESULT_PATH.name}")
    return 0


# ── bounded local fallback ──────────────────────────────────────────────────────────────────────
def _local_embed_and_cluster(records: list[dict]) -> tuple[list[dict], list[dict], dict]:
    """TF-IDF -> truncated SVD (2D) -> seeded k-means. Honest stand-in, labeled local_fallback.

    Plain language: the laptop-only version of the clustering notebook. Instead of neural sentence
    embeddings + UMAP + HDBSCAN, it scores words by frequency (TF-IDF), squashes that to 2D with a
    matrix trick (SVD), and groups the dots into 6 buckets with k-means. Same SHAPE of output (dots +
    cluster summaries), simpler math. Used only when Databricks is unreachable.
    """
    import numpy as np

    docs = [r["summary"] for r in records]
    # Build a vocabulary of single words + adjacent word-pairs (the same tokenizer idea the real
    # notebook's c-TF-IDF uses), so keyword extraction below behaves consistently across both paths.
    def toks(text: str) -> list[str]:
        words = [w.strip(".,;:").lower() for w in text.split()]
        words = [w for w in words if len(w) > 2 and not w.isdigit()]
        return words + [f"{a} {b}" for a, b in zip(words, words[1:])]

    vocab: dict[str, int] = {}
    doc_tokens = [toks(d) for d in docs]
    for dt in doc_tokens:
        for t in dt:
            vocab.setdefault(t, len(vocab))
    tf = np.zeros((len(docs), len(vocab)))
    for i, dt in enumerate(doc_tokens):
        for t in dt:
            tf[i, vocab[t]] += 1
    # TF-IDF weighting: common-everywhere words get downweighted, distinctive words get upweighted,
    # then each ticket's vector is scaled to unit length so they're comparable.
    df = (tf > 0).sum(axis=0)
    tfidf = tf * np.log(len(docs) / np.maximum(df, 1))
    tfidf /= np.maximum(np.linalg.norm(tfidf, axis=1, keepdims=True), 1e-9)

    # Squash the wide word-vectors down to 2 numbers (x, y) for plotting — the no-UMAP stand-in.
    # -> these coords ARE the scatter-plot dots on FactoryNcrIntelligence in local-fallback mode.
    u, s, _ = np.linalg.svd(tfidf, full_matrices=False)
    coords = u[:, :2] * s[:2]

    # k-means: pick 6 starting centers, then repeatedly assign each ticket to its nearest center and
    # recompute the centers. The SEED makes the starting picks (and thus the groups) repeatable.
    rng = np.random.RandomState(SEED)
    k = 6
    centers = tfidf[rng.choice(len(docs), k, replace=False)]
    labels = np.zeros(len(docs), dtype=int)
    for _ in range(25):
        d2 = ((tfidf[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        labels = d2.argmin(axis=1)
        for j in range(k):
            if (labels == j).any():
                centers[j] = tfidf[labels == j].mean(axis=0)

    inv_vocab = {v: t for t, v in vocab.items()}
    points, clusters = [], []
    for i, r in enumerate(records):
        points.append({"ncr_key": r["ncr_key"], "umap_x": float(coords[i, 0]),
                       "umap_y": float(coords[i, 1]), "cluster_id": int(labels[i])})
    for j in range(k):
        idx = np.flatnonzero(labels == j)
        if not len(idx):
            continue
        center = tfidf[idx].mean(axis=0)
        top_terms = [inv_vocab[t] for t in np.argsort(-center)[:5]]
        dist = np.linalg.norm(tfidf[idx] - center, axis=1)
        exemplars = [{"ncr_key": records[i]["ncr_key"], "workcell": records[i]["workcell"],
                      "severity": records[i]["severity"], "summary": records[i]["summary"]}
                     for i in idx[np.argsort(dist)[:3]]]
        sub = [records[i] for i in idx]
        trend = [0] * TREND_WEEKS
        for r in sub:
            w = (date.fromisoformat(r["opened_at"]) - (ANCHOR - timedelta(weeks=N_WEEKS))).days // 7
            rel = w - (N_WEEKS - TREND_WEEKS)
            if 0 <= rel < TREND_WEEKS:
                trend[rel] += 1
        slope = float(np.polyfit(np.arange(TREND_WEEKS, dtype=float),
                                 np.array(trend, dtype=float), 1)[0])
        status = "rising" if slope >= 0.35 else ("declining" if slope <= -0.35 else "flat")
        ttcs = [(date.fromisoformat(r["closed_at"]) - date.fromisoformat(r["opened_at"])).days
                for r in sub if r["closed_at"]]
        clusters.append({
            "cluster_id": j, "label": " · ".join(top_terms[:3]), "keywords": top_terms,
            "exemplars": exemplars, "n_records": int(len(idx)), "status": status,
            "trend": trend,
            "median_ttc_days": float(statistics.median(ttcs)) if ttcs else None,
            "reopen_rate": float(sum(1 for r in sub if r["reopened"]) / len(sub)),
        })
    meta = {"method": "tfidf_svd_kmeans_local", "n_docs": len(records),
            "n_clusters": len(clusters), "noise": 0}
    return points, clusters, meta


def _local_forecast(records: list[dict]) -> tuple[list[dict], dict]:
    # Laptop version of the backlog forecast notebook — identical drift-vs-naive walk-forward logic,
    # just running locally. Produces the same history+forecast rows and the same MAE/MAPE numbers.
    import numpy as np

    week_starts = [ANCHOR - timedelta(weeks=N_WEEKS - w) for w in range(N_WEEKS)]
    opened = [0] * N_WEEKS
    closed = [0] * N_WEEKS
    for r in records:
        wo = (date.fromisoformat(r["opened_at"]) - week_starts[0]).days // 7
        if 0 <= wo < N_WEEKS:
            opened[wo] += 1
        if r["closed_at"]:
            wc = (date.fromisoformat(r["closed_at"]) - week_starts[0]).days // 7
            if 0 <= wc < N_WEEKS:
                closed[wc] += 1
    backlog = []
    for w in range(N_WEEKS):
        week_end = week_starts[w] + timedelta(days=6)
        backlog.append(sum(
            1 for r in records
            if date.fromisoformat(r["opened_at"]) <= week_end
            and (not r["closed_at"] or date.fromisoformat(r["closed_at"]) > week_end)))

    # Drift forecast: last known backlog nudged by the trailing-8-week average net flow (same as the notebook).
    def drift(t: int, h: int) -> float:
        lo = max(0, t - 8)
        net = [opened[i] - closed[i] for i in range(lo, t)]
        return backlog[t - 1] + h * (sum(net) / len(net))

    # Walk-forward backtest misses: rm = drift model residuals, rn = naive baseline residuals.
    rm = [backlog[t] - drift(t, 1) for t in range(8, N_WEEKS)]
    rn = [backlog[t] - backlog[t - 1] for t in range(8, N_WEEKS)]
    abs_m, abs_n = np.abs(rm), np.abs(rn)
    actuals = np.array(backlog[8:], dtype=float)
    metrics = {
        "mae": float(abs_m.mean()), "mae_naive": float(abs_n.mean()),
        "mape_pct": float((abs_m / np.maximum(actuals, 1)).mean() * 100),
        "mape_naive_pct": float((abs_n / np.maximum(actuals, 1)).mean() * 100),
        "backtest_folds": len(rm),
    }
    metrics["skill_vs_naive"] = (1 - metrics["mae"] / metrics["mae_naive"]) if metrics["mae_naive"] else 0.0
    q = float(np.quantile(abs_m, 0.90))
    rows = [{"week_start": week_starts[w].isoformat(), "kind": "history", "opened": opened[w],
             "closed": closed[w], "backlog": backlog[w], "fc": None, "lo": None, "hi": None}
            for w in range(N_WEEKS)]
    for h in range(1, 5):
        fc = drift(N_WEEKS, h)
        band = q * (h ** 0.5)
        rows.append({"week_start": (week_starts[-1] + timedelta(weeks=h)).isoformat(),
                     "kind": "forecast", "opened": None, "closed": None, "backlog": None,
                     "fc": round(fc, 2), "lo": round(fc - band, 2), "hi": round(fc + band, 2)})
    return rows, metrics


def run_local() -> int:
    # Same three stages as the Databricks path, but all in-process on this machine.
    print("[ncr] RUNTIME=local — bounded fallback (provenance='local_fallback')")
    corpus_mod = _load_corpus_module()
    records = corpus_mod.generate_corpus()  # stage 1: the identical seeded demo tickets
    points, clusters, cmeta = _local_embed_and_cluster(records)
    backlog_rows, fmetrics = _local_forecast(records)
    LOCAL_DATA_PATH.write_text(json.dumps({
        "records": records, "points": points, "clusters": clusters,
        "backlog_weekly": backlog_rows,
    }, indent=1), encoding="utf-8")
    RESULT_PATH.write_text(json.dumps({
        "runtime": "local",
        "exits": {
            "ncr_corpus": {"rows": len(records), "seed": SEED},
            "ncr_clustering": {**cmeta, "mlflow_run_id": None},
            "ncr_backlog_forecast": {**{k: round(v, 3) for k, v in fmetrics.items()},
                                     "mlflow_run_id": None},
        },
    }, indent=2), encoding="utf-8")
    print(json.dumps(json.loads(RESULT_PATH.read_text(encoding="utf-8")), indent=2))
    print(f"[ncr] wrote {RESULT_PATH.name} + {LOCAL_DATA_PATH.name}")
    return 0


def main() -> int:
    # Pick the path from the RUNTIME env var; default to the real Databricks run.
    runtime = os.environ.get("RUNTIME", "databricks").lower()
    if runtime == "local":
        return run_local()
    return run_databricks()


if __name__ == "__main__":
    sys.exit(main())
