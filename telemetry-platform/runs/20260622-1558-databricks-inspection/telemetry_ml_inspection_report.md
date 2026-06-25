# Telemetry Databricks Notebook Inspection Report

Run: `telemetry-platform/runs/20260622-1558-databricks-inspection/` · 2026-06-22
Workspace `dbc-2504bec5-b5ab` · Catalog `novendor_1.telemetry` · Warehouse `0e56420fb707d861` · MLflow exp `3740651530987773`
Evidence: `run_manifest.json`, `phase0_snapshot.json`, `telemetry_ml_inspection_report.json`, `phaseC_rul_baselines.json`, `phaseC_failure_cases.json`, challenger run `a64ca62d2cb54f468fea192fbaabb828`.

## 1. Executive Summary

- **All 9 notebooks ran to SUCCESS** on serverless compute, in dependency order, first try, with no failures, no timeouts, and no cost-safety events. Runtime totalled ~17 min wall (slowest: `ncr_clustering` 353 s, mostly `%pip install` + MiniLM download).
- **The pipeline is engineering-usable and partially ML-credible.** Two areas are genuinely sound; three carry real ML problems that "the notebook ran" hides.
- **Biggest ML risks:**
  1. **Fused state-vector anomaly eval is degenerate** — both PCA-256 and the autoencoder collapse to a *constant all-positive classifier* (flags 128/128 test buckets, fn=0). Its f1=0.757 is exactly the always-say-anomaly baseline. Zero discriminative power on the supervised metric as reported.
  2. **NCR backlog forecast does not reliably beat naive** — skill_vs_naive=+0.0125 on MAE but **worse on MAPE** (9.15% vs 9.06%), and earlier historical runs *lost* to naive (−0.021). Within-noise tie.
  3. **RUL champion is selected on RMSE while its PHM (late-prediction) risk is worse** — GBM RMSE 20.3 (beats linear 21.7) but PHM 1423 vs linear 1036, and **58% of GBM predictions are LATE** (optimistic about remaining life on near-failure units). Aggregate RMSE hides that linear is better in the mid-RUL regime.
  4. **Anomaly headline metric (point-adjusted F1 0.639) inflates ~2×** the honest point-wise F1 (0.309). The pipeline *does* log honest+affiliation metrics and the gate is fail-closed — good — but any demo quoting 0.639 is overstating.
- **Biggest engineering risks:**
  1. **Workspace had drifted from repo source** (6/8 notebooks differed; live champion was built by *older* code that logged only point-adjusted metrics). Re-running the canonical local source fixed this.
  2. **Both registered models had no `champion` alias before this run** — `score_replay_feed` (which loads `@champion`) would have failed; `promote_models` re-established it.
  3. **`anomaly_score` display column is uncalibrated** (spans 10⁰–10¹³; tiny residuals yield 10¹² scores). Only the binary `model_pred` is trustworthy.

**Verdict: demo-ready for the anomaly + RUL story with honest framing; NOT reliable yet for the fused-vector anomaly claim or the NCR forecast "skill" claim.**

## 2. Notebook Run Results

