# Databricks notebook source
# MAGIC %md
# MAGIC # Telemetry — SMAP/MSL anomaly detection (baseline vs stronger)
# MAGIC Trains two real anomaly detectors on novendor_1.telemetry Gold tables, evaluates both with
# MAGIC point-adjusted precision/recall/F1 against the labeled test windows, logs each to MLflow,
# MAGIC and returns metrics + run IDs. No look-ahead: thresholds are calibrated on the TRAIN split
# MAGIC only; the TEST split is scored once with those frozen thresholds.

# COMMAND ----------
import json
import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
import mlflow.pyfunc
from mlflow.models.signature import infer_signature
from sklearn.decomposition import PCA

EXPERIMENT_ID = "3740651530987773"
TEL = "novendor_1.telemetry"
mlflow.set_experiment(experiment_id=EXPERIMENT_ID)

# F1 promotion gate, declared before training.
F1_GATE = 0.30

# COMMAND ----------
# Pull Gold windows once (rolling features already computed no-look-ahead in the lakehouse).
pdf = spark.table(f"{TEL}.gold_smap_msl_windows").select(
    "chan_id", "split", "t", "value",
    "value_rmean50", "value_rstd50", "value_rmin50", "value_rmax50", "value_roc", "is_anomaly"
).toPandas()
pdf = pdf.sort_values(["chan_id", "split", "t"]).reset_index(drop=True)
train = pdf[pdf.split == "train"].copy()
test = pdf[pdf.split == "test"].copy()
print("train rows", len(train), "test rows", len(test),
      "test anomaly rate", round(test.is_anomaly.mean(), 4))

# COMMAND ----------
# Point-adjusted evaluation: a labeled anomaly window counts as detected if ANY point in it is
# flagged; flagged points outside any window are false positives. This is the telemanom convention.
def point_adjust(df: pd.DataFrame, pred_col: str) -> dict:
    # Work entirely in positional space (reset_index) so numpy positions and labels never diverge.
    df = df.sort_values(["chan_id", "t"]).reset_index(drop=True)
    y = df["is_anomaly"].to_numpy().astype(int)
    p = df[pred_col].to_numpy().astype(int)
    adj = p.copy()
    # Expand: within each contiguous true-anomaly segment, if any predicted positive, mark all true.
    for _chan, g in df.groupby("chan_id"):
        pos = g.index.to_numpy()            # positional offsets into y/p/adj (df was reset)
        yy = y[pos]
        pp = p[pos]
        i = 0
        n = len(yy)
        while i < n:
            if yy[i] == 1:
                j = i
                while j < n and yy[j] == 1:
                    j += 1
                if pp[i:j].any():
                    adj[pos[i:j]] = 1
                i = j
            else:
                i += 1
    tp = int(((adj == 1) & (y == 1)).sum())
    fp = int(((adj == 1) & (y == 0)).sum())
    fn = int(((adj == 0) & (y == 1)).sum())
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    return {"precision": prec, "recall": rec, "f1": f1, "tp": tp, "fp": fp, "fn": fn}

# COMMAND ----------
# ---- BASELINE: rolling-median / MAD dynamic threshold on the raw value ----
# Per channel: robust center = rolling median proxy (value_rmean50), spread = MAD from train residuals.
# Threshold k chosen on TRAIN to flag ~ the train-implied rate, then frozen and applied to TEST.
def mad_resid(df):
    df = df.copy()
    df["resid"] = (df["value"] - df["value_rmean50"]).abs()
    return df

train_b = mad_resid(train)
test_b = mad_resid(test)

# Per-channel robust scale from TRAIN residuals (median absolute), with a global fallback.
scale = train_b.groupby("chan_id")["resid"].median().replace(0, np.nan)
global_scale = float(train_b["resid"].median()) or 1.0
scale = scale.fillna(global_scale)

