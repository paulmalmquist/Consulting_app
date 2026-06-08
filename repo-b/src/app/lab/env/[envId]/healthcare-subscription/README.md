# Healthcare Subscription Analytics — environment route

SYNTHETIC / NO-PHI. Standalone Winston lab environment (no app shell).

## Route map
- `/lab/env/{env_id}/healthcare-subscription` — Exec Overview (shipped).
- `funnel` / `cohorts` / `operations` / `copilot` / `governance` — reserved (Phase 2+).

## Data contract (Phase 1)
- `GET /api/hha/v1/health?env_id=…` → `{ ok, row_counts, source_freshness_at, provenance_label }`
- `GET /api/hha/v1/overview?env_id=…` → `{ as_of_date, source_freshness_at, provenance_label, disclaimer, kpis[] }`
  where each KPI is `{ key, label, value, unit, fmt, definition{ formula, grain, owner, source } }`.

Backed by `backend/app/routes/hha.py` → `backend/app/services/hha.py` → the `hha_*` tables in
`repo-b/db/schema/10013_hha_healthcare_subscription_core.sql`. Money is decimal dollars at the
API edge (integer minor units in the DB); rates are `[0,1]` fractions formatted client-side.

## Design
Standalone, teal health-tech, dark. The page renders `<OverviewClient envId>` directly — no
workspace shell. See `docs/plans/healthcare-subscription/design-adaptation.md`.

See `PROOF.md` for evidence and `DEMO.md` for the click-through.
