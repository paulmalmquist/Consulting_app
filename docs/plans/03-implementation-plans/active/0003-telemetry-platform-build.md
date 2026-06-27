# Dispatch Record 0003 — Telemetry Anomaly Platform Build

**Created:** 2026-06-01
**Status:** COMPLETE — Phases 0–6 DONE 2026-06-01. Live: Railway API (`62dcab4a`) + novendor.ai. Phase 6 added an operated-history backfill (42 runs / 364 predictions / 102 events / 104 drift, real pipeline outputs) + the Option B telemetry-only Lab Workbench UI. One documented gap: authenticated production screenshot (login cred not reachable); deployed UI proven by local screenshots + live API + cold-session auth-gating.
**Environment:** Telemetry Platform (NASA aerospace analog) — `docs/plans/telemetry-platform/`
**Deliverable type:** Multi-phase greenfield platform build (portfolio proof-of-work)

---

## Context

Portfolio proof-of-work for an AI Platform Architect / ML platform role: an end-to-end telemetry
anomaly-detection and health-monitoring platform that turns raw engine-test sensor streams into
automated go/no-go decisions, built on **public NASA aerospace analog datasets** (C-MAPSS turbofan
RUL, SMAP/MSL telemanom anomaly detection, IMS bearing run-to-failure). Not proprietary Relativity
data — this is stated in the README, the dashboard footer, and PROOF.md.

The bar is a reviewer test, not a feature list. A skeptical senior engineer with no context, given
~4 minutes, should independently conclude "this person could own our test-telemetry platform." They
verify three things without taking our word: (1) **real, not a slide deck** — data visibly moves, an
anomaly fires on its own, real MLflow run IDs / row counts / non-round metrics, live API values; (2)
**speaks the domain** — go/no-go, redline thresholds, off-nominal, sensor attribution, point vs
contextual anomaly, false-abort vs missed-anomaly cost; (3) **reads as a platform** — ingestion →
lakehouse → training → registry → promotion gate → serving → live app → monitoring → proof. The
operated loop (promotion gate + monitoring) is the differentiator, not the model. The load-bearing
demo moment is a deterministic "Replay test feed" that fires an anomaly and flips go/no-go on its own,
instantly, never stalling.

---

## Dispatch routing

- **Environment:** `docs/plans/telemetry-platform/` (README, architecture, roadmap, ai-behavior,
  eval-plan, next-session created; backlog, qa-checklist, design-adaptation, release-readiness stubbed).
- **Shared standards touched:**
  - `01-shared-standards/ai-runtime/fail-closed-rules.md` — added null_reasons `model_not_promoted`,
    `channel_not_scored` (Phase 0).
  - `01-shared-standards/design-system/shell-navigation-rules.md` — dark console, ≤7 nav, active =
    fill+weight (Phase 4 conformance).
  - `01-shared-standards/evals/golden-paths.md` — env golden paths defined in `eval-plan.md`.
- **Frontend (Phase 4):** `repo-b/src/app/lab/env/[envId]/telemetry/`,
  `repo-b/src/components/telemetry/`, `repo-b/src/components/lab/environments/constants.ts`,
  `repo-b/src/lib/api.ts`.
- **Backend (Phase 3):** `backend/app/routes/telemetry.py`, `backend/app/services/telemetry_*.py`,
  `backend/app/schemas/telemetry.py`, `backend/app/services/environment_seed_packs_v2/telemetry_starter.py`,
  `backend/tests/test_telemetry_*.py`.
- **DB/schema (Phase 3–4):** migration `repo-b/db/schema/NNN_telemetry_*.sql` (number resolved live
  against `supabase_migrations.schema_migrations`, project `ozboonlsplroialdwuxj`); template edit
  `repo-b/db/schema/516_environment_templates_seed.sql`.
- **Databricks (Phase 1–2):** reuse `skills/historyrhymes/scripts/databricks_client.py`; schema
  `novendor_1.telemetry`; code under `telemetry-platform/databricks/`.
- **AI/runtime:** optional fail-closed test-report copilot (`ai-behavior.md`).
- **Deployment (Phase 5):** Railway (API), Vercel (`repo-b`, manual `vercel deploy --prod`, no auto-deploy).
- **Risk level:** Phase 0 = Low (docs + one prefix line). Overall = Medium–High (external Databricks
  dependency, ML deploy, demo determinism).

### Discrepancy notes

- The originating prompt referenced `docs/plans/02-environments/` — that folder **does not exist**;
  the real convention is one folder per environment at `docs/plans/<env>/`. Using
  `docs/plans/telemetry-platform/`.
