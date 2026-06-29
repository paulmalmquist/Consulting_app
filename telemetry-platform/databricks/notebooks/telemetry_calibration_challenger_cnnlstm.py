# Databricks notebook source
# MAGIC %md
# MAGIC # Telemetry Calibration Layer — Ticket 2: CNN-LSTM challenger + tighter calibrated intervals
# MAGIC
# MAGIC Goal: beat the GBM baseline (RMSE 20.32 / PHM 1423, last-cycle FD001) on a sequence model and
# MAGIC **tighten** the conformal intervals while keeping calibrated coverage.
# MAGIC
# MAGIC **Graduation gate (ALL must hold, else GBM stays champion):**
# MAGIC 1. RMSE < 20.32 (last-cycle benchmark)
# MAGIC 2. PHM08 lower or materially better
# MAGIC 3. 80% / 90% conformal PICP within ±0.03 of nominal
# MAGIC 4. MPIW/PINAW narrower OR defensibly similar
# MAGIC 5. Tightening rule: if RMSE improves but MPIW/PINAW widens, it graduates ONLY if PHM08
# MAGIC    *materially* improves AND the wider interval is explicitly justified.
# MAGIC
# MAGIC Model: Conv1D x2 -> LSTM -> Dense (PyTorch CPU). One model, no transformer. No UI/API/schema.
# MAGIC Pin `torch==2.2.2`, `scikit-learn==1.4.2`. Plan: `telemetry-calibration-layer.md`.

# COMMAND ----------
# ===== TEACHING NOTES (plain language) =====
# WHAT THIS FILE DOES:
#   This is the CHALLENGER in a "challenger-vs-champion" bake-off: a new model tries to beat the current
#   best, and only replaces it if it clears every gate. The current champion is the GBM in
#   telemetry_calibration_baseline.py. The challenger here is a CNN-LSTM, a deep neural net that reads
#   each engine's sensor history two ways: the CNN (convolution) spots short patterns ACROSS sensors at a
#   moment, and the LSTM remembers how those patterns evolve OVER TIME. Together they predict Remaining
#   Useful Life (RUL = cycles of life left) from a 30-cycle sliding window of readings.
#
# WHERE YOU SEE THIS:
#   Same RUL / anomaly CALIBRATION surfaces as the baseline. This notebook decides whether the fancier
#   model "graduates" to champion. If it doesn't clear the gates, the GBM stays — the bar is deliberately
#   strict so we never ship a flashier-but-less-honest model.
#
# INPUTS -> OUTPUT:
#   INPUT  : silver_cmapss (raw per-cycle sensor readings, all 21 sensors) + silver_cmapss_rul (truth).
#   OUTPUT : an evidence JSON (accuracy + honesty metrics + a graduate yes/no) via dbutils.notebook.exit.
#            No UI, no new table, no API.
#
# HOW TO READ THE NUMBERS (jargon in one phrase each):
#   - champion vs challenger : the deployed model vs a contender that only wins if it beats it on EVERY gate.
#   - RMSE        : typical prediction error in cycles (lower = more accurate). Must beat GBM's 20.32.
#   - PHM08       : NASA's safety score that punishes LATE/optimistic RUL harder than early (lower = safer).
#   - PICP        : share of truths that actually fell inside the predicted range; "90%" range wants ~0.90.
#   - calibration : making stated confidence honest (a 90% range should really contain truth ~90% of time).
#   - MPIW/PINAW  : how WIDE the ranges are; narrower is better only if coverage stays honest.
#   - conformal   : build honest ranges by padding predictions with the model's own measured errors.
#   - early stopping : quit training once a held-out VALIDATION set stops improving, so the net doesn't
#                      memorize the training data (overfit).
# ============================================
import json, time
import numpy as np
import pandas as pd
import torch
import torch.nn as nn

