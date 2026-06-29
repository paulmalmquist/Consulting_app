# Databricks notebook source
# MAGIC %md
# MAGIC # Gate 0 — Telemetry Trust Layer Falsification (Option B: train-split held-out units)
# MAGIC Does embedding distance carry trust information beyond the point RUL prediction?
# MAGIC
# MAGIC **Question:** among C-MAPSS FD001 windows with similar *predicted* RUL, are windows farther
# MAGIC from the fleet in embedding space associated with larger absolute RUL error?
# MAGIC
# MAGIC **Why train-split:** the C-MAPSS *test* split has NO per-cycle `rul_target` (truncated units,
# MAGIC one final-cycle RUL each in `silver_cmapss_rul`). The *train* split has a real per-cycle
# MAGIC `rul_target` for every row. So we hold out a fraction of TRAIN units as the evaluation set:
# MAGIC real per-cycle truth, full density, and held-out units stay disjoint from the fleet used for
# MAGIC kNN (so distance reflects novelty, not memorization).
# MAGIC
# MAGIC **No training.** Predictions come from the registered `tel_rul_regressor` champion (frozen
# MAGIC inference). The embedding is a z-score (+ optional PCA) transform of existing
# MAGIC `gold_cmapss_features` columns, fit on FLEET rows only. No SupCon, no new predictor, no
# MAGIC schema/UI/API. Pin `scikit-learn==1.4.2` (the champion was pickled under it).
# MAGIC
# MAGIC Parent ticket: `docs/plans/03-implementation-plans/active/telemetry-trust-gate0-ticket.md`

# COMMAND ----------
# ===== TEACHING NOTES (plain language) =====
# WHAT THIS FILE DOES:
#   It tests a TRUST GATE that runs BEFORE the model is even allowed to judge a reading. The idea: a model
#   is only trustworthy on inputs that look like what it was trained on. So for each new reading we ask
#   "how far is this from the training fleet?" using MAHALANOBIS-style distance — distance that accounts
#   for how the sensors normally move together, not just raw gaps. A reading deep inside familiar territory
#   is one the model is competent to judge; one far outside should be flagged as "out of my depth".
#   This notebook is the FALSIFICATION test: does that distance actually predict bigger model errors? If
#   far-from-fleet readings really do have larger errors, the gate carries real trust information.
#
# WHERE YOU SEE THIS:
#   This is the evidence behind the COMPETENCE / trust-gate surfaces (the CompetenceEnvelopeCard family) —
#   the "is the model even in its zone of competence for this input?" check shown before a verdict.
#
# INPUTS -> OUTPUT:
#   INPUT  : gold_cmapss_features (sensor features) + the frozen registered champion tel_rul_regressor.
#   OUTPUT : an evidence JSON (distance-vs-error correlation per band + a continue/train/kill call) via
#            dbutils.notebook.exit. No training, no new model, no UI/API/schema.
#
# HOW TO READ THE NUMBERS (jargon in one phrase each):
#   - trust gate     : a check that runs BEFORE scoring to decide if the model is competent on THIS input.
#   - Mahalanobis distance : "how unusual is this reading" measured with the sensors' normal correlations
#                            built in, so being off in a way the sensors never normally move counts as far.
#                            (Here approximated by z-scoring + PCA, then kNN distance in that space.)
#   - kNN distance   : distance to the k nearest training readings — small = lots of close analogs (safe),
#                      large = no analogs (novel, risky). The gate's "how far from the fleet" signal.
#   - embedding      : a cleaned-up coordinate space (z-score + PCA) where distance is meaningful.
#   - Spearman rho   : rank correlation between distance and error; >0 means farther readings tend to have
#                      bigger errors — exactly the signal that makes the trust gate worth shipping.
#   - bootstrap CI   : a confidence range for rho from resampling; if it stays above 0 the signal is real,
#                      not noise. The gate's decision hinges on this excluding zero.
#   - frozen inference : the champion is reused exactly as shipped (no retraining) so this is an honest read.
# ============================================
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
HOLDOUT_FRAC = 0.2                  # fraction of FD001 train UNITS held out for evaluation
rng = np.random.default_rng(SEED)

# COMMAND ----------
# ---- Load existing gold features; use the TRAIN split only (it has real per-cycle rul_target) ----
feat = spark.table(f"{TEL}.gold_cmapss_features").toPandas()
feat = feat[feat.subset == SUBSET].copy()
FEAT_COLS = [c for c in feat.columns if c.startswith("sensor_")]   # same 47 cols the model trained on

