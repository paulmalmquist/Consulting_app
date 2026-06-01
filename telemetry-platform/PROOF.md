# PROOF

Every value in this file is copied from a real run. No rounding, no hand-edits. If a metric missed
its gate, it is recorded as missed. If a step could not run, the blocker is written here honestly.

## Status (2026-06-01, end of Phase 6)

All phases complete through Phase 6 (operated-history data enrichment + Option B Lab Workbench UI).
The demo now reads operated, not thin: a fleet of real test runs, hundreds of real predictions, real
anomaly events, and a real PSI drift series — all derived from the real pipeline — rendered in a
telemetry-only operator console with no executive chrome. Live on novendor.ai.

**Live URLs:**
- Backend API: `https://authentic-sparkle-production-7f37.up.railway.app` (git_sha `62dcab4a`)
- Frontend: `https://novendor.ai` (Vercel project `consulting-app`, root dir `repo-b`)
- Reviewer demo route: `https://novendor.ai/lab/env/dc82d39d-9be2-49b0-a01d-c7181b13a8b6/telemetry`
  (authenticated lab tenant — log in first)

## Phase 6 — operated-history enrichment + Lab Workbench UI

### Data enrichment (telemetry-demo tenant; real pipeline outputs only)

Backfill `telemetry-platform/databricks/13_backfill_serving.py` → committed
`seed_serving_backfill.sql`. Heavy aggregation in Databricks SQL; champion rule + PSI applied locally.

| Table | Before | After |
|---|---|---|
| `tel_test_runs` | 1 | 42 (30 SMAP/MSL channels + 12 C-MAPSS units) |
| `tel_predictions` | 3 | 364 (360 backfilled + 3 live; verdicts 259 GO / 31 REVIEW / 74 NO_GO) |
| `tel_anomaly_events` | 0 | 102 (30 real NASA labels + 72 model-detected) |
| `tel_drift_metrics` | 0 | 104 (PSI + rolling-rate; 8 monitored channels) |
| `tel_model_runs` | 4 | 4 (unchanged — the real models) |

Every row traces to a real source: predictions are the frozen champion (MAD, threshold 0.135467)
scored over real `gold_smap_msl_windows` per-channel windows; anomaly events are the real
`anomaly_sequences` labels (point/contextual); PSI is computed from real train-vs-test 10-bin
histograms. The 71% GO / 9% REVIEW / 20% NO_GO mix emerged from a representative fleet selection
(mostly-nominal channels by real anomaly fraction + a degraded minority), not from tuning.

Integrity:
- **Idempotent + live-preserving:** rows carry `is_backfilled=true` + `backfill_batch_id='phase6-backfill-v1'`
  (migration `10008`). Re-applying held counts steady (363→363, no doubling). The 3 live `/score`
  receipts (`is_backfilled=false`) are preserved; `tel_model_runs` untouched.
- **Timestamps** spread over ~45 days and flagged as backfill; values/verdicts/PSI are real.
- **Fail-closed PSI:** computed from real histograms (would leave drift empty + report otherwise).
- Traceability: the backfill prints 5 sample rows per table with source-trace fields.

### Backend (lean — no new deps)

- `score_window`: GO/REVIEW/NO_GO band (REVIEW = score 1–2× threshold) so live scoring matches the
  backfill; live receipts stamped `is_backfilled=false`.
- New `GET /api/telemetry/summary`: single KPI + serving-inventory contract for the Overview. Live:
  `{runs 42, predictions 364, anomaly_events 102, drift_monitors 8, verdicts {GO 259, REVIEW 31, NO_GO 74}}`.

### UI — Option B Lab Workbench

- Executive chrome removed via the proven seam: `telemetry` added to `LabEnvironmentShell.isDomainRoute`
  (full-bleed) + breadcrumb skip in `LabEnvTopBar`. Scoped to telemetry; other envs unaffected.
- Ported the Option B look (the `C` palette + `Tag`/`Panel`/`MetricCard`/`ModelCard`/`EmptyState`):
  single TEL ANOMALY / WORKBENCH rail (5 sections), 4-up metric strip, champion-vs-challenger model
  registry, verdict-distribution bar, ingested test-run fleet, serving-data inventory, all bound to
  `/summary` (single KPI source). Backfill-vs-live disclosure label on Overview + Monitoring.
