# Databricks notebook source
# MAGIC %md
# MAGIC # Telemetry Calibration Layer — Ticket 1: Reproduce + calibrate C-MAPSS FD001 RUL baseline
# MAGIC
# MAGIC **Thesis (defensible):** we do not claim the model knows when it has no analog; we make its RUL
# MAGIC uncertainty measurable, calibrated, and visible.
# MAGIC
# MAGIC This notebook:
# MAGIC 1. **Reproduces** the shipped benchmark — GBM on FD001, evaluated last-cycle-per-unit vs the
# MAGIC    official RUL truth (`silver_cmapss_rul`). Target: RMSE ~20.32 / PHM ~1423.
# MAGIC 2. **Calibrates** with split-conformal prediction intervals, units disjoint (fit / calib /
# MAGIC    internal-test), evaluated on per-cycle truth from the TRAIN split (the only split with
# MAGIC    per-cycle `rul_target`; the C-MAPSS test split has none).
# MAGIC 3. Emits RMSE, PHM08, PICP, MPIW/PINAW, CRPS, and a reliability table to a persisted artifact.
# MAGIC
# MAGIC No UI, no API, no schema, no new model surface. Pin `scikit-learn==1.4.2`.
# MAGIC Plan: `docs/plans/03-implementation-plans/active/telemetry-calibration-layer.md`

# COMMAND ----------
# ===== TEACHING NOTES (plain language) =====
# WHAT THIS FILE DOES:
#   It takes a model that predicts an engine's Remaining Useful Life (RUL = how many cycles of life
#   are left) and makes its UNCERTAINTY honest. A point prediction like "42 cycles left" is not enough;
#   we also want an HONEST RANGE ("between 25 and 60, and we're 90% sure"). "Calibration" means making
#   those confidence claims trustworthy: if the model says it's 90% sure the truth lands inside a range,
#   the truth really should land inside that range about 90% of the time — no more, no less.
#
# WHERE YOU SEE THIS:
#   This is the baseline evidence behind the RUL / anomaly CALIBRATION surfaces (the reliability table
#   and the "is the model's confidence honest?" panels). It is the CHAMPION (current best, GBM) that the
#   deep-learning challenger in telemetry_calibration_challenger_cnnlstm.py must beat.
#
# INPUTS -> OUTPUT:
#   INPUT  : gold_cmapss_features (model-ready sensor features) + silver_cmapss_rul (official RUL truth).
#   OUTPUT : an evidence JSON (metrics + a reliability table) returned via dbutils.notebook.exit — no UI,
#            no new table, no API. The numbers feed the calibration evidence surfaces.
#
# HOW TO READ THE NUMBERS (jargon in one phrase each):
#   - RMSE            : typical size of the prediction error, in cycles. Lower = more accurate.
#   - PHM08           : NASA's asymmetric error score that punishes LATE/optimistic RUL harder than early
#                       (predicting more life than there really is is the dangerous mistake). Lower = safer.
#   - calibration     : making the model's stated confidence match reality (70% sure -> right ~70% of time).
#   - PICP            : the share of truths that actually fell inside the predicted range. For a "90%"
#                       range you want PICP near 0.90. PICP near nominal = well calibrated.
#   - reliability     : the whole table of "we claimed X% confidence -> we actually hit Y%" across levels;
#                       a perfectly honest model has observed == nominal on every row.
#   - MPIW / PINAW    : how WIDE the ranges are (PINAW = width normalized so it's comparable). Narrower is
#                       better ONLY if coverage stays honest — a huge range is trivially "right".
#   - CRPS            : a single score blending accuracy and honest-uncertainty (lower = better).
#   - Brier score     : the standard "is this probability honest?" yardstick for yes/no predictions —
#                       the mean squared gap between the predicted probability and what actually happened
#                       (0 = perfect, lower = better-calibrated). RUL here is a number not a yes/no, so we
#                       use PICP + reliability instead; Brier is the same honest-confidence idea applied to
#                       the anomaly (yes/no) scores on the calibration surfaces.
#   - conformal       : the technique used here to build the honest ranges. It looks at how big the model's
#                       errors were on a held-out CALIBRATION set, then pads each prediction by that
#                       measured error so the range has the right coverage by construction.
# ============================================
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

TEL = "novendor_1.telemetry"
SUBSET = "FD001"
RUL_CAP = 125
SEED = 0
NOMINAL = [0.80, 0.90]                 # conformal interval levels
RELIABILITY_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]
rng = np.random.default_rng(SEED)

def rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a) - np.asarray(b)) ** 2)))

