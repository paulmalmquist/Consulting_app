# Databricks notebook source
# MAGIC %md
# MAGIC # Factory NCR Intelligence — embedding + clustering pipeline (REAL model run)
# MAGIC sentence-transformers (all-MiniLM-L6-v2) → UMAP(2D, random_state=SEED) → HDBSCAN →
# MAGIC c-TF-IDF keywords + centroid exemplars, over novendor_1.telemetry.ncr_records.
# MAGIC Writes ncr_points (per-record 2D coordinates + cluster label) and ncr_clusters (cluster
# MAGIC summaries) back to UC, and logs params/metrics to MLflow. The corpus is synthetic and labeled
# MAGIC as such; everything in THIS notebook is a real model run — the UI renders the model's actual
# MAGIC coordinates and labels, never render-time jitter.
# MAGIC
# MAGIC ===== TEACHING NOTES (plain language) =====
# MAGIC WHAT THIS FILE DOES: it takes each defect ticket's free-text summary and figures out which
# MAGIC tickets are "about the same thing," with no labels to start from. Three steps:
# MAGIC   1) EMBEDDING — turn each sentence into a list of ~384 numbers that captures its MEANING, so
# MAGIC      two tickets that say the same thing in different words end up as nearby number-lists.
# MAGIC   2) UMAP — a layout method that squashes those long number-lists down to just 2 numbers (an
# MAGIC      x and a y) while keeping similar tickets close together, so we can plot them.
# MAGIC   3) HDBSCAN — a clustering method that finds dense blobs of points and gives each blob a
# MAGIC      group number, while leaving lonely scattered points labeled -1 ("noise", i.e. ungrouped).
# MAGIC Then for each group it pulls out keywords (c-TF-IDF = the words most distinctive to that group)
# MAGIC and a few representative example tickets ("exemplars" = the tickets closest to the group center).
# MAGIC
# MAGIC WHERE YOU SEE THIS (exact page + visual): FactoryNcrIntelligence.tsx —
# MAGIC   - the UMAP x/y of each ticket ARE the dots on the SCATTER PLOT (one dot per ticket).
# MAGIC   - the HDBSCAN cluster label colors each dot and drives the PARETO BARS (count per family)
# MAGIC     and the KEYWORD / EXEMPLAR lists shown when you select a cluster.
# MAGIC
# MAGIC INPUTS -> OUTPUT: the ncr_records text rows in -> two tables out: ncr_points (one row per
# MAGIC ticket: its 2D coords + which cluster it landed in) and ncr_clusters (one row per cluster:
# MAGIC keywords, example tickets, size, trend, median close time, reopen rate).
# MAGIC
# MAGIC HOW TO READ THE JARGON (one phrase each):
# MAGIC   - embedding   = a sentence turned into a list of numbers that encodes its meaning.
# MAGIC   - UMAP        = a layout that flattens those number-lists to 2D, keeping neighbors as neighbors.
# MAGIC   - HDBSCAN     = density clustering that groups dense blobs and leaves outliers ungrouped (-1).
# MAGIC   - c-TF-IDF    = "which words are special to THIS cluster vs. all clusters" -> the keyword chips.
# MAGIC We pin random_state=SEED so the layout and groups are identical every run; the UI shows the
# MAGIC model's actual coordinates, not random jitter added at draw time.

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

SEED = 20260609                   # same seed everywhere -> identical layout + clusters every run
TEL = "novendor_1.telemetry"
EXPERIMENT_ID = "3740651530987773"
ANCHOR = date(2026, 6, 8)          # must match notebooks/ncr_corpus.py
N_WEEKS = 16
TREND_WEEKS = 8                    # trailing weeks shown per cluster
# The embedding model: a small, fast off-the-shelf sentence encoder. It reads a sentence and
# returns the ~384-number "meaning vector" described in the teaching notes.
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
# UMAP knobs. n_components=2 means "give me x,y so I can plot it"; metric="cosine" means "judge
# similarity by direction of the meaning vectors"; n_neighbors/min_dist control how tightly blobs pack.
UMAP_PARAMS = {"n_neighbors": 15, "min_dist": 0.1, "n_components": 2, "metric": "cosine"}
# HDBSCAN knobs: a blob needs at least 6 tickets to count as a real cluster; min_samples controls
# how conservative it is about calling a point an outlier.
HDBSCAN_PARAMS = {"min_cluster_size": 6, "min_samples": 4}
# A cluster gets a rising/declining/flat status chip in the UI based on its trend line's slope.
# These thresholds were declared up front (not cherry-picked after seeing results): a slope steeper
# than +0.35 tickets/week reads "rising", steeper than -0.35 reads "declining", anything between is "flat".
SLOPE_RISING = 0.35
SLOPE_DECLINING = -0.35

mlflow.set_experiment(experiment_id=EXPERIMENT_ID)

# Pull the ticket text (and a few fields we'll summarize later) out of the corpus table into a
# plain pandas table. docs = just the list of summary sentences we'll feed the embedder.
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