- Replay money-shot preserved: GO→NO-GO flip at t=728 from the real champion fixture.
- Frontend typecheck 0 errors. Screenshots: `telemetry-platform/docs/screenshots/p6_*.png`
  (`p6_overview`, `p6_replay_initial`, `p6_replay_flip`, `p6_runs`, `p6_model_performance`, `p6_monitoring`).

### Live verification (novendor.ai)

```
GET https://novendor.ai/api/telemetry/summary  -> runs 42, predictions 364, events 102, drift_monitors 8,
                                                   verdicts {GO 259, REVIEW 31, NO_GO 74}, disclosure note present
GET https://novendor.ai/api/telemetry/runs     -> 42 runs
GET https://novendor.ai/api/telemetry/replay    -> first_model_fire_t 728
cold session  /lab/env/dc82d39d-.../telemetry  -> 307 redirect to /login (route live + auth-gated)
backend /version = 62dcab4a ; Vercel prod consulting-rhoklh0rf = Ready
```

Known gap (unchanged from Phase 5): the authenticated production screenshot of the live UI was not
captured — the `info@novendor.ai` login password is not reachable from this session (not in the
pulled Vercel/prod env). The identical deployed UI is proven by the local-stack `p6_*` screenshots,
and the production API + auth gate are verified live above.

---

## (Phase 5 record below)

**Live URLs (as of Phase 5):**
- Backend API: `https://authentic-sparkle-production-7f37.up.railway.app` (git_sha `f178c5c1`)
- Frontend: `https://novendor.ai` (Vercel project `consulting-app`, root dir `repo-b`)
- Reviewer demo route: `https://novendor.ai/lab/env/dc82d39d-9be2-49b0-a01d-c7181b13a8b6/telemetry`
  (authenticated lab tenant — log in first)

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

## Phase 3 — Serving proof

### Migration

`repo-b/db/schema/10006_telemetry_serving.sql` (number resolved live: on-disk max was 10005;
`supabase_migrations.schema_migrations` is a separate legacy sequence at 1007 — the
`repo-b/db/schema/` files use the 10000-series, so the next file number is 10006). Applied via the
Supabase CLI against project `ozboonlsplroialdwuxj`. The migration's verification `DO` block requires
6 `tel_` tables all with RLS or it raises — it passed. Independent check:

```
tel_anomaly_events     rowsecurity=true   policy tel_anomaly_events_tenant
tel_drift_metrics      rowsecurity=true   policy tel_drift_metrics_tenant
tel_model_runs         rowsecurity=true   policy tel_model_runs_tenant
tel_predictions        rowsecurity=true   policy tel_predictions_tenant
tel_telemetry_channels rowsecurity=true   policy tel_telemetry_channels_tenant
tel_test_runs          rowsecurity=true   policy tel_test_runs_tenant
```

Convention note (documented adjustment): the repo's serving code does **not** rely on the
`current_setting('app.env_id')` GUC at query time — it filters by `business_id` and validates the
business via `public.business` (`resolve_tenant_id`), exactly like `cro_*`/`crm_*`. The `tel_*` tables
carry both: `env_id`/`business_id` columns **and** the `current_setting('app.env_id', true)` RLS policy
(matching `525_execution_board.sql`), so the policy is defense-in-depth on top of explicit column
filtering. This matches the existing repo convention rather than the plan's GUC-first sketch.

### RLS tenant isolation — verified

```sql
SET ROLE authenticated; SET app.env_id = 'some-other-env';
SELECT count(*) FROM tel_predictions;   -- visible_cross_tenant = 0
```
A non-owner role scoped to a different env sees 0 rows. (The CLI's default owner role bypasses RLS,
so the check was run as `authenticated`.)

### Serving layer

- Routes: `backend/app/routes/telemetry.py` (registered in `backend/app/main.py`).
- Services: `backend/app/services/telemetry_serving.py` (no databricks/mlflow/pyspark import).
- Schema: `backend/app/schemas/telemetry.py`.
- The anomaly champion is re-implemented as the rule it is: `resid = abs(value - rolling_mean)`,
  `fired = resid > k * effective_scale` with `k=4` and `effective_scale = global train scale
  (0.033867)` because D-4's per-channel train scale is ~0 — mirroring the registered model's fallback.
