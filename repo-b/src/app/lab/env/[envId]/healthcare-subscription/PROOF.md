# PROOF — Healthcare Subscription Analytics (HHA-1 + HHA-2)

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

## Live production verification (2026-06-08 merge, 2026-06-09 re-smoke)

PR #130 merged to `main` (commit `21f55939`); branch deleted.

- **Frontend (Vercel `consulting-app`):** auto-deployed from `main` → deployment `consulting-bfan2f6fa` (Ready); **novendor.ai** production alias points to it.
- **Backend (Railway `authentic-sparkle`):** deployed from a clean git worktree at the merge commit (no WIP). Live `GET /version` → `21f55939111786fadd624bb667197aabd70578b6`.
- **`GET /api/hha/v1/health?env_id=ceeb9ea0-…`** → `ok:true`, row_counts {overview 1, plans 4, funnel 24, cohorts 79, ops 4}, `synthetic:true`, `phi:false`, provenance `synthetic gold rollup (seeded) · hha_starter v1`.
- **`GET /api/hha/v1/overview?env_id=ceeb9ea0-…`** → **18 KPIs**, `as_of_date 2026-05-31`, money cast to dollars (mrr 501500.0), `phi:false`, disclaimer present.
- **Routes shipped (prod):** `/login` 200; `/lab/env/ceeb9ea0-…/healthcare-subscription` and `/lab/env/…/telemetry` → 307 (auth gate, not 404).
- **Telemetry regression:** `/api/telemetry/health` 200; `/api/telemetry/replay` `first_model_fire_t = 728` (unchanged).

### Logged-in visual verification (2026-06-09) — PASS, after fixing two defects

The first logged-in capture (Playwright, `info@novendor.ai`) **caught two production defects** that
HTTP/code-level checks had missed:
1. **Not standalone** — the page was wrapped in `LabEnvironmentShell` (breadcrumb, WORKSPACE SWITCH,
   OPERATIONS FUNCTIONS sidebar). Root cause: the route was missing from the shell's `isDomainRoute`
   full-bleed allowlist.
2. **KPI data 404** — `Overview data is not available`: the client used an empty `NEXT_PUBLIC_API_BASE`
   → same-origin `/api/hha/v1/overview` (404). The backend route is live; the frontend just wasn't
   reaching it.

**Fixed in PR #134** (`fix/hha-standalone-shell-and-bos-proxy`, merged → commit `a51fcabb`): added
`healthcare-subscription` to `LabEnvironmentShell` `isDomainRoute` (full-bleed, like telemetry) and
defaulted the client API base to the same-origin `/bos` proxy.

**Re-capture after deploy → all visual checks PASS:**
- **Standalone** — no `LabEnvironmentShell` chrome (sidebar/toolbar/dept gone). Only the shared
  `LabEnvTopBar` remains, which every lab env (incl. telemetry, the standalone reference) carries.
- Neutral title "Healthcare Subscription Analytics"; no "Hone Health" branding.
- Non-dismissible **NO-PHI banner** ("Synthetic demo · no PHI…").
- **18 KPI cards with live values** — Active Members 4,250 · MRR $502K · ARR $6.0M · ARPU $118 ·
  NRR 111.2% · GRR 95.9% · gross churn 4.1% · net churn −1.2% · trial→paid 62% · activation 71% ·
  month-3 retention 78% · LTV $2,640 · CAC $310 · LTV:CAC 8.5× · payback 8.6mo · lab SLA 93% · consult SLA 88%.
- **Metric-definition drawer** — e.g. Active Members → formula `count(distinct members with an active
  paid subscription on as_of_date)`, grain `as_of_date`, owner Growth, source `hha_overview_metrics`.
- **Provenance footer** — "as of 2026-05-31 · refreshed 5/31/2026 … synthetic gold rollup (seeded) · hha_starter v1".
- No PHI anywhere on screen.

Screenshots: `screenshots/hha_exec_overview_live.png`, `screenshots/hha_metric_drawer_live.png`.

## HHA-2 review evidence (2026-06-09)

**State:** IN REVIEW. NOT SHIPPED. NOT DEPLOYED.

### API and service behavior

- Added read-only `/api/hha/v1/funnel`, `/cohorts`, and `/operations`.
- Each service read issues `set_config('app.env_id', ..., true)`, filters by `env_id`,
  selects the latest applicable date, and returns response metadata/definitions.
- Funnel production-data read: as-of `2026-05-31`; six ordered blended stages; three
  channels with CAC `$420`, `$90`, and `$180`.
- Cohort production-data read: 78 visible `all` cells plus one marker:
  `{signup_cohort_month: "2026-05-01", channel: "womens_pilot", masked: true,
  reason: "< 11 members - suppressed"}`.
- The suppressed query selects only `signup_cohort_month` and `acquisition_channel`.
  The masked JSON contains no cohort size, retained count, retention rate, revenue, or LTV.
- Channel LTV:CAC returns an empty collection and the reason:
  `Channel-specific LTV is not seeded; only blended LTV and channel CAC are available.`
- Operations production-data read is ordered labs, consults, fulfillment, support.
  `over_sla` is false, true, false, true respectively.

### Verification

- `cd backend && python -m pytest --noconftest tests/test_hha.py -q`
  → **9 passed**.
- `cd repo-b && npm run typecheck` → **exit 0**.
- Schema verifier with the existing `DATABASE_URL`
  → **207 passed, 0 failed**.
- Local same-origin `/bos/api/hha/v1/cohorts` → **HTTP 200** with the masked marker
  and no suppressed numeric values.
- Authenticated local Playwright verification of Overview, Funnel, Cohorts, and
  Operations → **PASS**:
  - no `LabEnvironmentShell` sidebar/chrome;
  - shared `LabEnvTopBar`, NO-PHI banner, navigation, drawers, and provenance footer;
  - no console errors, failed requests, or document/fetch/XHR responses >=400;
  - masked cohort values absent from DOM and payload.

Screenshots:
- `screenshots/hha2-overview.png`
- `screenshots/hha2-funnel.png`
- `screenshots/hha2-cohorts.png`
- `screenshots/hha2-operations.png`

### Delivery boundary

- Branch: `codex/hha-phase-2-surfaces`.
- Draft PR: https://github.com/paulmalmquist/Consulting_app/pull/136
- No merge or deployment is authorized.
- Production Phase 2 API endpoints remain 404 until an approved merge and separate
  backend deployment.

## Caveats
- Phase 1 rollups are **seeded**, not derived (footer + provenance label say so).
- HHA-2 uses those same seeded rollups and does not add schema, seeds, or provisioning.
- HHA-1 production is live; HHA-2 remains review-only.
