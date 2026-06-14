# Databricks notebook source
# MAGIC %md
# MAGIC # Gate 0 — Telemetry Trust Layer Falsification
# MAGIC Does embedding distance carry trust information beyond the point RUL prediction?
# MAGIC
# MAGIC **Question:** among C-MAPSS FD001 windows with similar *predicted* RUL, are windows farther
# MAGIC from the training fleet in embedding space associated with larger absolute RUL error?
# MAGIC
# MAGIC **No training.** Predictions come from the registered `tel_rul_regressor` champion (frozen
# MAGIC inference). The embedding is a z-score (+ optional PCA) transform of the existing
# MAGIC `gold_cmapss_features` columns. No SupCon, no new predictor, no schema/UI/API.
# MAGIC
# MAGIC Parent ticket: `docs/plans/03-implementation-plans/active/telemetry-trust-gate0-ticket.md`

# COMMAND ----------
import json
import numpy as np
import pandas as pd
import mlflow

TEL = "novendor_1.telemetry"
SUBSET = "FD001"
RUL_CAP = 125                       # build convention
MODEL_URI = f"models:/{TEL}.tel_rul_regressor/1"   # registered champion, version 1
K = 10                              # kNN
PCA_K = 24                          # embedding dim after PCA (None disables PCA)
BANDS = [(0, 25), (25, 50), (50, 75), (75, 100), (100, 10_000)]
N_BOOT = 2000
SEED = 0
rng = np.random.default_rng(SEED)

# COMMAND ----------
# ---- Load existing gold features (no new data) ----
feat = spark.table(f"{TEL}.gold_cmapss_features").toPandas()
feat = feat[feat.subset == SUBSET].copy()
FEAT_COLS = [c for c in feat.columns if c.startswith("sensor_")]   # same 47 cols the model trained on

train = feat[feat.split == "train"].dropna(subset=FEAT_COLS).copy()
test = feat[feat.split == "test"].dropna(subset=FEAT_COLS).copy()
# True RUL at each row, capped (piecewise-linear convention). gold_cmapss_features.rul_target is the
# per-row remaining cycles; cap it for a consistent error scale with how the model was trained.
# Drop any test rows lacking a valid rul_target so all downstream ints/stats run on complete rows only.
test = test[test["rul_target"].notna()].copy()
test["y_true"] = np.minimum(test["rul_target"].to_numpy(), RUL_CAP)
n_test_dropped_nan_truth = int((feat[(feat.split == "test")]["rul_target"].isna()).sum())
print("FD001 | feat cols", len(FEAT_COLS), "| train rows", len(train),
      "| test rows", len(test), "| train units", train.unit.nunique(),
      "| test units", test.unit.nunique(),
      "| test rows dropped (NaN rul_target):", n_test_dropped_nan_truth)

# COMMAND ----------
# ---- Frozen-inference predictions from the registered champion (NO training) ----
model = mlflow.sklearn.load_model(MODEL_URI)
Xtr = train[FEAT_COLS].to_numpy()
Xte = test[FEAT_COLS].to_numpy()
test["pred_rul"] = np.clip(model.predict(Xte), 0, RUL_CAP)
test["abs_err"] = np.abs(test["pred_rul"].to_numpy() - test["y_true"].to_numpy())
overall_rmse = float(np.sqrt(np.mean((test["pred_rul"] - test["y_true"]) ** 2)))
print("scored test rows", len(test), "| all-cycle RMSE", round(overall_rmse, 3),
      "(NOT the 100-unit last-cycle benchmark; do not cite as competitive)")

# COMMAND ----------
# ---- Cheap embedding: z-score on TRAIN stats (+ optional PCA). A feature transform, not training ----
mu = Xtr.mean(axis=0)
sd = Xtr.std(axis=0)
sd[sd == 0] = 1.0
Ztr = (Xtr - mu) / sd
Zte = (Xte - mu) / sd

emb_method = "zscore"
if PCA_K:
    # PCA via SVD on standardized TRAIN features (fit on existing features, not a predictor).
    Uc = Ztr - Ztr.mean(axis=0)
    _, _, Vt = np.linalg.svd(Uc, full_matrices=False)
    comps = Vt[:PCA_K]
    Etr = Ztr @ comps.T
    Ete = Zte @ comps.T
    emb_method = f"zscore+pca{PCA_K}"
else:
    Etr, Ete = Ztr, Zte
print("embedding:", emb_method, "| dim", Etr.shape[1])