- The prompt's literal tree put `api/`, `frontend/`, `supabase/migrations/` inside `telemetry-platform/`.
  Per the locked hybrid decision those are pointer-READMEs only; the real code lives in `backend/`,
  `repo-b/`, and `repo-b/db/schema/`.
- Reusable lessons go to `docs/tips.md` (canonical, 255 KB). A duplicate `./tips.md` (27 KB) exists at
  repo root — do not write to it.

---

## Architecture decisions (locked with the user)

1. **Databricks = real workspace, user provides PAT.** Commit to the live workspace
   (`dbc-2504bec5-b5ab.cloud.databricks.com`, Unity Catalog `novendor_1`, SQL Warehouse
   `0e56420fb707d861`, MLflow experiment `3740651530987773`). Reuse
   `skills/historyrhymes/scripts/databricks_client.py`. Use a new Unity Catalog schema
   `novendor_1.telemetry` via fully-qualified SQL (do not edit the shared `databricks.json`). Training
   deps in `telemetry-platform/requirements.txt`, never `backend/requirements.txt`. `DATABRICKS_PAT`
   is a hard Phase 1 gate (sourced from `claude_token.txt`, verified read-only, STOP if it does not
   authenticate Databricks).
2. **Structure = hybrid.** `telemetry-platform/` holds Databricks/training code + README/PROOF/DEMO/docs.
   Serving API in `backend/`. Dashboard is a real Winston lab environment at
   `repo-b/src/app/lab/env/[envId]/telemetry/`, provisioned via the v2 pipeline — the demo is a real
   tenant. Migrations in `repo-b/db/schema/NNN_*.sql`.
3. **Schema = new `tel_` prefix, full RLS.** `tel_` registered in `ARCHITECTURE.md` (Phase 0). `tel_*`
   tables carry `env_id TEXT NOT NULL` + `business_id UUID NOT NULL` + `tenant_isolation` RLS policy +
   `WITH CHECK` + `COMMENT`. Match the prevailing repo RLS convention at migration time; document any
   adjustment.

---

## Phases (workstreams)

- **Phase 0 — Planning + skeleton + demo contract (DONE 2026-06-01).** This dispatch record, the
  `docs/plans/telemetry-platform/` folder, the `telemetry-platform/` skeleton (README/PROOF/DEMO/
  requirements + databricks/ + docs/ + the 3 pointer-READMEs + the frontend wireframe), the
  `ARCHITECTURE.md` `tel_` registration, and the two new null_reasons. No deps, no Databricks call, no
  migration, no dashboard code.
- **Phase 1 — Databricks Bronze/Silver/Gold ingestion.** PAT gate first. See `roadmap.md`.
- **Phase 2 — MLflow models + registry + promotion gates.** See `roadmap.md`.
- **Phase 3 — Supabase `tel_*` schema + FastAPI serving.** See `roadmap.md`.
- **Phase 4 — Dashboard as a Winston lab environment.** See `roadmap.md`.
- **Phase 5 — Deploy (Railway + Vercel) + smoke.** See `roadmap.md`.

Full per-phase tickets, proof, and acceptance live in `docs/plans/telemetry-platform/roadmap.md`.

---

## Acceptance criteria

### Phase 0 — verified 2026-06-01
- [x] `0003-telemetry-platform-build.md` exists with the 0002-mirrored sections.
- [x] `docs/plans/telemetry-platform/` has 6 created files + 4 stubs.
- [x] `telemetry-platform/` skeleton exists: README/PROOF/DEMO/requirements + `databricks/` + `docs/`
      + the 3 pointer-READMEs (api/, frontend/, supabase/).
- [x] `ARCHITECTURE.md` lists `tel_`; `fail-closed-rules.md` lists `model_not_promoted` and
      `channel_not_scored`.
- [x] `next-session.md` Phase 1 prompt is copy-paste runnable and starts with the PAT gate.
- [x] No deps installed, no Databricks call, no migration, no dashboard code.
- [x] PROOF.md carries the honest "PAT not yet injected" status line.

### Phases 1–5 — open
Per-phase acceptance in `roadmap.md`. Common: real datasets/row counts/run IDs/non-round metrics; a
missed gate recorded as missed; replay from precomputed real rows (no hand-authored flags); fail
closed; RLS verified; live API values on the dashboard (no frontend constants).

---

## Ticket order

