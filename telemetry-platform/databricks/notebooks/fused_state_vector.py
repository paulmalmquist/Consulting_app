# Databricks notebook source
# MAGIC %md
# MAGIC # Telemetry — 256-d fused multi-signal state vector + autoencoder-style reconstruction (Phase 7A)
# MAGIC Builds a REAL 256-d fused state vector = 32 SMAP/MSL channels x 8 window features, computed only
# MAGIC from real values in gold_smap_msl_windows. Trains PCA-256 (baseline) + a dense autoencoder-style
# MAGIC bottleneck network (sklearn MLPRegressor). Per-channel reconstruction-error attribution. Logs to
# MAGIC MLflow and writes gold_fused_state_vectors + gold_fused_feature_manifest Delta tables.
# MAGIC
# MAGIC HONEST CAVEAT: channels are aligned by NORMALIZED SEQUENCE PROGRESS (each channel's split split
# MAGIC into B equal buckets), NOT by physical simultaneity. This is a fused NASA analog representation
# MAGIC for model development + retrieval, not simultaneous multi-sensor vehicle telemetry.

# COMMAND ----------
import json
import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
from mlflow.models.signature import infer_signature
from sklearn.decomposition import PCA
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler

EXPERIMENT_ID = "3740651530987773"
TEL = "novendor_1.telemetry"
mlflow.set_experiment(experiment_id=EXPERIMENT_ID)

B = 128                      # normalized buckets per channel per split -> fused vectors per split
N_CHANNELS = 32
FEATURES = ["value_last", "value_mean", "value_std", "value_min", "value_max",
            "value_slope", "residual_last", "residual_z"]   # 8 features; 32 x 8 = 256
FDIM = N_CHANNELS * len(FEATURES)
TRAIN_MIN, TEST_MIN = 1500, 2000   # adequacy thresholds (grounded in the real row distribution)
PCT = 99.0                          # recon-error threshold percentile (fit on TRAIN only)

# COMMAND ----------
# ---- channel selection (deterministic; D-4 forced; spacecraft + class mix) ----
stats = spark.sql(f"""
  WITH tr AS (SELECT chan_id, count(*) n_train FROM {TEL}.gold_smap_msl_windows WHERE split='train' GROUP BY chan_id),
       te AS (SELECT chan_id, max(spacecraft) craft, count(*) n_test, sum(is_anomaly) anom
              FROM {TEL}.gold_smap_msl_windows WHERE split='test' GROUP BY chan_id),
       lb AS (SELECT chan_id, max(anomaly_class) cls FROM {TEL}.silver_smap_msl_labels GROUP BY chan_id)
  SELECT te.chan_id, te.craft, tr.n_train, te.n_test, te.anom, lb.cls
  FROM te JOIN tr USING(chan_id) LEFT JOIN lb USING(chan_id)
""").toPandas()

adeq = stats[(stats.n_train >= TRAIN_MIN) & (stats.n_test >= TEST_MIN)].copy()
adeq = adeq.sort_values("chan_id").reset_index(drop=True)
candidates = adeq.chan_id.tolist()
if len(candidates) < N_CHANNELS:
    raise SystemExit(json.dumps({"error": "insufficient_channels", "adequate": int(len(candidates)),
                                 "max_honest_dim": int(len(candidates) * len(FEATURES))}))

# COMMAND ----------
# ---- pull raw rows for ALL adequate candidates (so we can quality-filter before locking 32) ----
in_cand = ",".join(f"'{c}'" for c in candidates)
raw = spark.sql(f"""
  SELECT chan_id, split, t, value, value_rmean50, value_rstd50, is_anomaly
  FROM {TEL}.gold_smap_msl_windows WHERE chan_id IN ({in_cand})
""").toPandas()
print(f"candidates (adequate): {len(candidates)}; raw rows pulled: {len(raw)}")

