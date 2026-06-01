# PROOF

Every value in this file is copied from a real run. No rounding, no hand-edits. If a metric missed
its gate, it is recorded as missed. If a step could not run, the blocker is written here honestly.

## Status (2026-06-01, end of Phase 2)

Phases 0–2 are complete. **Phase 2 (MLflow models + registry + promotion gates) is done:** four real
models trained in Databricks, logged to MLflow with real run IDs and exact metrics, two champions
registered in the Unity Catalog Model Registry behind promotion gates, and the deterministic replay
feed re-scored by the champion anomaly model. No Supabase migration and no dashboard code exist yet
(Phases 3–4).

Auth: `DATABRICKS_PAT` was sourced from the repo-root `claude_token.txt` (its value was never read,
printed, logged, or committed). The token is a valid Databricks PAT — the read-only auth gate passed.

## Phase 1 — Ingestion proof

### Databricks auth gate (read-only) — PASS

```
[auth-gate] PAT source: file:claude_token.txt
[auth-gate] workspace: https://dbc-2504bec5-b5ab.cloud.databricks.com
[auth-gate] warehouse_id: 0e56420fb707d861
[auth-gate] warehouse_status: STOPPED
[auth-gate] catalog novendor_1 schemas: ['default', 'historyrhymes', 'information_schema', 'property_ops_risk_ml']
[auth-gate] telemetry schema exists: False  (target namespace: novendor_1.telemetry)
[auth-gate] PASS — Databricks authenticated, workspace reachable.
```

Schema created: `CREATE SCHEMA IF NOT EXISTS novendor_1.telemetry` → `SUCCEEDED`; schema list then
included `telemetry`.

### Datasets downloaded (real public sources)

| Dataset | Source | Files | Bytes | Status |
|---|---|---|---|---|
| C-MAPSS FD001–FD004 | `github.com/hankroark/Turbofan-Engine-Degradation` (mirror of NASA PCoE) | 12 (train/test/RUL ×4) | 44,913,306 | downloaded |
| SMAP/MSL telemanom | labels: `github.com/khundman/telemanom`; arrays: `huggingface.co/datasets/appleparan/telemanom` | 1 labels CSV + 164 `.npy` | 3,956 + 175,093,232 | downloaded |
| IMS bearing | `phm-datasets.s3.amazonaws.com/NASA/4.+Bearings.zip` (NASA PCoE) | 1 zip (1.075 GB) | 1,075,597,174 | archive verified, extraction deferred |

Sample SHA-256 (full records in `databricks/data/manifest_*.json`): `train_FD001.txt` →
`963b5e22825b34d8…`; SMAP/MSL `labeled_anomalies.csv` → `057ce2d6c8875982…`; IMS outer zip →
`21001ac266c465f5…`.

**IMS note (honest blocker handling):** the original NASA PCoE direct link
(`ti.arc.nasa.gov/.../IMS.7z`) now returns an HTML landing page, not the archive (a naive size check
was fooled by a 344 KB HTML page until a magic-byte check was added). The S3 mirror returned the real
1.075 GB archive. It is a zip → nested `IMS.7z` → three run-to-failure `.rar` archives (1st/2nd/3rd
test) + a Readme PDF. Full vibration feature engineering needs a triple-nested extraction of ~1 GB
and does not gate the Phase 1 replay demo, so it is **deferred**: Bronze records the verified
provenance only. No synthetic vibration data was created.

### Unity Catalog tables in `novendor_1.telemetry`

| Table | Rows |
|---|---|
| `bronze_cmapss` | 265,256 |
| `bronze_cmapss_rul` | 707 |
| `bronze_smap_msl_telemetry` | 705,876 |
| `bronze_smap_msl_labels` | 82 |
| `bronze_ims` | 5 |
| `silver_cmapss` | 265,256 |
| `silver_cmapss_rul` | 707 |
| `silver_smap_msl` | 705,876 |
| `silver_smap_msl_labels` | 82 |
| `silver_ims` | 5 |
| `gold_cmapss_features` | 265,256 |
| `gold_smap_msl_windows` | 705,876 |
| `gold_replay_feed` | 8,612 |

(Inventory + counts produced by `databricks/07_collect_proof.py` against the live warehouse.)

### Sample rows

Bronze C-MAPSS (`FD001` unit 1, first cycles):
```
cols: subset, split, unit, cycle, sensor_2, sensor_3, sensor_4
['FD001','train',1,1, 641.82, 1589.7, 1400.6]
['FD001','test', 1,1, 643.02, 1585.29,1398.21]
```
Silver C-MAPSS (typed + train-only `rul_target`):
```
cols: subset, split, unit, cycle, max_cycle, rul_target, sensor_2
['FD001','train',1,1, 192, 191, 641.82]
['FD001','train',1,2, 192, 190, 642.15]
```
Gold C-MAPSS features (no-look-ahead rolling + lag; split isolated):
```
cols: subset, unit, cycle, rul_target, sensor_2, sensor_2_rmean5, sensor_2_roc
['FD001',1,1, 191, 641.82, 641.82, NULL]     # first cycle: rmean5 == own value, roc NULL
```
Gold SMAP/MSL windows (labeled anomaly tick on channel T-1):
```
cols: chan_id, split, t, value, value_rmean50, value_roc, is_anomaly
['T-1','test',2399, 0.76615, 0.80726, -0.00343, 1]
```
Gold replay feed (deterministic T-1 test sequence):
```
cols: chan_id, t, value, value_rmean50, is_anomaly
['T-1',2399, 0.76615, 0.80726, 1]
```