- `tel_model_runs` seeded from the Phase 2 champions (run IDs + exact metrics + gate decisions).

### Live endpoints (local backend on :8077, real Supabase)

```
GET /api/telemetry/health
  {"status":"ok","promoted_models":2,"module":"telemetry"}

POST /api/telemetry/score   (calm window -> GO)
  {"verdict":"GO","anomaly_score":0.0,"threshold":0.13546720472974538,
   "model_name":"tel_anomaly_detector","model_version":"1","model_alias":"champion",
   "mlflow_run_id":"4a48cb6af8714609b9581d66e904544c",
   "attribution":[{"channel_name":"value","contribution":0.0}],
   "null_reason":null,"receipt_id":"18a3721d-8bf3-4e69-b771-4adddc9b26a4"}

POST /api/telemetry/score   (deviation -> NO_GO)
  {"verdict":"NO_GO","anomaly_score":2.46062,"threshold":0.13546720472974538,
   "model_name":"tel_anomaly_detector","model_version":"1","mlflow_run_id":"4a48cb6af871...",
   "attribution":[{"channel_name":"value","contribution":0.333333}],
   "receipt_id":"f8e8f23e-1da9-4f27-8785-175bd59d9e6b"}

GET /api/telemetry/runs
  [{"id":"7e1e7a00-...","run_key":"smap_msl:D-4:test","dataset":"smap_msl",
    "unit_or_channel":"D-4","spacecraft":"MSL","row_count":8473,"status":"ingested",...}]

GET /api/telemetry/run/{id}
  {"run":{...D-4...},"channels":[{"channel_name":"value","unit":"normalized",...}],
   "recent_predictions":[{"verdict":"NO_GO","anomaly_score":2.46062,...},
                         {"verdict":"GO","anomaly_score":0.0,...}],"anomaly_events":[],"null_reason":null}

GET /api/telemetry/monitoring
  {"rolling_anomaly_rate":0.5,"prediction_count":2,"latest_model_name":"tel_anomaly_detector",
   "latest_model_version":"1","latest_model_alias":"champion","last_scored_at":"2026-06-01T...",
   "psi":null,"window_label":"recent","null_reason":null}
```

### Persistence receipts — Supabase row count 0 → 2

`tel_predictions` (env `telemetry-demo`): **0 before** the two `/score` calls, **2 after**. Persisted
rows tie back to the registered champion:

```
id=18a3721d...  verdict=GO     score=0.0000  model=tel_anomaly_detector v1  run=4a48cb6af871  window t[10..12]
id=f8e8f23e...  verdict=NO_GO  score=2.4606  model=tel_anomaly_detector v1  run=4a48cb6af871  window t[726..728]
```

### Fail-closed paths — verified live

```
POST /score (env with no promoted model)
  -> {"verdict":"NOT_AVAILABLE","null_reason":"model_not_promoted","receipt_id":null}
POST /score (business_id not in public.business)
  -> HTTP 404 NOT_FOUND   (resolve_tenant_id fails closed)
```
The serving layer also returns `missing_run` (run_key not found) and `no_prediction_rows`
(`/monitoring` with no scores) — covered by tests. No fake success is returned when model metadata,
the run, or persistence is unavailable.

### What is live-scored vs replayed (explicit, per the Phase 3 brief)

- **`/score`** is the live API contract: it scores a submitted window with the champion rule and
  persists a receipt every call. This is the operational loop.
- **The demo replay** (Phase 4) reads precomputed real champion outputs from
  `novendor_1.telemetry.gold_replay_feed_scored` (Phase 2) for deterministic, no-stall playback. The
  reviewer demo will NOT depend on cold model loading or Databricks latency.

### Tests

`backend/tests/test_telemetry_serving.py` — **7 passed** (TestClient + `fake_cursor`): GO + receipt,
NO_GO on spike, `model_not_promoted`, `missing_run`, `/runs`, `/monitoring` with data,
`/monitoring` no-prediction null_reason. (`conftest.py` `_GET_CURSOR_TARGETS` extended with
`app.services.telemetry_serving.get_cursor`.)

