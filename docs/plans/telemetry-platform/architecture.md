# Telemetry Platform — Architecture

**Last updated:** 2026-06-01
**Status:** Phase 1 done — Databricks Bronze/Silver/Gold built on real NASA data (13 Delta tables in
`novendor_1.telemetry`). No MLflow runs, no Supabase migration, no dashboard yet (Phases 2–4).

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

## Needs verification (carried into Phase 2+)

- [ ] The exact next free migration number (`supabase_migrations.schema_migrations`, project `ozboonlsplroialdwuxj`) — Phase 3.
- [ ] The prevailing `tel_*` RLS policy form vs this sketch (match repo convention; document adjustment) — Phase 3.
- [ ] Whether a new `telemetry` template + seed pack is needed or `empty_lab` + a custom seed suffices — Phase 4.
