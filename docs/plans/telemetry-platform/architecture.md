# Telemetry Platform — Architecture

**Last updated:** 2026-06-01
**Status:** COMPLETE (Phases 1–5) — Bronze/Silver/Gold (13 Delta tables); 4 models + 2 registered
champions behind gates; Supabase `tel_*` + FastAPI serving; dashboard as a Winston lab env
(env `dc82d39d…`); deployed live — API on Railway (`authentic-sparkle-production-7f37`), frontend on
Vercel (novendor.ai). Reviewer access: authenticated lab tenant. Open: authenticated prod screenshot
(see release-readiness.md).

## Pipeline

```
NASA datasets (public)
  → download scripts        telemetry-platform/databricks/data/
  → Databricks Bronze       novendor_1.telemetry.bronze_*      raw, as-landed Delta
  → Databricks Silver       novendor_1.telemetry.silver_*      typed, time-ordered, no look-ahead
  → Databricks Gold         novendor_1.telemetry.gold_*        features + labeled windows + RUL targets
                            novendor_1.telemetry.gold_replay_feed   precomputed deterministic demo feed
  → MLflow training         experiment 3740651530987773        baseline + LSTM-AE + RUL
  → Model Registry + gate                                      refuse to promote sub-threshold models
  → FastAPI serving         backend/app/routes/telemetry.py    /health /score /runs /run/{id} /monitoring
  → Supabase tel_*          prediction log, tenant-scoped       one row per prediction + receipt
  → Winston lab dashboard   repo-b .../lab/env/[envId]/telemetry
  → Monitoring              /monitoring                         PSI, rolling anomaly rate, drift
  → PROOF.md                                                    row counts, run IDs, URLs
```

## Frontend map (Phase 4)

| Route | File | Purpose |
|---|---|---|
| `/lab/env/[envId]/telemetry` | `repo-b/src/app/lab/env/[envId]/telemetry/page.tsx` | Console overview |
| `.../telemetry/runs` | `.../telemetry/runs/` | Test Run Explorer |
| `.../telemetry/replay` | `.../telemetry/replay/` | Deterministic replay + Go/No-Go |
| `.../telemetry/model-performance` | `.../telemetry/model-performance/` | Metrics live from API |
| `.../telemetry/monitoring` | `.../telemetry/monitoring/` | PSI / anomaly rate / drift |
| `.../telemetry/copilot` (optional) | `.../telemetry/copilot/` | Fail-closed test-report assistant |

Components in `repo-b/src/components/telemetry/`. Data via `apiFetch` (`repo-b/src/lib/api.ts`),
same-origin `/v1/*` proxy. Industry registration + route resolver in
`repo-b/src/components/lab/environments/constants.ts`. Provisioned via `POST /v2/environments`
(template `telemetry`, seed pack `telemetry_starter`).

## Backend map (Phase 3)

- Routes: `backend/app/routes/telemetry.py` — `GET /health`, `POST /score`, `GET /runs`,
  `GET /run/{id}`, `GET /monitoring`. Register the router in the app's route registrar.
- Services: `backend/app/services/telemetry_scoring.py`, `telemetry_runs.py`, `telemetry_monitoring.py`.
- Schemas: `backend/app/schemas/telemetry.py`.
- `POST /score` returns: anomaly score, per-channel attribution, go/no-go flag, model version + run_id,
  Supabase persistence receipt. It writes exactly one `tel_predictions` row per call.
- The serving layer reads **promoted-model metadata only** (from `tel_model_runs`) and scores with the
  exported artifact, so it does not need pyspark or the full mlflow stack at serving time.

## Data map

Two systems, distinct roles:

- **Databricks `novendor_1.telemetry.*`** — lakehouse + training. Bronze/Silver/Gold Delta tables,
  features, labeled windows, RUL targets, the deterministic replay feed. Owns the heavy data and the
  model artifacts via MLflow. Reuses `skills/historyrhymes/scripts/databricks_client.py`; uses the
  `telemetry` schema via fully-qualified SQL so the shared `databricks.json` is never edited.
- **Supabase `tel_*`** — operational, tenant-scoped serving state. One row per prediction, anomaly
  events, model-run metadata mirrored from the registry, drift metrics. This is what the dashboard and
  `/monitoring` read.

### `tel_*` tables (Phase 3 migration, `repo-b/db/schema/NNN_telemetry_*.sql`)

Each carries `env_id TEXT NOT NULL` + `business_id UUID NOT NULL`, enables RLS, and gets a
`tenant_isolation` policy `USING (env_id = current_setting('app.env_id', true))` with a matching
`WITH CHECK`, plus a `COMMENT ON TABLE`. The exact RLS form must match the prevailing repo convention
at migration time (document any adjustment).

