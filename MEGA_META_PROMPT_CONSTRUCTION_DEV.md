# MEGA META PROMPT — PREMIUM CONSTRUCTION + DEVELOPMENT UI BRIDGING PDS INTO REPE

You are working inside the Business Machine monorepo. Your task is to design and implement a polished, premium Construction / Development module that bridges PDS project-management data into REPE asset/fund modeling without breaking any existing functionality, calculations, routes, or data flows.

This is not a throwaway demo page. Build it as a durable Business Machine capability that feels coherent with the rest of the platform and extends the current architecture cleanly.

---

## REPO SAFETY CONTRACT — READ FIRST

### Existing Architecture You Must Preserve

**REPE Object Model (DO NOT MODIFY these tables or their seeders):**
- `repe_fund` / `repe_deal` / `repe_asset` / `repe_property_asset` — the core fund → deal → asset hierarchy
- `re_asset_quarter_state` → `re_jv_quarter_state` → `re_investment_quarter_state` → `re_fund_quarter_state` — quarterly rollup chain
- `re_waterfall_definition` / `re_waterfall_tier` / `re_waterfall_run` / `re_waterfall_run_result` — waterfall engine
- `repe_fund_scenario` / `re_scenario` / `re_assumption_set` / `re_assumption_override` — scenario engine
- `re_loan` / `re_loan_covenant_*` / `re_loan_watchlist_event` — debt surveillance
- `re_partner` / `re_partner_commitment` / `re_capital_ledger_entry` / `re_partner_quarter_metrics` — capital stack
- `re_model_scenarios` / `re_model_scenario_assets` / `re_scenario_overrides` — cross-fund model architecture

**Construction Finance (ALREADY EXISTS — REUSE, DO NOT DUPLICATE):**
- `fin_construction_project` (schema 248) — already has project_id FK, status, budget linkage
- `fin_budget` / `fin_budget_version` / `fin_budget_line_csi` — CSI-division cost tracking
- `fin_change_order_version` — change order with cost + schedule impact
- `fin_contract_commitment` — committed/paid tracking per contractor
- `fin_forecast_snapshot` / `fin_forecast_line` — periodic forecasting
- `fin_lien_waiver_status` — compliance tracking

**PDS Core (ALREADY EXISTS — the project management layer):**
- `pds_projects` (schema 315) — projects with stages: planning → preconstruction → procurement → construction → closeout → completed
- `pds_analytics_projects` (schema 370) — analytics layer with project_type, service_line_key, budget, fee tracking
- `pds_pipeline_deals` (schema 331) — deal pipeline with stages and probabilities
- `pds_accounts` — client accounts with governance_track (variable/dedicated), tier, industry

**Meridian Capital Management Demo (THE ANCHOR — match these assets):**
- Fund: "Institutional Growth Fund VII" (fund_id: `9b4d7c63-...f201`)
- 5 existing assets (DO NOT rename, delete, or reassign these):
  1. Aurora Residences — multifamily, Denver, CO (214 units, $27.5M value)
  2. Cedar Grove Senior Living — senior_housing, Phoenix, AZ (162 units, $21.8M value)
  3. Northgate Student Commons — student_housing, Austin, TX (311 units, $24.1M value)
  4. Meridian Medical Pavilion — MOB, Nashville, TN ($30.9M value)
  5. Foundry Logistics Center — industrial, Columbus, OH ($28.4M value)
- env_id: `9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f101`
- Seed file: `fixtures/winston_demo/meridian_demo_seed.json`
- Seeder: `backend/scripts/backfill_meridian_re_seed.py`, `backend/app/services/re_fi_seed_v2.py`

**Existing Backend Services (DO NOT REPLACE — extend or compose):**
- `backend/app/services/re_fund_metrics.py` — fund metric calculations
- `backend/app/services/re_valuation.py` — valuation engine
- `backend/app/services/re_waterfall*.py` — waterfall runtime
- `backend/app/services/re_scenario*.py` — scenario engine
- `backend/app/services/re_fund_aggregation.py` — fund aggregation
- `backend/app/services/finance_repe.py` — core REPE financial operations

**Existing Frontend (DO NOT BREAK):**
- `/app/lab/env/[envId]/re/` — full REPE workspace (funds, deals, assets, models, waterfalls, capital)
- Components in `repo-b/src/components/repe/` — asset cockpit, scenario builder, waterfall, etc.
- `ReEnvProvider` context — REPE environment resolution
- `repo-b/src/lib/bos-api.ts` — all REPE API functions

### What You CAN Do
- ADD new tables with foreign keys referencing existing ones
- ADD new columns to existing tables (nullable, with defaults)
- ADD new API routes (new routers, new prefixes)
- ADD new frontend pages under existing or new route groups
- ADD new components
- ADD new seed data that references existing Meridian assets
- EXTEND existing services with new functions (do not modify existing function signatures)
- CREATE a bridge/link table connecting PDS projects to REPE assets

