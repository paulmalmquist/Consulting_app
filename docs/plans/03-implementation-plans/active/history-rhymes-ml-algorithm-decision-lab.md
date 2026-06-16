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