### No-look-ahead design + verification

- **Contract:** a feature at time `t` is a function of times `<= t` only. Every rolling feature uses
  `ROWS BETWEEN n PRECEDING AND CURRENT ROW` (never `FOLLOWING`); rate-of-change uses `LAG(...)`
  (strictly past). The C-MAPSS `rul_target` is a label, never an input to a same-row feature.
- **C-MAPSS leakage bug caught and fixed:** the first Gold build partitioned rolling windows by
  `(subset, unit)`. Because a train unit and a test unit share `(subset, unit)`, features bled across
  the train/test boundary — e.g. `FD001` unit 1 cycle 1 `sensor_2_rmean5` came out `642.42` (the
  average of the train value `641.82` and the test value `643.02`). Fixed by partitioning on
  `(subset, split, unit)`. After the fix the train row's `rmean5` is `641.82` and the test row's is
  `643.02` — each only sees its own split.
- **Verified ranges:** C-MAPSS train `rul_target` ∈ [0, 542] (never negative). SMAP/MSL test split:
  509,555 rows, 63,738 labeled anomaly ticks, base rate `0.1250856139180265`.

### Streaming vs replay decision

Deterministic Delta-replay (documented simplification, allowed by the plan). `gold_replay_feed` is a
single fixed channel (T-1, SMAP) test sequence of 8,612 ticks ordered by `t`, carrying no-look-ahead
features and the labeled `is_anomaly` flag (1,536 anomaly ticks in `t ∈ [0, 8611]`). Replaying these
ordered rows reproduces an identical feed every run, which is what the demo's "fires on its own,
never stalls" requirement needs. True Spark Structured Streaming is not used in Phase 1; the ordered
Delta replay is the honest, reproducible substitute. The anomaly flags in this feed are the **labeled
NASA targets**, not hand-authored — Phase 2 will overlay real model scores on the same feed.

### Exact commands run

```
cd telemetry-platform/databricks
python auth_gate.py                 # read-only gate — PASS
python 01_create_schema.py          # CREATE SCHEMA novendor_1.telemetry
python data/download_cmapss.py      # 12 files, 44.9 MB
python data/download_smap_msl.py    # labels + 164 .npy, 175 MB
python data/download_ims.py         # 1.075 GB archive (S3 mirror)
python 02_bronze_cmapss.py          # bronze_cmapss 265,256 ; bronze_cmapss_rul 707
python 03_bronze_smap_msl.py        # bronze_smap_msl_telemetry 705,876 ; labels 82
python 04_bronze_ims.py             # bronze_ims 5 (provenance)
python 05_silver.py                 # silver_* (no-look-ahead ordering; P-2 dedup)
python 06_gold.py                   # gold_* + gold_replay_feed (split-isolated features)
python 07_collect_proof.py          # inventory + counts + samples
```
The SQL Warehouse `0e56420fb707d861` was started before each step and stopped after (it also
auto-stops in 15 min). The PAT value was never printed.

## Phase 2 — Model proof

### Training mechanism — Databricks-native

All four models trained inside serverless Databricks notebook jobs on the ML runtime (sklearn 1.4.2,
numpy 1.26.4), reading the Gold tables in `novendor_1.telemetry` and logging to MLflow natively. The
driver scripts (`telemetry-platform/databricks/08–11_*.py`) upload the notebooks
(`databricks/notebooks/*.py`) and run them as jobs; no local ML libraries were used for training.
Mechanism validated by a probe job (MLflow run `f5c8525f79f044f5946a17fb29e70728`). The shared
client's job-create omitted the serverless `environments` block (Jobs API now rejects that); fixed in
`databricks/_jobs.py` rather than editing the shared client.

### MLflow experiment

`/Users/paulmalmquist@gmail.com/HistoryRhymesML` (id `3740651530987773`) — the workspace's existing
experiment (per `skills/historyrhymes/config/databricks.json`). Telemetry runs are tagged by run
name (`anomaly_*`, `rul_*`) to keep them identifiable within the shared experiment.

### Anomaly detection — SMAP/MSL (point-adjusted eval on the labeled test split)

Test split: 509,555 rows, 63,738 labeled anomaly ticks, base rate 0.1250856139180265.

| Model | Run ID | Precision | Recall | F1 |
|---|---|---|---|---|
| Baseline — rolling-MAD dynamic threshold (k=4) | `4a48cb6af8714609b9581d66e904544c` | 0.5460286697630902 | 0.7691330132730867 | **0.6386571043323628** |
| Stronger — PCA reconstruction error (3 components, 99th-pctl train threshold) | `8e99b41142c14948b37aadade59e5aad` | 0.8725776874659266 | 0.2762245442279331 | 0.4196150866948698 |

