# Telemetry Databricks — Running Checkpoints

Run dir: `telemetry-platform/runs/20260622-1558-databricks-inspection/`
Workspace: `dbc-2504bec5-b5ab` · Catalog/schema: `novendor_1.telemetry` · Warehouse: `0e56420fb707d861` · MLflow exp: `3740651530987773`

---

## Checkpoint — Phase 0 preflight & probe

### Status
Success

### What ran
Auth preflight (`get_client` + `SELECT 1` → SUCCEEDED); `phase0_probe.py` (schema inventory, prereq check, workspace listing, MLflow + UC-model snapshot); backed up all 9 deployed workspace notebooks; `_diag_threadpool.py` serverless run.

### Inputs confirmed
- 20 tables in `novendor_1.telemetry`. All 5 prerequisites present + non-empty: `gold_smap_msl_windows` (705,876), `gold_cmapss_features` (265,256), `silver_cmapss_rul` (707), `silver_smap_msl_labels` (82), `gold_replay_feed` (8,473). **→ No upstream 01–07 rebuild needed.**
- 9 notebooks deployed in workspace (incl. remote-only `telemetry_probe`).

### Outputs produced
- `phase0_snapshot.json` (baseline MLflow runs + models BEFORE).
- `workspace_backup_before/*.py` (deployed source for all 9 — mutation guard).
- `run_manifest.json` (initialized).

### Metrics observed (pre-existing runs)
- **MLflow runs before: 23.** Anomaly champion run logs ONLY point-adjusted: `anomaly_baseline_mad` f1=0.6387 (p=0.546, r=0.769, tp=49023, fp=40758, fn=14715); `anomaly_pca_recon` f1=0.4196 (p=0.873, r=0.276).
- RUL: `rul_gbm` rmse=20.32 / phm=1423; `rul_linear_baseline` rmse=21.70 / **phm=1036 (better)**.
- Fused: PCA and AE both f1=0.7573, recall=1.0, fn=0, fp=50 (identical confusion matrix); one stale AE run had test_recon_mse=1.3e31 (blow-up, since fixed by winsorization).
- NCR forecast latest: mae=1.234 vs mae_naive=1.25, skill=+0.0125; earlier runs skill=−0.021 (lost to naive). NCR clustering latest: 7 clusters, noise_frac=0.055.

### Warnings/errors
- **Pre-existing state issue:** both UC models (`tel_anomaly_detector` v1, `tel_rul_regressor` v1) have **NO `champion` alias** (`aliases=null`). `score_replay_feed` loads `@champion`, so it would FAIL until `promote_models` re-sets the alias. Not fatal to the plan — promote runs before score.
- **Drift:** deployed workspace notebooks differ from repo source for 6/8 (e.g. local `train_anomaly` 12,094 B vs deployed 7,237 B). The live champion was produced by older deployed code; repo source is newer (honest metrics). Running the drivers pushes canonical local source. Backed up first.

### ML fundamentals notes
- Champion anomaly metrics on record are point-adjusted (inflating). Honest/affiliation metrics not yet logged for the deployed champion → re-run needed to get a defensible floor.
- RUL champion chosen on RMSE while PHM (asymmetric, operationally important) is worse than the linear baseline — flag for review.
- Fused recall=1.0/fn=0 with identical PCA/AE confusion matrices suggests the threshold/label structure dominates, not the model.
- Forecast skill vs naive is marginal/unstable across historical runs.

### threadpoolctl diagnostic (Phase 0 step 4 — run_id 399447755875906, 31.9s, SUCCESS)
- Versions: Python 3.12.3, sklearn 1.4.2, **threadpoolctl 2.2.0**, numpy 1.26.4, scipy 1.13.1.
- `threadpool_info()`: `libgomp` (OpenMP) entry has **`version: null`** → threadpoolctl 2.2.0 calls `.split()` on `None` inside a ctypes lib-enumeration callback → `AttributeError: 'NoneType'...split`, surfaced as "Exception ignored on calling ctypes callback."
- **Impact: none.** `pca_recon_finite=true`, IsolationForest predicts both classes (4.3% flagged), `unraisable_events=[]` in this controlled fit/predict+gc (intermittent). Non-fatal introspection noise.

