# PROOF

Every value in this file is copied from a real run. No rounding, no hand-edits. If a metric missed
its gate, it is recorded as missed. If a step could not run, the blocker is written here honestly.

**Reviewer entry points:** [`REVIEWER_DEMO.md`](REVIEWER_DEMO.md) (login, routes, 4-minute script,
expected evidence values, caveats) · [`docs/portfolio-proof.md`](docs/portfolio-proof.md) (2-minute
written summary for a recruiter / hiring manager). This file is the full per-phase evidence log.

## Status (2026-06-02, end of Applied-AI Phase 6 — Test Intelligence Copilot)

All ML-platform phases complete (ingestion → training → gating → serving → Lab Workbench UI →
operated-history backfill), plus Phase 7A (the 256-d fused NASA state vector + autoencoder-style
recon, committed `8cdd0d0f`), and now the **Applied-AI Layer Phase 6: a grounded, tool-using Test
Intelligence Copilot**. On the replay page, when the verdict flips GO→NO-GO at t=728, a reviewer
clicks "Explain this verdict" and gets a live-LLM answer grounded in the real prediction receipt,
anomaly score, threshold, champion model, and MLflow run — with a visible evidence trail, deterministic
pre-LLM refusals for out-of-scope questions, a post-validator that blocks any ungrounded id/number, and
a governance panel backed by real logged interactions.