### Exact commands

```
# migration + verification + seed
cat repo-b/db/schema/10006_telemetry_serving.sql | supabase db query --linked
cat telemetry-platform/databricks/seed_serving_demo.sql | supabase db query --linked
# tests
cd backend && python -m pytest tests/test_telemetry_serving.py -q     # 7 passed
# live serving (local)
cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 8077
curl .../api/telemetry/{health,score,runs,run/{id},monitoring}
```

## Phase 4 — Dashboard proof

### Reviewer access model — decided

Authenticated lab tenant. The telemetry template sets `default_auth_mode = 'private'`; the reviewer
logs in and opens `/lab/env/{env_id}/telemetry`. No new public surface, no risk of exposing other
tenants/admin. (Recorded in `10007_environment_templates_telemetry.sql` and architecture.md.)

### Environment provisioned via the v2 pipeline

- Template `telemetry` v1 added to the registry (`repo-b/db/schema/10007_environment_templates_telemetry.sql`),
  `industry_type='telemetry'`, `default_home_route='/lab/env/{env_id}/telemetry'`, seed pack
  `telemetry_starter` (`backend/app/services/environment_seed_packs_v2/telemetry_starter.py`, registered).
- `POST /v2/environments` dry-run validated, then real create →
  **env_id `dc82d39d-9be2-49b0-a01d-c7181b13a8b6`**, dashboard URL
  `/lab/env/dc82d39d-9be2-49b0-a01d-c7181b13a8b6/telemetry`.
- Landed in **both** registries with matching env_id and `industry='telemetry'`:
  `app.environments` (industry_type telemetry) and `v1.environments` (is_active true) — so
  `resolveEnvironmentOpenPath` routes correctly.
- **Honest blocker:** lifecycle came back `failed` and `GET /v2/environments/{id}/verify` 500s
  because `app.environment_contract` does not exist in this database — a **pre-existing missing table
  that affects all v2 environments here, not telemetry-specific** (the same contract subsystem the
  Phase 0 plan flagged). The env row exists, routes correctly, and the dashboard reads its data from
  the `telemetry-demo` serving tenant via `/api/telemetry/*`, so the demo works regardless. Wiring the
  contract table is out of Phase 4 scope and tracked in the backlog.

### Industry registration

`repo-b/src/components/lab/environments/constants.ts`: added `telemetry` to `industries`,
`INDUSTRY_DISPLAY_MAP`, an `isTelemetryEnvironment()` helper, and a `resolveEnvironmentOpenPath()`
branch → `/lab/env/{envId}/telemetry`.

### Routes (final paths)

```
/lab/env/[envId]/telemetry                    Overview
/lab/env/[envId]/telemetry/replay             Replay (the centerpiece)
/lab/env/[envId]/telemetry/runs               Test Run Explorer
/lab/env/[envId]/telemetry/model-performance  Model Performance
/lab/env/[envId]/telemetry/monitoring         Monitoring
```
Components in `repo-b/src/components/telemetry/`; client API in `repo-b/src/lib/telemetry/api.ts`;
same-origin proxy `repo-b/src/app/api/telemetry/[...path]/route.ts` → backend `/api/telemetry/*`.

### Panel → endpoint binding (all live; no hardcoded metrics)

| Panel | Endpoint |
|---|---|
| Overview KPIs + spine | `GET /api/telemetry/model-performance`, `GET /api/telemetry/monitoring` |
| Replay trace + Go/No-Go + attribution | `GET /api/telemetry/replay` (precomputed champion outputs) |
| Test Run Explorer | `GET /api/telemetry/runs` |
| Model Performance tables | `GET /api/telemetry/model-performance` |
| Monitoring | `GET /api/telemetry/monitoring` |

### THE MONEY SHOT — deterministic replay flip (verified)

Playwright drove the replay page (env `dc82d39d…`) against the live stack
(frontend :3001 → proxy → backend :8077 → Supabase + the committed replay fixture):