| Table | Holds |
|---|---|
| `tel_test_runs` | one row per ingested test run (dataset, unit/channel, row count, ingest time, status) |
| `tel_telemetry_channels` | channel definitions per run (name, unit, redline thresholds) |
| `tel_predictions` | one row per `/score` call (score, go/no-go, model version/run_id, receipt) |
| `tel_anomaly_events` | detected anomaly windows (start/end, confidence, contributing channels, point vs contextual) |
| `tel_model_runs` | promoted-model metadata mirrored from the registry (name, version, run_id, gate decision, metrics) |
| `tel_drift_metrics` | rolling PSI / anomaly rate / prediction counts for monitoring |

## AI / runtime map

Optional test-report copilot only. Fail-closed per `01-shared-standards/ai-runtime/fail-closed-rules.md`:
never invent, return null + declared null_reason, label output "assistant-generated draft",
confirmation gate + receipt for any write. Telemetry null_reasons: existing `data_not_ingested`,
`tool_not_available`, `out_of_scope_environment`, `no_relevant_documents`, plus new
`model_not_promoted` and `channel_not_scored`. See `ai-behavior.md`.

## Test map

- Backend: `backend/tests/test_telemetry_*.py` (Phase 3).
- Frontend: `repo-b/src/app/lab/env/[envId]/telemetry/page.test.tsx` (Phase 4).
- Golden paths + negative tests: `eval-plan.md`.

## Databricks reference (verified Phase 0)

- Workspace `dbc-2504bec5-b5ab.cloud.databricks.com`, catalog `novendor_1`, SQL Warehouse
  `0e56420fb707d861` (auto-stops after 15 min — start/stop explicitly per job), MLflow experiment
  `3740651530987773`.
- Reuse `skills/historyrhymes/scripts/databricks_client.py`; config in
  `skills/historyrhymes/config/databricks.json`.
- `DATABRICKS_PAT` not yet injected as of Phase 0. Hard gate on Phase 1.

## Domain glossary

The dashboard copy and API field names should pull from this so the platform speaks the domain
unprompted.

| Term | Meaning |
|---|---|
| go/no-go | the automated verdict for a test run — proceed or abort |
| redline threshold | a sensor limit; crossing it is off-nominal |
| off-nominal | behavior outside expected bounds |
| point anomaly | a single reading out of range |
| contextual anomaly | a reading abnormal only given recent context, not in isolation |
| sensor attribution | which channels drove a detection, ranked |
| false-abort cost | the cost of aborting a healthy test (scrubs an expensive run) |
| missed-anomaly risk | the cost of not catching a real fault (destroys hardware) |
| RUL | remaining useful life — cycles/time left before failure |
| PHM score | the prognostics scoring function that penalizes late RUL predictions more than early |
| test-run replay | replaying a recorded run's telemetry in accelerated time |

## Phase 1 outcome (2026-06-01)

- Auth gate passed; `claude_token.txt` holds a real Databricks PAT (value never read).
- Datasets: C-MAPSS (full FD001–FD004) and SMAP/MSL (labels + 164 `.npy` arrays) fully ingested.
  IMS bearing archive verified real (1.075 GB) but vibration extraction **deferred** (triple-nested
  zip→7z→rar; does not gate the replay demo) — Bronze holds provenance only.
- 13 Delta tables in `novendor_1.telemetry` (5 bronze, 5 silver, 3 gold). Counts in PROOF.md.
- **Streaming decision:** deterministic Delta-replay (documented simplification), not Spark
  Structured Streaming. `gold_replay_feed` = channel **T-1** (SMAP) test sequence, 8,612 ticks,
  1,536 labeled anomaly ticks, ordered by `t`. The anomaly flags are NASA labels, not hand-authored.
- **No-look-ahead:** enforced via `ROWS BETWEEN n PRECEDING AND CURRENT ROW` + `LAG`. A C-MAPSS
  split-leakage bug (rolling window partitioned by `subset,unit` mixed train+test units sharing a
  unit id) was caught and fixed by partitioning on `subset,split,unit`.
- Ingestion code: `telemetry-platform/databricks/` (`auth_gate.py`, `01_create_schema.py`,
  `02_bronze_cmapss.py`, `03_bronze_smap_msl.py`, `04_bronze_ims.py`, `05_silver.py`, `06_gold.py`,
  `07_collect_proof.py`; helpers `_bootstrap.py`, `_volume.py`; downloaders under `data/`).