torch.manual_seed(0); np.random.seed(0)
TEL = "novendor_1.telemetry"; SUBSET = "FD001"
RUL_CAP = 125; WIN = 30; SEED = 0
NOMINAL = [0.80, 0.90]; RELIABILITY_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]
# FD001 informative sensors (drop near-constant): standard 14-sensor selection
SENSORS = [f"sensor_{i}" for i in [2,3,4,7,8,9,11,12,13,14,15,17,20,21]]
rng = np.random.default_rng(SEED)

def rmse(a,b): return float(np.sqrt(np.mean((np.asarray(a)-np.asarray(b))**2)))
def phm_score(yt,yp):
    d=np.asarray(yp)-np.asarray(yt)
    return float(np.sum(np.where(d<0, np.exp(-d/13.)-1., np.exp(d/10.)-1.)))

# COMMAND ----------
# ---- Load raw per-cycle silver (has all 21 sensors + per-cycle rul_target on train) ----
sil = spark.table(f"{TEL}.silver_cmapss").toPandas()
sil = sil[sil.subset==SUBSET].copy()
rul_truth = spark.table(f"{TEL}.silver_cmapss_rul").toPandas()
rul_truth = rul_truth[rul_truth.subset==SUBSET].copy()
train_raw = sil[sil.split=="train"].sort_values(["unit","cycle"]).copy()
test_raw  = sil[sil.split=="test"].sort_values(["unit","cycle"]).copy()
print("FD001 silver | train rows", len(train_raw), "units", train_raw.unit.nunique(),
      "| test rows", len(test_raw), "units", test_raw.unit.nunique(), "| sensors", len(SENSORS))

# ---- Normalization fit on TRAIN ONLY ----
# Put every sensor on the same scale (z-score: subtract mean, divide by spread) so no single sensor
# dominates just because its raw numbers are bigger. Crucially the mean/spread come from TRAIN ONLY —
# letting the test data influence the scaling would be a subtle form of cheating (leakage).
mu = train_raw[SENSORS].mean(); sd = train_raw[SENSORS].std().replace(0,1.0)
def norm(df):
    x=df.copy(); x[SENSORS]=(x[SENSORS]-mu)/sd; return x
train_raw = norm(train_raw); test_raw = norm(test_raw)

# ---- Sliding 30-cycle windows; target = capped RUL at window's LAST cycle ----
# The net reads a movie, not a snapshot: each training example is a 30-cycle window of sensor readings,
# and the answer it must predict is the RUL at the LAST cycle of that window. Sliding the window forward
# one cycle at a time turns each engine's run into many overlapping examples.
def windows(df, has_truth=True):
    X, y, meta = [], [], []
    for u, g in df.groupby("unit"):
        g = g.sort_values("cycle"); arr = g[SENSORS].to_numpy(); n=len(g)
        ruls = np.minimum(g["rul_target"].to_numpy(), RUL_CAP) if has_truth else None
        for e in range(WIN, n+1):
            X.append(arr[e-WIN:e])
            meta.append((int(u), int(g["cycle"].iloc[e-1])))
            if has_truth: y.append(ruls[e-1])
    X=np.asarray(X, dtype=np.float32)
    y=np.asarray(y, dtype=np.float32) if has_truth else None
    return X, y, meta

Xtr_all, ytr_all, meta_tr = windows(train_raw, True)
print("train windows", Xtr_all.shape, "| target range", float(ytr_all.min()), float(ytr_all.max()))

