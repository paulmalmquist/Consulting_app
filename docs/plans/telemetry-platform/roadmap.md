# Telemetry Platform — Roadmap (Phases 1–5)

**Phase gate (applies to every phase):** stop at the end of the phase. Append real evidence to
`telemetry-platform/PROOF.md`, update the dispatch record
`docs/plans/03-implementation-plans/active/0003-telemetry-platform-build.md` and the relevant files in
this folder, and record reusable lessons in `docs/tips.md` (canonical — not the root `./tips.md`). Do
not begin the next phase in the same session unless explicitly told.

**Honesty rules (all phases):** real datasets, real row counts, real run IDs, exact non-round metrics.
A model that misses its gate is recorded as held back. Replay uses precomputed real prediction rows,
never hand-authored flags. Fail closed; never invent. Never read/print/log/commit secrets.

---

## Phase 1 — Databricks Bronze/Silver/Gold ingestion

**Gate first:** verify `DATABRICKS_PAT` (source from `claude_token.txt` if unset) with a read-only
`DatabricksClient.warehouse_status()`. STOP if it does not authenticate Databricks.

Tickets:
1. Dataset download scripts — `telemetry-platform/databricks/data/download_{cmapss,smap_msl,ims}.py`.
   Public sources only; print SHA + row counts; idempotent.
2. Schema + Bronze — create `novendor_1.telemetry` (fully-qualified SQL via `DatabricksClient`, no
   config edit); `bronze_cmapss`, `bronze_smap_msl`, `bronze_ims` Delta tables (raw).
3. Silver — `silver_*` typed, deduped, ordered by unit + cycle/time; document the ordering that
   prevents look-ahead.
4. Gold — `gold_cmapss_features` (RUL target), `gold_smap_msl_windows` (labeled anomaly windows),
   `gold_ims_features`; rolling-window features from past rows only. Build the deterministic
   `gold_replay_feed` used by the demo.
5. Streaming decision — structured-streaming sim or documented Delta-replay simplification; record
   which and why in `architecture.md`.

**Proof:** `count(*)` per bronze/silver/gold table + `DatabricksClient.list_tables('telemetry')` +
ingest timestamps + sample rows + the no-look-ahead windowing SQL.

**Acceptance:** every table exists with non-zero rows; Gold features verifiably exclude future rows;
replay feed is deterministic.

---

## Phase 2 — MLflow models + registry + promotion gates

Tickets:
1. Baseline anomaly detector (dynamic/nonparametric thresholding) on SMAP/MSL — log to experiment
   `3740651530987773` via `DatabricksClient.create_mlflow_run` / `log_metric`.
2. LSTM autoencoder on SMAP/MSL — reconstruction-error scoring; precision/recall/F1 vs labeled windows;
   walk-forward validation, no look-ahead.
3. RUL model on C-MAPSS FD001 — RMSE + PHM score; holdout by unit.
4. Registry + promotion gate — register models; gate refuses to promote if thresholds missed (echo the
   `ContractVerificationReport` / `eligible_for_promotion` fail-closed idiom in `backend/app/routes/lab_v2.py`).
   Record held-back models honestly.
5. Persist model metadata for serving — name, version, run_id, gate decision (mirrored into
   `tel_model_runs` in Phase 3).

**Proof:** real MLflow run IDs, exact non-round metrics, baseline-vs-autoencoder comparison,
promotion decisions (incl. held-back). Flip the README results table from "pending" to real.

**Acceptance:** each model has a real run ID; gate provably blocks a sub-threshold model; validation
demonstrably no-look-ahead.

---

## Phase 3 — Supabase `tel_*` schema + FastAPI serving

Tickets:
1. Migration `repo-b/db/schema/NNN_telemetry_*.sql` — number resolved live against
   `supabase_migrations.schema_migrations` (project `ozboonlsplroialdwuxj`). Six `tel_*` tables, each
   with `env_id` / `business_id` / RLS `tenant_isolation` + `WITH CHECK` + `COMMENT`. Verification
   queries at end of file. Match the prevailing RLS convention; document any adjustment.