- Ingestion mechanism: parse locally → stage gzip CSV to Unity Catalog volume
  `novendor_1.telemetry.raw` via the Files API → `CREATE TABLE AS read_files(...)`.

## Phase 2 design — declared before training (so gates are honest, not retrofit)

**Training mechanism: Databricks-native.** Models train inside serverless notebook jobs on the
Databricks ML runtime (sklearn 1.4.2 + numpy 1.26.4 available natively), reading the Gold tables that
already live in `novendor_1.telemetry`, logging to MLflow experiment `3740651530987773` natively. The
driver (`telemetry-platform/databricks/`) uploads each notebook via the Workspace API and runs it as
a serverless job (`_jobs.py`; the shared client's job-create lacked the serverless `environments`
block, fixed in the helper). No local ML libraries are used for training — local numpy/pandas is only
for proof parsing. Validated end-to-end by a probe job (MLflow run `f5c8525f79f044f5946a17fb29e70728`,
read `gold_replay_feed` = 8,612 rows).

**Models:**
- Baseline anomaly (SMAP/MSL): rolling-median/MAD dynamic threshold on the telemetry value — a real,
  hard-to-beat-dishonestly baseline. Point-adjusted precision/recall/F1 vs `is_anomaly` on the test
  split.
- Stronger anomaly (SMAP/MSL): PCA reconstruction-error over the rolling-feature vector (sklearn),
  thresholded the same way. LSTM autoencoder is explicitly optional and not required — a smaller real
  model with MLflow proof beats a fancy model that risks breaking the run.
- RUL (C-MAPSS FD001): gradient-boosted / random-forest regression on the Gold rolling features,
  evaluated on the held-out test units against `silver_cmapss_rul` truth. RMSE + NASA PHM asymmetric
  score (penalizes late predictions more than early).

**Promotion gates (declared now):**
- Anomaly model promoted only if **F1 ≥ 0.30** (point-adjusted) on the labeled SMAP/MSL test windows.
  Telemanom-era F1 on this set sits ~0.25–0.40, so 0.30 is a real bar.
- The stronger anomaly model becomes the promoted anomaly model only if its F1 **beats the baseline**;
  if the baseline wins, the baseline is promoted and that is recorded honestly.
- RUL model promoted only if **RMSE ≤ 25** cycles on FD001 test. Literature baseline is ~20–30.
- A model that misses its gate is recorded with `model_not_promoted` — never faked into a promoted state.

Run IDs, exact metrics, and gate decisions go to `telemetry-platform/PROOF.md` (Phase 2 section).

## Phase 2 outcome (2026-06-01)

- **Training mechanism:** Databricks-native serverless notebook jobs (driver in
  `telemetry-platform/databricks/08–11_*.py`, notebooks in `databricks/notebooks/*.py`); MLflow logged
  natively. No local ML libs used for training. Helper `_jobs.py` fixes the shared client's serverless
  job-create (missing `environments` block).
- **Models (experiment `3740651530987773`):**
  - Anomaly baseline (rolling-MAD): F1 **0.6387** (run `4a48cb6a…`) — **promoted champion**.
  - Anomaly PCA recon: F1 0.4196 (run `8e99b411…`) — not selected (lower F1; the simple baseline won).
  - RUL linear: RMSE 21.70 (run `b3c8ddc1…`).
  - RUL GBM: RMSE **20.32** (run `c970fdcc…`) — **promoted champion** (lower RMSE; higher PHM tradeoff noted).
- **Promotion gates** (declared before training): anomaly F1 ≥ 0.30, RUL RMSE ≤ 25. Gate notebook
  reads metrics from the MLflow store and registers champions in the UC Model Registry:
  `novendor_1.telemetry.tel_anomaly_detector@champion` (v1), `tel_rul_regressor@champion` (v1).
- **Replay:** `gold_replay_feed` moved to channel **D-4** (T-1 was contextual-only; the residual
  detector correctly never fired on it). `gold_replay_feed_scored` carries the champion's `model_pred`
  (fires at t=728, covers all 3,248 labeled ticks) — the demo flips on the real model output.