# COMMAND ----------
# ---- Disjoint-unit split (parity with Ticket 1): fit/calib/internal-test = 60/20/20 ----
# Calib (20) + internal-test (20) units are IDENTICAL to Ticket 1's seed-0 split, so calibration is
# apples-to-apples. The 60 fit units are further split into 50 train + 10 VALIDATION units (for early
# stopping + over/underfit read). Validation units never touch calib or internal-test.
units = np.sort(train_raw.unit.unique()); perm = rng.permutation(units); n=len(units)
n_fit=int(round(n*.6)); n_cal=int(round(n*.2))
fit_u_all=set(perm[:n_fit]); cal_u=set(perm[n_fit:n_fit+n_cal]); ite_u=set(perm[n_fit+n_cal:])
fit_perm=perm[:n_fit]; n_val=int(round(n_fit*(10/60)))            # ~10 of the 60 fit units
val_u=set(fit_perm[:n_val]); fit_u=set(fit_perm[n_val:])
mtr = np.array([m[0] for m in meta_tr])
def sel(uset):
    idx = np.isin(mtr, list(uset)); return Xtr_all[idx], ytr_all[idx]
Xf,yf = sel(fit_u); Xv,yv = sel(val_u); Xc,yc = sel(cal_u); Xi,yi = sel(ite_u)
print("windows | fit", len(Xf), "val", len(Xv), "calib", len(Xc), "internal-test", len(Xi))

# COMMAND ----------
# ---- CNN-LSTM (Conv1D x2 -> LSTM -> Dense) ----
# The model in three stages: (1) two Conv1d layers scan the window for short local patterns across the
# sensors; (2) the LSTM walks those patterns through time and keeps a running memory of the engine's
# trajectory; (3) a small Dense head turns the final memory into one number — the predicted RUL.
class CNNLSTM(nn.Module):
    def __init__(self, F):
        super().__init__()
        self.c1=nn.Conv1d(F,32,3,padding=1); self.c2=nn.Conv1d(32,32,3,padding=1)
        self.act=nn.ReLU()
        self.lstm=nn.LSTM(32,48,batch_first=True)
        self.head=nn.Sequential(nn.Linear(48,32), nn.ReLU(), nn.Dropout(0.2), nn.Linear(32,1))
    def forward(self,x):                 # x: (B, WIN, F)
        z=x.transpose(1,2)               # (B,F,WIN)
        z=self.act(self.c1(z)); z=self.act(self.c2(z))
        z=z.transpose(1,2)               # (B,WIN,32)
        o,_=self.lstm(z)
        return self.head(o[:,-1,:]).squeeze(-1)

def predict(m, X, bs=512):
    m.eval(); out=[]
    with torch.no_grad():
        for s in range(0,len(X),bs):
            out.append(m(torch.tensor(X[s:s+bs])).numpy())
    return np.clip(np.concatenate(out),0,RUL_CAP)

# Train the net while watching a held-out VALIDATION set. We keep the weights from the best validation
# score and stop early if validation stops improving for `patience` epochs — that's how we avoid
# overfitting (memorizing training data instead of learning the real degradation signal).
def train_model(Xtr, ytr, Xval, yval, max_epochs=60, bs=256, lr=1e-3, patience=8):
    m=CNNLSTM(Xtr.shape[2]); opt=torch.optim.Adam(m.parameters(), lr=lr); loss=nn.MSELoss()
    dl=torch.utils.data.DataLoader(torch.utils.data.TensorDataset(torch.tensor(Xtr),torch.tensor(ytr)),
                                   batch_size=bs, shuffle=True)
    Xvt=torch.tensor(Xval); yvt=torch.tensor(yval)
    hist=[]; best=float("inf"); best_state=None; bad=0; stopped=max_epochs
    for ep in range(max_epochs):
        m.train(); tot=0.
        for xb,yb in dl:
            opt.zero_grad(); l=loss(m(xb),yb); l.backward(); opt.step(); tot+=l.item()*len(xb)
        tr_mse=tot/len(Xtr)
        m.eval()
        with torch.no_grad(): val_mse=float(loss(m(Xvt),yvt))
        hist.append({"epoch":ep,"train_mse":round(tr_mse,3),"val_mse":round(val_mse,3)})
        if ep%5==0 or ep==max_epochs-1: print(f"  ep {ep} train_mse {tr_mse:.2f} val_mse {val_mse:.2f}")
        if val_mse < best-1e-3:
            best=val_mse; best_state={k:v.clone() for k,v in m.state_dict().items()}; bad=0
        else:
            bad+=1
            if bad>=patience: stopped=ep+1; print(f"  early stop at epoch {ep} (best val_mse {best:.2f})"); break
    if best_state is not None: m.load_state_dict(best_state)
    return m, {"history":hist,"epochs_run":stopped,"best_val_mse":round(best,3),
               "final_train_mse":hist[-1]["train_mse"],"final_val_mse":hist[-1]["val_mse"],
               "patience":patience,"max_epochs":max_epochs}

