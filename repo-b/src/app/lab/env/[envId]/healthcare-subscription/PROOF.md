# PROOF — Healthcare Subscription Analytics (HHA-1)

Evidence for the Exec Overview vertical slice. SYNTHETIC / NO-PHI.

## Schema / table inventory
`repo-b/db/schema/10013_hha_healthcare_subscription_core.sql` (10012 was taken by telemetry on origin/main; renumbered to 10013 pre-commit — DDL unchanged, already applied to prod).

| Table | Grain | RLS |
|---|---|---|
| `hha_overview_metrics` | (env_id, as_of_date) | enabled + tenant-isolation policy |
| `hha_plans` | (env_id, plan_key) | enabled + tenant-isolation policy |
| `hha_funnel_metrics` | (env_id, as_of_date, stage, channel) | enabled + tenant-isolation policy |
| `hha_cohort_metrics` | (env_id, cohort_month, months_since, channel) | enabled + tenant-isolation policy |
| `hha_operational_metrics` | (env_id, as_of_date, ops_domain) | enabled + tenant-isolation policy |

All five: `env_id TEXT NOT NULL`, `business_id UUID NOT NULL`, `COMMENT ON TABLE`, `(env_id,…)` index,
money as integer minor units. Plus a `healthcare_subscription` row in `app.environment_templates`
(home route `/lab/env/{env_id}/healthcare-subscription`, seed pack `hha_starter`).

## Synthetic seed (deterministic, idempotent)
`backend/app/services/environment_seed_packs_v2/hha_starter.py`. Fixed as-of `2026-05-31`,
`uuid5` keys, `ON CONFLICT DO NOTHING`. Approx row counts per env:
- `hha_plans`: 4 · `hha_overview_metrics`: 1 · `hha_funnel_metrics`: 24 (6 blended + 3 channels × 6)
- `hha_cohort_metrics`: 79 (12-cohort triangle + 1 suppressed pilot) · `hha_operational_metrics`: 4
- `business_id` synthesized deterministically from `env_id` (v2 leaves it unset for demo envs).
- One cohort (women's pilot, size 8) carries `is_suppressed = true`.

## Sample metric outputs (from seed)
active_members 4,250 · MRR $501,500 · ARR $6,018,000 · ARPU $118 · NRR 111.2% · GRR 95.9% ·
net churn −1.2% · trial→paid 62% · activation 71% · month-3 retention 78% · LTV $2,640 ·
blended CAC $310 · LTV:CAC 8.5× · payback 8.6 mo · lab SLA 93% · consult SLA 88%.

## API
`backend/app/routes/hha.py` — `GET /api/hha/v1/health`, `GET /api/hha/v1/overview` (env_id query param,
read-only). Money cast to decimal dollars at the edge; rates as `[0,1]` fractions.

## Tests
`pytest --noconftest backend/tests/test_hha.py` → **6 passed** (2026-06-08): KPI build + money cast +
`set_config('app.env_id')` scope; empty-state; health row counts; seed determinism + suppression + integer
money; seed-SQL no-PHI scan; schema no-PHI scan + full RLS.

## Typecheck
`npm run typecheck` (repo-b) → **exit 0** (2026-06-08).

## UI
Standalone Exec Overview (no app shell): KPI grid, non-dismissible NO-PHI banner,
metric-definition drawer, freshness/provenance footer. `repo-b/src/components/healthcare-subscription/OverviewClient.tsx`.

## Live provisioning + smoke (2026-06-08, Supabase `ozboonlsplroialdwuxj`)

- **Migration applied** via `supabase db query --linked`. Confirmed all 5 `hha_*` tables exist
  with `rowsecurity = true`, and the `healthcare_subscription` template row registered
  (home route `/lab/env/{env_id}/healthcare-subscription`, seed pack `hha_starter`).
- **Provisioned via the real v2 pipeline** (`environment_pipeline_v2.create_environment_v2`,
  dry_run → apply): stages `validate ok`, `create_rows ok`, `run_seed_pack ok`, `health_check ok`.
  `app.environments.lifecycle_state = verified`, `seed_pack_applied = hha_starter` v1.
  - **Provisioned `env_id`: `ceeb9ea0-9f8b-4369-b853-adcd60c01def`**
- **Seed rows (read back under RLS scope):** overview 1 · plans 4 · funnel 24 · cohorts 79 ·
  operations 4 · **1 suppressed cohort** (size 8 < 11). MRR 50,150,000 minor ($501,500),
  NRR 1.112, provenance `synthetic gold rollup (seeded) · hha_starter v1`.
- **API path proven** by calling the service against the live DB:
  `get_health` → ok, counts as above; `get_overview` → 18 KPIs, money cast to dollars
  (mrr 501500.0), as_of 2026-05-31, disclaimer present.
- **`db:verify`** (repo-b) → exit 0. **`pytest`** → 6 passed. **`typecheck`** → exit 0.

### Fail-closed note
The pipeline's own `health_check` passed (lifecycle = `verified`). The separate
`/v2/environments/{id}/verify` contract-verifier could not run because `app.environment_contract`
(migration `10004`) is not present in this database — a pre-existing tooling gap unrelated to hha,
not a provisioning failure. Env creation + seed + the pipeline health check all succeeded.

### Not done (by design)
- No frontend deploy. The standalone page is typecheck-clean and reads the proven API; a live
  browser screenshot requires the frontend deployed (or `npm run dev`). Auto-deploy-on-merge to
  `main` would publish it — flagged for go-ahead before any merge.

## Caveats
- Phase 1 rollups are **seeded**, not derived (footer + provenance label say so).
- No deploy in HHA-1.