2. Schema `backend/app/schemas/telemetry.py` — request/response shapes.
3. Services `backend/app/services/telemetry_{scoring,runs,monitoring}.py` — read promoted-model
   metadata; set `app.env_id` before tenant queries; write a `tel_predictions` row per `/score`.
4. Routes `backend/app/routes/telemetry.py` — `/health`, `POST /score`, `/runs`, `/run/{id}`,
   `/monitoring`. Register the router.
5. Fail-closed paths — no promoted model → `model_not_promoted`; channel without scores →
   `channel_not_scored`; never invent.
6. API tests `backend/tests/test_telemetry_*.py` — `/score` persists a row and returns all required
   fields; `/monitoring` returns PSI; fail-closed null_reasons returned with correct codes.

**Proof:** live `/score` JSON (score, attribution, run_id, receipt), the persisted row, `/monitoring`
PSI, test output.

**Acceptance:** migration applies with RLS verified (cross-tenant read blocked); every `/score` writes
exactly one prediction row; tests pass.

---

## Phase 4 — Dashboard as a Winston lab environment

**Access-model decision (explicit):** choose public read-only demo, invite-code-gated demo, or
authenticated lab tenant. Default template auth_mode is `private`; widening it is a recorded choice.
Do not expose admin/lab capabilities publicly by accident.

Tickets:
1. Template — add `telemetry` to `repo-b/db/schema/516_environment_templates_seed.sql` (or reuse
   `empty_lab` + custom seed): `default_home_route '/lab/env/{env_id}/telemetry'`, `industry_type
   'telemetry'`, dark theme tokens, auth_mode per the decision above.
2. Seed pack `backend/app/services/environment_seed_packs_v2/telemetry_starter.py` + register in
   `__init__.py` `SEED_PACKS` (mirror `supply_chain_starter`). Seed minimal `tel_test_runs` /
   `tel_telemetry_channels` shells so the env is not empty on first load.
3. Industry registration — add `telemetry` to `industries`, `INDUSTRY_DISPLAY_MAP`, an
   `isTelemetryEnvironment()`, and a `resolveEnvironmentOpenPath()` branch in
   `repo-b/src/components/lab/environments/constants.ts`.
4. Dashboard pages under `repo-b/src/app/lab/env/[envId]/telemetry/` (+ `runs/`, `replay/`,
   `model-performance/`, `monitoring/`, optional `copilot/`); components in
   `repo-b/src/components/telemetry/`; all data via `apiFetch`, no frontend constants.
5. Deterministic replay — wire to the precomputed replay feed; pre-warm so it never stalls; fire-tick
   flips Go/No-Go and renders attribution.
6. Provision the tenant — `POST /v2/environments {client_name, template_key:'telemetry', slug,
   env_kind:'demo', seed_pack:'telemetry_starter', dry_run:false}`; ensure `app.environments` and
   `v1.environments` env_id match; run `GET /v2/environments/{env_id}/verify`.

**Proof:** env_id, verify-gate result, screenshots per panel, the replay sequence, evidence values
come from the API.

**Acceptance:** env loads dark console, ≤7 nav, no console errors; replay deterministic; Model
Performance + Monitoring show live non-round values; `page.test.tsx` passes; golden paths pass.

---

## Phase 5 — Deploy

Tickets:
1. API → Railway — deploy `backend/` (telemetry routes); secrets via Railway store. Keep serving deps
   lean (no pyspark). If Railway cannot host needed deps, fall back to serving registered-model
   metadata and document the fallback honestly.
2. Frontend → Vercel — `repo-b` is the existing Vercel project and does **not** auto-deploy; run
   `vercel deploy --prod` manually. Point the env's API base at the Railway URL via platform env var.
3. Smoke tests — `curl` the deployed `/health`, `/score`, `/monitoring`; load the deployed env; run
   the replay.
4. Finalize `README.md` / `PROOF.md` / `DEMO.md` with real URLs, smoke outputs, final results table.

**Proof:** Railway URL + live `/score` against it, Vercel prod URL + live env, smoke transcript.

**Acceptance:** both URLs reachable; deployed `/score` matches local shape; deployed replay fires
deterministically.