src = feat[feat.split == "train"].dropna(subset=FEAT_COLS + ["rul_target"]).copy()
all_units = np.sort(src.unit.unique())
n_hold = max(1, int(round(len(all_units) * HOLDOUT_FRAC)))
hold_units = set(rng.choice(all_units, size=n_hold, replace=False).tolist())
fleet_units = [u for u in all_units if u not in hold_units]

# Split the engines into two disjoint groups so the distance test is honest:
#   FLEET    = the "known population" the gate measures distance against (and fits the embedding on).
#   HELD-OUT = genuinely unseen engines we score, to ask "are the far-from-fleet ones the high-error ones?"
# Holding engines out by id (not by row) is what makes the distance reflect real novelty, not memorization.
# FLEET = the reference population (kNN target, embedding fit, no leakage of held-out units).
# HELD-OUT = the evaluation windows scored for distance-vs-error.
train = src[src.unit.isin(fleet_units)].copy()      # naming kept: 'train' = fleet reference
test = src[src.unit.isin(hold_units)].copy()        # 'test'  = held-out evaluation windows
test["y_true"] = np.minimum(test["rul_target"].to_numpy(), RUL_CAP)
print("FD001 train-split | feat cols", len(FEAT_COLS),
      "| total units", len(all_units), "| fleet units", len(fleet_units), "| held-out units", n_hold,
      "| fleet rows", len(train), "| held-out rows", len(test),
      "| held-out unit ids", sorted(hold_units))
assert len(test) > 0 and len(train) > 0, "empty fleet or held-out — check split"

# COMMAND ----------
# ---- Frozen-inference predictions from the registered champion (NO training) ----
# We load the SHIPPED model and just run it ("frozen inference" = reused as-is, no retraining). abs_err is
# how wrong each prediction was — the quantity we'll check against distance. The whole gate stands or
# falls on whether bigger distance lines up with bigger abs_err.
model = mlflow.sklearn.load_model(MODEL_URI)
Xtr = train[FEAT_COLS].to_numpy()
Xte = test[FEAT_COLS].to_numpy()
test["pred_rul"] = np.clip(model.predict(Xte), 0, RUL_CAP)
test["abs_err"] = np.abs(test["pred_rul"].to_numpy() - test["y_true"].to_numpy())
overall_rmse = float(np.sqrt(np.mean((test["pred_rul"] - test["y_true"]) ** 2)))
# NOTE: the champion was trained on ALL 100 train units (incl. these held-out ones), so predictions
# are in-sample — optimistic, i.e. LESS error to correlate with. That makes the gate HARDER to pass
# (conservative), not easier. The held-out split governs the EMBEDDING/kNN (no fleet leakage), which
# is what the distance signal depends on; the predictor is reused as-is per the no-training rule.
print("held-out windows scored", len(test), "| held-out per-cycle RMSE", round(overall_rmse, 3),
      "(in-sample for the predictor; NOT the 100-unit last-cycle benchmark; do not cite as competitive)")

# COMMAND ----------
# ---- Cheap embedding: z-score on TRAIN stats (+ optional PCA). A feature transform, not training ----
# Before measuring distance we put the features in a fair coordinate space: z-score (equal scale per
# feature) then PCA (keep the few directions that carry most of the variation, drop noise). Distance in
# THIS space is the Mahalanobis-style "how unusual is this reading" signal. It's a transform of existing
# features fit on FLEET only — no model is trained here.
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
# ---- kNN distance: each HELD-OUT window -> nearest FLEET windows (L2 on the embedding) ----
# The "how far from the fleet" number: for each unseen reading, find its k closest fleet readings and
# average those distances. Small = the model has seen plenty like this (competent, trust it); large = no
# close analog (novel, the gate should flag it). This knn_dist is what the competence/trust panels show.
# Held-out units are disjoint from fleet units by the unit-level split above, so distance reflects
# fleet novelty, not memorization. Chunk to bound memory.
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
# The core question, made into a number: within readings of SIMILAR predicted RUL (so we compare like
# with like), does greater distance-from-fleet go with greater error? Spearman rho > 0 says yes. We
# compute it inside RUL "bands" so the signal isn't just "low-RUL readings happen to be far AND wrong".
def spearman(a, b):
    # Spearman = correlation of RANKS (does b tend to rise when a rises, regardless of exact scale).
    ra = pd.Series(a).rank().to_numpy()
    rb = pd.Series(b).rank().to_numpy()
    ra -= ra.mean(); rb -= rb.mean()
    den = np.sqrt((ra**2).sum() * (rb**2).sum())
    return float((ra * rb).sum() / den) if den > 0 else 0.0