| Order | Notebook | Status | Key outputs | Warnings/errors | Evidence (run id) |
|---|---|---|---|---|---|
| 1 | telemetry_probe | ✅ SUCCESS | replay_rows=8473; sklearn 1.4.2 | none | 640853957107629 |
| 2 | train_anomaly | ✅ SUCCESS | MLflow runs b93e13f7 (MAD), 3dbb490b (PCA); honest+affiliation metrics | threadpoolctl noise (non-fatal) | 454828378162752 |
| 3 | train_rul | ✅ SUCCESS | linear d4035973 (rmse 21.70/phm 1036), gbm d773eab9 (rmse 20.32/phm 1423) | none | 1069625059509494 |
| 4 | promote_models | ✅ SUCCESS | `tel_anomaly_detector` v2 champion (MAD); `tel_rul_regressor` v2 champion (GBM) | (re-set missing aliases) | 273475505040153 |
| 5 | score_replay_feed | ✅ SUCCESS | `gold_replay_feed_scored` 8473 rows; agreement 3248/3248, fp 1240, fn 0 | uncalibrated score column | 815063442932503 |
| 6 | fused_state_vector | ✅ SUCCESS | `gold_fused_state_vectors`(256), `_feature_manifest`(256); pca/ae runs | **degenerate all-positive eval** | 166465491367800 |
| 7 | ncr_corpus | ✅ SUCCESS | `ncr_records` 128 (6 families+20 noise), seed 20260609 | none (synthetic, labeled) | 316835915512182 |
| 8 | ncr_clustering | ✅ SUCCESS | `ncr_points`(128), `ncr_clusters`(7); MiniLM→UMAP→HDBSCAN | family split/scatter | 849184872719071 |
| 9 | ncr_backlog_forecast | ✅ SUCCESS | `ncr_backlog_weekly`(16 hist+4 fc) | **ties/loses to naive** | 216155244100928 |
| +E | train_rul_challenger_tmp | ✅ SUCCESS | diagnostic only (no register/promote) | — | 598151536961911 |

Per-notebook checkpoints with the full Status/Inputs/Outputs/Metrics/Warnings/ML-notes blocks: `telemetry_run_checkpoints.md`.

## 3. Pipeline Dependency Map

```
gold_smap_msl_windows ─┬─> train_anomaly ──(MLflow runs)──┐
silver_smap_msl_labels │                                   ├─> promote_models ─> tel_anomaly_detector@champion ─> score_replay_feed ─> gold_replay_feed_scored
gold_cmapss_features ──┴─> train_rul ─────(MLflow runs)──┘                       tel_rul_regressor@champion
silver_cmapss_rul

gold_smap_msl_windows + silver_smap_msl_labels ─> fused_state_vector ─> gold_fused_state_vectors, gold_fused_feature_manifest

ncr_corpus ─> ncr_records ─┬─> ncr_clustering ──────> ncr_points, ncr_clusters
                           └─> ncr_backlog_forecast ─> ncr_backlog_weekly
```
Upstream `01–07` (download→bronze→silver→gold) were **not run** — all prerequisite tables were present and non-empty. The replay feed (`gold_replay_feed`, D-4 channel) is a curated deterministic fixture, not the full test set.

## 4. ML Fundamentals Review

### Anomaly model (`tel_anomaly_detector` v2 = rolling-MAD, champion)
- **Data:** `gold_smap_msl_windows` 705,876 rows, 81 channels. Train split = **196,321 rows, all label 0 (no anomalies)** → genuinely *unsupervised* AD. Test = 509,555 rows, 12.5% anomalies. `value_rmean50` null count = 0; trailing window is past-only (no look-ahead, verified in code + `eval_honest_metrics.py`).
- **Baseline:** present and correct — MAD (rolling median + dynamic k·MAD, k=4) is the baseline; PCA-reconstruction is the challenger. Honest gate compares both.
- **Metrics:** MAD point-adjusted f1=0.639 **but honest f1_pointwise=0.309** (p=0.319, r=0.299), event_recall=0.769, alarm_precision=0.319, affiliation_f1=0.466. PCA honest f1_pointwise=0.027 → **honest gate FAILS PCA, PASSES MAD**. Confusion (point-wise): tp=49,023 / fp=40,758 / fn=14,715.
- **Imbalance:** 12.5% positive; metrics correctly avoid accuracy and report P/R/F1 + event-level + affiliation. Good.
- **Calibration:** the deployed `anomaly_score` display column is **uncalibrated** — spans 10⁰–10¹³, tiny residuals (~0.005) produce 10¹² scores due to division by a near-zero per-channel scale. Direction is right (anomaly mean 1.2e13 vs normal 1.1e11) but magnitude is meaningless; threshold lives in `model_pred`, not the score.
- **Leakage:** low risk by construction (unsupervised, past-only features). No labeled validation exists, so the k=4 / 99th-pctl threshold is a heuristic, not label-tuned.
- **Recommendation:** keep MAD champion + honest gate (this is the defensible design). **Stop quoting the 0.639 point-adjusted figure**; lead with affiliation_f1=0.466 / event_recall=0.769. Fix or hide the raw `anomaly_score` magnitude in the UI.

