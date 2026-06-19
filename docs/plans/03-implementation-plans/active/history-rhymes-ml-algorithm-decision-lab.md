# ML Algorithm Decision Lab — History Rhymes

Status: implemented (2026-06-15) · Owner: feature-dev · Surface: History Rhymes lab env
Route: `/lab/env/[envId]/historyrhymes/ml-algorithms` · API: `/api/hr/v1/ml-demo/*`

## Status (2026-06-15)

All layers landed in one session. Backend: `services/hr_ml_demo/` package +
`routes/hr_ml_demo.py` (registered in main.py); 58 backend tests green
(service 37 incl. routes, curveballs 13, cloud-links 8). Frontend: route + `lib/historyrhymes/mlDemo.ts`
+ components + recharts/confusion/dendrogram charts + Reality Mode panel +
MLDetailDrawer drilldowns + cloud lineage; `npm run typecheck` clean, 9-test
client contract green, Playwright spec added (data-driven flow gated `HR_E2E=1`).
GCP materialization implemented (`scripts/ml_demo_materialize.py`); run it with
`ML_DEMO_CLOUD_PROVIDER=gcp` + creds to make links live (defaults to "none" →
local-demo links). Deferred: reverse HR sub-nav retrofit into routine/morning-book/
planning (avoided touching tested components + the envId-less routine page);
Databricks/MLflow links remain config-ready (stub).

## Session brief

Turn the 10 classic ML algorithms (linear/logistic regression, decision tree,
random forest, SVM, KNN, naive bayes, k-means, hierarchical clustering, PCA)
into a live teaching/demo surface inside History Rhymes. The lesson is "which
model fits *this* data / constraint / business goal," not "which is most
advanced." Three layers, built continuously:

- **A — Core lab:** 10 algorithms trained on deterministic synthetic
  HR-flavored market-signal data; model cards, metrics, charts, comparison
  matrix, how-to-choose + demo script. Fail-closed, deterministic (seed=42),
  no fabricated metrics, no production-performance claims, one failed algorithm
  never breaks the page.
- **B — Reality Mode / Curveball Engine:** 15 toggles that mutate the same
  dataset to expose each model's weaknesses (regime shift, stale features,
  informative missingness, class imbalance, cost-of-error, label delay, data
  leakage, near-duplicate/episode leakage, conflicting signals, outliers,
  non-event analogs, adversarial narrative, distribution drift, human-override
  policy, latency budget).
- **C — Drilldowns + cloud lineage:** clickable visuals → `MLDetailDrawer` →
  source/feature/model/metric/lineage → real GCP deep links (the synthetic
  dataset + results are materialized to BigQuery/GCS). Provider abstraction
  `gcp | databricks | none`; never fabricates a URL.

## Key contracts

- API prefix `/api/hr/v1/ml-demo` (NOT `/api/history-rhymes/*` — forbidden by
  the frontend HR contract test). Single-tenant, no env_id/RLS (HR exemption).
- Per-algorithm envelope: `algorithm_id, name, status("ok"|"not_available"),
  null_reason, task_type, business_question, dataset{}, metrics{}, charts{},
  model_card{...,fit_score_dimensions}, evidence{seed,model_version,source},
  external_links[], lineage{}`. `not_available` keeps `model_card`; empties
  metrics/charts. Routes never 5xx.
- Dataset is deterministic in-memory (seed=42, ~240 rows) — runtime source of
  truth, no DB migration. Also exported to BigQuery/GCS so GCP links resolve.

## PR sequence

0. Plan doc + docs page (this).
1. Backend core: `services/hr_ml_demo/{dataset,registry,trainers,runner,schema}.py`,
   `routes/hr_ml_demo.py`, main.py registration + service/route tests.
2. Reality Mode engine (all 15) + honest metrics/leakage/splits + scenario params + tests.
3. Cloud config + link builder + materialize + lineage + export script + tests.
4. Frontend core lab page + `lib/historyrhymes/mlDemo.ts` + components + charts + HrSubNav + contract test.
5. Frontend Reality Mode panel + honest metrics + clean-vs-reality.
6. Frontend drilldowns (MLDetailDrawer, clickable charts, external links, lineage, provider badge).
7. Playwright e2e + nav retrofit + tips.md + final report.