### What You CANNOT Do
- Modify existing table PKs, FKs, constraints, or column types
- Delete or rename existing seed data, especially Meridian assets
- Change existing API response shapes
- Modify existing calculation logic (waterfall, IRR, TVPI, scenario engine)
- Override existing scenario base cases without explicit overlay mechanism
- Introduce breaking changes to the quarterly state rollup chain

---

## CORE PRODUCT GOAL

Create a visually strong and functionally coherent Construction / Development workspace where PDS projects (construction management, development management) correspond to real REPE assets owned by Meridian Capital Management. The bridge makes project-level assumptions (budget, schedule, lease-up, stabilization) flow into asset modeling and fund returns.

### The Key Insight

PDS already manages construction projects with budgets, schedules, risk scores, and milestones. REPE already manages assets with valuations, cash flows, scenarios, and fund returns. **The missing piece is the bridge** — a link table and service layer that maps:

```
PDS Project (execution reality)
  → fin_construction_project (cost control)
    → repe_asset (investment model)
      → re_asset_quarter_state (quarterly performance)
        → fund-level metrics (IRR, TVPI, NAV)
```

---

## PART 1 — INTEGRATION ARCHITECTURE (BUILD THIS FIRST)

### 1A. New Bridge Schema

Create a new migration file (e.g., `395_development_asset_bridge.sql`) with:

```sql
-- Bridge: links a PDS analytics project to a REPE asset for development tracking
CREATE TABLE IF NOT EXISTS dev_project_asset_link (
  link_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL,
  business_id            uuid NOT NULL,
  pds_project_id         uuid NOT NULL,           -- FK to pds_analytics_projects.project_id
  repe_asset_id          uuid NOT NULL,            -- FK to repe_asset.asset_id
  fin_construction_id    uuid,                     -- FK to fin_construction_project (optional)
  link_type              text NOT NULL DEFAULT 'ground_up'
                         CHECK (link_type IN ('ground_up', 'major_renovation', 'value_add', 'repositioning')),
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'completed', 'suspended')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, pds_project_id, repe_asset_id)
);

-- Development assumptions that feed into the asset model
CREATE TABLE IF NOT EXISTS dev_assumption_set (
  assumption_set_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id                uuid NOT NULL REFERENCES dev_project_asset_link(link_id),
  scenario_label         text NOT NULL DEFAULT 'base',
  -- Cost assumptions
  hard_cost              numeric(28,2),
  soft_cost              numeric(28,2),
  contingency            numeric(28,2),
  financing_cost         numeric(28,2),
  total_development_cost numeric(28,2),
  -- Timing assumptions
  construction_start     date,
  construction_end       date,
  lease_up_start         date,
  lease_up_months        int,
  stabilization_date     date,
  -- Stabilized operating assumptions
  stabilized_occupancy   numeric(8,4),             -- e.g., 0.9500
  stabilized_noi         numeric(28,2),
  exit_cap_rate          numeric(8,4),             -- e.g., 0.0525
  -- Debt assumptions
  construction_loan_amt  numeric(28,2),
  construction_loan_rate numeric(8,4),
  perm_loan_amt          numeric(28,2),
  perm_loan_rate         numeric(8,4),
  -- Calculated outputs (populated by bridge service)
  yield_on_cost          numeric(8,4),
  stabilized_value       numeric(28,2),
  projected_irr          numeric(8,4),
  projected_moic         numeric(8,4),
  -- Meta
  is_base                boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (link_id, scenario_label)
);

-- Draw schedule tracking (monthly/quarterly draws against construction loan)
CREATE TABLE IF NOT EXISTS dev_draw_schedule (
  draw_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption_set_id      uuid NOT NULL REFERENCES dev_assumption_set(assumption_set_id),
  draw_date              date NOT NULL,
  draw_amount            numeric(28,2) NOT NULL,
  cumulative_drawn       numeric(28,2),
  draw_type              text DEFAULT 'scheduled'
                         CHECK (draw_type IN ('scheduled', 'actual', 'forecast')),
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now()
);
```

### 1B. Bridge Service Layer

Create `backend/app/services/dev_asset_bridge.py` that:

1. **Links a PDS project to a REPE asset** — creates the `dev_project_asset_link` row
2. **Reads PDS project data** (budget, schedule, milestones) and **maps it into `dev_assumption_set`** defaults
3. **Calculates derived metrics** (yield_on_cost = stabilized_noi / total_development_cost, stabilized_value = stabilized_noi / exit_cap_rate)
4. **Does NOT modify existing `re_asset_quarter_state`** — instead creates a read-only projection that shows what the asset model would look like under development assumptions
5. **Provides scenario comparison** — base vs cost-overrun vs delayed-completion vs weaker-lease-up
6. **Computes fund impact delta** — what does this development project contribute to fund NAV / IRR / TVPI vs a simple acquisition