### RUL model (`tel_rul_regressor` v2 = GBM, champion)
- **Data:** `gold_cmapss_features` FD001; 20,631 train rows, **100 test units** (last cycle each, truth = official RUL_FD001, capped 125). Test rul_target is null in the gold table by design (truth joined from `silver_cmapss_rul`). Split is time/unit-aware (correct).
- **Baselines (added in this review — the notebook had none):** predict-train-mean RMSE 41.9 / PHM 30,753; predict-train-median 48.6 / 150,658. **Both trained models beat naive ~2× on RMSE and by orders of magnitude on PHM.** RUL is genuinely skillful.
- **Leakage:** **NEGATIVE CONTROL PASSES** — shuffling training labels collapses GBM to RMSE 41.65 ≈ naive 41.71. No target leakage; the model learns from features.
- **Metrics / regime:** GBM RMSE 20.3 (linear 21.7), MAE 14.5 (linear 17.7). But **GBM PHM 1423 > linear 1036**, and **58% of GBM predictions are LATE** (optimistic). Error-by-regime: GBM beats linear at low-RUL (20.3 vs 23.7) and high-RUL (16.9 vs 21.6) but **loses mid-RUL (23.1 vs 20.0)**. Worst case: unit 52 true RUL 29, predicted 86 (late by 57 — would miss an imminent failure).
- **Calibration / intervals:** none (point predictions only; no PHM-style interval or conformal coverage).
- **Recommendation:** **candidate challenger recommended, not promoted.** GBM stays champion under the existing RMSE gate, but the gate should become **PHM-/late-rate-aware** because late predictions are the operationally dangerous failure mode. Add a naive baseline + PHM + late-fraction to the model card. Whether to switch to the more conservative linear model is a safety/product decision.

### Fused state vector
- **Input quality:** 256-d (32 channels × 8 features), winsorized z-scores (±8), train-median imputation (no leak). Manifest table documents every feature + leakage risk. Alignment = normalized sequence progress, **not** physical simultaneity — documented honestly.
- **Embedding/vector logic:** PCA-16 (baseline) and a sklearn-MLP autoencoder bottleneck. Reconstruction-error anomaly scoring with a 99th-pctl-of-train threshold.
- **Dimensionality / similarity:** the **supervised anomaly eval is degenerate** — test has 78 anomaly buckets of 128; **both models flag all 128** (tp=78, fp=50, **fn=0**), so f1=0.757 is exactly the always-positive baseline (2·0.609·1/1.609). The 99th-pctl train threshold sits below the *minimum* test reconstruction error (train→test distribution shift), so everything trips. The bucket label ("any of 32 channels anomalous in this progress bucket") is ~61% positive — near-degenerate. One earlier AE run even logged test_recon_mse=1.3×10³¹ (numeric blow-up, since winsorized).
- **Recommendation:** the 256-d **representation** may be useful for retrieval, but **do not present the fused PCA/AE numbers as a working anomaly detector.** Needs a product decision: redefine the bucket label (per-channel, tighter), set the threshold from train↔test separation (or a labeled val), and add nearest-neighbor cosine sanity checks before any similarity claim. Not a metric to chase blindly.