- **Serving note for Phase 3:** the champion anomaly model is the rule-based MAD detector; serving can
  re-implement its scoring (per-channel scale + k threshold) cheaply, or load the registered pyfunc.
  The RUL champion is an sklearn GBM. Keep the serving deps lean (don't ship pyspark).

## Phase 3 outcome (2026-06-01)

- **Migration:** `repo-b/db/schema/10006_telemetry_serving.sql` — 6 `tel_*` tables, each with
  `env_id`/`business_id` + RLS `tenant_isolation` policy (`current_setting('app.env_id', true)`) +
  `WITH CHECK` + `COMMENT`. Number resolved live (on-disk 10000-series max was 10005 → 10006).
- **Convention adjustment (documented):** serving filters by `business_id` + `resolve_tenant_id`
  (canonical `public.business`), NOT by setting the `app.env_id` GUC — matching `cro_*`/`crm_*`. The
  RLS policy is defense-in-depth. Cross-tenant read returns 0 rows under a non-owner role (verified).
- **Serving (lean, no databricks/mlflow/pyspark import):** `backend/app/routes/telemetry.py`
  (registered in `main.py`), `backend/app/services/telemetry_serving.py`,
  `backend/app/schemas/telemetry.py`. Endpoints: `GET /api/telemetry/health`, `POST /api/telemetry/score`,
  `GET /api/telemetry/runs`, `GET /api/telemetry/run/{id}`, `GET /api/telemetry/monitoring`.
- **Champion as a rule:** `/score` re-implements the MAD detector (`resid > 4 × effective_scale`,
  `effective_scale = global train scale 0.033867` since D-4's per-channel scale ≈ 0 — mirrors the
  registered model's fallback). Reads promoted-model metadata from `tel_model_runs`; writes one
  `tel_predictions` receipt per call (verified 0 → 2).
- **Fail-closed:** `model_not_promoted`, `missing_run`, `no_prediction_rows`, plus 404 for an unknown
  business. No fake success.
- **Demo serving fixture:** a dedicated `telemetry-demo` tenant
  (business `7e1eb000-0000-4000-a000-000000000001`) seeded by
  `telemetry-platform/databricks/seed_serving_demo.sql` with the 2 champions + the D-4 run/channel.
- **Live vs replay:** `/score` is the live contract; the Phase 4 demo replay reads precomputed
  `gold_replay_feed_scored` (no cold-start dependency).
- **Tests:** `backend/tests/test_telemetry_serving.py` (7 pass); `conftest.py` `_GET_CURSOR_TARGETS`
  extended with `app.services.telemetry_serving.get_cursor`.

## Phase 4 outcome (2026-06-01)

- **Reviewer access:** authenticated lab tenant. Template `telemetry`
  (`repo-b/db/schema/10007_environment_templates_telemetry.sql`) sets `default_auth_mode='private'`.
- **Provisioned env:** `dc82d39d-9be2-49b0-a01d-c7181b13a8b6` via `POST /v2/environments` (template
  `telemetry`, seed pack `telemetry_starter`). Landed in both `app.environments` and `v1.environments`
  with `industry='telemetry'`; `resolveEnvironmentOpenPath` routes to `/telemetry`.
- **Known gap (not telemetry-specific):** v2 lifecycle reports `failed` and `.../verify` 500s because
  `app.environment_contract` is absent in this DB. Affects all v2 envs here; the env row + routing +
  serving all work. Backlogged.
- **Frontend:** pages under `repo-b/src/app/lab/env/[envId]/telemetry/` (overview, replay, runs,
  model-performance, monitoring); components in `repo-b/src/components/telemetry/`; client API
  `repo-b/src/lib/telemetry/api.ts`; same-origin proxy `repo-b/src/app/api/telemetry/[...path]/route.ts`
  → backend `/api/telemetry/*`. Industry registered in `constants.ts`.
- **Replay decision:** the dashboard reads a committed JSON fixture
  (`backend/app/data/telemetry/replay_fixture.json`, exported from `gold_replay_feed_scored` by
  `databricks/12_export_replay_fixture.py`) served at `GET /api/telemetry/replay`. Precomputed real
  champion outputs → no Databricks/cold-inference dependency at replay time. Distinct from live `/score`.
- **Money shot:** GO→NO-GO flip verified by Playwright (screenshots in
  `telemetry-platform/docs/screenshots/`); the verdict flips on the champion's `model_pred` at t=728.
- **Design:** dark console pinned on the telemetry layout (`--bm-*` token values) so the operator
  surface is dark regardless of the global theme toggle. ≤7 nav, redline verdict, explicit
  loading/error/unavailable states. Typecheck 0 errors. Backend stayed lean (replay from fixture).

## Needs verification (carried into Phase 5+)

- [ ] Wire `app.environment_contract` so the v2 verify gate passes (pre-existing, platform-wide) — backlog.
- [ ] Phase 5: Railway API deploy footprint (keep lean; no pyspark), Vercel deploy (repo-b manual), env vars.