# ---- compute 8 features per (channel, split, bucket); bucket = normalized progress in [0,B) ----
def channel_bucket_features(df_cs: pd.DataFrame) -> pd.DataFrame:
    df = df_cs.sort_values("t").reset_index(drop=True)
    tmin, tmax = df.t.min(), df.t.max()
    span = max(tmax - tmin + 1, 1)
    df["bucket"] = np.minimum((B * (df.t - tmin) / span).astype(int), B - 1)
    out = []
    for b, g in df.groupby("bucket"):
        v = g.value.to_numpy(dtype=float)
        rmean = g.value_rmean50.to_numpy(dtype=float)
        rstd = g.value_rstd50.to_numpy(dtype=float)
        resid = v - rmean
        with np.errstate(divide="ignore", invalid="ignore"):
            rz = np.where(rstd > 1e-9, resid / rstd, np.nan)
        slope = np.polyfit(np.arange(len(v)), v, 1)[0] if len(v) >= 2 else np.nan
        out.append({
            "bucket": int(b),
            "value_last": v[-1], "value_mean": v.mean(), "value_std": v.std(ddof=0),
            "value_min": v.min(), "value_max": v.max(), "value_slope": slope,
            "residual_last": resid[-1], "residual_z": np.nanmean(rz) if np.isfinite(rz).any() else np.nan,
            "is_anom": int(g.is_anomaly.max()), "n_rows": len(v),
        })
    return pd.DataFrame(out)

feat_rows = []
rows_per_bucket = []
for (chan, split), g in raw.groupby(["chan_id", "split"]):
    cb = channel_bucket_features(g)
    cb["chan_id"] = chan; cb["split"] = split
    rows_per_bucket.extend(cb["n_rows"].tolist())
    feat_rows.append(cb)
feat = pd.concat(feat_rows, ignore_index=True)

# Impute missing feature values with the TRAIN-split median for that (channel, feature) — documented,
# no leakage (train statistics only), no padding columns.
for chan in candidates:
    for fcol in FEATURES:
        med = feat[(feat.chan_id == chan) & (feat.split == "train")][fcol].median()
        if not np.isfinite(med):
            med = feat[feat.split == "train"][fcol].median()  # global train fallback
        mask = (feat.chan_id == chan) & (~np.isfinite(feat[fcol]))
        feat.loc[mask, fcol] = med
print("rows/bucket: min", min(rows_per_bucket), "median", int(np.median(rows_per_bucket)), "max", max(rows_per_bucket))

# COMMAND ----------
# ---- quality filter: a channel passes only if EVERY one of its 8 features varies across the corpus
# (train+test buckets). This guarantees no constant/dead feature columns in the fused vector. ----
VAR_EPS = 1e-12
def channel_passes(chan: str) -> bool:
    g = feat[feat.chan_id == chan]
    return all(g[fcol].var(ddof=0) > VAR_EPS for fcol in FEATURES)

quality = [c for c in candidates if channel_passes(c)]
craft = stats.set_index("chan_id")["craft"]
print(f"quality-passing channels (all 8 features non-constant): {len(quality)} of {len(candidates)}")
if "D-4" not in quality:
    raise SystemExit(json.dumps({"error": "d4_failed_quality", "note": "D-4 has a constant feature"}))
if len(quality) < N_CHANNELS:
    raise SystemExit(json.dumps({"error": "insufficient_quality_channels", "passing": int(len(quality)),
                                 "max_honest_dim": int(len(quality) * len(FEATURES))}))

# ---- select 32 from quality-passing: force D-4, then ~2:1 SMAP:MSL round-robin by chan_id ----
smap = [c for c in quality if c != "D-4" and craft.loc[c] == "SMAP"]
msl  = [c for c in quality if c != "D-4" and craft.loc[c] == "MSL"]
selected = ["D-4"]; i = j = 0
while len(selected) < N_CHANNELS and (i < len(smap) or j < len(msl)):
    if (len(selected) % 3 != 0) and i < len(smap):
        selected.append(smap[i]); i += 1
    elif j < len(msl):
        selected.append(msl[j]); j += 1
    elif i < len(smap):
        selected.append(smap[i]); i += 1
