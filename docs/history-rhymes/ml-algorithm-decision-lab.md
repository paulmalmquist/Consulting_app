# ML Algorithm Decision Lab

A hands-on model-selection cockpit inside History Rhymes. Ten classic ML
algorithms trained deterministically on synthetic HR-flavored market-signal
data, so a viewer learns **which model fits this data / constraint / business
goal** — not "which is most advanced."

- **Route:** `/lab/env/[envId]/historyrhymes/ml-algorithms`
- **API:** `/api/hr/v1/ml-demo/*` (single-tenant; deterministic; fail-closed)
- **Data:** in-memory synthetic, seed 42, ~240 rows (no DB). Optionally
  materialized to BigQuery/GCS so cloud detail links resolve.

## Algorithms

Linear Regression, Logistic Regression, Decision Tree, Random Forest, SVM, KNN,
Naive Bayes, K-Means, Hierarchical Clustering, PCA — mapped to four task
families (regression, classification, text classification, clustering, dim
reduction) over one shared dataset.

## Reality Mode (Curveball Engine)

15 toggles that mutate the same dataset to expose each model's weaknesses:
regime shift, stale features, informative missingness, class imbalance,
cost-of-error, label delay, data leakage, near-duplicate/episode leakage,
conflicting signals, outlier shock, non-event analogs, adversarial narrative,
distribution drift, human-override policy, latency budget. Clean mode makes
models look reasonable; Reality mode makes the tradeoffs obvious.

## Drilldowns & cloud lineage

Charts and tables are clickable → `MLDetailDrawer` → source / feature / model /
metric / lineage. Cloud links use a provider abstraction (`gcp | databricks |
none`) and never fabricate a URL: when unconfigured, links are disabled with a
reason but a copyable identifier is always shown. GCP is the real materialized
provider (see `scripts/ml_demo_materialize.py`); Databricks is config-ready.

## Endpoints

`GET /overview · /dataset · /algorithms · /algorithms/{id} · /compare ·
/curveballs · /cloud-config` and `POST /run`. Each algorithm returns a flat
envelope with `status`, `metrics`, `charts`, `model_card`, `evidence`,
`external_links`, `lineage`, and (under a scenario) a `reality` overlay.

## Tests

- Backend: `cd backend && pytest tests/test_hr_ml_demo_*.py`
- Frontend: `npm run typecheck`, `npx vitest run src/components/historyrhymes/`,
  `npm run test:e2e` (deep checks gated behind `HR_E2E=1`).

See the implementation plan at
`docs/plans/03-implementation-plans/active/history-rhymes-ml-algorithm-decision-lab.md`.