### Next action
Continue → Phase A.

---

## Phase A — all 9 notebooks ran SUCCESS (serverless, local source uploaded; prior deployed source backed up). Per-run output preserved live in `run_manifest.json`.

| # | Notebook | Run id | Elapsed | Result |
|---|---|---|---|---|
| 1 | telemetry_probe | 640853957107629 | 47s | SUCCESS (replay_rows=8473) |
| 2 | train_anomaly | 454828378162752 | 78s | SUCCESS |
| 3 | train_rul | 1069625059509494 | 124s | SUCCESS |
| 4 | promote_models | 273475505040153 | 47s | SUCCESS |
| 5 | score_replay_feed | 815063442932503 | 78s | SUCCESS |
| 6 | fused_state_vector | 166465491367800 | 108s | SUCCESS |
| 7 | ncr_corpus | 316835915512182 | 62s | SUCCESS |
| 8 | ncr_clustering | 849184872719071 | 353s | SUCCESS (pip+MiniLM) |
| 9 | ncr_backlog_forecast | 216155244100928 | 62s | SUCCESS |

### Checkpoint — train_anomaly  (Success)
- **Writes:** none (MLflow only). Reads `gold_smap_msl_windows`.
- **MLflow:** baseline_mad run `b93e13f753a047aa8818878dba859e5b`; pca run `3dbb490b6b264421bd264bb48727cdc2`.
- **Metrics — MAD:** point-adjusted f1=0.6387; **honest f1_pointwise=0.309** (p=0.319, r=0.299); event_recall=0.769; alarm_precision=0.319; affiliation_f1=0.466; **honest_gate_pass=TRUE**.
- **Metrics — PCA:** point-adjusted f1=0.420; honest f1_pointwise=0.027; event_recall=0.481; affiliation_f1=0.363; **honest_gate_pass=FALSE**.
- **ML notes:** point-adjustment inflates ~2× (0.639 vs honest 0.309). Honest gate correctly passes MAD, rejects PCA. test_anomaly_rate=0.125 (imbalanced). Threshold k=4.0 calibrated on TRAIN residual scale (no test tuning) — defensible. No warnings.

### Checkpoint — train_rul  (Success)
- **Writes:** none (MLflow only). Reads `gold_cmapss_features`, `silver_cmapss_rul` (FD001).
- **MLflow:** linear `d4035973f5c049febbc5091803f0a463` (rmse=21.70, phm=1036); gbm `d773eab980634302ab063fa2ec0aaf54` (rmse=20.32, phm=1423). rmse_gate=25, rul_cap=125, test_units=100.
- **ML notes:** **GBM wins on RMSE but loses on PHM** (1423 vs linear 1036). PHM penalizes late predictions; optimizing RMSE alone selects the operationally worse model. No naive baseline (last-RUL / linear-degradation / median-life) present. Test = last cycle per unit (time/unit-aware) — good. No warnings.

### Checkpoint — promote_models  (Success)
- **Registry mutation:** `tel_anomaly_detector` v1→**v2 champion** (MAD, run b93e13f7); `tel_rul_regressor` v1→**v2 champion** (GBM, run d773eab9).
- **Gate decisions:** anomaly winner=MAD (honest gate: MAD pass / PCA fail), affiliation_f1=0.466; RUL winner=GBM (rmse 20.32 ≤ 25).
- **Promotion guard:** pre-run both models had NO alias; post-run both have `champion`. Rollback = re-point alias to v1 (not recommended; v1 lacks honest metrics). Promotion is via the notebook's own declared gate — allowed.
- **ML notes:** RUL promotion records linear_phm vs gbm_phm in output but selects on RMSE only.