(Naming note: the repo's earlier "Phase 6" is the ML-platform operated-history enrichment, recorded
below. The section directly under this Status is the Applied-AI layer's Phase 6 — the copilot.)

**Live URLs:**
- Backend API: `https://authentic-sparkle-production-7f37.up.railway.app` (git_sha `62dcab4a`)
- Frontend: `https://novendor.ai` (Vercel project `consulting-app`, root dir `repo-b`)
- Reviewer demo route: `https://novendor.ai/lab/env/dc82d39d-9be2-49b0-a01d-c7181b13a8b6/telemetry`
  (authenticated lab tenant — log in first)

## Phase 7A — 256-dimensional fused NASA telemetry state vector

A single résumé-grade claim made true and verifiable: a real **256-dimensional fused multi-signal
state vector**, a **dense autoencoder-style reconstruction model** (+ PCA-256 baseline), and real
**per-channel divergence ranking**. Built in Databricks, persisted to Supabase, served read-only.
Nothing padded, nothing duplicated, no labels used as inputs. Phases 7B–7G are deferred.

### What the 256 dimensions actually are

**256 = 32 real SMAP/MSL channels × 8 computed window features.** Not 256 sensors, not zero-padding,
not duplicated columns. The 8 features per (channel, window) are computed from the real telemetry
`value` series (and its rolling mean/std) already in `novendor_1.telemetry.gold_smap_msl_windows`:

```
value_last, value_mean, value_std, value_min, value_max,
value_slope (linear fit over the window),
residual_last  = value − value_rmean50,
residual_z     = (value − value_rmean50) / value_rstd50
```

Channel selection (`fused_channel_selection.json`, 32 rows): from 81 SMAP/MSL channels, keep those
with adequate history (train ≥ 1500 & test ≥ 2000 rows) → 68 candidates; build all 8 features for each;
**quality filter** — every one of the 8 features must be non-constant (variance > 1e-12) → drop
near-flat channels; select 32 with a spacecraft + anomaly-class mix and **D-4 force-included** (the
replay channel). Result: **SMAP = 22, MSL = 10.** If <32 had passed, the build was instructed to stop
and report the maximum honest dimension rather than pad — it did not need to.

**Alignment caveat (disclosed, not buried):** the 32 channels are aligned by **normalized sequence
progress** per channel/split (128 buckets over each channel's own length), **not** by physical
simultaneity. The result is a fused NASA *analog* telemetry representation for model development and
retrieval — it is **not** a claim of simultaneous multi-sensor readings from one vehicle, and the
serving API states this in its `alignment` field. Public NASA analog data, labeled as such.

### Feature manifest (256 rows — every dimension traceable)

`fused_feature_manifest.json` + `tel_feature_manifest` (256 rows). Each row: `feature_index`,
`chan_id`, `feature_name`, `source_table` (`novendor_1.telemetry.gold_smap_msl_windows`), `calc`,
`leakage_risk` (`none (past-only rolling features; train-median imputation)`), `included`. Anomaly
labels appear only in evaluation, never as a feature.

### Models on the fused vector (real metrics, copied from the seeded run)

Both trained X→X on the standardized vectors (StandardScaler fit on train only, then winsorized to
±8 to stop a near-degenerate feature from blowing up test error — disclosed, not hidden):

- **Dense autoencoder-style bottleneck network** — `sklearn MLPRegressor`, layers `256→128→32→16→32→128→256`.
  This is honestly a dense reconstruction network trained as an autoencoder-style bottleneck, **not** a
  PyTorch/LSTM production autoencoder. No torch in the backend.
- **PCA-256 reconstruction** — honest linear baseline, trained alongside.

Reconstruction error (mean squared error over the 256 features), over the 256 fused vectors
(128 train / 128 test):

| Metric | Value |
|---|---|
| Mean AE recon error (all) | 739.43 |
| Mean PCA-256 recon error (all) | 411.90 |
| Mean AE recon error — **labeled-anomalous test windows** | **1634.23** |
| Mean AE recon error — nominal test windows | 347.32 |

The honest read: AE reconstruction error is **~4.7× higher on labeled-anomalous windows** (1634 vs
347) — the separation you want from a reconstruction-based detector. And PCA-256 reconstructs *lower
on average* (412 vs 739) — recorded as-is; the simpler baseline is not beaten on raw recon MSE, which
is exactly the kind of result this project refuses to tune away. The live `/score` champion is still
the frozen MAD rule (Phase 2); the fused models are challengers, not promoted over it.

### Per-channel divergence ranking (real, multi-channel)

Per-feature squared reconstruction error aggregated to 8-feature-per-channel totals → ranked →
`top_contributors` jsonb. Sample (highest-AE-error anomalous test vector, `window_index=113`,
AE 2479.74 / PCA 1344.94):

```
rank 1  D-3  total_recon_error 465.90  top_features [residual_last, value_mean, value_last]
rank 2  D-4  total_recon_error 461.62  top_features [value_min, value_max, value_mean]
rank 3  D-5  total_recon_error ...     top_features [residual_last, value_std, value_max]
```

That is real channel-divergence ranking across the fused vector — not a single scored channel.

### Persistence (migration 10009, applied)

`repo-b/db/schema/10009_telemetry_fused_vectors.sql`:
- `tel_fused_state_vectors` — `feature_vector vector(256)` (pgvector 0.8.0), `source_channels`,
  `split`, `window_index`, `label_any_anomaly`, `recon_error_ae`, `recon_error_pca`,
  `top_contributors` jsonb, `source='public_nasa_analog_dataset'`, RLS by `env_id`.
- `tel_feature_manifest` — 256 manifest rows, RLS by `env_id`.
- Backfilled into the `telemetry-demo` tenant via the idempotent `14_backfill_fused.sql`
  (`is_backfilled=true`, `backfill_batch_id='phase7a-fused-v1'`). **256 vectors + 256 manifest rows.**

### Verification (`verify_fused_vector.py` — ALL CHECKS PASS)

```
selected_channels      = 32 (expect 32)   D-4 included = True
features_per_channel   = 8 (expect 8)
manifest features      = 256 (expect 256)
stored vectors         = 256 ; manifest rows = 256
stored vector_dim/len  = {'hi': 256, 'lo': 256, 'vhi': 256, 'vlo': 256}
constant-pad columns   = 0 (expect 0)
alignment              = normalized sequence progress per channel/split (NOT physical simultaneity)
sample anomalous vector: eb55cb2c-c4f split=test window_index=113 -> traces to source_channels A-1..D-1... label=1
SMAP/MSL mix           = SMAP=22 MSL=10
ALL CHECKS PASS — 256-d fused vector is real, 32 channels x 8 features, D-4 included, no padding,
traceable, leakage-free.
```

Eight assertions: 32 selected channels, 8 features/channel, dim 256, 256 manifest rows, every stored
vector length 256, **0 constant-pad columns**, D-4 present, a sample vector traces to its NASA source
channels + window. (An earlier draft had 2 constant-pad columns from a near-flat channel and an AE
test error of 1.3e31 from an un-winsorized degenerate feature; both were found and fixed before this
PASS — recorded in `docs/tips.md`.)

### Backend + UI (read-only surfacing; no overclaim)

- `GET /api/telemetry/fused-vector-info` (lean, psycopg3 only) → `{available, vector_dim 256,
  n_channels 32, features_per_channel 8, feature_names, channels, d4_included, fused_vectors 256,
  anomalous_test_vectors 78, model, alignment, source}`. Fails closed (`null_reason:data_not_ingested`)
  if not built.
- Overview "Fused state vector" panel shows the **actual** dim from the API ("256 features · 32 NASA
  channels × 8 window features · incl. D-4"), the feature names, the model description, and the
  alignment caveat verbatim. The line appeared only after the verifier passed.
- Backend stays lean (no mlflow/torch/pyspark added). Frontend typecheck: 0 errors.
- **Phase-6 regression intact:** `/replay` still flips GO→NO-GO at t=728; `/summary` still reports 364
  predictions; the 4 real `tel_model_runs` are untouched.

### Résumé-claim audit (as of Phase 7A)

What the repo verifiably supports today. Claims still aspirational are marked deferred and must not
appear in résumé copy yet.

| Claim | Supported now? | Evidence | Caveats |
|---|---|---|---|
| 256-dimensional multi-signal state vector | **Yes** | `tel_fused_state_vectors` (256 vectors, `vector(256)`), `fused_feature_manifest.json` (256 rows), `verify_fused_vector.py` PASS | 32 real NASA SMAP/MSL channels × 8 computed features; aligned by **normalized sequence progress**, not physical simultaneity; public analog data, not proprietary vehicle telemetry or simultaneous rocket sensors |
| Autoencoder-style reconstruction model | **Yes (worded carefully)** | MLPRegressor `256→128→32→16→32→128→256`, recon MSE in this section | "Dense reconstruction model trained as an autoencoder-style bottleneck," **not** a PyTorch/LSTM production AE; PCA-256 baseline logged alongside; challenger, not promoted over the MAD champion |
| Channel divergence ranking | **Yes** | `top_contributors` jsonb (per-channel aggregated recon error, ranked), sample above | per-channel AE reconstruction error; fused-vector path (live `/score` still single-channel until 7B) |
| Anomaly detection that fires autonomously | Yes (Phase 2/4) | `/replay` GO→NO-GO flip at t=728 from the frozen MAD champion | real model output, not scripted |
| RUL / remaining-useful-life regression | Yes (Phase 2) | `tel_model_runs` (C-MAPSS FD001, RMSE + PHM) | held-out test split |
| Classification (anomalous vs nominal) | **Deferred (7C)** | — | not built — keep out of résumé copy |
| Directional forecasting | **Deferred (7C)** | — | not built |
| pgvector / HNSW analog retrieval | **Deferred (7D)** | `vector(256)` column exists; pgvector 0.8.0 confirmed | HNSW index + `/analogs` endpoint not built yet |
| Brier score / calibration | **Deferred (7E)** | — | not built |
| Walk-forward / rolling-origin validation | **Deferred (7F)** | — | current wording stays "held-out, no-look-ahead split" |
| Drift alerts + retrain trigger | **Deferred (7G)** | real PSI drift series exists (Phase 6) | alerts table + trigger not built |

---

## Applied-AI Layer — Phase 6: Test Intelligence Copilot

A narrow, tool-using, grounded copilot over the telemetry platform — **not** a generic chatbot. It
explains model verdicts from real evidence, refuses out-of-scope questions, and exposes a governance +
eval surface. Self-contained: its own deterministic planner + read-only tool allow-list + post-validator
+ template fallback, isolated from the REPE `ai_gateway`/`assistant_runtime`. Backend stays lean (no ML
deps); it reuses only the OpenAI client + `gpt-5-mini` already wired for the platform.

### Flagship — "Explain this verdict" (real, live, grounded)

`POST /api/telemetry/copilot/explain-verdict {run_key:"smap_msl:D-4:test", verdict:"NO_GO", fire_tick:728}`
→ `answer_source=live_llm`, ~6–8s, citing **only** real evidence (verified via in-process HTTP TestClient
against the real Supabase + live `gpt-5-mini`):

- Prediction receipt **`f8e8f23e-1da9-4f27-8785-175bd59d9e6b`** (the NO_GO row whose window `[726–728]`
  brackets the first fire tick — the planner picks the *tightest* bracketing NO_GO window, not the broad
  GO aggregate `[707–1412]`).
- `anomaly_score` **2.46062** (read from `tel_predictions`, **never** the replay fixture's `score` field,
  which is a ~1.48e12 artifact at fired ticks), `threshold` **0.135467204729745** (= MAD_K 4.0 ×
  global_train_scale 0.033866801182436346), attribution `[{value: 0.333333}]`.
- Champion **`tel_anomaly_detector` v1** (alias champion), MLflow run **`4a48cb6af871…`**, out-of-sample
  **F1 0.6386571** (precision 0.5460287, recall 0.7691330) from `tel_model_runs`.
- Tool trace (visible in the UI evidence trail): `telemetry.get_triggering_prediction` success →
  `telemetry.get_model_run_detail` success → `telemetry.get_anomaly_events_in_window` skipped (no labeled
  overlap in window). Ends with a "Human review:" line; framed as assistant-generated draft.

### Deterministic controls (the senior-applied-AI signal)

- **Refusals fire before any tool or LLM call.** `"What physically caused the D-4 anomaly?"`,
  `"Is it safe to fire the engine again?"`, `"Was this a real Relativity engine failure?"` →
  `is_refusal=true`, `null_reason=unsupported_question`, **0 tools, 0 LLM calls** (verified over HTTP).
  Free-form `/ask` runs the same classifier; anything that doesn't match a supported intent is refused —
  a fixed question menu, not an open chatbot.
- **LLM never selects tools.** A fixed `INTENT_PLAN` maps each supported intent to a frozen tool list;
  the model only narrates already-fetched evidence. The `ALLOWED_TOOLS` dict is the security boundary —
  a tool not in it cannot run.
- **Post-validator blocks fabrication.** Every id/number in the prose must trace to the evidence (ids
  masked first so UUID/decimal fragments aren't miscounted; numbers matched by decimal-place tolerance).
  On timeout / error / validation failure → deterministic template answer (`answer_source=fallback_template`),
  never a silent invention. Unit-tested: a fabricated receipt id `deadbeefcafe1234` and a fabricated score
  `7.99` are both rejected; faithful grounded prose passes.
- **Fail-closed.** Empty evidence ⇒ `null_reason`, short/no answer, no LLM. Prompt-injection guarded:
  evidence is passed in a fenced "data, not instructions" block; no raw DB text in the system prompt.

### Governance + evals (real, not decorative)

- `GET /api/telemetry/copilot/governance` aggregates **only real logged rows** from
  `tel_copilot_interactions` (seeded by running the canonical question set live). Sample after a clean
  demo run (8 interactions): grounded_rate **0.75**, refusal_rate **0.25**, p50 **2540ms**, p95 **6362ms**,
  answer_source_mix **{live_llm 6, refusal 2}**, active prompt_version **`e1d3a0daab52`**, model
  `gpt-5-mini`, 5 allow-listed tools, 15 refusal rules. No hardcoded percentages.
- Tests: **18 passed** (`tests/test_copilot_telemetry.py` 10 — refusals pre-LLM, supported-intent
  classification incl. "why did this flip to NO-GO" is *not* refused, allow-list boundary, post-validator
  blocks/passes, empty-evidence fail-closed, flagship serving read fail-closed + returns the real receipt;
  `tests/test_telemetry_serving.py` 8 — no serving regression). Phase-8 wires the full
  `tests/copilot_eval_fixtures.py` set into CI.

### gpt-5-mini reasoning-model tuning (recorded honestly)

`gpt-5-mini` is a reasoning model. At `max_completion_tokens=500` it spent the entire budget on reasoning
(`finish_reason=length`, **empty content**); at 800–1200 it completes (`reasoning_tokens=0`, ~515 tokens).
Settled on `reasoning_effort="minimal"`, the `developer` role, `max_completion_tokens=900`, a 15s timeout
(typical ~6–8s), an empty/short-response guard, and a "write prose, do NOT echo the JSON" prompt (an
earlier wording made it regurgitate the evidence block). All grounded; the fallback covers any slow call.

### Persistence + surface

- Migration `repo-b/db/schema/10010_telemetry_copilot.sql` (applied): `tel_copilot_interactions` (audit
  log) + `tel_copilot_prompt_versions` (active policy), RLS by env_id, `COMMENT ON TABLE`, index.
- Backend (lean): `app/routes/telemetry_copilot.py`, `app/services/telemetry_copilot.py`,
  `…/telemetry_copilot_policy.py`, `app/schemas/telemetry_copilot.py`, `app/services/copilot_logger.py`,
  4 new read-only fns in `telemetry_serving.py`; router registered in `main.py`.
- Frontend (dark C palette): `src/lib/telemetry/copilot-api.ts`, `src/components/telemetry/Copilot.tsx`
  (evidence cards, tool-trace rows, governance strip, explanation panel, workbench), the "Explain this
  verdict" button + panel in `ReplayConsole.tsx`, the `/telemetry/copilot` page, and the "Test
  Intelligence" nav entry. `tsc --noEmit` 0 errors.

### Regression (Phase-6 ML-platform + Phase-7A intact)

`/api/telemetry/replay` still flips at `first_model_fire_t=728`; `/api/telemetry/summary` predictions
unchanged at **364**; `/api/telemetry/fused-vector-info` still `vector_dim=256`, `n_channels=32`. The
copilot is strictly additive — no edits to existing serving functions.

### Deployed + post-fix cold production verification (2026-06-02)

Deployed (per the "deploy after verification" decision): backend on Railway, frontend on Vercel
`consulting-app` (novendor.ai). A live browser walkthrough found the copilot 500ing in the browser
while curl worked — a genuine production-only bug. Root-caused and fixed:

- **Frontend root cause (commit `aec59fe2`):** `copilot-api.ts` set a `content-type` header even
  though `apiFetch` already sets `Content-Type`. The two case-differing keys merged into a DUPLICATE
  header (`content-type: application/json, application/json`) under fetch/undici, which mangled the
  POST body — the backend parsed it to a non-dict and returned `422 model_attributes_type` (surfaced
  in the UI as "Could not load"). curl sent a single header, so it never reproduced. Fix: drop the
  redundant header (match the repo's other POST callers). Verified 200 + grounded answer.
- **Backend hardening (commit `9803df57`):** the app-wide `RequestValidationError` handler returned
  raw `exc.errors()`, which for a body-parse failure contains the request **bytes** in `input` —
  `JSONResponse` can't serialize it (`TypeError: Object of type bytes is not JSON serializable`), so
  the outer handler turned every body-parse 422 into a 500. Now returns the sanitized loc/msg/type
  list → clean 422. Kept even though it wasn't the primary cause.
- **Tree cleanup (commits `daaf3b5a`, `14101c48`):** gitignored client-engagement scratch (Happyco
  receipts/drafts, Hone work, root mockups/scripts, client execution plans, lead-gen prompts);
  committed `skills/novendor-repe-outreach/SKILL.md` (router skill). Working tree clean.
- **Intentionally left alone** (pre-existing tracked edits, not this work): `CLAUDE.md`,
  `mcp-servers/outlook-mcp/server.py`, `orchestration/parallel_test_report.md`.

**Cold verification (no auth cookies = stranger path; live `aec59fe2` bundle + backend `9803df57`):**

```
1. GET /replay                      first_model_fire_t = 728                               PASS
2. POST /copilot/explain-verdict    HTTP 200 ~4s, answer_source=live_llm; cites
                                    receipt f8e8f23e-1da9-4f27-8785-175bd59d9e6b,
                                    score 2.46062, threshold 0.135467204729745,
                                    champion tel_anomaly_detector v1,
                                    mlflow 4a48cb6af8714609b9581d66e904544c, F1 0.6386571   PASS
   tool_trace: get_triggering_prediction success -> get_model_run_detail success ->
               get_anomaly_events_in_window skipped (no labeled overlap)
3. POST /copilot/ask "what physically caused..."  is_refusal=true,
                                    null_reason=unsupported_question, 0 tools, 0 LLM        PASS
4. governance total 22 -> 24 (explain + refusal both logged), grounded_rate 0.75           PASS
5. POST /copilot/explain-verdict  --data 'not json'  ->  HTTP 422 (json_invalid), not 500  PASS
```

Caveat: the above is the cold API/contract layer (curl, no cookies — the copilot API is not
cookie-gated; the page is). The visual UI render is confirmed by a hard-refresh browser pass; an
authenticated production screenshot is not capturable from this session (same limitation noted in
Phase 5/6).

---

---

## Applied-AI Layer — Phase 8: AI Governance + Eval Dashboard

A thin **observability layer** over the existing copilot — no new copilot behavior, no retraining, no
replay/explain/report redesign. The page answers one question: *"Can we trust the AI layer, and how
do we know?"* — entirely from real logged data and a real eval run. Route:
`/lab/env/[envId]/telemetry/governance` (nav: "AI Governance").

### One new signal, instrumented honestly

To report a **real post-validator block count** (not lump all fallbacks together), the answer flow now
records *why* it fell back — `postvalidate_block | timeout | empty_response | llm_error | no_api_key`
— in a new `tel_copilot_interactions.fallback_reason` column (migration `10012`). Pure observability;
behavior unchanged. Everything else the dashboard shows was already logged.

### What the page surfaces (all real, never hardcoded)

From `GET /api/telemetry/copilot/governance` (extended): total interactions, grounded-answer rate,
refusal rate, live-LLM vs fallback rate, **post-validator block count**, fallback-reason breakdown,
**tool-call success/error/skipped**, p50/p95 latency, active prompt hash + model, allow-list size,
refusal-rule count, a **recent-interactions table**, **recent refusal examples**, and
**unsupported-claim-blocked examples**. From `GET /api/telemetry/copilot/evals` (new): the last eval
run's per-case pass/fail with run timestamp + source. Production-smoke status is the **last manually
recorded** cold smoke (timestamp + source), explicitly labeled — not a live status.

Honesty rules enforced in the UI: a null metric renders **"Not available"**, never a misleading zero;
empty example lists render "None recorded"; eval/smoke panels show their run timestamp + source so
staleness is visible. A **"What this proves"** strip names the six controls (fixed intent planning,
allow-listed tools, pre-tool refusals, post-generation validation, audit receipts,
human-review-required reports).

### Verification (real values)

```
GET /copilot/governance  -> total 26, grounded 0.7692, refusal 0.2308, fallback 0.0, live 0.7692,
                            postvalidator_block_count 0 (LLM stayed grounded — a real 0, not invented),
                            tool_call_stats {success 34, skipped 15}, recent 15 / refusals 6 / blocked 0,
                            production_smoke pass (recorded 2026-06-02), prompt e1d3a0daab52, gpt-5-mini
GET /copilot/evals       -> available, 5/5 pass, source "pytest backend/tests/test_copilot_telemetry.py"
   grounded_no_go · refusal_proprietary_root_cause · report_evidence_and_disclaimer ·
   fail_closed_missing_input · no_invented_cause_or_disposition
pytest tests/test_copilot_telemetry.py tests/test_telemetry_serving.py -> 26 passed
   (3 new Phase-8: evals artifact served, evals fail-closed when artifact missing, governance aggregates)
tsc --noEmit -> 0 errors
```

The eval artifact (`backend/app/data/telemetry/eval_results.json`) is produced by a **real pytest run**
via `telemetry-platform/run_governance_evals.py` (re-run after any copilot change); the endpoint serves
it labeled with the run timestamp — eval pass/fail on the page is never invented.

Files: migration `repo-b/db/schema/10012_telemetry_copilot_fallback_reason.sql`; backend
`telemetry_copilot.py` (fallback_reason in `answer()`, extended `governance_summary`, new `evals`),
`copilot_logger.py`, `routes/telemetry_copilot.py` (`/evals`), `schemas/telemetry_copilot.py`;
artifacts `backend/app/data/telemetry/{eval_results,last_smoke}.json` + `run_governance_evals.py`;
frontend `GovernanceDashboard.tsx`, `…/telemetry/governance/page.tsx`, `TelemetrySidebar.tsx` (nav),
`copilot-api.ts`.

**Known gaps:** production-smoke is **not yet machine-automated** — the dashboard shows the last
*manually recorded* cold smoke (timestamp/source), as designed. Authenticated screenshots of the
rendered Explain-verdict / Draft-report / Governance pages are not capturable headlessly from the
build session (same limitation since Phase 5) — the real replay-NO-GO and model-performance shots are
wired into the reviewer pack, and a 2-minute manual-capture checklist for the remaining three is in
`REVIEWER_DEMO.md` §7; the data-level proof above + the live routes stand in.

---

## Applied-AI Layer — Phase 7: Test Report Workflow

Turns the Phase 6 grounded evidence into a **reviewable operational artifact**. The chain a reviewer
sees: GO→NO-GO → Explain verdict → **Draft test report** → evidence trail attached → human review
required. Narrow by design: no new broad copilot behavior, no retraining, no dashboard redesign, no
document-management system. Draft → persist → preview → evidence trail → human-review flag.

### What it does

- **Deterministic report assembler (no LLM).** `draft_report()` reuses the Phase 6 tool chain
  (`get_triggering_prediction` → `get_model_run_detail` → `get_anomaly_events_in_window`), assembles
  the same grounded `evidence[]`, then builds a structured markdown report **purely from those real
  values** — verdict, triggering receipt, anomaly score + threshold (with the MAD math), model basis
  (champion/version/MLflow/F1·precision·recall), labeled-anomaly overlap, a fixed *statistical*
  interpretation, false-positive/missed-anomaly considerations, recommended human follow-up, and
  limits. No inference, so nothing can be fabricated.
- **Labeled `ASSISTANT-GENERATED DRAFT — REQUIRES HUMAN REVIEW`** in the header banner and footer.
  The interpretation explicitly states it is *not* a physical root cause; the limits section states
  the assistant does not infer physical cause or issue flight/safety dispositions.
- **Fail-closed.** No triggering receipt (missing run / no NO_GO) ⇒ `null_reason`, **no markdown, no
  persisted row** — verified.
- **Persisted with full provenance** to `tel_copilot_reports` (migration `10011`): `run_id`,
  `run_key`, `receipt_id`, `verdict`, `anomaly_score`, `threshold`, `champion_model`, `model_version`,
  `mlflow_run_id`, `prompt_version`, `evidence_payload` (jsonb), `generated_markdown`,
  `review_status='requires_human_review'`, `created_at`. The report id is the report receipt.
- **Guardrails intact.** Out-of-scope "write a report on the physical root cause…" is refused by the
  same deterministic pre-LLM classifier (`unsupported_question`). The fixed intents, allow-listed
  tools, and audit receipts from Phase 6 are unchanged.

### Surface

- `POST /api/telemetry/copilot/draft-report` (run_key, fire_tick) → report receipt + markdown +
  provenance; `GET /api/telemetry/copilot/report/{id}` → fetch a stored report (preview/detail).
- `DraftReportCard` (dark C palette): amber `REQUIRES HUMAN REVIEW` banner, provenance row (report
  receipt, run, prediction receipt, prompt version), the markdown body, and a **Download .md** button.
  A "Draft test report →" button appears under any grounded copilot result (replay explanation panel
  and the `/copilot` workbench).

### Verification (real values)

```
pytest tests/test_copilot_telemetry.py tests/test_telemetry_serving.py  -> 23 passed
  report contains evidence trail (run, receipt f8e8f23e, 2.46062, 0.135467, champion, mlflow, F1)
  report includes REQUIRES HUMAN REVIEW disclaimer
  report omits root-cause / safety-disposition claims (statistical only)
  unsupported root-cause report request -> refused pre-LLM (unsupported_question)
  missing run -> fail closed (null_reason missing_run, NO INSERT into tel_copilot_reports)
HTTP E2E (TestClient, real Supabase):
  POST /draft-report (D-4)  -> 200, report_id, review_status=requires_human_review,
                               cites receipt f8e8f23e, verdict NO_GO, score 2.46062     PASS
  GET  /report/{id}         -> stored report fetched, review_status requires_human_review PASS
  POST /draft-report (NOPE) -> report_id null, null_reason missing_run, no markdown       PASS
  regression: explain-verdict live_llm; /replay first_model_fire_t 728                    PASS
tsc --noEmit  -> 0 errors
```

### Sample report receipt (real)

A persisted draft for `smap_msl:D-4:test` (~2,047-char markdown) citing prediction receipt
`f8e8f23e-1da9-4f27-8785-175bd59d9e6b`, score `2.46062`, threshold `0.135467204729745`, champion
`tel_anomaly_detector v1` (MLflow `4a48cb6af871…`, F1 `0.638657`), `review_status=requires_human_review`,
stored in `tel_copilot_reports` and re-fetchable via `GET /report/{id}`.

Files: migration `repo-b/db/schema/10011_telemetry_copilot_reports.sql`; backend
`app/services/telemetry_copilot.py` (assembler + `draft_report`/`get_report`),
`app/schemas/telemetry_copilot.py` (`DraftReportRequest`), `app/routes/telemetry_copilot.py` (2
routes), `backend/tests/test_copilot_telemetry.py` (5 Phase-7 tests); frontend
`repo-b/src/lib/telemetry/copilot-api.ts` (`draftReport`/`getReport`),
`repo-b/src/components/telemetry/Copilot.tsx` (`DraftReportCard` + button + `.md` download).

### Deployed + final production contract smoke (commit `dc67da11`)

Deployed to Railway + Vercel. A focused contract pass also drove two fixes: `GET /report/{id}` now
returns `run_id` (was stored but unselected), and the Verdict line now explicitly attributes the call
to the model — *"The promoted telemetry anomaly detector (`tel_anomaly_detector`) returned a NO_GO
verdict … This is a model output over recorded telemetry — not a statement that the test, vehicle, or
hardware failed."* (evidence-based analytics, never a final engineering/safety disposition).

Final cold smoke via novendor.ai (no auth cookies), all **PASS**:
```
POST /copilot/draft-report   200; report_id; review_status=requires_human_review; generated_markdown;
                             evidence; provenance receipt/run/model/mlflow; verdict attributed to the
                             detector; no "test failed"/"unsafe" framing; no invented root cause.
GET  /copilot/report/{id}    200; same report_id; receipt_id; run_id; champion_model; mlflow_run_id;
                             REQUIRES HUMAN REVIEW disclaimer; markdown returned.
GET  /copilot/report/<bogus> -> null_reason=missing_report (fail closed)
POST /copilot/draft-report (unknown run) -> report_id null, null_reason=missing_run, no row (fail closed)
```
Reviewer chain complete end-to-end in prod: **GO→NO-GO → Explain verdict → Draft test report →
evidence trail → human review required.**

---

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

**Honest metrics beside the legacy point-adjusted F1.** The F1 above is *point-adjusted*: one in-window
hit credits the whole labeled segment. On the same champion predictions, the honest tick-level numbers
are much lower, and both are recorded in the champion's `tel_model_runs.metrics` row (keys
`f1_pointwise`, `precision_pointwise`, `recall_pointwise`, `event_recall`, `alarm_precision`):

| Metric | Value |
|---|---|
| F1 (point-adjusted — legacy) | 0.6387 |
| F1 (point-wise — honest) | **0.3130** |
| Precision / Recall (point-wise) | 0.3279 / 0.2993 |
| Event recall (80 of 104 labeled segments) | 0.7692 |
| Alarm precision | 0.3279 |

Reproduce offline from the raw arrays + labels, no Databricks and no retrain — applies the exact frozen
rule and re-derives the point-adjusted F1 as a fidelity check (**0.645 local vs 0.639 stored**, recall
matches to three decimals, MLflow run `4a48cb6af8714609b9581d66e904544c`):

```
python telemetry-platform/eval_honest_metrics.py --data-dir telemetry-platform/databricks/data/smap_msl
```

Result snapshot: [docs/honest_metrics_result.json](docs/honest_metrics_result.json). Full critique and
our reporting stance: [docs/BENCHMARK_CRITIQUE.md](docs/BENCHMARK_CRITIQUE.md). The three-track roadmap
(range-aware metrics, conformal budget, usefulness A/B) is in
[docs/CREDIBILITY_ROADMAP.md](docs/CREDIBILITY_ROADMAP.md); the N-CMAPSS / IMS run-to-failure expansion
plan is in [docs/DATA_EXPANSION_PLAN.md](docs/DATA_EXPANSION_PLAN.md).

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