### NCR clustering
- **Corpus quality:** 128 deterministic synthetic records (seed 20260609), 6 engineered families + 20 noise topics, clearly labeled synthetic.
- **Embedding/cluster logic:** MiniLM → UMAP(seeded) → HDBSCAN(min_cluster_size=6, min_samples=4) → 7 clusters, noise 7 (5.5%). Deterministic.
- **Cluster quality / family recovery (measured):** clean — am_porosity (cluster 0, n=18), harness_chafing (cluster 4, n=8), weld_undercut (cluster 3, ~9). **Split** — seal_thermal across clusters 1(13)+2(21); fastener_torque across 5(8)+6(10). **Scattered** — surface_finish (10 in cluster 1, **4 dumped to noise**, rest spread). No silhouette/DBCV logged.
- **Dynamics recovery:** seal_thermal *rising* partly surfaces (cluster 1 slope +0.595, but mixed with surface_finish); **fastener_torque *declining* does NOT surface** — its slopes (−0.18/−0.23 after the split) never cross the −0.35 "declining" threshold.
- **Recommendation:** add a **"needs human review" bucket** for low-purity clusters; detect trend at the *family* level rather than per-cluster (splitting dilutes the slope); log a cluster-quality metric. Do **not** lower the −0.35 threshold just to make the declining label appear — that overfits to the known answer.

### NCR backlog forecast
- **Target:** weekly open backlog (records opened ≤ week-end and not yet closed). Clear.
- **Baseline / validation:** naive last-value baseline present; **walk-forward backtest (8 folds, h=1, no look-ahead)** — methodology is correct.
- **Forecast quality:** mae=1.234 vs mae_naive=1.25 (**skill +0.0125**) but **mape=9.15% vs naive 9.06% (worse)**; earlier runs lost to naive (−0.021). On a backlog of ~13 over 8 folds, a 0.016 MAE edge is within noise. 4-week forecast 14.25→15.0 with widening empirical q90 band (±2.2→±4.5).
- **Recommendation:** **do not claim the forecaster beats naive** — it ties. Either accept it as "naive-equivalent with an honest uncertainty band" or add signal (seasonality/flow decomposition). Report MAE *and* MAPE together; add residual-over-time and interval-coverage checks.

## 5. Debug Findings

### threadpoolctl issue — ROOT CAUSE FOUND, NON-FATAL
- **Environment:** Python 3.12.3, sklearn 1.4.2, **threadpoolctl 2.2.0**, numpy 1.26.4, scipy 1.13.1 (DBR serverless).
- **Root cause:** `threadpool_info()` shows the bundled `libgomp` (OpenMP) entry with **`version: null`**. threadpoolctl **2.2.0** does not guard against a missing version string; during its ctypes library-enumeration callback it calls `.split()` on that `None` → `AttributeError: 'NoneType' object has no attribute 'split'`, which Python surfaces as *"Exception ignored on calling ctypes callback function."*
- **Fatal or non-fatal: NON-FATAL.** Proven by the diagnostic (run 399447755875906): PCA reconstruction finite (`pca_recon_finite=true`), IsolationForest predicts both classes (4.3% flagged), `unraisable_events=[]` in a controlled fit/predict+gc (the warning is intermittent introspection noise, not on the result path). All 9 production notebooks completed and produced finite, plausible metrics.
- **Recommended fix (only if the log noise is undesirable):** notebook-scoped `%pip install "threadpoolctl>=3.1.0"` at the top of any notebook that calls sklearn (3.x guards against `version=None`). **Tradeoff:** notebook-scoped, reversible, isolated to that run; do **not** change the global cluster image. Rollback = remove the pip line. Default recommendation: **document as known harmless noise; leave packages as-is** since results are unaffected.

## 6. ML Inspector Program
- **Path:** `telemetry-platform/inspect_pipeline.py` (read-only). Also `phase0_probe.py`, `phaseC_rul_baselines.py`, `phaseC_failure_cases.py`, `_diag_threadpool.py`, `runner.py`.
- **What it checks:** latest MLflow run per name (metrics+params), UC models/versions/`champion` alias + run behind champion, table row counts, split/label balance, null counts, prediction-table agreement (tp/fp/fn), cluster sizes/status/family purity, forecast history-vs-forecast and band.
- **How to run:** set `DATABRICKS_PAT` (or repo-root `claude_token.txt`); `cd telemetry-platform/databricks && python ../inspect_pipeline.py`. Read-only — never promotes, scores, or overwrites.
- **Outputs:** `telemetry_ml_inspection_report.json` (+ this `.md`).