t0=time.time(); model, train_log = train_model(Xf,yf,Xv,yv); train_wall=round(time.time()-t0,1)
# fit_verdict is a quick health check on training: if validation error is much worse than training error
# the net memorized (overfit); if both are high it never learned (underfit). We don't want to crown a
# challenger that only won by luck on an unstable training run.
# under/overfit read: ratio of final val to final train MSE
ratio = train_log["final_val_mse"]/max(train_log["final_train_mse"],1e-6)
fit_verdict = ("overfit" if ratio>1.5 else "underfit" if train_log["best_val_mse"]>1500 else "reasonable")
train_log.update({"train_wall_s":train_wall,"val_over_train_ratio":round(ratio,2),"fit_verdict":fit_verdict})
print("train wall", train_wall, "s | fit verdict:", fit_verdict, "| val/train", round(ratio,2))

# COMMAND ----------
# ---- LAST-CYCLE benchmark on official test set (compare to GBM 20.32 / 1423) ----
# The head-to-head accuracy test: score each engine at its final reading and compare RMSE/PHM directly
# against the champion GBM's 20.32 / 1423. This is the apples-to-apples number the graduation gate uses.
Xte_all, _, meta_te = windows(test_raw, has_truth=False)
te_df = pd.DataFrame(meta_te, columns=["unit","cycle"])
te_df["pred"]=predict(model, Xte_all)
last = te_df.sort_values(["unit","cycle"]).groupby("unit").tail(1).merge(
    rul_truth[["unit","rul"]], on="unit", how="inner")
last["y_true"]=np.minimum(last["rul"].to_numpy(),RUL_CAP)
bench={"rmse":rmse(last["y_true"],last["pred"]),"phm":phm_score(last["y_true"],last["pred"]),"n_units":int(len(last))}
GBM_RMSE, GBM_PHM = 20.322, 1423.33
print("CNN-LSTM last-cycle:", {k:round(v,2) if isinstance(v,float) else v for k,v in bench.items()},
      "| GBM ref:", GBM_RMSE, GBM_PHM)

# COMMAND ----------
# ---- ASYMMETRIC split-conformal. Calibration-only change (NO retrain): the val units (which served
# early stopping) are merged into the conformal calibration pool -> larger, more stable quantile set.
# Two-sided signed-residual quantiles fit RUL's asymmetric error better than a symmetric +/-q.
# Internal-test units are untouched, so coverage is still measured honestly on held-out data.
cal_pred=predict(model,Xc); val_pred=predict(model,Xv); ite_pred=predict(model,Xi)
cal_signed = np.concatenate([yc-cal_pred, yv-val_pred])   # signed residuals on calib + val (no internal-test)
n_cal_resid = int(len(cal_signed))
lo_res = -cal_signed     # how far truth falls BELOW pred  (pred - truth)
hi_res =  cal_signed     # how far truth falls ABOVE pred  (truth - pred)
def q_at(arr, level):
    m=len(arr); k=min(int(np.ceil((m+1)*level)),m); return float(np.sort(arr)[k-1])
def conformal_band(level, pred):
    # split the two-sided miss budget equally: each tail gets the (1+level)/2 quantile
    t = (1+level)/2
    ql = max(q_at(lo_res, t), 0.0); qh = max(q_at(hi_res, t), 0.0)
    return np.clip(pred-ql,0,RUL_CAP), np.clip(pred+qh,0,RUL_CAP), ql, qh