selected = sorted(set(selected))
assert len(selected) == N_CHANNELS and "D-4" in selected, f"selected {len(selected)}"

sel_meta = stats.set_index("chan_id").loc[selected]
selection = [{
    "chan_id": c, "spacecraft": sel_meta.loc[c, "craft"],
    "n_train": int(sel_meta.loc[c, "n_train"]), "n_test": int(sel_meta.loc[c, "n_test"]),
    "anomaly_ticks_test": int(sel_meta.loc[c, "anom"]),
    "anomaly_class": (sel_meta.loc[c, "cls"] or "n/a"),
    "reason": ("replay channel (forced)" if c == "D-4"
               else f"adequate (train>={TRAIN_MIN}, test>={TEST_MIN}) + all 8 features non-constant; "
                    f"{sel_meta.loc[c,'craft']}; coverage"),
} for c in selected]
print(f"selected {len(selected)}: SMAP={sum(1 for s in selection if s['spacecraft']=='SMAP')} "
      f"MSL={sum(1 for s in selection if s['spacecraft']=='MSL')}; D-4 included")
chan_order = selected
# restrict the feature frame to the selected channels for downstream vector assembly
feat = feat[feat.chan_id.isin(selected)].reset_index(drop=True)

# COMMAND ----------
# ---- assemble fused 256-d vectors: one per (split, bucket), channels in FIXED sorted order ----
def build_vectors(split: str):
    vecs, labels, anom_chans, idxs = [], [], [], []
    for b in range(B):
        parts, any_anom, ch_anom = [], 0, []
        for chan in chan_order:
            row = feat[(feat.chan_id == chan) & (feat.split == split) & (feat.bucket == b)]
            if row.empty:
                parts.extend([np.nan] * len(FEATURES))  # rare; fixed below by global train median
            else:
                r = row.iloc[0]
                parts.extend([float(r[f]) for f in FEATURES])
                if split == "test" and int(r["is_anom"]) == 1:
                    any_anom = 1; ch_anom.append(chan)
        vecs.append(parts); labels.append(any_anom); anom_chans.append(ch_anom); idxs.append(b)
    X = np.array(vecs, dtype=float)
    # any remaining NaN (empty bucket for a channel) -> column-wise train median fill at the end
    return X, np.array(labels), anom_chans, idxs

Xtr_raw, ytr, _, idx_tr = build_vectors("train")
Xte_raw, yte, anom_te, idx_te = build_vectors("test")
# final NaN guard: fill any residual NaN with train column median (documented)
col_med = np.nanmedian(Xtr_raw, axis=0)
col_med = np.where(np.isfinite(col_med), col_med, 0.0)
Xtr_raw = np.where(np.isfinite(Xtr_raw), Xtr_raw, col_med)
Xte_raw = np.where(np.isfinite(Xte_raw), Xte_raw, col_med)
assert Xtr_raw.shape[1] == FDIM == 256, f"dim {Xtr_raw.shape[1]} != 256"
print("fused vectors:", Xtr_raw.shape, Xte_raw.shape, "test anomaly buckets:", int(yte.sum()))

# scaler fit on TRAIN only (no leakage); clip standardized features to +/-CLIP so a near-constant
# train feature with a test outlier cannot blow up reconstruction error (winsorized z-scores).
CLIP = 8.0
scaler = StandardScaler().fit(Xtr_raw)
Xtr = np.clip(scaler.transform(Xtr_raw), -CLIP, CLIP)
Xte = np.clip(scaler.transform(Xte_raw), -CLIP, CLIP)