0. ~~Planning + skeleton + demo contract + `tel_` registration~~ — **DONE 2026-06-01**
1. ~~Databricks Bronze/Silver/Gold ingestion (gated on `DATABRICKS_PAT`)~~ — **DONE 2026-06-01** (13 Delta tables, real NASA data; proof in `telemetry-platform/PROOF.md`)
2. ~~MLflow models + registry + promotion gates~~ — **DONE 2026-06-01** (4 models, 2 champions registered; baseline beat PCA on anomaly F1; proof in PROOF.md)
3. ~~Supabase `tel_*` migration + FastAPI serving + API tests~~ — **DONE 2026-06-01** (`10006_telemetry_serving.sql`, 6 RLS tables; `/api/telemetry/*` live; 0→2 receipts persisted; 7 tests pass; proof in PROOF.md)
4. ~~Dashboard lab environment + v2 provisioning + deterministic replay~~ — **DONE 2026-06-01** (env `dc82d39d…`; 5 dark-console pages live from the API; GO→NO-GO replay flip verified by screenshots; proof in PROOF.md)
5. ~~Deploy API (Railway) + frontend (Vercel) + smoke tests~~ — **DONE 2026-06-01** (backend live `/version`=f178c5c1; novendor.ai serves telemetry; 7 endpoints smoke-tested live incl. persisted `/score` receipt; cold session auth-gates correctly; proof in PROOF.md)
6. ~~Operated-history data enrichment (real pipeline backfill) + Option B Lab Workbench UI~~ — **DONE 2026-06-01** (tel_* enriched: 42 runs / 364 predictions / 102 events / 104 drift, all real; REVIEW band + `/summary`; executive chrome stripped; telemetry-only console; redeployed `62dcab4a`; proof + p6 screenshots in PROOF.md)

---

## Verification (Phase 0) — results

| Step | Check | Result |
|---|---|---|
| Skeleton | `telemetry-platform/` dirs + docs created | Done |
| Env folder | `docs/plans/telemetry-platform/` 6 files + 4 stubs | Done |
| Dispatch | this record created at `0003-*` | Done |
| Prefix | `tel_` added to `ARCHITECTURE.md` approved list | Done |
| null_reasons | `model_not_promoted` + `channel_not_scored` added to `fail-closed-rules.md` | Done |
| Change surface | `git status` shows only docs + `ARCHITECTURE.md` + new skeleton | (see Phase 0 verify) |
| Secret hygiene | `claude_token.txt` existence/size/git status checked; contents NOT read | Done |

## Verification (Phase 1) — results

| Step | Check | Result |
|---|---|---|
| Auth gate | read-only `warehouse_status()` via PAT from `claude_token.txt` | PASS (token is a real Databricks PAT; value never printed) |
| Schema | `CREATE SCHEMA novendor_1.telemetry` | SUCCEEDED |
| Downloads | C-MAPSS 12 files / SMAP-MSL labels+164 npy / IMS 1.075 GB | all landed (SHAs in `databricks/data/manifest_*.json`) |
| Bronze | `bronze_cmapss` 265,256 ; `bronze_cmapss_rul` 707 ; `bronze_smap_msl_telemetry` 705,876 ; labels 82 ; `bronze_ims` 5 | created |
| Silver | typed/ordered; P-2 duplicate-label fan-out fixed; `silver_smap_msl` 705,876 = 1/(chan,split,t) | created |
| Gold | `gold_cmapss_features` 265,256 ; `gold_smap_msl_windows` 705,876 ; `gold_replay_feed` 8,612 (1,536 anomaly ticks) | created |
| No-look-ahead | rolling frames are `ROWS BETWEEN n PRECEDING AND CURRENT ROW`; C-MAPSS split-leakage bug caught + fixed (partition `subset,split,unit`); train `rul_target` ∈ [0,542] | verified |
| IMS scope | 1.075 GB archive verified real; vibration extraction deferred (does not gate replay); provenance in Bronze | documented |
| Cost | warehouse started per step + stopped after; auto-stop 15 min | controlled |

13 Delta tables exist with real row counts. Full evidence + sample rows + exact commands in
`telemetry-platform/PROOF.md`.

## Verification (Phase 2) — results