# Same honest-range idea as the baseline, but ASYMMETRIC: RUL errors lean one way, so we pad the bottom
# and top of the range by DIFFERENT amounts (separate lower/upper error quantiles). This fits reality
# better than a symmetric +/- band and still reports honest coverage on the untouched internal-test units.
def picp(t,lo,hi): return float(np.mean((t>=lo)&(t<=hi)))  # share of truths inside the range (want ~nominal)
ite_point={"rmse_per_cycle":rmse(yi,ite_pred),"n_windows":int(len(Xi)),"n_units":len(ite_u)}
rng_y=float(yi.max()-yi.min()) or 1.0
print(f"conformal calib residuals: {n_cal_resid} (calib {len(yc)} + val {len(yv)} windows, no retrain)")
interval_metrics={}
for lvl in NOMINAL:
    lo,hi,ql,qh=conformal_band(lvl,ite_pred)
    cov=picp(yi,lo,hi); mpiw=float(np.mean(hi-lo))
    interval_metrics[str(int(lvl*100))]={"nominal":lvl,"q_lower":round(ql,3),"q_upper":round(qh,3),
        "PICP":round(cov,4),"PICP_minus_nominal":round(cov-lvl,4),"MPIW":round(mpiw,3),
        "PINAW":round(mpiw/rng_y,4),"within_pm_0.03":bool(abs(cov-lvl)<=0.03)}
    print(f"  {int(lvl*100)}%: PICP {cov:.3f} (d{cov-lvl:+.3f}) MPIW {mpiw:.2f} PINAW {mpiw/rng_y:.3f} q=[{ql:.1f},{qh:.1f}]")
reliability=[]
for l in RELIABILITY_LEVELS:
    lo,hi,_,_=conformal_band(l,ite_pred)
    reliability.append({"nominal":l,"observed_PICP":round(picp(yi,lo,hi),4)})

# COMMAND ----------
# ---- GRADUATION GATE (mechanical) ----
# The verdict, by rule (no judgment calls). The challenger replaces the champion ONLY if it is more
# accurate (RMSE), no less safe (PHM), still honest (PICP calibrated), AND its ranges aren't wider —
# unless it is MATERIALLY safer, the one allowed exception. Anything else: GBM stays champion.
# Ticket 1 baseline conformal widths (MPIW) for the "narrower or defensibly similar" test:
GBM_MPIW = {"80": 42.98, "90": 55.98}
picp_ok = all(interval_metrics[k]["within_pm_0.03"] for k in interval_metrics)
rmse_better = bench["rmse"] < GBM_RMSE
phm_better  = bench["phm"] <= GBM_PHM
phm_materially_better = bench["phm"] <= 0.90*GBM_PHM
mpiw_narrower_or_similar = all(
    interval_metrics[k]["MPIW"] <= GBM_MPIW[k]*1.05 for k in interval_metrics)  # within +5% = "similar"
mpiw_widened = any(interval_metrics[k]["MPIW"] > GBM_MPIW[k]*1.05 for k in interval_metrics)

if not picp_ok:
    graduates=False; reason="calibration coverage failed (PICP outside +/-0.03)"
elif not rmse_better:
    graduates=False; reason="RMSE not better than GBM baseline"
elif not mpiw_widened and phm_better and mpiw_narrower_or_similar:
    graduates=True; reason="RMSE better, PHM not worse, coverage calibrated, intervals narrower/similar"
elif mpiw_widened and phm_materially_better:
    graduates=True; reason="RMSE better and intervals widened, but PHM materially better (tightening-rule exception); width increase must be justified in writeup"
else:
    graduates=False
    reason=("RMSE better but intervals widened without materially-better PHM (tightening rule blocks graduation)"
            if mpiw_widened else "PHM regressed or intervals not narrower/similar")