## Acceptance / verification

- `cd backend && pytest tests/test_hr_ml_demo_*.py` green (determinism,
  fail-closed, curveballs, cloud-link modes).
- All endpoints 200; `/algorithms` returns 10; unknown id → 200 not_available.
- `npm run typecheck` + `npm run test:unit` green; Playwright smoke (HR_E2E=1):
  10 cards, open LR/KNN/PCA, comparison matrix, toggle a curveball, open a
  drawer from a chart click → source + provider badge + external link or
  disabled reason; mobile usable.
- Regression guard: existing HR/telemetry/RS pages, auth, runners intact; no
  unrelated migrations; no secret exposure.

## Notes

- Intake: per user decision this mega-prompt is the approved Session Brief
  (CLAUDE.md ADO intake skipped for this feature).
- Databricks/MLflow links are config-ready only (stub); GCP is the real
  materialized provider.

## Feature Store stack status (2026-06-16)

Stacked PRs on the ML Algorithm Lab: A1 engine (#206) → A2 API+swap (#209) →
A3 Feature Foundry (#210) → B1 schema+materializer (#213) → B2 FRED (#215) →
**B3 Census (this)**. B3 adds the public Census housing connector
(`housing_starts_saar` → canonical slot; `housing_permits_saar` → auxiliary,
`quant_slot=None`). Fixtures-only tests, dry-run-by-default ingest, no live
infra exercised. Next: B4 VIX (`vix_term` nullable), then FOMC text, DefiLlama;
then B7 infra manifests; then C gated `episode_embeddings` backfill.

## Feature Store stack — B4 VIX (2026-06-16)

B4 adds the VIX connector: `vix_spot` (FRED VIXCLS) → canonical slot;
`vix_term_structure` is a canonical slot reported **unavailable**
(`term_structure_source_not_configured`) — never fabricated from spot; MOVE omitted
(no confirmed source). Fixtures-only tests, dry-run-by-default ingest, no schema
change, no `episode_embeddings`. Stack: A1 #206 → A2 #209 → A3 #210 → B1 #213 →
B2 #215 → B3 #216 → **B4 (this)**. Next: B5 FOMC text (fetch/normalize text only;
embeddings deferred to a separate materializer step).

## Feature Store stack — B5 FOMC text (2026-06-16)

B5 adds the FOMC text connector: `fomc_statement` → `fomc_statement_text` (text in
silver provenance, `value` NULL, no schema change); `fomc_minutes` reported
unavailable (`minutes_source_not_configured`). TEXT ONLY — no embeddings, LLM,
summarization, or classification; embedding deferred to a separate materializer
(`embedding_materializer_not_configured`). Fixtures-only tests, dry-run-by-default
ingest, no `episode_embeddings`. Stack: A1 #206 → A2 #209 → A3 #210 → B1 #213 →
B2 #215 → B3 #216 → B4 #219 → **B5 (this)**. Next: B6 DefiLlama stablecoins
(public/keyless, liquidity proxies only).

## Feature Store stack — B6 DefiLlama (2026-06-16)

B6 adds the public/keyless DefiLlama stablecoin connector: `stablecoin_supply_usd`
(daily total supply) + `stablecoin_supply_growth_7d`/`_30d` (computed from observed
history; insufficient → `defillama_growth_window_insufficient`). All outputs are
auxiliary (`quant_slot=None`) — stablecoin supply is a crypto-liquidity PROXY, not
market liquidity; no fragmentation/CB/regime claims. Fixtures-only tests,
dry-run-by-default ingest, no schema change, no `episode_embeddings`. Stack: A1 #206
→ A2 #209 → A3 #210 → B1 #213 → B2 #215 → B3 #216 → B4 #219 → B5 #221 → **B6 (this)**.
The 5 first-pass connectors (FRED/Census/VIX/FOMC/DefiLlama) are now complete.
Next: B7 infra manifests only (k8s base + gke-prod overlay + Confluent topics +
BigQuery sink wiring; no connector logic).

## Feature Store stack — B7 infra manifests (2026-06-17)

B7 authors the feature-store k8s lane (mirroring history-rhymes-polymarket):
base (ns/sa/configmap/ingest+materializer Deployments at replicas 0/kustomization)
+ gke-prod overlay (SecretProviderClass = database-url + fred-api-key only; WI
sa-patch; config-patch; README). Topic constants
winston.hr.feature_store.{readings,pipeline_status,materialized}.v1 added to
events/topics.py + listed in EVENT_SINK_TOPICS (config-only sink routing, BQ off).
DEFAULT-OFF (FS_*_ENABLED=false AND replicas 0); kustomize build validated; no live
deploy/apply, no connector logic, no schema change, no episode_embeddings. Worker
entrypoints + FRED run_ingest harmonization are a runtime follow-up. Stack: A1 #206
→ A2 #209 → A3 #210 → B1 #213 → B2 #215 → B3 #216 → B4 #219 → B5 #221 → B6 #224 →
**B7 (this)**. Next: C1 gated episode_embeddings backfill (plan/dry-run only).

## Feature Store stack — C1 gated embedding backfill, dry-run only (2026-06-18)

C1 adds the dry-run-first gated planner that promotes vetted
`hr_history_rhymes_model_observations` into `episode_embeddings`:
`embedding_backfill.py` (planner + gated executor + fail-soft DB repo + C2 mapping
proposal), `backfill_gates.py` (Brier<0.22, permutation p<0.05, version bump,
256-dim, source_quality=live, non-overwrite, 2:1 non-event coverage),
`backfill_audit.py` (deterministic no-lookahead), the
`scripts/history_rhymes/episode_embeddings_backfill.py` CLI (dry-run default;
write behind `--write --confirm --model-version --calibration-evidence` + all
gates), fixtures, fixture-only tests, and `docs/history-rhymes/episode-embeddings-backfill.md`.
**No writes by default; no production mutation; no schema change.** Verified schema
gap: `episode_embeddings` is keyed by `episode_id` (FK→episodes), gold rows have no
`episode_id` → the live DB repo blocks on `episode_mapping_unresolved` and proposes
C2 (read-only adapter OR a new fs-keyed embedding table). Stack: A1 #206 → A2 #209
→ A3 #210 → B1 #213 → B2 #215 → B3 #216 → B4 #219 → B5 #221 → B6 #224 → B7 #230 →
**C1 (this)**. Next: C2 — only after C1, either the schema/adapter mapping work or
calibration-evidence plumbing.

## Feature Store stack — C2-B observation embedding target (2026-06-18)

C2-B resolves the C1-discovered mapping gap WITHOUT touching `episode_embeddings`
or forcing observations into the episode library. New additive migration
`10020_history_rhymes_observation_embeddings.sql` creates
`hr_feature_store_observation_embeddings` (keyed by
`(observation_id, model_obs_version, embedding_model_version)`, vector(256) +
HNSW, source_quality/readiness CHECKs, verification DO block, COMMENTs explaining
the deliberate separation). The C1 planner gains a `target`:
`observation_embeddings` (default; no episode mapping; requires
`--embedding-model-version`) vs `episode_embeddings` (historical library; still
blocks on `episode_mapping_unresolved`). CLI adds `--target` +
`--embedding-model-version`. All C1 gates still apply; dry-run remains default;
writes stay behind `--write --confirm` + all gates; append-only by encoder
version (no in-place overwrite). Fixture/fake-repo tests only. Stack: A1 #206 →
A2 #209 → A3 #210 → B1 #213 → B2 #215 → B3 #216 → B4 #219 → B5 #221 → B6 #224 →
B7 #230 → C1 #234 → **C2-B (this)**. Next: C3 — observation→episode promotion
workflow DESIGN only (reviewed candidate creation, non-event labeling,
calibration receipt attachment, explicit human approval).

## Feature Store stack — C3 observation→episode promotion (DESIGN ONLY, 2026-06-18)

C3 is a docs/design PR (no code, no schema, no migration, no API/UI, no backfill,
`episode_embeddings` untouched). New design doc
`docs/history-rhymes/observation-to-episode-promotion.md` specifies the
human-reviewed promotion path: model observation (+ C2-B observation embedding) →
reviewed candidate → human-approved candidate → `episodes` row → `episode_embeddings`
row → immutable receipt. Defines the 10 stages (discovery → review packet →
non-event/crisis labeling → evidence → calibration receipt → no-lookahead audit →
human approval → episode creation → episode embedding → post-promotion receipt),
the review-packet contract, the `draft→needs_evidence→needs_review→approved/
rejected/superseded→promoted` status machine, exclusion rules, the faithful
`episodes` field mapping (verified against `434_history_rhymes_wss.sql`) + the
documented NOT-NULL and metadata gaps, and three storage options
(A=`hr_episode_promotion_candidates` table, B=receipt-only, C=reuse Winston
work-item/audit). **Recommendation: Option A eventually, but implement only in C4
after this design is approved — agree the gate before building the table.**
Non-event discipline (`>=2.0` ratio, block or audited override) and the C1
no-lookahead guard are preserved; the `_search_analogs` retrieval contract is the
regression guard. Stack: … B7 #230 → C1 #234 → C2-B #236 → **C3 (this)**. Next: C4
— implement the chosen promotion-candidate storage/receipt contract (no automatic
`episode_embeddings` writes), only after C3 approval.

## Feature Store stack — C4 promotion-candidate storage + receipt (2026-06-18)

C4 implements the C3 Option-A airlock, storage only (no episode creation, no
`episode_embeddings` write, no UI, no auto-promotion, no LLM). Additive migration
`10021_history_rhymes_episode_promotion_candidates.sql` (`hr_episode_promotion_candidates`
with status/type/label/source_quality/readiness CHECKs, the design indexes,
gate-field COMMENTs, verification DO block; `episodes`/`episode_embeddings`
untouched). `promotion_candidates.py` = repo protocol + fail-soft DB repo + service
ops + status machine + evidence gate + non-event guard (ratio ≥2.0 or audited
override). `promotion_receipts.py` = deterministic `stable_hash` + immutable
`build_receipt`/`append_receipt` (prior receipt → `receipt_history`, version bump).
`record_promoted_episode_link` only links an episode created elsewhere. 25 new
tests (fake repo, no DB/network); 243 feature-store+ML-demo tests green. Stack: …
C1 #234 → C2-B #236 → C3 #237 → **C4 (this)**. Next: C5 — promotion review API /
internal admin surface DESIGN only (still no automatic episode creation or
`episode_embeddings` write).

## Feature Store stack — C5 promotion review surface (DESIGN ONLY, 2026-06-18)

C5 is a docs/design PR (no code, no API, no UI, no schema, no episode creation, no
`episode_embeddings` write, no LLM). New design doc
`docs/history-rhymes/promotion-review-surface.md` specifies how an internal admin
reviewer operates the C4 airlock: 8 surface areas (candidate queue · detail/review
packet · evidence gate panel · non-event coverage panel · no-lookahead audit panel ·
approval action bar · receipt history panel · promoted-episode link panel), each with
purpose/data/empty/blocked/allowed/forbidden/audit. Maps 1:1 onto the C4 service
functions (the surface adds no authority); preserves the status machine and the exact
C4 blocked reasons (HTTP 409 `{status, blocked_reasons[], candidate_id, current_status,
allowed_actions[]}`). Recommends the `/api/hr/v1/promotion-candidates*` route family
(per-route request/response/auth/side-effects), a `promotions` `HrSubNav` tab +
component boundaries, the `admin_prompt_receipts.py` admin gate
(`require_authenticated_request` + `x-bm-platform-admin`, actor from `x-bm-actor`),
and audit-in-receipt for now (platform `ai_decision_audit_log` needs a CHECK migration
→ deferred C7). Regression guard: `_search_analogs` + Feature Foundry stay read-only
wrt promotion. Stack: … C2-B #236 → C3 #237 → C4 #240 → **C5 (this)**. Next: C6 —
implement the protected promotion-candidate API only (no UI, no episode creation, no
`episode_embeddings` write).

## Feature Store stack — C6 protected promotion API (2026-06-18)

C6 implements the C5-designed route layer (API only — no UI, no schema, no episode
creation, no `episode_embeddings` write, no LLM, no audit-table migration).
`backend/app/routes/hr_promotion_candidates.py` mounts
`/api/hr/v1/promotion-candidates` (9 routes: list/get + needs-evidence/needs-review/
approve/reject/supersede/link-promoted-episode + create), admin-gated
(`require_authenticated_request` + `x-bm-platform-admin`, actor from `x-bm-actor`),
delegating every transition to the C4 service and surfacing `PromotionCandidateError`
as HTTP 409 with the exact `{status, blocked_reasons[], candidate_id, current_status,
allowed_actions[]}` envelope. Added two minimal C4 helpers (`mark_needs_evidence`,
`allowed_actions`) — no schema change, rules preserved — and registered the router in
`main.py`. `link-promoted-episode` only links an externally-created episode id. 18 new
API tests (TestClient + fake repo, no DB/network); 261 HR feature-store + ML-demo +
API tests green. Stack: … C3 #237 → C4 #240 → C5 #242 → **C6 (this)**. Next: C7 —
internal promotion review UI, calling only the C6 API (still no episode creation or
`episode_embeddings` write).

## Feature Store stack — C7 promotion review UI (2026-06-18)

C7 implements the C5-designed reviewer surface (UI only — no schema, no backend
route change, no episode creation, no `episode_embeddings` write, no LLM). New
route `…/historyrhymes/promotions/page.tsx` + a `Promotions` `HrSubNav` tab; typed
client `repo-b/src/lib/historyrhymes/promotions.ts` calling only the C6
`/api/hr/v1/promotion-candidates*` routes with exact 409 blocked-reason parsing; and
8 components under `components/historyrhymes/promotions/` (queue, detail/review
packet, evidence gate, non-event coverage, no-lookahead audit, action bar, receipt
history, promoted-episode link). Action buttons gate on `allowed_actions`; approve is
disabled on a no-lookahead failure (non-overridable); link only records an
externally-created episode id. 20 frontend tests (5 client + 13 panel + 2 nav);
typecheck clean for C7 files (one pre-existing unrelated repe/assets error); backend
C4/C6 suites unchanged. Stack: … C4 #240 → C5 #242 → C6 #246 → **C7 (this)**. Next:
C8 — either the platform audit-table integration migration for promotion actions, or
the external episode-creation/linking workflow design, depending on which gap is more
urgent.

## Feature Store stack — C8-A promotion audit integration (2026-06-18)

C8-A wires C6 promotion-candidate actions into the platform audit log (no episode
creation, no `episode_embeddings` write, no UI, no LLM). Migration
`10022_history_rhymes_promotion_audit_type.sql` controlled-widens the inline
`ai_decision_audit_log.decision_type` CHECK (discover-by-definition → drop → re-add
with all 4 legacy values + `history_rhymes_promotion_candidate_action`; verify
block). `promotion_audit.py` builds a safe-metadata payload (stable
`request_payload_hash`/`candidate_receipt_hash`) and writes best-effort via
`governance.record_decision` (sentinel business_id for the single-tenant hr_
domain). C6 routes audit every state-changing action — success AND blocked — adding
an additive `audit_status` to both envelopes; audit-write failure surfaces
`audit_status="failed"` and never hides/reverses the service result. The audit layer
adds no authority. 13 new tests (fake writer/repo, no DB/network); 274 HR
feature-store + ML-demo + promotion API/audit tests green; C7 client unaffected.
Stack: … C5 #242 → C6 #246 → C7 #249 → **C8-A (this)**. Next: C9 — external episode
creation/linking workflow design (how an approved candidate becomes a real
`episodes` row and only then an `episode_embeddings` row, still human-gated +
append-only).

## Feature Store stack — C9 approved-candidate→episode workflow (DESIGN ONLY, 2026-06-18)

C9 is a docs/design PR (no code, no schema, no API, no UI, no episode creation, no
`episode_embeddings` write, no LLM). New design doc
`docs/history-rhymes/approved-candidate-to-episode-workflow.md` specifies the final
human-gated path: eligible approved candidate → human-authored episode draft →
required-field validation → `episodes` insert (`source='promotion'`) → embedding
plan → `episode_embeddings` insert (append-only, `full_state`, vector(256)) → C4
`record_promoted_episode_link` seal → receipt + C8-A audit → retrieval regression
check (10 stages, each with purpose/inputs/outputs/required/failure/actor/audit/
rollback). Verified the real `episodes` NOT NULL set (`name`/`asset_class`/
`start_date`/`macro_conditions_entering`/`catalyst_trigger`/`timeline_narrative`) →
human-authored, no placeholders; `episode_embeddings` already versions via
`UNIQUE(episode_id, embedding_type, model_version)` (no schema change). Documented
gap: `episodes` has no origin/candidate_id column → keep origin in receipt + audit,
propose schema ticket C11. Recommends transaction Option C (episode now, embedding
async with honest searchability state) or Option A if immediate analog use is
required; never Option B. Stack: … C6 #246 → C7 #249 → C8-A #251 → **C9 (this)**.
Next: C10 — implement the approved-candidate episode-creation API only (no
`episode_embeddings` write; embedding creation a separate explicit step).

## Feature Store stack — C10 episode-creation API (2026-06-18)

C10 implements C9 stages 1-5+9 (validate + create the `episodes` row), API only:
no embedding, no seal, no searchability, no schema change.
`episode_creation.py` = eligibility (approved + actor + receipt + carried C4
evidence gate) + required-field validation (verified NOT NULL set, placeholder
rejection, exact `missing_<field>` reasons) + `build_episode_preview` (candidate
`proposed_*` defaults under the reviewer payload; `source='promotion'`) + one
append-only `episodes` insert via `DbEpisodeRepository`. Two protected routes in the
C6 file: `validate-episode` (no write) and `create-episode` (admin + actor +
`confirm:true`), 409 with exact reasons, success
`{status:"created", episode_id, searchable:false, embedding_status:"not_created",
next_required_step:"create_episode_embedding"}`, both C8-A-audited. Never writes
embeddings, seals, calls an encoder/LLM, or changes candidate status; origin stays
in audit/response (episodes origin column deferred to C11). 28 new tests
(TestClient + fake episode repo + fake audit writer, no DB/network); 302 HR
feature-store + ML-demo + promotion API/audit/episode tests green. Stack: … C7 #249
→ C8-A #251 → C9 #256 → **C10 (this)**. Next: C11 (additive episodes origin column)
or C12 (explicit episode-embedding creation + C4 seal).

## Feature Store stack — C11 episodes promotion-origin columns (2026-06-19)

C11 adds additive migration `10023_history_rhymes_episode_origin.sql`: nullable
`origin_candidate_id`/`origin_observation_id`/`origin_model_obs_version`/
`origin_embedding_model_version`/`origin_receipt_hash`/`origin_metadata_json` on
`episodes` (no backfill, COMMENTs, verify block; `episode_embeddings` untouched).
C10's `episode_creation` now attaches origin via `build_origin_fields` and the DB
repo fails soft (retries without origin cols if 10023 isn't applied). C10 behavior
preserved (`searchable:false`). 7 new tests; 35 C10+C11 green. Stack: … C9 #256 →
C10 #257 → **C11 (this)**. Next: C12 explicit episode-embedding creation API.