## 7. Action Items

### Must fix
- **Fused-vector anomaly claim:** stop presenting PCA/AE f1=0.757 as anomaly detection — it is the all-positive baseline. Redefine the bucket label and threshold, or reframe the surface as representation-only.
- **NCR forecast claim:** stop implying it beats naive; it ties (worse on MAPE).
- **Anomaly headline:** retire the point-adjusted F1 (0.639) from demo copy; lead with honest/affiliation metrics.

### Should fix
- **RUL gate:** add naive baseline + PHM + late-fraction to selection/model card; make the champion decision PHM-aware (late predictions are the dangerous mode). Treat GBM-vs-linear as a safety decision.
- **`anomaly_score` calibration:** clamp/normalize the display score (currently 10⁰–10¹³); or show a percentile rank.
- **Clustering:** add a "needs human review" bucket + family-level trend detection + a logged cluster-quality metric; surface that the *declining* family is currently missed.
- **Provenance hygiene:** prevent workspace/repo drift (the live champion was built by stale code). Treat repo `notebooks/*.py` as the only source; redeploy on change.

### Nice to have
- Prediction intervals / conformal coverage for RUL; reliability diagram for any probability surfaced.
- Silhouette/DBCV logged for clustering; residual-over-time + interval-coverage plots for the forecast.
- A labeled validation slice for anomaly threshold selection (currently heuristic).

## 8. Interview / demo translation

**What these notebooks DO prove:**
- A real, reproducible medallion → train → gate → register → score → serve pipeline on **real NASA data** (C-MAPSS FD001 RUL; SMAP/MSL anomaly), with fail-closed promotion gates and honest, range-aware metrics logged beside the legacy ones.
- **RUL is genuinely skillful:** beats naive ~2× on RMSE, passes a label-shuffle leakage test, with documented per-unit/per-regime error.
- **Anomaly detection is honestly gated:** the inflating point-adjusted F1 is exposed; the defensible affiliation_f1 (0.47) / event_recall (0.77) carry the claim; PCA is correctly rejected.
- Determinism and provenance: seeded synthetic NCR corpus, MLflow run IDs, UC champion alias, snapshot inputs.

**What they do NOT prove yet:**
- That the **fused 256-d vector** is a working multi-signal anomaly detector — as evaluated it is a constant all-positive classifier; it is a *representation*, and the buckets are aligned by normalized progress, not real simultaneity.
- That the **NCR backlog forecast** adds skill over a naive last-value baseline — it ties.
- That **NCR clustering** recovers all engineered defect families or their dynamics — 3/6 clean, 2 split, 1 scattered; the *declining* trend is missed.
- Any **calibrated probability** of failure/anomaly — scores are uncalibrated; the RUL model has no intervals.
- The synthetic NCR data is explicitly synthetic — do not present it as factory ground truth.

## 9. Next recommended notebook / PR

**PR-1 (highest value, smallest surface): make RUL promotion PHM-aware + add naive baselines to `train_rul.py` and the model card**, folding in the challenger diagnostic (label-shuffle leakage control, per-unit/per-regime error, late-fraction). It turns the strongest model into the most defensible one and gives the demo a real "we measure the dangerous failure mode" story. Runner-up: **PR-2 — honest reframing of the fused-vector and NCR-forecast surfaces** (relabel/threshold the fused eval; drop the forecast "skill" claim).

---

# Final ML Improvement Report

## Executive judgment
**Research-ready and demo-ready for the anomaly + RUL story with honest framing; NOT yet reliable for the fused-vector anomaly claim or the NCR-forecast "skill" claim.** The pipeline executes cleanly and end-to-end, the gates are fail-closed, and the strongest model (RUL) survives a leakage test and beats naive. Three surfaces need honesty fixes before they can be claimed.