print("GRADUATES:", graduates, "|", reason)

# COMMAND ----------
evidence={
  "ticket":"improve_fd001_rul_predictor_and_tighten_intervals","model":"cnn_lstm_pytorch_cpu",
  "plan":"docs/plans/03-implementation-plans/active/telemetry-calibration-layer.md",
  "notebook":"telemetry-platform/databricks/notebooks/telemetry_calibration_challenger_cnnlstm.py",
  "deps":["torch==2.2.2 (cpu)","scikit-learn==1.4.2"],
  "data_source_tables":[f"{TEL}.silver_cmapss",f"{TEL}.silver_cmapss_rul"],
  "config":{"window":WIN,"sensors":SENSORS,"rul_cap":RUL_CAP,"seed":SEED,
            "normalization":"per-sensor z-score, fit on train only",
            "unit_split":{"fit":len(fit_u),"val":len(val_u),"calib":len(cal_u),"internal_test":len(ite_u),
                          "calib_internaltest_match_ticket1":"yes (seed 0, identical 20/20 units)"}},
  "training_stability":train_log,
  "conformal_method":"asymmetric split-conformal (signed lower/upper residual quantiles); calibration "
                     "pool = calib units + val units (val already served early stopping), "
                     f"{n_cal_resid} residual windows. Calibration-only; model NOT retrained.",
  "calibration_protocol":"conformal quantiles computed on CALIB+VAL units' residuals; intervals "
                         "evaluated on INTERNAL-TEST units; nothing tuned on internal-test. The model "
                         "weights are identical to the pre-recalibration run (same seed, no retrain).",
  "challenger_last_cycle":{"rmse":round(bench["rmse"],3),"phm":round(bench["phm"],2),"n_units":bench["n_units"]},
  "gbm_baseline_reference":{"rmse":GBM_RMSE,"phm":GBM_PHM,"mpiw":GBM_MPIW},
  "internal_test_point":{k:(round(v,3) if isinstance(v,float) else v) for k,v in ite_point.items()},
  "interval_metrics":interval_metrics,"reliability_table":reliability,
  "graduation":{"graduates":graduates,"reason":reason,
                "checks":{"rmse_better":rmse_better,"phm_better":phm_better,
                          "phm_materially_better":phm_materially_better,"picp_calibrated":picp_ok,
                          "mpiw_narrower_or_similar":mpiw_narrower_or_similar,"mpiw_widened":mpiw_widened}},
  "caveats":[
    "Last-cycle RMSE/PHM are the comparable benchmark vs GBM (20.32/1423). Per-cycle internal-test RMSE "
    "is a different quantity; PHM is NOT computed per-cycle (it explodes — last-cycle only).",
    "Single seed (0); disjoint-unit split matches Ticket 1 for apples-to-apples calibration.",
    "Training stability reported (train/val MSE history, early stopping, fit verdict). A win on one seed "
    "without a stable val curve should not graduate on luck.",
    "PHM08 captures late-prediction danger: if RMSE improves but PHM worsens, that is a SAFETY "
    "regression (more optimistic/late RUL), not a minor tradeoff — the gate treats it as a fail unless "
    "the tightening-rule exception (materially-better PHM) applies.",
    "If graduated under the tightening-rule exception, the wider interval MUST be justified in the writeup.",
    "No competitiveness claim unless last-cycle RMSE clears the FD001 literature bar (<=13).",
  ],
}
print(json.dumps({"rmse":round(bench["rmse"],2),"phm":round(bench["phm"],1),
                  "picp":{k:interval_metrics[k]["PICP"] for k in interval_metrics},
                  "fit_verdict":train_log["fit_verdict"],"epochs_run":train_log["epochs_run"],
                  "graduates":graduates},indent=2))
dbutils.notebook.exit(json.dumps(evidence))