# COMMAND ----------
# ---- feature manifest (256 rows) ----
manifest = []
for ci, chan in enumerate(chan_order):
    for fi, fname in enumerate(FEATURES):
        manifest.append({
            "feature_index": ci * len(FEATURES) + fi, "chan_id": chan, "feature_name": fname,
            "source_table": f"{TEL}.gold_smap_msl_windows",
            "calc": {"value_last": "last value in bucket", "value_mean": "mean(value)",
                     "value_std": "std(value)", "value_min": "min(value)", "value_max": "max(value)",
                     "value_slope": "OLS slope of value vs index", "residual_last": "last (value - value_rmean50)",
                     "residual_z": "mean((value - value_rmean50)/value_rstd50)"}[fname],
            "leakage_risk": "none (past-only rolling features; train-median imputation)",
            "included": True,
        })

# COMMAND ----------
# ---- evaluation helper: recon error -> threshold -> P/R/F1 vs label_any_anomaly ----
def evaluate(train_err, test_err, y):
    thr = float(np.percentile(train_err, PCT))
    pred = (test_err > thr).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum()); fp = int(((pred == 1) & (y == 0)).sum())
    fn = int(((pred == 0) & (y == 1)).sum())
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    return {"threshold": thr, "precision": prec, "recall": rec, "f1": f1, "tp": tp, "fp": fp, "fn": fn}

# ---- PCA-256 baseline ----
pca = PCA(n_components=16, random_state=0).fit(Xtr)
def pca_err(X): return ((X - pca.inverse_transform(pca.transform(X))) ** 2).sum(axis=1)
m_pca = evaluate(pca_err(Xtr), pca_err(Xte), yte)
with mlflow.start_run(run_name="fused_pca_256") as run:
    mlflow.log_param("model", "pca_recon_256"); mlflow.log_param("feature_dim", FDIM)
    mlflow.log_param("n_channels", N_CHANNELS); mlflow.log_param("features_per_channel", len(FEATURES))
    mlflow.log_param("buckets", B); mlflow.log_param("n_components", 16)
    for k, v in m_pca.items(): mlflow.log_metric(k, float(v))
    mlflow.log_dict({"selection": selection, "manifest_sample": manifest[:8]}, "fused_manifest.json")
    mlflow.sklearn.log_model(pca, artifact_path="model",
                             signature=infer_signature(Xte[:5], pca_err(Xte[:5])), input_example=Xte[:5])
    pca_run = run.info.run_id

# ---- dense autoencoder-style bottleneck net (MLPRegressor X->X), NOT a torch/LSTM AE ----
ae = MLPRegressor(hidden_layer_sizes=(128, 32, 16, 32, 128), activation="relu", solver="adam",
                  alpha=1e-3, max_iter=2000, early_stopping=True, n_iter_no_change=25,
                  random_state=0).fit(Xtr, Xtr)
def ae_recon(X): return ae.predict(X)
def ae_err(X): return ((X - ae_recon(X)) ** 2).sum(axis=1)
m_ae = evaluate(ae_err(Xtr), ae_err(Xte), yte)
with mlflow.start_run(run_name="fused_autoencoder_256") as run:
    mlflow.log_param("model", "dense_autoencoder_bottleneck_mlpregressor")
    mlflow.log_param("note", "dense autoencoder-style bottleneck network (sklearn MLPRegressor), not a torch/LSTM AE")
    mlflow.log_param("feature_dim", FDIM); mlflow.log_param("n_channels", N_CHANNELS)
    mlflow.log_param("features_per_channel", len(FEATURES)); mlflow.log_param("buckets", B)
    mlflow.log_param("architecture", "256->128->32->16->32->128->256")
    mlflow.log_param("train_samples", int(Xtr.shape[0]))
    mlflow.log_metric("train_recon_mse", float(ae_err(Xtr).mean()))
    mlflow.log_metric("test_recon_mse", float(ae_err(Xte).mean()))
    for k, v in m_ae.items(): mlflow.log_metric(k, float(v))
    mlflow.log_dict({"selection": selection, "manifest": manifest}, "fused_manifest.json")
    mlflow.sklearn.log_model(ae, artifact_path="model",
                             signature=infer_signature(Xte[:5], ae_recon(Xte[:5])), input_example=Xte[:5])
    ae_run = run.info.run_id