def phm_score(y_true, y_pred):
    # PHM08 = NASA's safety-weighted error score. Predicting MORE life than reality (late, d>0) is the
    # dangerous mistake (you run the part past failure), so it costs more (divisor 10) than predicting
    # too little life (early, divisor 13). Lower total = a safer, less optimistic model.
    # NASA PHM'08 asymmetric: late (pred>true => d>0) penalized harder (a=10) than early (a=13).
    d = np.asarray(y_pred) - np.asarray(y_true)
    s = np.where(d < 0, np.exp(-d / 13.0) - 1.0, np.exp(d / 10.0) - 1.0)
    return float(np.sum(s))

# COMMAND ----------
# ---- Load existing gold features + official test RUL truth ----
feat = spark.table(f"{TEL}.gold_cmapss_features").toPandas()
feat = feat[feat.subset == SUBSET].copy()
rul_truth = spark.table(f"{TEL}.silver_cmapss_rul").toPandas()
rul_truth = rul_truth[rul_truth.subset == SUBSET].copy()
FEAT_COLS = [c for c in feat.columns if c.startswith("sensor_")]

train_all = feat[feat.split == "train"].dropna(subset=FEAT_COLS + ["rul_target"]).copy()
train_all["y"] = np.minimum(train_all["rul_target"].to_numpy(), RUL_CAP)
test = feat[feat.split == "test"].dropna(subset=FEAT_COLS).copy()
print("FD001 | feat cols", len(FEAT_COLS), "| train rows", len(train_all),
      "| train units", train_all.unit.nunique(), "| test rows", len(test),
      "| official test-truth units", rul_truth.unit.nunique())

# COMMAND ----------
# ============================================================================================
# PART 1 — REPRODUCE the shipped benchmark (GBM on all train rows, last-cycle-per-unit eval)
# ============================================================================================
# First we re-fit the existing champion (a Gradient Boosting model — many small trees, each fixing the
# last one's mistakes) and confirm we get the SAME accuracy the shipped system reports. This proves we
# are calibrating the real deployed model, not a different one. "Last-cycle-per-unit" = score each engine
# only at its final observed reading, which is the standard FD001 benchmark setup.
gbm_full = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05,
                                     subsample=0.8, random_state=0).fit(
    train_all[FEAT_COLS].to_numpy(), train_all["y"].to_numpy())

test_last = test.sort_values(["unit", "cycle"]).groupby("unit").tail(1).copy()
test_last = test_last.merge(rul_truth[["unit", "rul"]], on="unit", how="inner")
test_last["y_true"] = np.minimum(test_last["rul"].to_numpy(), RUL_CAP)
pred_last = np.clip(gbm_full.predict(test_last[FEAT_COLS].to_numpy()), 0, RUL_CAP)
bench = {"rmse": rmse(test_last["y_true"], pred_last),
         "phm": phm_score(test_last["y_true"], pred_last),
         "n_units": int(len(test_last))}
print("REPRODUCED last-cycle benchmark:", {k: round(v, 2) if isinstance(v, float) else v for k, v in bench.items()})
print("  (shipped reference: RMSE ~20.32 / PHM ~1423; NOT literature-competitive vs FD001 <=13)")

# COMMAND ----------
# ============================================================================================
# PART 2 — CALIBRATION via split-conformal, UNITS DISJOINT (fit / calib / internal-test)
# Per-cycle truth exists only on the TRAIN split, so the calibrated eval lives there.
# ============================================================================================
# To build honest ranges we split the engines into THREE disjoint groups (no engine appears in two):
#   fit (60%)  -> teaches the model,
#   calib (20%)-> measures how big the model's errors really are (sets the range width),
#   test (20%) -> never touched until the end; where we CHECK that the ranges cover the truth.
# Splitting by engine (not by row) is what keeps the honesty check fair — the test engines are genuinely
# unseen, so the coverage number is real, not memorized.
units = np.sort(train_all.unit.unique())
perm = rng.permutation(units)
n = len(units)
n_fit = int(round(n * 0.60)); n_cal = int(round(n * 0.20))
fit_u  = set(perm[:n_fit].tolist())
cal_u  = set(perm[n_fit:n_fit + n_cal].tolist())
test_u = set(perm[n_fit + n_cal:].tolist())
print("unit split | fit", len(fit_u), "| calib", len(cal_u), "| internal-test", len(test_u))

def rows(uset):
    return train_all[train_all.unit.isin(uset)]

fit_df, cal_df, ite_df = rows(fit_u), rows(cal_u), rows(test_u)
gbm = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05,
                                subsample=0.8, random_state=0).fit(
    fit_df[FEAT_COLS].to_numpy(), fit_df["y"].to_numpy())

