# Databricks notebook source
# MAGIC %md
# MAGIC # Factory NCR Intelligence — embedding + clustering pipeline (REAL model run)
# MAGIC sentence-transformers (all-MiniLM-L6-v2) → UMAP(2D, random_state=SEED) → HDBSCAN →
# MAGIC c-TF-IDF keywords + centroid exemplars, over novendor_1.telemetry.ncr_records.
# MAGIC Writes ncr_points (per-record 2D coordinates + cluster label) and ncr_clusters (cluster
# MAGIC summaries) back to UC, and logs params/metrics to MLflow. The corpus is synthetic and labeled
# MAGIC as such; everything in THIS notebook is a real model run — the UI renders the model's actual
# MAGIC coordinates and labels, never render-time jitter.

# COMMAND ----------
# MAGIC %pip install sentence-transformers umap-learn hdbscan

# COMMAND ----------
dbutils.library.restartPython()  # type: ignore[name-defined]  # noqa: F821

# COMMAND ----------
import json
import statistics
from datetime import date, timedelta

import numpy as np
import mlflow

SEED = 20260609
TEL = "novendor_1.telemetry"
EXPERIMENT_ID = "3740651530987773"
ANCHOR = date(2026, 6, 8)          # must match notebooks/ncr_corpus.py
N_WEEKS = 16
TREND_WEEKS = 8                    # trailing weeks shown per cluster
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
UMAP_PARAMS = {"n_neighbors": 15, "min_dist": 0.1, "n_components": 2, "metric": "cosine"}
HDBSCAN_PARAMS = {"min_cluster_size": 6, "min_samples": 4}
# Declared (not tuned post-hoc): weekly-slope thresholds for the cluster status chip.
SLOPE_RISING = 0.35
SLOPE_DECLINING = -0.35

mlflow.set_experiment(experiment_id=EXPERIMENT_ID)

rows = (
    spark.table(f"{TEL}.ncr_records")  # type: ignore[name-defined]  # noqa: F821
    .select("ncr_key", "summary", "workcell", "severity", "opened_at", "closed_at", "reopened")
    .toPandas()
    .sort_values("ncr_key")
    .reset_index(drop=True)
)
docs = rows["summary"].tolist()
print("corpus rows:", len(rows))

# COMMAND ----------
from sentence_transformers import SentenceTransformer
import umap
import hdbscan

model = SentenceTransformer(EMBED_MODEL)
emb = model.encode(docs, normalize_embeddings=True, show_progress_bar=False)

reducer = umap.UMAP(random_state=SEED, **UMAP_PARAMS)
coords = reducer.fit_transform(emb)

clusterer = hdbscan.HDBSCAN(**HDBSCAN_PARAMS)
labels = clusterer.fit_predict(coords)

cluster_ids = sorted({int(c) for c in labels if c >= 0})
noise_count = int((labels == -1).sum())
print("clusters:", cluster_ids, "noise:", noise_count)

# COMMAND ----------
# c-TF-IDF keywords per cluster (BERTopic-style class-based tf-idf, unigrams + bigrams).
STOP = {
    "a", "an", "and", "at", "after", "as", "be", "beyond", "by", "during", "for", "found", "from",
    "in", "is", "of", "on", "or", "out", "per", "the", "to", "with", "via", "near", "required",
    "requires", "review", "observed", "recorded", "detected", "flagged", "indication", "found at",
}


def _tokens(text: str) -> list[str]:
    words = [w.strip(".,;:") for w in text.lower().split()]
    words = [w for w in words if w and w not in STOP and not w.isdigit()]
    bigrams = [f"{a} {b}" for a, b in zip(words, words[1:])]
    return words + bigrams


def ctfidf_keywords(cluster_docs: dict[int, list[str]], top_k: int = 5) -> dict[int, list[str]]:
    tf: dict[int, dict[str, int]] = {}
    df: dict[str, int] = {}
    for cid, cdocs in cluster_docs.items():
        counts: dict[str, int] = {}
        for d in cdocs:
            for t in _tokens(d):
                counts[t] = counts.get(t, 0) + 1
        tf[cid] = counts
        for t in counts:
            df[t] = df.get(t, 0) + 1
    avg_words = sum(sum(c.values()) for c in tf.values()) / max(len(tf), 1)
    out = {}
    for cid, counts in tf.items():
        total = sum(counts.values()) or 1
        scored = {t: (n / total) * np.log(1 + avg_words / df[t]) for t, n in counts.items()}
        out[cid] = [t for t, _ in sorted(scored.items(), key=lambda kv: -kv[1])[:top_k]]
    return out


cluster_docs = {cid: [docs[i] for i in range(len(docs)) if labels[i] == cid] for cid in cluster_ids}
keywords = ctfidf_keywords(cluster_docs)

# COMMAND ----------
# Cluster summaries: centroid exemplars (embedding space), trailing-8-week trend + declared slope
# status, median time-to-close, reopen rate.
def week_idx(d: date) -> int:
    return (d - (ANCHOR - timedelta(weeks=N_WEEKS))).days // 7


