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