The PCA model is more precise (0.87) but far less sensitive (recall 0.28). On F1 the **simple
baseline wins** (0.639 vs 0.420). No-look-ahead: both thresholds were calibrated on the train split
only and frozen before scoring the test split.

### Remaining useful life — C-MAPSS FD001 (evaluated on all 100 test units, RUL capped at 125)

| Model | Run ID | RMSE | PHM score |
|---|---|---|---|
| Baseline — linear regression | `b3c8ddc1df974875b9ddbb4f3621e0d5` | 21.702448390120548 | 1036.1390874014483 |
| Stronger — gradient boosting (300 trees, depth 3) | `c970fdcc57d24f518cb8d3bc1a9fa3fc` | **20.321851416076** | 1423.3269302516078 |

The GBM has lower RMSE (20.32 vs 21.70) but a *higher* (worse) PHM score — PHM penalizes late
predictions asymmetrically, and the GBM is later on average. Honest tradeoff recorded; promotion is
decided on the declared gate metric (RMSE).

### Promotion gates (declared before training) + Model Registry

Gates: anomaly **F1 ≥ 0.30**; RUL **RMSE ≤ 25**. The gate notebook reads the metrics back from the
MLflow tracking store (not hand-passed numbers) and applies the rule.

| Decision | Model | Metric | Gate | Result |
|---|---|---|---|---|
| Anomaly | baseline MAD chosen over PCA (higher F1) | F1 0.6387 | ≥ 0.30 | **promoted** |
| RUL | GBM chosen over linear (lower RMSE) | RMSE 20.32 | ≤ 25 | **promoted** |

Registered in the Unity Catalog Model Registry (`mlflow.set_registry_uri("databricks-uc")`):
- `novendor_1.telemetry.tel_anomaly_detector` — version 1, alias `champion` (the MAD baseline)
- `novendor_1.telemetry.tel_rul_regressor` — version 1, alias `champion` (the GBM)

Registry write required two real fixes recorded honestly: the first attempt registered
`runs:/<id>/model` with no artifact (training only logged metrics) → added `log_model`; the second
failed because Unity Catalog requires a model signature → added `infer_signature` + `input_example`.
Both promoted models cleared their gate, so no `model_not_promoted` was recorded this round; the gate
logic emits it (see `databricks/notebooks/promote_models.py`) and would have fired had either model
missed.

### Replay feed scored by the champion (the demo's autonomous flip is a real model output)

`gold_replay_feed` was rebuilt on a channel the promoted detector actually fires inside: **D-4 (MSL)**
(T-1 was contextual-only — its max residual 1.42 never crossed the 4×0.516 train threshold, so the
model correctly never fired there; D-4 has a clear residual-spike anomaly). `gold_replay_feed_scored`:

```
chan_id=D-4  rows=8473  label_anomaly_ticks=3248  model_fired_ticks=4488  first_model_fire_t=728
model_label_agreement_ticks=3248 (model covers every labeled anomaly tick)
champion=novendor_1.telemetry.tel_anomaly_detector@champion
```

The `model_pred` column the demo flips on is the champion model's output (loaded from the registry),
not a hand-authored flag. The feed stays deterministic (same input + same model → same output).

### Exact commands run

```
cd telemetry-platform/databricks
python auth_gate.py            # read-only gate — PASS
python 08_train_anomaly.py     # baseline MAD + PCA -> MLflow (point-adjusted F1)
python 09_train_rul.py         # linear + GBM -> MLflow (RMSE + PHM)
python 10_promote_models.py    # gates read MLflow metrics; register champions (UC registry)
python 11_score_replay_feed.py # score gold_replay_feed with the champion -> gold_replay_feed_scored
```
Notebooks: `databricks/notebooks/{train_anomaly,train_rul,promote_models,score_replay_feed}.py`.
The PAT value was never printed; the warehouse/jobs are serverless and auto-stop.

## Phase 3 — Serving proof (pending)

To be appended after Phase 3:

- migration filename + applied confirmation + RLS verification (cross-tenant read blocked)
- `curl GET /health` response
- `curl POST /score` response (anomaly score, per-channel attribution, go/no-go, model version/run_id, persistence receipt)
- Supabase `tel_predictions` row count before/after a `/score` call
- `curl GET /monitoring` response (PSI, rolling anomaly rate, counts, drift)
- API test output

## Phase 4 — Dashboard proof (pending)

To be appended after Phase 4:

- provisioned `env_id` (and confirmation `app.environments` / `v1.environments` match)
- `GET /v2/environments/{env_id}/verify` contract-gate result
- screenshot paths per panel (Test Run Explorer, Go/No-Go, Model Performance, Monitoring)
- the deterministic replay sequence (green→red flip + attribution), with evidence values come from the API
- `page.test.tsx` output

## Phase 5 — Deploy proof (pending)

To be appended after Phase 5:

- Railway API URL + `curl /health` and `curl /score` against it
- Vercel production URL + confirmation the live env loads
- smoke-test transcript
- final results table (real metrics only)