print("PCA", m_pca, "\nAE", m_ae)

# COMMAND ----------
# ---- per-channel attribution from AE per-feature reconstruction error ----
recon = ae_recon(Xte)
sq_err = (Xte - recon) ** 2                       # (n_test, 256) per-feature squared error
te_err_vec = ae_err(Xte)
fnames = [m["feature_name"] for m in manifest]
chans = [m["chan_id"] for m in manifest]
def top_contributors(row_sq):
    by_chan = {}
    for k, e in enumerate(row_sq):
        by_chan.setdefault(chans[k], []).append((fnames[k], float(e)))
    ranked = sorted(((c, sum(e for _, e in fl), sorted(fl, key=lambda x: -x[1])[:3]) for c, fl in by_chan.items()),
                    key=lambda x: -x[1])
    return [{"channel_id": c, "total_reconstruction_error": round(tot, 6),
             "top_features": [f for f, _ in tops], "rank": i + 1}
            for i, (c, tot, tops) in enumerate(ranked[:5])]

# COMMAND ----------
# ---- write Delta tables ----
# feature_vector stores the MODEL-READY representation: train-standardized + clipped to +/-8 (the same
# vector the AE/PCA see and the analog-retrieval embedding). Documented in the manifest/PROOF.
fused_rows = []
for k in range(len(Xte_raw)):
    fused_rows.append({
        "split": "test", "window_index": int(idx_te[k]),
        "source_channels": ",".join(chan_order), "vector_dim": FDIM,
        "feature_vector": [float(x) for x in Xte[k]],   # standardized + clipped (model-ready)
        "label_any_anomaly": int(yte[k]),
        "label_channels_anomalous": ",".join(anom_te[k]),
        "recon_error_ae": float(te_err_vec[k]), "recon_error_pca": float(pca_err(Xte[k:k+1])[0]),
        "top_contributors": json.dumps(top_contributors(sq_err[k])),
    })
for k in range(len(Xtr_raw)):
    fused_rows.append({
        "split": "train", "window_index": int(idx_tr[k]),
        "source_channels": ",".join(chan_order), "vector_dim": FDIM,
        "feature_vector": [float(x) for x in Xtr[k]], "label_any_anomaly": 0,
        "label_channels_anomalous": "", "recon_error_ae": float(ae_err(Xtr[k:k+1])[0]),
        "recon_error_pca": float(pca_err(Xtr[k:k+1])[0]), "top_contributors": "[]",
    })
fused_sdf = spark.createDataFrame(pd.DataFrame(fused_rows))
fused_sdf.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{TEL}.gold_fused_state_vectors")
man_sdf = spark.createDataFrame(pd.DataFrame(manifest))
man_sdf.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{TEL}.gold_fused_feature_manifest")

# COMMAND ----------
summary = {
    "feature_dim": FDIM, "n_channels": N_CHANNELS, "features_per_channel": len(FEATURES),
    "buckets": B, "fused_vectors_train": int(len(Xtr_raw)), "fused_vectors_test": int(len(Xte_raw)),
    "rows_per_bucket": {"min": int(min(rows_per_bucket)), "median": int(np.median(rows_per_bucket)),
                        "max": int(max(rows_per_bucket))},
    "test_anomaly_buckets": int(yte.sum()),
    "selection": selection,
    "feature_names": FEATURES,
    "alignment": "normalized sequence progress per channel/split (NOT physical simultaneity)",
    "models": {"pca_256": {"run_id": pca_run, **m_pca},
               "autoencoder_256": {"run_id": ae_run, "train_recon_mse": float(ae_err(Xtr).mean()),
                                   "test_recon_mse": float(ae_err(Xte).mean()), **m_ae}},
    "experiment_id": EXPERIMENT_ID,
    "delta_tables": [f"{TEL}.gold_fused_state_vectors", f"{TEL}.gold_fused_feature_manifest"],
}
dbutils.notebook.exit(json.dumps(summary))