```
initial verdict:                "GO"
click "Replay test feed", run past t=728:
post-replay verdict:            "NO-GO"
```
Screenshots in `telemetry-platform/docs/screenshots/`:
- `replay_01_initial_go.png` — verdict GO (green), trace empty, "No contributing channels yet".
- `replay_02_nogo_flip.png` — verdict **NO-GO** (red), anomaly region shaded, redline marker,
  Sensor Attribution "D-4 fired @ t=728 · Detected by tel_anomaly_detector@champion (MLflow run
  4a48cb6af8)". The flag the verdict flips on is the model's `model_pred`, not hand-authored.
- `overview.png` — dark console, KPIs (2 champions, F1 0.6387, RMSE 20.32, 2 predictions / 50% no-go),
  operated-loop spine, real tool names, public-data footer.
- `model_performance.png` — baseline vs stronger, live from the API:
  tel_anomaly_pca F1 0.4196 (evaluated) vs tel_anomaly_detector F1 0.6387 (**promoted**);
  tel_rul_linear RMSE 21.70 (evaluated) vs tel_rul_regressor RMSE 20.32 (**promoted**); real run IDs.
- `monitoring.png` — predictions 2, rolling no-go 50%, **PSI shows "—" (not computed yet — honest,
  not a fake zero)**, serving champion + last-scored timestamp.
- `runs.png` — the D-4 test run (8,473 rows) from `tel_test_runs`.

### Replay fixture provenance

`telemetry-platform/databricks/replay_fixture.json` (also `backend/app/data/telemetry/`) — exported by
`12_export_replay_fixture.py` from `novendor_1.telemetry.gold_replay_feed_scored` (Phase 2). 750 ticks
(downsampled from 8,473; onset around t=728 kept dense), first model fire t=728, champion
`tel_anomaly_detector@champion` MLflow run `4a48cb6af871…`. Precomputed real outputs → the demo never
depends on Databricks/cold inference. Distinct from the live `/score` contract (Phase 3).

### Design

Dark engineering console (the telemetry layout pins the dark `--bm-*` token values so the surface is
dark regardless of the global theme toggle — internal operator surface per the design charter).
Primary nav = 5 items (≤7); active = fill + weight, not underline. Go/No-Go reads as a redline
indicator. Explicit loading / error / `Unavailable(null_reason)` states (never blank, never a silent
zero). Frontend typecheck (`tsc --noEmit -p tsconfig.typecheck.json`): **0 errors**.

### Exact commands

```
# fixture export (Databricks)
cd telemetry-platform/databricks && python 12_export_replay_fixture.py
# template + seed pack + provision
cat repo-b/db/schema/10007_environment_templates_telemetry.sql | supabase db query --linked
curl -X POST :8077/v2/environments -d '{"template_key":"telemetry","seed_pack":"telemetry_starter",...}'
# typecheck + visual proof
cd repo-b && npx tsc --noEmit -p tsconfig.typecheck.json    # 0 errors
#   Next dev (BOS_API_ORIGIN=http://127.0.0.1:8077) + Playwright drove the 6 screenshots
```

## Phase 5 — Deploy proof

### Backend → Railway

Deployed the shared FastAPI backend (telemetry routes registered) to the existing Railway service
`authentic-sparkle` (project production). `railway up` ships the local tree; the working SHA is
captured into `backend/app/_git_sha.txt` (gitignored) and exposed at `/version`.

```
# before: /version = 719653b5...  (telemetry routes 404)
cd backend && railway up --service authentic-sparkle --detach
# after ~120s: /version = f178c5c11883adfbb44c50627408f894bf82f120  (the Phase 4 commit)
curl https://authentic-sparkle-production-7f37.up.railway.app/api/telemetry/health
  -> {"status":"ok","promoted_models":2,"module":"telemetry"}
```

Deploy hygiene: the 3 uncommitted unrelated working-tree edits (CLAUDE.md, outlook-mcp, a report)
were stashed before deploy so only committed work shipped, then restored. No databricks/mlflow/
pyspark added to `backend/requirements.txt` — backend stayed lean; replay is served from the
committed fixture.

Blast-radius note (decided with the user): the backend is one shared app serving all of production.
This branch was 19 commits ahead of what was live, so the deploy shipped the whole branch, not just
telemetry — an accepted, deliberate choice.

### Live API smoke — against the Railway URL