## What improved
- **Honest metrics are now the live champion's provenance.** Re-running canonical source replaced a stale champion (point-adjusted-only) with v2 runs that log honest + affiliation metrics; `promote_models` re-established the missing `champion` aliases (fixing a latent `score_replay_feed` failure).
- **RUL now has the baselines + leakage test + failure analysis it lacked** (challenger run `a64ca62d`): beats naive ~2×, negative control PASSES, per-unit/per-regime error and 58%-late-rate quantified.
- **threadpoolctl warning root-caused and cleared** as non-fatal (libgomp `version=null` × threadpoolctl 2.2.0).

## What did not improve (rejected / deferred)
- **Did not promote the RUL challenger** — it is diagnostic; GBM stays champion under the existing RMSE gate. Switching to linear is a safety/product call (Reject auto-change; recommend gate redesign).
- **Did not tune the NCR `declining` threshold** to surface fastener_torque — that overfits to the known answer (Reject).
- **Did not "fix" the fused-vector metric** by moving the threshold — the label is degenerate; a real fix needs a product decision on bucket labeling (Defer: needs data/decision).
- **Did not chase the NCR forecast** past naive — bottleneck is signal/data, not modeling (Defer).

## Current best models
| Area | Champion | Baseline | Key metric | Why champion wins |
|---|---|---|---|---|
| Anomaly (SMAP/MSL) | rolling-MAD v2 | MAD vs PCA | affiliation_f1 0.466, event_recall 0.769 | Only model passing the fail-closed honest gate (PCA fails) |
| RUL (C-MAPSS FD001) | GBM v2 | predict-train-mean | RMSE 20.3 (naive 41.9) | Beats naive ~2×, no leakage — **but** PHM 1423 > linear 1036; promotion should be PHM-aware |
| Fused 256-d | none defensible | always-positive | f1 0.757 == baseline | **No winner** — both models == all-positive baseline |
| NCR clustering | HDBSCAN (7 clusters) | n/a (unsupervised) | noise 5.5%; 3/6 families clean | Recovers obvious families; splits/scatters others |
| NCR forecast | drift(8w) | naive last-value | skill +0.0125 MAE / −0.01 MAPE | **Ties naive** — no defensible win |

## Remaining ML risks
- **Weak/degenerate labels:** fused buckets ~61% positive ("any channel"); anomaly train has no labeled positives (threshold un-tuned); NCR labels are synthetic.
- **Calibration:** no calibrated scores anywhere; `anomaly_score` magnitude is meaningless; RUL has no intervals.
- **Champion criterion vs operational risk:** RUL optimizes RMSE while the dangerous mode (late predictions, 58%) is captured by PHM.
- **Small data:** NCR (128 records, 16 weeks) and fused (128+128 buckets) are too small for stable conclusions.
- **Drift:** workspace vs repo drift recurred once; without a deploy discipline the live model can lag the code.

## Recommended next actions
### Must fix
- Reframe fused-vector and NCR-forecast demo claims to honest language; retire the point-adjusted anomaly F1 from copy.
### Should fix
- PHM-aware RUL gate + baselines/late-rate in the model card; clamp/normalize `anomaly_score`; "needs human review" + family-level trend for clustering; enforce repo→workspace deploy discipline.
### Nice to have
- RUL prediction intervals + coverage; clustering silhouette/DBCV; forecast residual + coverage diagnostics; labeled validation slice for anomaly thresholding.

## Demo translation
Say: *"Real NASA telemetry, reproducible medallion-to-registry pipeline, fail-closed honest gates, an RUL model that beats naive ~2× and passes a leakage test, and an anomaly detector whose honest range-aware F1 we report instead of the inflated point-adjusted number."* Do **not** say: *"physics-informed,"* *"calibrated risk,"* *"the fused vector detects anomalies,"* or *"our forecast beats baseline"* — none are supported yet.