| Step | Check | Result |
|---|---|---|
| Mechanism | Databricks-native serverless notebook jobs log to MLflow (sklearn 1.4.2) | validated (probe run `f5c8525f…`); shared client serverless job-create fixed in `_jobs.py` |
| Anomaly baseline | rolling-MAD, point-adjusted F1 on test split | F1 **0.6387** (P 0.546 / R 0.769), run `4a48cb6a…` |
| Anomaly stronger | PCA reconstruction error | F1 0.4196 (P 0.873 / R 0.276), run `8e99b411…` |
| Anomaly gate | F1 ≥ 0.30; promote higher-F1 model | baseline promoted (beat PCA) — honest "simple beat fancy" |
| RUL baseline | linear regression, 100 FD001 test units | RMSE 21.70 / PHM 1036.1, run `b3c8ddc1…` |
| RUL stronger | gradient boosting | RMSE **20.32** / PHM 1423.3, run `c970fdcc…` |
| RUL gate | RMSE ≤ 25; promote lower-RMSE model | GBM promoted (lower RMSE; higher PHM tradeoff recorded) |
| Registry | UC Model Registry, champion alias | `tel_anomaly_detector` v1, `tel_rul_regressor` v1 (champion) |
| Registry honesty | first attempts failed (no artifact → added log_model; no signature → added infer_signature) | fixed, recorded in PROOF |
| Replay scored | champion scores `gold_replay_feed_scored` | D-4: 8,473 ticks, model fires 4,488 (first t=728), covers all 3,248 label ticks |
| No-look-ahead | thresholds calibrated on train only, frozen for test | verified |
| Secret hygiene | PAT never printed; jobs serverless/auto-stop | held |

Experiment `/Users/paulmalmquist@gmail.com/HistoryRhymesML` (id `3740651530987773`). Full metrics,
run IDs, comparison tables, and commands in `telemetry-platform/PROOF.md`.

## Verification (Phase 3) — results

| Step | Check | Result |
|---|---|---|
| Migration | `repo-b/db/schema/10006_telemetry_serving.sql` applied (number resolved live) | 6 `tel_` tables, all RLS + tenant policy |
| RLS isolation | `SET ROLE authenticated; SET app.env_id='other'; SELECT count(*) FROM tel_predictions` | 0 rows (cross-tenant blocked) |
| Convention | serving filters by `business_id` + `resolve_tenant_id` (not the GUC); RLS is defense-in-depth | matches `cro_*`/`525_execution_board.sql`; documented |
| Lean backend | no databricks/mlflow/pyspark import; champion re-implemented as a rule | confirmed |
| /health | live | `{"status":"ok","promoted_models":2}` |
| /score GO | calm window | verdict GO, receipt `18a3721d…` |
| /score NO_GO | deviation | verdict NO_GO, score 2.46, receipt `f8e8f23e…` |
| Persistence | `tel_predictions` count before/after | 0 → 2 (one row per `/score`) |
| /runs, /run/{id}, /monitoring | live | real D-4 run, recent predictions, rolling rate 0.5 |
| Fail-closed | no model / missing run / no business / no predictions | `model_not_promoted`, `missing_run`, 404, `no_prediction_rows` |
| Tests | `backend/tests/test_telemetry_serving.py` | 7 passed |
| Live vs replay | `/score` is live; demo replay reads precomputed `gold_replay_feed_scored` | documented in PROOF |

Full request/response bodies, receipts, and commands in `telemetry-platform/PROOF.md`.

## Verification (Phase 4) — results

| Step | Check | Result |
|---|---|---|
| Access model | reviewer access decided | authenticated lab tenant (template auth_mode `private`) |
| Template | `10007_environment_templates_telemetry.sql` applied | `telemetry` v1 registered |
| Seed pack | `telemetry_starter.py` registered in SEED_PACKS | resolves in dry-run |
| Industry | `constants.ts` (`industries`, display map, helper, resolver) | typechecks; routes to `/telemetry` |
| Provision | `POST /v2/environments` | env_id `dc82d39d…`; both registries; industry telemetry |
| Provision gap | lifecycle `failed` / verify 500 | pre-existing missing `app.environment_contract` (affects all v2 envs; not telemetry) — backlogged |
| Money shot | Playwright replay flip | GO → **NO-GO** at t=728; attribution shows champion run; screenshots saved |
| Pages | overview/runs/model-perf/monitoring | live from `/api/telemetry/*`; no hardcoded metrics |
| Honest states | monitoring PSI with no drift | renders "—" not a fake zero |
| Design | dark console, ≤7 nav, redline verdict | conformed (theme pinned on the telemetry layout) |
| Typecheck | `tsc --noEmit` | 0 errors |
| Lean | no databricks/mlflow/pyspark added to backend | held; replay served from a committed fixture |

Screenshots: `telemetry-platform/docs/screenshots/`. Full evidence in `telemetry-platform/PROOF.md`.

## Verification (Phase 5) — results