```
GET  /api/telemetry/health           -> {"status":"ok","promoted_models":2,...}
GET  /api/telemetry/runs             -> smap_msl:D-4:test, 8473 rows
GET  /api/telemetry/run/{id}         -> run smap_msl:D-4:test, 1 channel, 2 recent predictions
GET  /api/telemetry/model-performance-> 4 models (tel_anomaly_detector promoted F1 0.6387; tel_anomaly_pca
                                        evaluated 0.4196; tel_rul_regressor promoted RMSE 20.32; tel_rul_linear 21.70)
GET  /api/telemetry/monitoring       -> preds 2, no-go rate 0.5, psi null, serving tel_anomaly_detector
GET  /api/telemetry/replay           -> channel D-4, 750 ticks, first_fire t=728, champion run 4a48cb6af8
POST /api/telemetry/score            -> verdict NO_GO, score 2.953, model tel_anomaly_detector v1,
                                        receipt bf89dfc6-81c0-49e6-a13b-906dace8d44c
```
The live `POST /score` persisted a real receipt to **production Supabase**: `tel_predictions` count
rose 2 → 3. The full loop runs on the deployed URL.

### Frontend → Vercel

The lab/app frontend deploys via the Vercel project **`consulting-app`** whose Root Directory is
`repo-b` (serves `novendor.ai`). The local `repo-b/.vercel` link was stale (pointed at an
inaccessible project); re-linked the repo root to `consulting-app` and deployed.

```
# .vercelignore added to exclude non-frontend dirs from the upload — the 1.075 GB NASA IMS
# archive under telemetry-platform/databricks/data/ exceeded Vercel's 100 MB file limit.
vercel deploy --prod --yes   (from repo root; root dir repo-b)
  -> READY, production: consulting-rj7i89zhh-paulmalmquists-projects.vercel.app -> novendor.ai
```

`BOS_API_ORIGIN` was already set on `consulting-app` production (the telemetry proxy reuses it), so no
env-var change was needed. Verified the production proxy reaches the deployed backend:

```
GET https://novendor.ai/api/telemetry/health            -> {"status":"ok","promoted_models":2,...}
GET https://novendor.ai/api/telemetry/replay            -> channel D-4, first_fire 728, champion 4a48cb6af8
GET https://novendor.ai/api/telemetry/model-performance -> 4 models with promotion states
```

### Cold-session test ("like a stranger")

A fresh Playwright browser (no cookies, no dev server) hitting
`https://novendor.ai/lab/env/dc82d39d-.../telemetry/replay` **redirects to
`/login?returnTo=...telemetry/replay`** — confirming the routes are live and correctly auth-gated per
the chosen access model (authenticated lab tenant). A reviewer logs in, then reaches the journey.

### Known gap (honest, distinguished from core readiness)

- **Authenticated production screenshot not captured.** Driving the live replay flip in a browser
  needs the `info@novendor.ai` login password, which is not available to this session (ENV_KEYS
  points to env vars rather than storing the literal; it is not in `backend/.env`). I did not reset
  the production auth password to obtain it (that would be an unwanted outward side effect).
  - **Core demo readiness IS proven:** the production API end-to-end (incl. a persisted `/score`
    receipt), the production proxy, and auth gating all verified live; the identical authenticated UI
    (GO→NO-GO flip, model performance, monitoring) is proven on the local stack in the Phase 4
    screenshots (`prod_*`/local screenshots in `docs/screenshots/`), running the same committed code
    now deployed. The remaining item is purely capturing that flip *screenshot on the production
    domain*, which requires the reviewer login.
  - **To close it:** with the `info@novendor.ai` password, log in at `https://novendor.ai/login`, open
    the reviewer demo route, click "Replay test feed", and screenshot the NO-GO flip.
- **v2 verify gate** still 500s (pre-existing missing `app.environment_contract`, platform-wide) —
  does not affect the deployed telemetry route. Backlogged.

### Commands

```
cd backend && railway up --service authentic-sparkle --detach   # backend
# repo root:
vercel link --yes --project consulting-app --scope paulmalmquists-projects
vercel deploy --prod --yes --scope paulmalmquists-projects      # frontend (.vercelignore excludes ML data)
# smoke: curl the 7 endpoints on the Railway URL and via https://novendor.ai/api/telemetry/*
```
