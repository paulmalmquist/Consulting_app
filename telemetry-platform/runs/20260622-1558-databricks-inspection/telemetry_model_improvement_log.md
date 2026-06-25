# Telemetry Model Improvement Log

Run `20260622-1558-databricks-inspection`. Bounded recursive improvement (challenger-only, max 3 iterations/area).
Champion is never silently overwritten; promotion only via `promote_models.py`'s declared gate when met.

---

## Area: RUL (C-MAPSS FD001)

### Candidate improvement: add naive baselines + leakage negative-control + failure analysis (iteration 1/3)

**Problem found:**
`train_rul.py` reports linear + GBM but (a) has **no naive baseline** to prove either is skillful, (b) selects the champion on **RMSE alone** though GBM's PHM (1423) is worse than linear's (1036), and (c) provides no leakage test, per-unit error, or regime breakdown. Aggregate RMSE could hide regime/late-prediction risk.

**Change made:**
New non-promoting challenger notebook `train_rul_challenger_tmp.py` (same FD001 protocol: capped 125, last cycle per unit, clip [0,125], asymmetric PHM). Adds: predict-train-mean/median baselines; a **label-shuffle negative control** (shuffle ytr, refit GBM); per-unit signed error → worst-10; error-by-RUL-regime; late-fraction. Logs ONE MLflow run `rul_challenger_diagnostic`. **No model registered, no alias moved, no table written.**

**Before (production champion, run d773eab9):**
GBM RMSE 20.32 / PHM 1423.3 / MAE 14.5. Linear (d4035973) RMSE 21.70 / PHM 1036.1 / MAE 17.7. No baseline, no leakage test.

**After (challenger run a64ca62d2cb54f468fea192fbaabb828):**
- Naive: predict-train-mean RMSE **41.9** / PHM 30,753; predict-train-median RMSE 48.6 / PHM 150,658.
- **Negative control PASS:** GBM on shuffled labels RMSE **41.65 ≈ naive 41.71** (real GBM 20.32). No target leakage.
- GBM **late-fraction = 0.58** (over-predicts remaining life on most units). 8/10 worst errors are LATE (unit 52: true 29, pred 86).
- Error-by-regime (RMSE): low-RUL GBM 20.3 / lin 23.7; mid-RUL GBM 23.1 / **lin 20.0**; high-RUL GBM 16.9 / lin 21.6.

**Regression checks:**
No leakage (negative control passes). No overfitting introduced (diagnostic only, no new features). Runtime 185 s serverless. No table/registry mutation. Reproducible (random_state=0, deterministic data).

**Decision:** **Keep the diagnostic; do NOT promote a new champion.** GBM remains champion under the existing RMSE gate.

**Reason:** Both models comfortably beat naive, so RUL is genuinely skillful — the win is real, not vanity. But GBM's lower RMSE buys a worse PHM and a 58% late rate (the operationally dangerous mode), and it regresses in the mid-RUL regime. Whether to prefer the more conservative linear model is a **safety/product decision**, not an automatic metric swap — so per the champion/challenger rules I stop at "candidate challenger recommended" and recommend the **gate become PHM-/late-rate-aware** (PR-1).

---

## Area: Anomaly (SMAP/MSL)

### Assessment: already acceptable — no code change (iteration 0)

**Problem found:** headline point-adjusted F1 (0.639) inflates ~2× the honest point-wise F1 (0.309); deployed champion's *provenance run* (v1) logged only point-adjusted metrics.

**Change made:** none to modeling. Re-running canonical `train_anomaly.py` produced v2 runs that log honest + affiliation metrics; `promote_models` selected MAD via the fail-closed honest gate (PCA fails) and set `tel_anomaly_detector` v2 champion.

**Before:** v1 champion, point-adjusted-only metrics, **no `champion` alias set**.
**After:** v2 champion (run b93e13f7), honest f1_pointwise 0.309 / event_recall 0.769 / affiliation_f1 0.466 logged; `@champion` alias restored.