BASELINE_K = 4.0  # frozen multiple of robust scale; declared, not tuned on test
def baseline_flag(df):
    df = df.copy()
    s = df["chan_id"].map(scale).fillna(global_scale).to_numpy()
    df["pred"] = (df["resid"].to_numpy() > BASELINE_K * s).astype(int)
    return df

test_b = baseline_flag(test_b)
m_base = point_adjust(test_b, "pred")
print("baseline", m_base)

# Pyfunc wrapper so the rule-based detector is a real, registrable model artifact.
class MadDetector(mlflow.pyfunc.PythonModel):
    def __init__(self, scale_map, global_scale, k):
        self.scale_map = scale_map
        self.global_scale = global_scale
        self.k = k
    def predict(self, context, model_input):
        df = model_input
        resid = (df["value"] - df["value_rmean50"]).abs().to_numpy()
        s = df["chan_id"].map(self.scale_map).fillna(self.global_scale).to_numpy()
        return (resid > self.k * s).astype(int)

with mlflow.start_run(run_name="anomaly_baseline_mad") as run:
    mlflow.log_param("model", "rolling_mad_dynamic_threshold")
    mlflow.log_param("k", BASELINE_K)
    mlflow.log_param("eval", "point_adjusted")
    for kk, vv in m_base.items():
        mlflow.log_metric(kk, float(vv))
    _bin = test_b[["chan_id", "value", "value_rmean50"]].head(5)
    _sig = infer_signature(_bin, m_base and test_b["pred"].head(5).to_numpy())
    mlflow.pyfunc.log_model(
        artifact_path="model",
        python_model=MadDetector(scale.to_dict(), global_scale, BASELINE_K),
        signature=_sig,
        input_example=_bin,
    )
    baseline_run_id = run.info.run_id

# COMMAND ----------
# ---- STRONGER: PCA reconstruction error over the rolling-feature vector ----
FEATS = ["value", "value_rmean50", "value_rstd50", "value_rmin50", "value_rmax50", "value_roc"]
tr = train.dropna(subset=FEATS).copy()
te = test.dropna(subset=FEATS).copy()

mu = tr[FEATS].mean()
sd = tr[FEATS].std().replace(0, 1.0)
Xtr = ((tr[FEATS] - mu) / sd).to_numpy()
Xte = ((te[FEATS] - mu) / sd).to_numpy()

pca = PCA(n_components=3, random_state=0).fit(Xtr)   # fit on TRAIN only (no look-ahead)
def recon_err(X):
    return ((X - pca.inverse_transform(pca.transform(X))) ** 2).sum(axis=1)

tr_err = recon_err(Xtr)
te_err = recon_err(Xte)
# Threshold frozen from TRAIN error distribution (99th percentile), applied to TEST.
PCA_PCTL = 99.0
thresh = float(np.percentile(tr_err, PCA_PCTL))
te = te.assign(pred=(te_err > thresh).astype(int))
m_pca = point_adjust(te, "pred")
print("pca", m_pca, "thresh", thresh)

with mlflow.start_run(run_name="anomaly_pca_recon") as run:
    mlflow.log_param("model", "pca_reconstruction_error")
    mlflow.log_param("n_components", 3)
    mlflow.log_param("train_pctl_threshold", PCA_PCTL)
    mlflow.log_param("eval", "point_adjusted")
    for kk, vv in m_pca.items():
        mlflow.log_metric(kk, float(vv))
    _sig_pca = infer_signature(Xte[:5], recon_err(Xte[:5]))
    mlflow.sklearn.log_model(pca, artifact_path="model", signature=_sig_pca, input_example=Xte[:5])
    pca_run_id = run.info.run_id

# COMMAND ----------
result = {
    "baseline": {"run_id": baseline_run_id, **m_base, "k": BASELINE_K},
    "pca": {"run_id": pca_run_id, **m_pca, "threshold": thresh},
    "f1_gate": F1_GATE,
    "test_anomaly_rate": float(test.is_anomaly.mean()),
    "experiment_id": EXPERIMENT_ID,
}
dbutils.notebook.exit(json.dumps(result))