### 1C. API Endpoints

Add a new router `backend/app/routes/dev_bridge.py` with prefix `/api/dev/v1`:

- `GET /projects` — list dev projects with linked asset info
- `GET /projects/{link_id}` — project detail with assumptions and outputs
- `GET /projects/{link_id}/assumptions` — full assumption set
- `PUT /projects/{link_id}/assumptions` — update assumptions, trigger recalc
- `GET /projects/{link_id}/draws` — draw schedule
- `GET /projects/{link_id}/scenario-impact` — scenario comparison (base/downside/upside)
- `GET /projects/{link_id}/fund-impact` — fund-level contribution metrics
- `GET /portfolio` — development portfolio summary (KPIs, health, spend trends)

---

## PART 2 — SEED DATA (MAKE PDS PROJECTS CORRESPOND TO MERIDIAN ASSETS)

This is the critical requirement from the user. Create seed data where PDS projects correspond to the 5 Meridian assets. Create a new seed file `backend/app/services/dev_bridge_seed.py`:

| PDS Project | Linked Meridian Asset | Type | Stage |
|---|---|---|---|
| Aurora Phase II Expansion | Aurora Residences (multifamily, Denver) | value_add | construction |
| Cedar Grove Memory Care Wing | Cedar Grove Senior Living (senior_housing, Phoenix) | major_renovation | preconstruction |
| Northgate Commons Phase III | Northgate Student Commons (student_housing, Austin) | ground_up | construction |
| Meridian Medical Pavilion MOB Build-Out | Meridian Medical Pavilion (MOB, Nashville) | repositioning | closeout |
| Foundry Logistics Distribution Annex | Foundry Logistics Center (industrial, Columbus) | ground_up | planning |

For each project, seed:
- A `pds_analytics_projects` row (if not already existing) with realistic budget, timeline, percent_complete
- A `dev_project_asset_link` row pointing to the real Meridian `repe_asset`
- A `dev_assumption_set` with realistic development assumptions:
  - Hard/soft/contingency costs that sum to a coherent total development cost
  - Construction timeline consistent with the project stage
  - Lease-up assumptions appropriate to the property type
  - Stabilized NOI that is close to (but may differ from) the existing asset NOI
  - Exit cap rates appropriate to market and property type (4.5%–6.5% range)
  - Financing terms (construction loan at 70-80% LTC, 6-8% rate; perm loan at 60-65% LTV, 5-6% rate)
- A `dev_draw_schedule` with monthly draws for the construction period
- 2 additional `dev_assumption_set` rows per project: one "cost_overrun" scenario (+15% hard costs, +3 month delay) and one "strong_lease_up" scenario (-2 months lease-up, +3% stabilized occupancy)

**CRITICAL**: Use the exact Meridian asset_ids from `fixtures/winston_demo/meridian_demo_seed.json`. Do not generate new asset_ids.

---

## PART 3 — FRONTEND UI

### Route Structure

Add under the existing lab environment pattern:
```
/app/lab/env/[envId]/re/development/           — Development Portfolio
/app/lab/env/[envId]/re/development/[linkId]/  — Project Detail
```

This nests development under the RE workspace (not PDS) because the executive audience is the fund/asset team, not the project management team. The data flows from PDS into this view.

Alternatively, add a "Development" group to the REPE sidebar navigation in `repo-b/src/components/repe/workspace/repeNavigation.ts`.

### 3A. Development Portfolio Page

KPI strip (reuse pattern from `PdsMetricStrip` or REPE `MetricsStrip`):
- Total development budget (sum of total_development_cost across active projects)
- Committed cost
- Actual cost
- Forecast at completion
- Contingency remaining (% and absolute)
- Projects on track / at risk / delayed (count + health badges)

Below the KPIs:
- **Spend trend chart** — monthly committed vs actual vs budget (use Recharts, consistent with existing charts)
- **Project table** — name, linked asset, property type, market, stage, budget, % complete, health status, projected IRR
- Each row clicks through to the project detail page

### 3B. Project Detail Page (the modeling bridge — this is the key screen)

Three-panel layout:

**Left: PDS Execution Data**
- Project name, stage, timeline
- Budget summary (hard / soft / contingency / total)
- Milestones with planned vs actual dates
- Risk score and top risks
- Change orders and their cost impact
- % complete (physical + financial)