### Checkpoint — score_replay_feed  (Success)
- **Writes:** `gold_replay_feed_scored` (OVERWRITE — existing design). Pre=8473 rows, post=8473 rows. Reads `gold_replay_feed` + `tel_anomaly_detector@champion`.
- **Output:** label_anomaly_ticks=3248, model_fired_ticks=4488, agreement=3248, first_fire_t=728.
- **ML notes:** agreement==label count exactly → MAD fires on **every** labeled tick of the curated replay feed (recall=1.0 here) + 1240 extra. Replay feed is a curated demo subset; this looks far stronger than honest test recall (0.30). Demo-honesty flag.

### Checkpoint — fused_state_vector  (Success)
- **Writes:** `gold_fused_state_vectors` (256 rows), `gold_fused_feature_manifest` (256). 32 channels × 8 feats, 128 buckets, 128 train + 128 test vectors. D-4 forced.
- **MLflow:** pca_256 `52f8c511b6d5494f9a94c0fbc904f766`; autoencoder_256 `7de5546fcbec4b58a10fa7891c51f882`.
- **Metrics:** PCA and AE **identical** — p=0.609, recall=1.0, **fn=0**, tp=78, fp=50, f1=0.757. AE train_recon_mse=202, test_recon_mse=1277.
- **ML notes (MAJOR):** test has 78 anomaly buckets / 128; model flags all 128 (fp=50 = every non-anomaly bucket). f1=0.757 **is exactly the always-positive baseline** (2·0.609·1/1.609). Threshold (99th pctl of TRAIN recon) sits below min TEST recon error (train→test shift) → degenerate all-anomaly classifier, zero discriminative power. Bucket label ("any channel anomalous") is ~61% positive — nearly degenerate. Representation may be fine; the supervised eval is not meaningful. Alignment = normalized progress (documented, ≠ simultaneity).

### Checkpoint — ncr_corpus  (Success)
- **Writes:** `ncr_records` (OVERWRITE, 128 rows). Deterministic SEED=20260609, 16 weeks, 6 families, 20 noise, 13 open. Stdlib-only → fully reproducible. Synthetic, labeled as such.

### Checkpoint — ncr_clustering  (Success)
- **Writes:** `ncr_points` (128), `ncr_clusters` (7). MLflow run `ae875c376c094424bb036f462ebc5327`. MiniLM→UMAP(seed)→HDBSCAN.
- **Output:** 7 clusters, noise=7 (5.5%). Sizes 18/31/34/10/8/9/11. Statuses: cluster 1 "rising", rest "flat".
- **ML notes:** corpus encodes seal_thermal RISING + fastener_torque DECLINING + 4 flat. Clustering recovered 1 rising but **no declining cluster** (fastener driven to ~0 → trailing-8wk slope flat). 7 clusters vs 6 families → split/merge; needs interpretability check. No DBCV/silhouette logged. Deterministic (seeded UMAP).

### Checkpoint — ncr_backlog_forecast  (Success)
- **Writes:** `ncr_backlog_weekly` (20 rows = 16 history + 4 forecast). MLflow run `d4ce7eb818af4439915c0014ab269f57`.
- **Metrics:** mae=1.234 vs **mae_naive=1.25** (skill +0.0125); **mape=9.15% vs mape_naive=9.06% (WORSE)**. 8 walk-forward folds, h=4 forecast, empirical q90 band.
- **ML notes:** marginal/tie vs naive on MAE, worse on MAPE; earlier historical runs lost to naive (skill −0.021). Walk-forward protocol is correct (no look-ahead), but the drift forecaster does **not** reliably beat naive. Demo-honesty flag.

### Next action
Continue → Phase B (read-only inspector consolidating post-run state) then Phase C (skeptical ML review + negative controls + failure-case library).