def predict(df):
    return np.clip(gbm.predict(df[FEAT_COLS].to_numpy()), 0, RUL_CAP)

cal_pred = predict(cal_df); cal_true = cal_df["y"].to_numpy()
ite_pred = predict(ite_df); ite_true = ite_df["y"].to_numpy()

# Point metrics on the internal held-out units (per-cycle; honest, NOT the last-cycle benchmark)
ite_point = {"rmse_per_cycle": rmse(ite_true, ite_pred),
             "phm_per_cycle": phm_score(ite_true, ite_pred),
             "n_windows": int(len(ite_df)), "n_units": len(test_u)}
print("internal-test per-cycle point metrics:",
      {k: round(v, 2) if isinstance(v, float) else v for k, v in ite_point.items()})

# COMMAND ----------
# ---- Split-conformal absolute-residual intervals + calibration metrics ----
# Core trick: look at how far off the model was on the CALIBRATION engines (the residuals = |truth -
# prediction|). To make a "90% range", pad every prediction by the 90th-percentile residual. By
# construction the range then covers ~90% of cases. This is what the reliability/coverage panels report.
cal_resid = np.abs(cal_true - cal_pred)

def conformal_q(level):
    # The residual size to pad by for a given confidence level (e.g. 0.90). Picking it from the sorted
    # calibration errors with this (m+1) rule is what makes the coverage guarantee hold on finite data.
    # finite-sample-valid split-conformal quantile of |residual|
    m = len(cal_resid)
    k = int(np.ceil((m + 1) * level))
    k = min(k, m)
    return float(np.sort(cal_resid)[k - 1])

def picp(true, lo, hi):
    # PICP = the fraction of truths that actually landed inside [lo, hi]. This is THE calibration number:
    # for a "90%" range you want this near 0.90. It's the bar the reliability panel plots against nominal.
    return float(np.mean((true >= lo) & (true <= hi)))

def crps_from_intervals(true, pred, qfun):
    # Approximate CRPS by integrating the pinball/coverage proxy across many levels of the
    # symmetric conformal band. Cheap, monotone, good enough for a calibration receipt.
    levels = np.linspace(0.05, 0.95, 19)
    tot = np.zeros(len(true))
    for L in levels:
        q = qfun(L)
        lo, hi = np.clip(pred - q, 0, RUL_CAP), np.clip(pred + q, 0, RUL_CAP)
        # interval (Winkler) score at level L; average over levels approximates CRPS up to scale
        alpha = 1 - L
        w = (hi - lo)
        w = w + (2/alpha) * (lo - true) * (true < lo)
        w = w + (2/alpha) * (true - hi) * (true > hi)
        tot += w
    return float(np.mean(tot / len(levels)))

# For each promised confidence level, build the range, then measure: did coverage (PICP) match the
# promise, and how wide (MPIW/PINAW) was the range? "within_pm_0.03" is the pass/fail honesty flag the
# calibration gate reads — coverage must be within 3 points of what we promised.
interval_metrics = {}
rng_y = float(ite_true.max() - ite_true.min()) or 1.0
for lvl in NOMINAL:
    q = conformal_q(lvl)
    lo = np.clip(ite_pred - q, 0, RUL_CAP)
    hi = np.clip(ite_pred + q, 0, RUL_CAP)
    cov = picp(ite_true, lo, hi)
    mpiw = float(np.mean(hi - lo))
    interval_metrics[f"{int(lvl*100)}"] = {
        "nominal": lvl, "conformal_q": round(q, 3),
        "PICP": round(cov, 4), "PICP_minus_nominal": round(cov - lvl, 4),
        "MPIW": round(mpiw, 3), "PINAW": round(mpiw / rng_y, 4),
        "within_pm_0.03": bool(abs(cov - lvl) <= 0.03),
    }
    print(f"  level {int(lvl*100)}%: q={q:.2f} PICP={cov:.3f} (Δ{cov-lvl:+.3f}) MPIW={mpiw:.2f} PINAW={mpiw/rng_y:.3f}")

crps = crps_from_intervals(ite_true, ite_pred, conformal_q)
print("approx CRPS (interval-integrated):", round(crps, 3))

# COMMAND ----------
# ---- Reliability table (observed coverage vs nominal across levels) ----
# This table is exactly what the RELIABILITY panel draws: for each promised level (nominal) we record the
# coverage we actually got (observed_PICP). A perfectly honest model has observed == nominal on every row;
# observed well below nominal = overconfident, well above = needlessly cautious (ranges too wide).
reliability = []
for lvl in RELIABILITY_LEVELS:
    q = conformal_q(lvl)
    lo = np.clip(ite_pred - q, 0, RUL_CAP); hi = np.clip(ite_pred + q, 0, RUL_CAP)
    reliability.append({"nominal": lvl, "observed_PICP": round(picp(ite_true, lo, hi), 4)})
