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