# COMMAND ----------
# ---- kNN distance: each TEST window -> nearest TRAIN windows (L2 on the embedding) ----
# Exclude same-unit leakage is moot (train/test units are disjoint in C-MAPSS), but we still compute
# test->train only. Chunk to bound memory.
tr_units = train.unit.to_numpy()
knn_dist = np.empty(len(Ete))
nn_train_idx = np.empty(len(Ete), dtype=int)
CH = 512
for s in range(0, len(Ete), CH):
    e = Ete[s:s + CH]                                  # (b, d)
    # squared L2 to all train points
    d2 = ((e[:, None, :] - Etr[None, :, :]) ** 2).sum(axis=2)   # (b, n_train)
    part = np.argpartition(d2, K, axis=1)[:, :K]
    rowK = np.take_along_axis(d2, part, axis=1)
    knn_dist[s:s + CH] = np.sqrt(rowK.mean(axis=1))   # mean of k nearest (deep-kNN style)
    nn_train_idx[s:s + CH] = part[np.arange(len(e)), rowK.argmin(axis=1)]
test["knn_dist"] = knn_dist
test["nn_train_unit"] = tr_units[nn_train_idx]
test["nn_train_cycle"] = train["cycle"].to_numpy()[nn_train_idx]

# COMMAND ----------
# ---- Within-band Spearman rho(knn_dist, abs_err) + bootstrap CI ----
def spearman(a, b):
    ra = pd.Series(a).rank().to_numpy()
    rb = pd.Series(b).rank().to_numpy()
    ra -= ra.mean(); rb -= rb.mean()
    den = np.sqrt((ra**2).sum() * (rb**2).sum())
    return float((ra * rb).sum() / den) if den > 0 else 0.0

def boot_ci(a, b, n=N_BOOT):
    a = np.asarray(a); b = np.asarray(b); m = len(a)
    if m < 8:
        return [None, None]
    rs = np.empty(n)
    for i in range(n):
        idx = rng.integers(0, m, m)
        rs[i] = spearman(a[idx], b[idx])
    return [float(np.percentile(rs, 2.5)), float(np.percentile(rs, 97.5))]

def quantile_table(df, q=4):
    # median abs_err by knn-distance quartile within the band (monotonicity check)
    d = df.copy()
    d["dq"] = pd.qcut(d["knn_dist"], q, labels=False, duplicates="drop")
    return [
        {"distance_quartile": int(k), "n": int(len(g)),
         "median_abs_err": float(g["abs_err"].median()),
         "mean_knn_dist": float(g["knn_dist"].mean())}
        for k, g in d.groupby("dq")
    ]

per_band = []
for lo, hi in BANDS:
    g = test[(test.pred_rul >= lo) & (test.pred_rul < hi)]
    if len(g) < 8:
        per_band.append({"band": f"{lo}-{hi if hi < 9999 else 'inf'}", "n": int(len(g)),
                         "rho": None, "ci95": [None, None], "note": "too few rows"})
        continue
    rho = spearman(g["knn_dist"].to_numpy(), g["abs_err"].to_numpy())
    ci = boot_ci(g["knn_dist"].to_numpy(), g["abs_err"].to_numpy())
    per_band.append({
        "band": f"{lo}-{hi if hi < 9999 else 'inf'}", "n": int(len(g)),
        "rho": round(rho, 4), "ci95": [round(ci[0], 4) if ci[0] is not None else None,
                                       round(ci[1], 4) if ci[1] is not None else None],
        "ci_method": f"bootstrap_{N_BOOT}",
        "median_abs_err_by_distance_quartile": quantile_table(g),
    })
overall_rho = spearman(test["knn_dist"].to_numpy(), test["abs_err"].to_numpy())
print("overall rho", round(overall_rho, 4))
for b in per_band:
    print(b["band"], "n=", b["n"], "rho=", b["rho"], "ci=", b["ci95"])