**Center: Development Assumptions → Asset Model**
- Editable assumption cards:
  - Total development cost → feeds basis
  - Construction timeline → feeds when income starts
  - Lease-up assumptions → feeds occupancy ramp
  - Stabilized NOI → feeds valuation
  - Exit cap rate → feeds terminal value
  - Debt terms → feeds leverage metrics
- "Recalculate" button that calls PUT on assumptions
- Yield on cost, stabilized value, projected IRR displayed prominently

**Right: Fund Impact**
- Linked fund name and ownership %
- Asset contribution to fund NAV
- Asset contribution to fund IRR
- TVPI / DPI impact
- Scenario comparison mini-table (base vs overrun vs strong)

### 3C. Scenario Impact Panel

Allow comparing scenarios side by side:
- Base case
- Cost overrun (+15% hard costs)
- Delayed completion (+3 months)
- Weak lease-up (+4 months, -5% occupancy)
- Strong lease-up (-2 months, +3% occupancy)

Show delta columns for: total cost, stabilized NOI, stabilized value, yield on cost, IRR, fund IRR impact.

---

## PART 4 — VISUAL DESIGN DIRECTION

Follow the existing REPE design language, not PDS design language. The REPE workspace uses:
- Dark theme with muted palette
- `MetricsStrip` for KPIs
- Data grids with clean sorting/filtering
- Panel-based layouts with subtle borders
- Status chips and health badges
- Recharts for charting

Match the REPE asset cockpit aesthetic. The development bridge page should feel like a natural extension of the asset detail page — an executive looking at fund performance can drill into the development execution status without leaving the investment context.

---

## PART 5 — WHAT THIS PROMPT DOES NOT DO

To keep scope manageable and avoid breaking things:

1. **Does NOT modify the waterfall engine** — the development bridge provides read-only projections of what asset metrics would be; it does not inject data into the actual waterfall run tables
2. **Does NOT modify `re_asset_quarter_state` directly** — the bridge calculates projected states but stores them in `dev_assumption_set` output fields, not in the quarterly state chain
3. **Does NOT replace the PDS project management UI** — the PDS pages continue to work as-is for project managers; this is an investment-team overlay
4. **Does NOT build a new calculation engine** — it computes simple metrics (yield on cost, stabilized value, simple IRR from cost and value timeline) without replacing the scenario engine
5. **Does NOT touch the Meridian demo seeder** — it adds bridge data alongside, not modifying `backfill_meridian_re_seed.py` or `re_fi_seed_v2.py`

---

## PART 6 — VALIDATION CHECKLIST

After implementation, verify:

1. **REPE pages still work**: Fund detail, asset detail, scenario builder, waterfall runs, capital activity — all unchanged
2. **PDS pages still work**: Command center, accounts, delivery risk, AI query — all unchanged
3. **Meridian assets unchanged**: All 5 assets show the same NOI, value, DSCR, WALT as before
4. **Development portfolio loads**: KPIs populate from seeded data, project table renders, charts show spend trends
5. **Project detail loads**: Three-panel layout shows PDS data, assumptions, and fund impact
6. **Assumption editing works**: Changing stabilized NOI recalculates yield on cost and stabilized value
7. **Scenario comparison works**: Base vs overrun vs strong shows meaningful deltas
8. **No null cascades**: Missing bridge data shows graceful empty states, not crashes
9. **Seed data is coherent**: Costs tie, timelines make sense, IRRs are realistic (8-18% range), cap rates are market-appropriate

---

## PART 7 — DELIVERABLES

1. Migration file: `395_development_asset_bridge.sql`
2. Backend service: `backend/app/services/dev_asset_bridge.py`
3. Backend routes: `backend/app/routes/dev_bridge.py`
4. Seed service: `backend/app/services/dev_bridge_seed.py`
5. Frontend pages: development portfolio + project detail
6. Frontend components: KPI strip, project table, assumption panel, fund impact card, scenario comparison
7. Navigation update: add "Development" to REPE sidebar
8. Architecture note: how the bridge works, what's reused vs new, deferred enhancements
9. Tips appended to `tips.md`

---

## PART 8 — DEFERRED (DO NOT BUILD NOW)

- Automated recalc that writes back into `re_asset_quarter_state` (requires careful scenario engine integration)
- Waterfall impact simulation
- Monte Carlo on development assumptions
- Draw request workflow with lender approvals
- Daily log / RFI / submittal tracking (leave in PDS)
- AI-generated development narrative
- Timeline animation / Gantt chart

---

## EXECUTION INSTRUCTION

1. Inspect the repo first — read the schema files, seed files, and existing services listed above
2. Build the bridge schema and service before touching the frontend
3. Seed data before building UI so you can see real data immediately
4. Match REPE visual patterns, not PDS patterns
5. Prefer composition over replacement — wrap existing data, don't restructure it
6. Test that existing pages still load after your changes
7. Add implementation lessons to `tips.md`