**Decision:** **Keep.** The honest gate + affiliation metrics are the right design; the defensible numbers are now the champion's provenance.
**Reason:** Improving raw anomaly F1 (IsolationForest, threshold tuning) would be scope creep and is fraught without a labeled validation set (train has no positives). The fix is **honest framing** + a calibrated/clamped display score, not a new model. Bottleneck = missing labeled validation data.

---

## Area: Fused state vector

### Assessment: needs product decision — no metric chase (iteration 0)

**Problem found:** PCA-256 and the autoencoder produce **identical** metrics that equal the always-positive baseline (flag all 128 test buckets, fn=0, f1=0.757). The 99th-pctl-of-train threshold sits below the minimum test reconstruction error (train→test shift); the bucket label ("any of 32 channels anomalous") is ~61% positive.

**Change made:** none. Moving the threshold to force separation would be tuning on the evaluation set and the label is degenerate regardless.

**Decision:** **Reject metric tweaks; recommend reframe.** Treat the 256-d output as a *representation* (retrieval), not an anomaly detector. A real fix = redefine the bucket label (per-channel, tighter) and derive the threshold from a labeled validation slice or train↔test separation — a product/data decision.
**Reason:** Guardrail — do not make the metric look good by tuning on test; do not present a constant classifier as a model.

---

## Area: NCR clustering

### Assessment: interpretability-limited — no overfit tuning (iteration 0)

**Problem found:** 6 engineered families → 7 clusters: am_porosity / harness_chafing / weld_undercut clean; **seal_thermal split (clusters 1+2)**, **fastener_torque split (5+6)**, **surface_finish scattered** (4 records dumped to noise). The engineered *declining* dynamic (fastener_torque) never surfaces — its post-split slopes (−0.18/−0.23) don't cross the −0.35 threshold.

**Change made:** none. Lowering the −0.35 threshold to reveal the declining family would overfit to the known answer.

**Decision:** **Reject threshold tuning; recommend a "needs human review" bucket + family-level trend detection + logged cluster-quality metric.**
**Reason:** Guardrail — don't tune clustering to make the plot look nice. The honest outcome is "recovers obvious families, splits/scatters subtle ones, misses one dynamic."

---

## Area: NCR backlog forecast

### Assessment: ties naive — bottleneck is signal, not modeling (iteration 0)

**Problem found:** skill_vs_naive = +0.0125 on MAE but **worse on MAPE** (9.15% vs 9.06%); earlier runs lost to naive (−0.021). On a ~13 backlog over 8 folds this is within noise.

**Change made:** none. Walk-forward protocol is already correct; the drift model simply doesn't add signal over last-value on this small series.

**Decision:** **Keep methodology; reject any "beats naive" claim.** Present as "naive-equivalent with an honest uncertainty band," or add seasonality/flow signal (a modeling project, not a tweak).
**Reason:** Guardrail — a forecast isn't useful unless it beats an appropriate naive baseline; this one doesn't, and the bottleneck is data/signal, not a parameter.

---

## Promotion / rollback record (promote_models, run 273475505040153)
- `tel_anomaly_detector`: **v1 (no alias) → v2 `champion`** (run b93e13f7, MAD, honest gate pass; PCA failed gate). Rollback: re-point `champion` to v1 (not advised — v1 lacks honest metrics).
- `tel_rul_regressor`: **v1 (no alias) → v2 `champion`** (run d773eab9, GBM, RMSE 20.32 ≤ 25 gate). Rollback: re-point `champion` to v1.
- Both promotions are via the notebook's own declared gates (allowed). No manual alias edits were made outside the notebook.

## Workspace mutations (reported per guard)
- Uploaded canonical local source over the (drifted) deployed copies for all 9 production notebooks; prior deployed source backed up in `workspace_backup_before/`.
- Uploaded one temporary challenger: `train_rul_challenger_tmp` (diagnostic). Recommend deleting it from the workspace after review.
- No tables overwritten except by the notebooks' own existing design (`gold_replay_feed_scored`, `gold_fused_*`, `ncr_*`).