clusters_out = []
for cid in cluster_ids:
    idx = np.flatnonzero(labels == cid)
    centroid = emb[idx].mean(axis=0)
    dist = np.linalg.norm(emb[idx] - centroid, axis=1)
    exemplar_rows = rows.iloc[idx[np.argsort(dist)[:3]]]
    exemplars = [
        {"ncr_key": r.ncr_key, "workcell": r.workcell, "severity": r.severity, "summary": r.summary}
        for r in exemplar_rows.itertuples()
    ]
    sub = rows.iloc[idx]
    trend = [0] * TREND_WEEKS
    for d in sub["opened_at"]:
        w = week_idx(d if isinstance(d, date) else date.fromisoformat(str(d)))
        rel = w - (N_WEEKS - TREND_WEEKS)
        if 0 <= rel < TREND_WEEKS:
            trend[rel] += 1
    x = np.arange(TREND_WEEKS, dtype=float)
    slope = float(np.polyfit(x, np.array(trend, dtype=float), 1)[0])
    status = "rising" if slope >= SLOPE_RISING else ("declining" if slope <= SLOPE_DECLINING else "flat")
    ttcs = []
    for r in sub.itertuples():
        if r.closed_at is not None and str(r.closed_at) != "None":
            o = r.opened_at if isinstance(r.opened_at, date) else date.fromisoformat(str(r.opened_at))
            c = r.closed_at if isinstance(r.closed_at, date) else date.fromisoformat(str(r.closed_at))
            ttcs.append((c - o).days)
    clusters_out.append({
        "cluster_id": int(cid),
        "label": " · ".join(keywords[cid][:3]),
        "keywords": json.dumps(keywords[cid]),
        "exemplars": json.dumps(exemplars),
        "n_records": int(len(idx)),
        "status": status,
        "slope_per_week": round(slope, 4),
        "trend": json.dumps(trend),
        "median_ttc_days": float(statistics.median(ttcs)) if ttcs else None,
        "reopen_rate": float(sub["reopened"].mean()),
    })

points_out = [
    {"ncr_key": rows.iloc[i]["ncr_key"], "umap_x": float(coords[i][0]), "umap_y": float(coords[i][1]),
     "cluster_id": int(labels[i])}
    for i in range(len(rows))
]

# COMMAND ----------
with mlflow.start_run(run_name="ncr_clustering") as run:
    mlflow.log_param("embed_model", EMBED_MODEL)
    mlflow.log_param("umap_params", json.dumps(UMAP_PARAMS))
    mlflow.log_param("hdbscan_params", json.dumps(HDBSCAN_PARAMS))
    mlflow.log_param("seed", SEED)
    mlflow.log_param("status_slope_thresholds", json.dumps(
        {"rising": SLOPE_RISING, "declining": SLOPE_DECLINING}))
    mlflow.log_metric("n_docs", len(docs))
    mlflow.log_metric("n_clusters", len(cluster_ids))
    mlflow.log_metric("noise_count", noise_count)
    mlflow.log_metric("noise_frac", noise_count / max(len(docs), 1))
    if getattr(clusterer, "relative_validity_", None) is not None:
        mlflow.log_metric("dbcv_relative_validity", float(clusterer.relative_validity_))
    mlflow.log_dict({"clusters": clusters_out}, "clusters_summary.json")
    run_id = run.info.run_id

for c in clusters_out:
    c["mlflow_run_id"] = run_id

# Explicit schemas: nullable columns (e.g. median_ttc_days) must not depend on schema inference.
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, DoubleType  # noqa: E402

POINTS_SCHEMA = StructType([
    StructField("ncr_key", StringType()),
    StructField("umap_x", DoubleType()),
    StructField("umap_y", DoubleType()),
    StructField("cluster_id", IntegerType()),
])
CLUSTERS_SCHEMA = StructType([
    StructField("cluster_id", IntegerType()),
    StructField("label", StringType()),
    StructField("keywords", StringType()),
    StructField("exemplars", StringType()),
    StructField("n_records", IntegerType()),
    StructField("status", StringType()),
    StructField("slope_per_week", DoubleType()),
    StructField("trend", StringType()),
    StructField("median_ttc_days", DoubleType()),
    StructField("reopen_rate", DoubleType()),
    StructField("mlflow_run_id", StringType()),
])
spark.createDataFrame(points_out, schema=POINTS_SCHEMA).write.mode("overwrite") \
    .option("overwriteSchema", "true").saveAsTable(f"{TEL}.ncr_points")  # type: ignore[name-defined]  # noqa: F821
spark.createDataFrame(clusters_out, schema=CLUSTERS_SCHEMA).write.mode("overwrite") \
    .option("overwriteSchema", "true").saveAsTable(f"{TEL}.ncr_clusters")  # type: ignore[name-defined]  # noqa: F821

result = {
    "mlflow_run_id": run_id, "experiment_id": EXPERIMENT_ID,
    "n_docs": len(docs), "n_clusters": len(cluster_ids), "noise": noise_count,
    "sizes": {str(c["cluster_id"]): c["n_records"] for c in clusters_out},
    "statuses": {str(c["cluster_id"]): c["status"] for c in clusters_out},
    "tables": [f"{TEL}.ncr_points", f"{TEL}.ncr_clusters"],
}
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))  # type: ignore[name-defined]  # noqa: F821