for r in reliability:
    print(f"  reliability nominal={r['nominal']:.2f} observed={r['observed_PICP']:.3f}")

# COMMAND ----------
# ---- Late-prediction callout (PHM08 penalizes late/optimistic RUL harder) ----
# Safety lens: how often, and by how much, did the model OVERESTIMATE remaining life? Late predictions
# are the dangerous ones (you'd run a part past its real failure point). This callout surfaces that risk
# explicitly so the calibration evidence isn't just "coverage looks fine on average".
err = ite_pred - ite_true                      # >0 = late (predicted more life than real)
late_frac = float(np.mean(err > 0))
late_mean_overshoot = float(np.mean(err[err > 0])) if (err > 0).any() else 0.0
# fraction of the 90% conformal misses that are on the LATE side (the dangerous side)
q90 = conformal_q(0.90)
miss = ite_true > np.clip(ite_pred + q90, 0, RUL_CAP)  # truth above upper band => model was late
late_callout = {"frac_predictions_late": round(late_frac, 4),
                "mean_late_overshoot_cycles": round(late_mean_overshoot, 2),
                "late_side_miss_rate_at_90": round(float(np.mean(miss)), 4)}
print("late-prediction callout:", late_callout)

# COMMAND ----------
# ---- Gate check ----
# The single go/no-go: are ALL the promised confidence levels honest (coverage within 3 points)? PASS
# here is what licenses showing these calibrated ranges on the surfaces; FAIL means recalibrate first.
picp_gate_pass = all(interval_metrics[k]["within_pm_0.03"] for k in interval_metrics)
print("CALIBRATION GATE (PICP within +/-0.03 at all nominal levels):", "PASS" if picp_gate_pass else "FAIL")

evidence = {
    "ticket": "reproduce_and_calibrate_cmapss_fd001_rul_baseline",
    "plan": "docs/plans/03-implementation-plans/active/telemetry-calibration-layer.md",
    "notebook": "telemetry-platform/databricks/notebooks/telemetry_calibration_baseline.py",
    "data_source_tables": [f"{TEL}.gold_cmapss_features", f"{TEL}.silver_cmapss_rul"],
    "sklearn_pin": "scikit-learn==1.4.2 (GBM; matches the shipped champion runtime)",
    "rul_cap": RUL_CAP, "seed": SEED, "feat_cols": len(FEAT_COLS),
    "part1_reproduced_last_cycle_benchmark": {
        "rmse": round(bench["rmse"], 3), "phm": round(bench["phm"], 2), "n_units": bench["n_units"],
        "shipped_reference": "RMSE ~20.32 / PHM ~1423",
        "note": "Reproduction of the existing champion's eval. NOT literature-competitive "
                "(FD001 bar is RMSE <=13). No competitiveness claim made.",
    },
    "part2_calibration": {
        "unit_split": {"fit": len(fit_u), "calib": len(cal_u), "internal_test": len(test_u),
                       "basis": "FD001 TRAIN split, disjoint units, seed=" + str(SEED)},
        "internal_test_point_metrics": {k: round(v, 3) if isinstance(v, float) else v
                                        for k, v in ite_point.items()},
        "interval_metrics": interval_metrics,
        "approx_crps": round(crps, 3),
        "reliability_table": reliability,
        "late_prediction_callout": late_callout,
        "calibration_gate_picp_within_0.03": picp_gate_pass,
    },
    "caveats": [
        "Calibration eval uses the TRAIN split (only split with per-cycle rul_target); units are "
        "disjoint across fit/calib/internal-test so there is no unit leakage.",
        "Part 1 last-cycle RMSE and Part 2 per-cycle RMSE are DIFFERENT quantities; do not compare them.",
        "Predictor is the same GBM family as the shipped champion; this ticket reproduces+calibrates, it "
        "does not introduce a new model surface.",
        "CRPS here is an interval-integrated approximation (Winkler-averaged), not a closed-form CRPS.",
        "No competitiveness claim: FD001 literature bar is RMSE <=13; this baseline is ~20.",
    ],
    "next": "If PICP gate passes, consider one stronger predictor (single model) and then the thin "
            "calibration demo screen. If it fails, recalibrate before any UI.",
}
print(json.dumps({"benchmark_rmse": round(bench["rmse"], 2),
                  "picp": {k: interval_metrics[k]["PICP"] for k in interval_metrics},
                  "gate_pass": picp_gate_pass}, indent=2))
dbutils.notebook.exit(json.dumps(evidence))