| Step | Check | Result |
|---|---|---|
| Backend deploy | `railway up` → Railway service `authentic-sparkle` | `/version` flipped to `f178c5c1` |
| Deploy hygiene | unrelated WIP stashed, only committed work shipped, restored after | held |
| Backend lean | no databricks/mlflow/pyspark added | confirmed |
| Live API | 7 endpoints on the Railway URL | all return real data |
| Live `/score` | POST against prod | NO_GO, receipt `bf89dfc6…`; `tel_predictions` 2→3 in prod Supabase |
| Frontend deploy | `vercel deploy --prod` → `consulting-app` (root `repo-b`) → novendor.ai | READY; routes live |
| Upload fix | `.vercelignore` excludes the 1 GB NASA IMS archive (>100 MB limit) | resolved |
| Prod proxy | `novendor.ai/api/telemetry/{health,replay,model-performance}` | reaches the Railway backend |
| Cold session | fresh browser hits the demo route | redirects to `/login` (auth-gated, route live) |
| Gap | authenticated production screenshot | not captured — needs login cred; core readiness proven otherwise |
| Blast radius | shared backend, whole branch shipped | accepted by the user with the divergence in view |

Live: API `https://authentic-sparkle-production-7f37.up.railway.app`; demo
`https://novendor.ai/lab/env/dc82d39d-9be2-49b0-a01d-c7181b13a8b6/telemetry`. Full transcript in
`telemetry-platform/PROOF.md`.

---

## Risk & rollback

- **Databricks PAT / reachability** — hard external dependency; mitigated by the PAT gate, the proven
  `DatabricksClient`, explicit warehouse start/stop. The token file is named "claude" — Phase 1 must
  confirm it is a Databricks `dapi…` PAT and STOP otherwise.
- **Demo fragility** — replay uses precomputed real outputs; never cold inference on click.
- **`tel_` env as a real tenant** — two registries (`app.environments` + `v1.environments`) must share
  env_id; follow the `supply_chain` precedent; run the verify gate.
- **Heavy ML deps on Railway** — keep serving lean; document any fallback to registered-model metadata.
- **Migration number collision** — resolve live, never hardcode.
- **Rollback (Phase 0):** delete `telemetry-platform/`, `docs/plans/telemetry-platform/`, this dispatch
  record, and revert the two doc edits to `ARCHITECTURE.md` and `fail-closed-rules.md`. No schema, no
  deps, no runtime code to unwind.

---

## Phase 7 — Stargate "Rules vs baseline" lane + inspectable provenance

Full plan: `~/.claude/plans/the-clean-next-move-majestic-ladybug.md`. Goal: make the Stargate Live page
tell the whole story (stream → validate → enrich → score → route → inspect → prove lineage), honestly.
Decisions: full arc (durable sink included); one real Confluent round-trip required for sign-off; ML lane
labeled "baseline scorer (rolling-MAD residual) · not LSTM"; redline copy says "cold melt pool (<1400°C) +
high arm vibration (>0.08g)", never "high temp."

### T1 — process-context fields, proto v3, deterministic fixture (LANDED)

| Item | Result |
|---|---|
| Shared derived helpers | `stargate_signal_mapping.py` gains pure (numpy-free) `toolpath_speed_mm_s`, `acceleration_mm_s2`, `temp_slope_c_per_s` — one definition for producer + fixture + bridge |
| Proto evolution | `infra/confluent/proto/stargate_telemetry_v3.proto` adds tags 12–17 (toolpath_speed, acceleration, commanded_power, sensor_quality, capture_id, temp_slope); pb2 NOT regenerated (broker-only; deferred to the cloud sign-off pass) — v1 reader skips them, proven by hand-built wire bytes |
| Fixture | `capture_fixture.py`: four printer personalities — v4-01 nominal control (0 anomalies), v4-02 coupled drift (38), v4-03 abrupt cold-pool+vibration redline (135), v4-04 pre_failure + 5 DLQ beats flavored as v4-04. New fields + constant `capture_id="cap-stargate-20260611"`. Regenerated `replay_capture.jsonl` (2405 lines), byte-stable across two runs |
| Feed/power stable in v4-02 | commanded_power + deposition held steady while temp falls / vib rises — that contrast is the baseline-leads-the-rule story |
| Tests | `test_stargate_codec.py` +10 (helper truth tables, v3 wire-skip, fixture round-trip, four-personality, DLQ-tied-to-v4-04, build_lines determinism); predicate-lock `TestFlinkSqlLock` stays green. Bridge `dlq_count` 3→5 updated. **36 passed, 1 skipped** (`test_stargate_codec.py` + `test_stargate_bridge.py`) |
| Predicate | unchanged — `melt_pool_temp_c < 1400.0 AND arm_vibration_g > 0.08`; all new logic additive |