# STEP 1 — EMBED: turn every ticket sentence into its meaning vector (a list of numbers).
# normalize_embeddings=True scales them to unit length so we can compare by direction (cosine).
model = SentenceTransformer(EMBED_MODEL)
emb = model.encode(docs, normalize_embeddings=True, show_progress_bar=False)

# STEP 2 — UMAP: flatten each long meaning vector down to just (x, y) for plotting, keeping similar
# tickets near each other. -> these 2D coords ARE the scatter-plot dots on FactoryNcrIntelligence.
reducer = umap.UMAP(random_state=SEED, **UMAP_PARAMS)
coords = reducer.fit_transform(emb)

# STEP 3 — HDBSCAN: find the dense blobs of dots and label each one. fit_predict returns one label
# per ticket: 0,1,2,... for real clusters, and -1 for "noise" (a lonely point that joined no group).
clusterer = hdbscan.HDBSCAN(**HDBSCAN_PARAMS)
labels = clusterer.fit_predict(coords)

# Tally what we got: the real cluster numbers (label >= 0) and how many tickets were left ungrouped.
# -> cluster_ids drive the Pareto bars / keyword groups; noise_count is the gray "ungrouped" dots.
cluster_ids = sorted({int(c) for c in labels if c >= 0})
noise_count = int((labels == -1).sum())
print("clusters:", cluster_ids, "noise:", noise_count)

# COMMAND ----------
# Now name each cluster. c-TF-IDF answers "which words are distinctive to THIS group of tickets,
# compared with the other groups?" — those become the keyword chips in the UI. We count single
# words (unigrams) and adjacent word pairs (bigrams). STOP is the throwaway-words list (the, and,
# found...) we ignore so keywords are actually meaningful, not filler.
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
    # tf = how often each word appears WITHIN each cluster; df = in how many clusters the word shows
    # up at all. A word scores high when it's frequent inside one cluster but rare across the others
    # (so generic words common to every cluster get pushed down). We keep the top_k per cluster.
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


# Group the ticket sentences by their cluster label, then compute keywords for each cluster.
cluster_docs = {cid: [docs[i] for i in range(len(docs)) if labels[i] == cid] for cid in cluster_ids}
keywords = ctfidf_keywords(cluster_docs)

# COMMAND ----------
# Build one summary row per cluster for the UI. For each cluster we compute: a few example tickets
# (the ones nearest the cluster's center = "exemplars"), a trailing-8-week trend line and its
# rising/declining/flat status chip, the median days-to-close, and the reopen rate.
def week_idx(d: date) -> int:
    return (d - (ANCHOR - timedelta(weeks=N_WEEKS))).days // 7


clusters_out = []
for cid in cluster_ids:
    idx = np.flatnonzero(labels == cid)  # positions of all tickets in this cluster
    # The centroid is the average meaning-vector of the cluster (its "typical" ticket). The three
    # tickets sitting closest to that center are the clearest examples -> shown as cluster exemplars.
    centroid = emb[idx].mean(axis=0)
    dist = np.linalg.norm(emb[idx] - centroid, axis=1)
    exemplar_rows = rows.iloc[idx[np.argsort(dist)[:3]]]
    exemplars = [
        {"ncr_key": r.ncr_key, "workcell": r.workcell, "severity": r.severity, "summary": r.summary}
        for r in exemplar_rows.itertuples()
    ]
    sub = rows.iloc[idx]
    # Count how many of this cluster's tickets opened in each of the last 8 weeks -> the trend line.
    trend = [0] * TREND_WEEKS
    for d in sub["opened_at"]:
        w = week_idx(d if isinstance(d, date) else date.fromisoformat(str(d)))
        rel = w - (N_WEEKS - TREND_WEEKS)
        if 0 <= rel < TREND_WEEKS:
            trend[rel] += 1
    # Fit a straight line through those 8 weekly counts; its slope = average change per week.
    # Compare to the declared thresholds to stamp the rising / declining / flat status chip.
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

# One row per ticket: its 2D coordinates and which cluster it joined (-1 = ungrouped/noise).
# -> this is the literal data behind every dot on the scatter plot in FactoryNcrIntelligence.
points_out = [
    {"ncr_key": rows.iloc[i]["ncr_key"], "umap_x": float(coords[i][0]), "umap_y": float(coords[i][1]),
     "cluster_id": int(labels[i])}
    for i in range(len(rows))
]

# COMMAND ----------
# Log the run to MLflow (an experiment tracker): record what settings we used and how it turned out
# (number of clusters found, fraction left as noise, a clustering-quality score). This is the audit
# trail proving the UI numbers came from a real, reproducible model run.
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
# Write the two output tables: the per-dot coordinates and the per-cluster summaries. These are
# what 16_mirror_ncr_serving.py later copies into the serving tables the /api/telemetry/ncr endpoint
# reads, which is what FactoryNcrIntelligence ultimately renders.
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
