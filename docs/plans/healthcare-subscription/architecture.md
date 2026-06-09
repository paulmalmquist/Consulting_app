# Architecture — Healthcare Subscription Analytics

## Serving model

Gold-rollup-first. The five `hha_*` tables are the serving layer; the dashboard reads
them through FastAPI. This mirrors the medallion thinking in `Hone_work/` (bronze →
silver → gold → consumption) but ships only the gold layer in Phase 1.

```
hha_* gold rollups (Postgres, RLS by env_id)
  → backend/app/services/hha.py (set_config('app.env_id') + WHERE env_id)
    → backend/app/routes/hha.py (/api/hha/v1/health, /overview, /funnel, /cohorts, /operations)
      → same-origin /bos proxy
        → repo-b/src/lib/healthcare-subscription/client.ts
          → standalone HHA client surfaces (no app shell)
```

## Tables (`repo-b/db/schema/10013_hha_healthcare_subscription_core.sql`)

| Table | Grain | Purpose |
|---|---|---|
| `hha_overview_metrics` | (env_id, as_of_date) | Exec KPI strip + freshness/provenance |
| `hha_plans` | (env_id, plan_key) | Membership plan dimension |
| `hha_funnel_metrics` | (env_id, as_of_date, stage, channel) | Acquisition funnel |
| `hha_cohort_metrics` | (env_id, cohort_month, months_since, channel) | Retention/LTV + small-cell suppression |
| `hha_operational_metrics` | (env_id, as_of_date, ops_domain) | Care-ops SLAs |

Every table: `env_id TEXT NOT NULL`, `business_id UUID NOT NULL`, RLS enabled with a
tenant-isolation policy on `current_setting('app.env_id', true)`, `COMMENT ON TABLE`, and
an `(env_id, …)` index. Money is integer minor units (cents); the service casts to decimal
dollars at the edge. Rates are stored as `[0,1]` fractions and formatted client-side.

## Tenancy

- Scope key is `env_id` (globally unique per environment). Reads filter by `env_id` and
  issue `set_config('app.env_id', …, true)` for RLS — defense in depth under either RLS regime.
- `business_id` is required by the prefix contract but the v2 pipeline does not assign one
  to fresh demo envs, so the seed pack synthesizes it deterministically via
  `uuid5(ns, f"{env_id}:hha:business")`.

## Provisioning

Real env via the v2 pipeline. The `healthcare_subscription` template row (added in the
10013 migration) points `default_home_route` at `/lab/env/{env_id}/healthcare-subscription`
and `default_seed_pack` at `hha_starter`. `POST /v2/environments` runs validate → derive →
create rows → seed (`hha_starter`) → health check; the seed writes the gold rollups scoped
to the generated `env_id`.

## Seeded vs derived (be honest)

Phase 1 and Phase 2 rollups are **seeded**, not derived from events. The footer says so
(`provenance_label = "synthetic gold rollup (seeded) · hha_starter v1"`). Phase 3 adds the
event-level grain and makes the rollups derived. Until then, do not present the numbers as
pipeline output.

## Standalone design

The environment owns its full chrome and is **not** wrapped in `DomainWorkspaceShell` /
`RepeWorkspaceShell` / any shared app shell. Each `page.tsx` is a thin async wrapper that
renders its client component; the client owns its background, header, content, drawer,
navigation, and footer. `LabEnvTopBar` remains above the full-bleed route. See
[design-adaptation.md](design-adaptation.md).

## Phase 2 serving rules

- Every read issues `set_config('app.env_id', env_id, true)` and explicitly filters by
  `env_id`.
- Money converts from minor units to dollars only in the service; rates remain fractions.
- Each response carries environment ID, as-of date, freshness, provenance, disclaimer,
  synthetic/PHI flags, and metric definitions.
- Suppressed cohort records are selected separately using only cohort month and channel.
  Counts, retention, revenue, and LTV never enter the masked service payload.
- Browser clients always use the same-origin `/bos` proxy. Do not reintroduce a direct
  backend-origin `NEXT_PUBLIC_API_BASE` path for HHA.

## Needs repo verification

- v2 provisioning was exercised against the live Supabase project during HHA-1 — see
  `release-readiness.md` for the recorded result before treating the live env as a given.