> **Deferred on purpose, not forgotten:** `proto_gen/stargate_telemetry_pb2.py` regeneration AND Confluent
> Schema Registry registration of the v3 subject (`stargate.printer.telemetry.v1-value`, BACKWARD-compatible)
> are intentionally NOT done in T1. They are broker-only (cloud mode) and the parked Confluent cluster is
> not un-parked for T1. Capture mode (CI/Railway/demo) uses the JSON fixture, which carries the v3 fields
> directly, so nothing in T1–T4 needs them. Both are explicit steps of the **real Confluent round-trip
> sign-off pass** (un-park → register v3 schema → regenerate pb2 → `producer --mode cloud` → verify
> provenance → re-park).

### T3 — baseline scorer + feature windows + enriched SSE (LANDED)

| Item | Result |
|---|---|
| Pure scorer | `stargate_signal_mapping.score_baseline` re-expresses the frozen champion (rolling-MAD residual over fractional-deviation-normalized values) pure-stdlib so the import-pure bridge can score live. `baseline_verdict` = GO `<1.0` / REVIEW `≤2.0` / NO_GO `>2.0` |
| Constants/math lock | tests assert `BASELINE_MAD_K`/`BASELINE_GLOBAL_TRAIN_SCALE`/bands == `telemetry_serving.MAD_K`/`GLOBAL_TRAIN_SCALE`/`_verdict_for`, AND that `score_baseline` reproduces the live ETL path (`telemetry_stream_etl.normalize_window` + `rolling_mean`). Two spellings of one rule, locked |
| Feature windows | `MultiWindowAggregator` (rolling 5s/15s/60s avg_temp, max_vib, temp/vib slope, n) beside the existing 5s `TumblingAggregator` (which still owns the chart/agg rows) |
| Enriched ingest | the one chokepoint `BridgeState.ingest_telemetry` now attaches `rule` / `scorer` / `feature_window` / `routing` / `provenance` to anomaly rows, and maintains a per-printer `scored` snapshot surfaced on every SSE frame (so the lane shows a baseline REVIEW even before any anomaly routes) |
| Provenance | capture-mode coordinates are deterministically SYNTHESIZED and labeled: `provenance_source="recorded_capture"`, `kafka_partition = synthetic_partition(printer_id) % 6`, monotonic per-partition `kafka_offset`, `schema_null_reason="capture_mode_synthetic_schema_id"`, `synthetic=true`. Real broker coords arrive via the new optional `kafka_meta` arg (wired in the cloud pass) |
| Fail closed | a window shorter than `BASELINE_MIN_WINDOW` (10) yields `model_not_configured` + `null_reason:"insufficient_window"` and a null score — never a fabricated number |
| v4-02 tuned (edit #5) | the gentle `pre_failure` ramp peaked at baseline score 0.254 — the SMAP-calibrated threshold is too coarse for melt-pool's small fractional deviations, so the baseline never led. Per the user's edit #5, tuned **only v4-02's seeded values**: a new authored `coupled_drift` segment (early melt-pool temperature excursion with vibration still nominal → rule silent → baseline REVIEW, then a sustained cold-pool + vibration redline → rule fires). **Verified: baseline REVIEW at 35513ms (score 1.48) leads the first hard-rule anomaly at 48613ms; 114 anomalies still routed.** Predicate and scorer thresholds untouched |
| Bridge purity | subprocess test imports the bridge + scores with no `DATABASE_URL`/`TELEMETRY_DATABASE_URL` set |
| Tests | `test_stargate_codec.py` +scorer/feature/provenance classes; `test_stargate_bridge.py` +`TestRulesVsBaseline` (scored frame, enriched anomalies, fail-closed, v4-02 lead regression) +`TestBridgeImportPurity`. **49 passed, 1 skipped** (stargate suites); `test_telemetry_serving`/`test_telemetry_stream_etl` 30 passed (no regression) |

### T4 — UI Rules-vs-baseline lane + inspection drawer + provenance route (LANDED)

| Item | Result |
|---|---|
| Provenance route | `GET /api/telemetry/stargate/provenance` is REAL (the drawer button calls it, not a mock). Default-off sink → `{null_reason:"durable_sink_not_enabled"}` (200); sink on but no row → `{null_reason:"provenance_not_found"}` (404). Reads `tel_stream_kafka_rows` (exists since 10033) with the RLS `app.env_id` GUC. Durable WRITE stays T2 |
| Types + hook | `stargateStream.ts` gains `ProvenanceMeta`/`BaselineScorer`/`RuleState`/`WindowStat`/`FeatureWindow`/`ScoredRow`, optional enrichment on `AnomalyRow`, `scored` on the frame, and `scored` state on the hook |
| Rules-vs-baseline lane | `RulesVsBaselineLane.tsx` — per-printer rule state beside the baseline verdict; tagged "baseline scorer (rolling-MAD residual) · not LSTM"; `model_not_configured` → "Not available — model_not_configured" (never a number); "baseline ahead of rule" when baseline ≥ REVIEW while the rule is clear |
| Honest copy (edit) | the baseline-leads note uses the exact agreed wording: "the baseline scorer flagged an early melt-pool temperature residual while vibration was still below the rule threshold; the hard two-condition rule routed the anomaly later when cold melt-pool and high arm vibration co-occurred." All predicate copy is cold melt pool (<1400°C) + high arm vibration (>0.08g) — no "high temp" |
| Inspection drawer | `AnomalyInspectionDrawer.tsx` (radix dialog, cloned from `MetadataDetailDrawer`): Raw event · Feature window (5/15/60s) · Rule · Baseline scorer (fail-closed) · Routing · Provenance. Synthetic banner ("Recorded capture — synthetic coordinates"); "Open durable serving row" renders `durable_sink_not_enabled` vs `provenance_not_found` as visibly different copy; copy buttons for event id / topic-partition-offset / raw payload; "View surrounding 60 seconds" highlights the event window on the chart |
| Deep link | `?inspect=<topic>:<partition>:<offset>` reopens the drawer when the event is in the live buffer, else a fail-closed "not in the current window" note; selecting/closing mirrors to the URL via `router.replace` |
| Chart highlight | `TempVibrationChart` gains an optional `highlight` ReferenceArea (±30s) driven by the drawer |
| Tests | backend `test_stargate_provenance_route.py` (3: both distinct reasons + row found). Frontend vitest **22 passed** across 5 stargate files: `RulesVsBaselineLane` (labels, fail-closed, baseline-ahead wording, no "high temp"), `AnomalyInspectionDrawer` (synthetic banner, fail-closed score, durable-sink vs not-found distinct copy, copy buttons, view-60s callback), `StargateConsole.deeplink` (reopen + missing-window). `tsc --noEmit` clean on touched files; eslint clean |

### T2 — durable sink + provenance hydration (LANDED, default-off)

A full BROKER consumer (`TelemetryStreamConsumer`, `build_row`, `persist_row`, triage handling) already
existed concurrently for the live Confluent path. T2 ADDED the capture-mode pieces the spec named that were
missing — no rewrite of the broker consumer, no new tables, no schema changes (10033 + 10034 already exist;
`record_kind` admits `telemetry_sample|anomaly|agg5s|dlq`).

| Item | Result |
|---|---|
| Sink API (`telemetry_stream_consumer.py`) | added `make_provenance(mode, record, partition_count=6)` (broker preserves real topic/partition/offset/schema; capture synthesizes deterministic + labeled), `persist_kafka_row(cur, ...)` (`INSERT ... ON CONFLICT (env_id,business_id,kafka_topic,kafka_partition,kafka_offset) DO NOTHING`; score/features/routing → `normalized_payload`, decoded event → `decoded_payload`), `commit_stream_offset`, `get_kafka_row_by_coords`, `tail_kafka_rows`. All cursor-based; all set the `app.env_id` RLS GUC (the telemetry cursor does not) |
| Synthetic schema_id | `schema_id` is NOT NULL on the table, so capture rows write the `SYNTHETIC_SCHEMA_ID` sentinel WITH `schema_null_reason='capture_mode_synthetic_schema_id'` — honestly flagged. Databricks pointer fails closed (`not_available` / `databricks_table_mapping_not_configured`) |
| Bridge hook | gated `STARGATE_DURABLE_SINK_ENABLED` (default off); **lazy `app.db` import only inside the gated branch** (purity preserved); **best-effort** — any DB failure is swallowed, the SSE hot path never breaks. Persists raw telemetry sampled (`offset % STARGATE_SINK_SAMPLE_N`), anomalies / agg5s / DLQ in full |
| Per-topic coordinates | each kind lives on its own topic (telemetry / anomalies / agg5s / dlq) with its own synthetic offset counter, so they never collide on the durable UNIQUE. The anomaly now carries the **anomalies-topic** coordinate in BOTH the SSE frame and the durable row, so the drawer's deep-link `topic:partition:offset` matches the durable row |
| Routes | `/api/telemetry/stargate/provenance` refactored to read via `get_kafka_row_by_coords` (single read path); added `/api/telemetry/stargate/anomalies/tail` (survives-reload anomaly feed). Both keep `durable_sink_not_enabled` vs `provenance_not_found` fail-closed |
| Tests | `test_stargate_durable_sink.py` (make_provenance capture+broker, raw sampling, ON CONFLICT + GUC, synthetic sentinel, commit/read SQL, bridge hook: flag-off no-DB, flag-on persists anomaly on the anomalies topic, DB-failure-doesn't-break-SSE, raw-sampled-but-anomaly-full). Full telemetry+stargate suite **214 passed / 2 skipped** (incl. existing broker-consumer tests + determinism, no regression) |

### Sign-off — live Confluent round-trip (PASS)

Ran against the real cluster `lkc-gqpvvyv` (Confluent Cloud, SASL_SSL, bootstrap
`pkc-619z3.us-east1.gcp.confluent.cloud:9092`, SR `psrc-z27ovke…`):

| Step | Result |
|---|---|
| Register proto v3 | `confluent schema-registry schema create` on `stargate.printer.telemetry.v1-value` (type protobuf) → **schema ID 100006**, accepted under the subject's BACKWARD compatibility |
| Produce | **40/40** messages delivered to `stargate.printer.telemetry.v1`; real broker partition/offset captured per delivery |
| Consume | **40/40** read back off the broker (wire round-trip OK) |
| Durable persist | 6 rows written via `persist_kafka_row` + `make_provenance("cloud", …)` carrying the REAL coordinates |
| Verify | **6/6** durable rows in `tel_stream_kafka_rows` have `kafka_partition/kafka_offset` == the broker coordinate (partition 5, offsets 50515–50520) with `source_system=confluent_cloud`, `synthetic=false`; each resolves via `get_kafka_row_by_coords` (the drawer's read path) |

**Teardown (kill all):** all 7 Confluent API keys created during the pass were deleted; `stop-serving`
re-confirmed 0 connectors + 0 running Flink statements (topics + schemas retained) and stamped the Mission
Control broker row `warm`. The cluster was already alive+warm before the session and is left in that exact
state — the cluster was NOT deleted (it also hosts non-Stargate topics: `history-rhymes.signals.v1`,
`winston.executions.v1`, `sample_data`; deletion would be high-blast-radius and only saves the small STANDARD
flat hourly base that predates this work). Note: the SR python client needs the
`confluent-kafka[schemaregistry,protobuf]` extras (authlib/cachetools/httpx) installed in the tooling venv.

**Follow-up (open):** the `scripts/streaming/stargate/proto_gen/stargate_telemetry_pb2.py` Python bindings
are still **v1** (10 fields). Proto **v3 is registered in the SR** (subject `stargate.printer.telemetry.v1-value`,
schema ID 100006) and the v3 fields are carried by the capture-mode JSON fixture, so nothing in the
capture/CI/Railway/demo path depends on the bindings. But **full on-the-wire v3 field production in cloud mode
needs the bindings regenerated** — `pip install grpcio-tools` then
`python -m grpc_tools.protoc -I infra/confluent/proto --python_out=scripts/streaming/stargate/proto_gen stargate_telemetry_v3.proto`
(output as `stargate_telemetry_pb2.py`). Do not claim full on-wire v3 field production until that regen lands.

**Phase 7 COMPLETE** — T1–T4 landed and committed; the live Confluent sign-off passes.

---

## Reference ticket — AI Build & Operations Reference page (2026-06-27)

Added one document-style telemetry reference page that explains *how the demo was built and how it is
operated* — the missing "AI / automation / CLI / REST / MCP / CI-CD / DevOps connections" artifact.

- **Route:** `/lab/env/[envId]/telemetry/ai-build-ops` (flat convention; nav label "AI Build & Ops",
  page title "AI Build & Operations Reference"). Visible in the **Evidence & Lineage** nav group.
- **Shape:** static — no fetch, no live compute, no new API, no migration. 11 numbered sections (page
  inventory, AI-skill map, runtime AI, REST endpoint map, MCP map, CLI/DevOps, CI/CD gates, evidence,
  honest boundaries) rendered from a hand-maintained manifest where every claim-bearing row carries
  `sourceRefs` citing the real file/route. Engineering-runbook layout, not a card grid.
- **Files:** `repo-b/src/app/lab/env/[envId]/telemetry/ai-build-ops/page.tsx`;
  `repo-b/src/components/telemetry/buildops/{AiBuildOpsReference.tsx,refPrimitives.tsx,manifest.ts,
  AiBuildOpsReference.test.tsx}`; nav entry + slug→group in `telemetryNav.ts` (+ test).
- **Verified:** `npm run typecheck` clean; `npm run lint` clean (new files); focused vitest 13/13;
  `npm run build` compiles the route (14.8 kB, 295 pages). Manifest sourced from the verified
  endpoint/MCP/CI inventory so it can't drift silently.