# COMMAND ----------
# ---- A/B pair discovery: similar pred RUL, different knn_dist, different abs_err ----
pairs = []
t = test.reset_index(drop=True)
for lo, hi in BANDS:
    g = t[(t.pred_rul >= lo) & (t.pred_rul < hi)]
    if len(g) < 20:
        continue
    near = g[g.knn_dist <= g.knn_dist.quantile(0.25)]
    far = g[g.knn_dist >= g.knn_dist.quantile(0.75)]
    for _, a in near.iterrows():
        cand = far[np.abs(far.pred_rul - a.pred_rul) <= 3.0]
        if len(cand) == 0:
            continue
        b = cand.iloc[(cand.abs_err - a.abs_err).abs().argmax()]   # max error contrast
        # guard: skip any row with a missing field (defensive; truth NaNs already dropped upstream)
        vals = [a.unit, a.cycle, a.pred_rul, a.y_true, a.abs_err, a.knn_dist,
                b.unit, b.cycle, b.pred_rul, b.y_true, b.abs_err, b.knn_dist]
        if any(pd.isna(v) for v in vals):
            continue
        gap_dist = float(b.knn_dist - a.knn_dist)
        gap_err = float(b.abs_err - a.abs_err)
        if gap_dist <= 0 or gap_err <= 0:
            continue
        pairs.append({
            "band": f"{lo}-{hi if hi < 9999 else 'inf'}",
            "A": {"unit": int(a.unit), "cycle": int(a.cycle), "pred_rul": round(float(a.pred_rul), 1),
                  "true_rul": int(a.y_true), "abs_err": round(float(a.abs_err), 1),
                  "knn_dist": round(float(a.knn_dist), 4),
                  "nn_analog": f"unit{int(a.nn_train_unit)}@c{int(a.nn_train_cycle)}"},
            "B": {"unit": int(b.unit), "cycle": int(b.cycle), "pred_rul": round(float(b.pred_rul), 1),
                  "true_rul": int(b.y_true), "abs_err": round(float(b.abs_err), 1),
                  "knn_dist": round(float(b.knn_dist), 4),
                  "nn_analog": f"unit{int(b.nn_train_unit)}@c{int(b.nn_train_cycle)}"},
            "dist_gap": round(gap_dist, 4), "err_gap": round(gap_err, 1),
            "score": round(gap_dist * gap_err, 3),
        })
pairs = sorted(pairs, key=lambda p: -p["score"])[:10]
print("A/B candidate pairs:", len(pairs))

# COMMAND ----------
# ---- Decision rule (three-way) ----
real_bands = [b for b in per_band if b["rho"] is not None]
pos_bands = [b for b in real_bands if b["ci95"][0] is not None and b["ci95"][0] > 0]   # CI excludes 0
strong = [b for b in pos_bands if b["rho"] >= 0.30]
if len(strong) >= 2 and len(pairs) >= 1:
    recommendation = "continue"
elif len(pos_bands) >= 1:
    recommendation = "train_contrastive"   # weak-but-real -> SupCon next
else:
    recommendation = "kill"
print("RECOMMENDATION:", recommendation)

# COMMAND ----------
evidence = {
    "gate": "telemetry_trust_gate0",
    "notebook": "telemetry-platform/databricks/notebooks/telemetry_trust_gate0_distance_error.py",
    "data_source_tables": [f"{TEL}.gold_cmapss_features"],
    "model_source": f"{TEL}.tel_rul_regressor (version 1, run c970fdcc; frozen inference, no retrain)",
    "embedding_source": f"derived in-notebook from gold_cmapss_features ({emb_method}); "
                        "NOT gold_fused_state_vectors (that is the SMAP/MSL anomaly lane)",
    "distance_metric": f"mean L2 over k={K} nearest train windows (deep-kNN style), embedding space",
    "dataset_split": {"subset": SUBSET, "train_rows": int(len(train)), "test_rows": int(len(test)),
                      "train_units": int(train.unit.nunique()), "test_units": int(test.unit.nunique()),
                      "test_rows_dropped_nan_truth": n_test_dropped_nan_truth,
                      "scoring": "all test cycles (not last-cycle-per-unit benchmark)"},
    "sklearn_pin": "scikit-learn==1.4.2 — REQUIRED: the champion was pickled under 1.4.2; newer "
                   "sklearn drops GradientBoostingRegressor's HalfSquaredError.get_init_raw_predictions "
                   "and predict() raises AttributeError. Pin to reproduce.",
    "rul_cap": RUL_CAP,
    "all_cycle_rmse": round(overall_rmse, 3),
    "all_cycle_rmse_note": "all-cycle RMSE, NOT the 100-unit last-cycle benchmark (20.32). Not a "
                           "literature-competitive claim.",
    "band_definitions": [f"{lo}-{hi if hi < 9999 else 'inf'}" for lo, hi in BANDS],
    "overall_spearman_rho": round(overall_rho, 4),
    "per_band": per_band,
    "top_ab_pairs": pairs,
    "recommendation": recommendation,
    "caveats": [
        "Embedding is a cheap z-score(+PCA) of existing features, not a learned/contrastive encoder; "
        "a weak-but-real rho routes to the SupCon ticket, not a kill.",
        "Scored at every test cycle for density; the shipped 20.32 RMSE is the last-cycle-per-unit "
        "benchmark and is a different quantity.",
        "C-MAPSS train/test units are disjoint, so kNN distance reflects fleet novelty, not memorization.",
        "FD001 has a single fault mode; the stronger novel-fault-mode test (FD003 cross-subset) is a "
        "later step, not this gate.",
    ],
}
print(json.dumps({"recommendation": recommendation,
                  "per_band": [(b["band"], b["rho"], b["ci95"]) for b in per_band],
                  "n_pairs": len(pairs)}, indent=2))
dbutils.notebook.exit(json.dumps(evidence))