# Bootstrap CI: re-sample the data many times and recompute rho each time to get a plausible range. If
# the whole range stays above 0, the distance->error link is real signal, not a fluke of this one sample.
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
# Concrete demo examples for the surface: find pairs where the model predicted ABOUT THE SAME RUL, but one
# reading was close to the fleet (A, low distance) and one was far (B, high distance) — and show that the
# far one had the bigger error. These are the "trust the near one, doubt the far one" stories the gate tells.
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
# The verdict on whether distance carries trust info: strong, consistent positive signal -> "continue"
# (ship the gate as-is); weak-but-real -> "train_contrastive" (the signal exists, invest in a better
# embedding); nothing above zero -> "kill" (distance doesn't predict error here, drop the idea).
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
    "design": "option_b_train_split_heldout_units",
    "notebook": "telemetry-platform/databricks/notebooks/telemetry_trust_gate0_distance_error.py",
    "data_source_tables": [f"{TEL}.gold_cmapss_features"],
    "model_source": f"{TEL}.tel_rul_regressor (version 1, run c970fdcc; frozen inference, no retrain)",
    "embedding_source": f"derived in-notebook from gold_cmapss_features ({emb_method}), fit on FLEET "
                        "rows only; NOT gold_fused_state_vectors (that is the SMAP/MSL anomaly lane)",
    "distance_metric": f"mean L2 over k={K} nearest FLEET windows (deep-kNN style), embedding space",
    "dataset_split": {"subset": SUBSET, "split_basis": "FD001 TRAIN split (has real per-cycle "
                      "rul_target); held-out by unit id, seed=" + str(SEED),
                      "fleet_units": int(train.unit.nunique()), "heldout_units": int(test.unit.nunique()),
                      "fleet_rows": int(len(train)), "heldout_rows": int(len(test)),
                      "heldout_unit_ids": sorted(int(u) for u in test.unit.unique()),
                      "scoring": "every cycle of each held-out unit (real per-cycle truth)"},
    "sklearn_pin": "scikit-learn==1.4.2 — REQUIRED: the champion was pickled under 1.4.2; newer "
                   "sklearn drops GradientBoostingRegressor's HalfSquaredError.get_init_raw_predictions "
                   "and predict() raises AttributeError. Pin to reproduce.",
    "rul_cap": RUL_CAP,
    "heldout_per_cycle_rmse": round(overall_rmse, 3),
    "heldout_rmse_note": "Per-cycle RMSE on held-out TRAIN units. IN-SAMPLE for the predictor (the "
                         "champion was trained on all 100 train units), so optimistic — this makes the "
                         "distance/error gate HARDER, not easier. NOT the 100-unit last-cycle benchmark "
                         "(20.32). Not a literature-competitive claim.",
    "band_definitions": [f"{lo}-{hi if hi < 9999 else 'inf'}" for lo, hi in BANDS],
    "overall_spearman_rho": round(overall_rho, 4),
    "per_band": per_band,
    "top_ab_pairs": pairs,
    "recommendation": recommendation,
    "caveats": [
        "Ran on the FD001 TRAIN split because the TEST split has no per-cycle rul_target (100% NaN); "
        "held-out units have real per-cycle truth.",
        "Predictor is in-sample (champion trained on all 100 train units incl. held-out): predictions "
        "are optimistic, which makes the distance/error gate harder to pass, not easier. The held-out "
        "split governs the embedding/kNN (no fleet leakage), which is what the distance signal needs.",
        "Embedding is a cheap z-score(+PCA) of existing features, not a learned/contrastive encoder; "
        "a weak-but-real rho routes to the SupCon ticket, not a kill.",
        "Held-out RMSE here is per-cycle and in-sample; the shipped 20.32 RMSE is the last-cycle-per-unit "
        "benchmark — a different quantity. No competitiveness claim either direction.",
        "FD001 has a single fault mode; the stronger novel-fault-mode test (FD003 cross-subset) is a "
        "later step, not this gate.",
    ],
}
print(json.dumps({"recommendation": recommendation,
                  "per_band": [(b["band"], b["rho"], b["ci95"]) for b in per_band],
                  "n_pairs": len(pairs)}, indent=2))
dbutils.notebook.exit(json.dumps(evidence))
