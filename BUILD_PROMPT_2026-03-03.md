# Winston Platform — Engineering Build Prompt
**Generated:** 2026-03-03
**Source:** RE Platform Verification Run 4 (T1–T15) + Loop Intelligence QA (QA-1–QA-9)
**Stack:** Next.js 14 App Router · TypeScript · Supabase · Railway API

This prompt is ordered by dependency. Fix items earlier in the list unblock items later. Complete each section fully before moving to the next.

---

## CONTEXT

You are working on the Winston platform at `paulmalmquist.com`. The codebase is a Next.js 14 App Router application with TypeScript, a Supabase Postgres backend, and a Railway-hosted API for compute-heavy operations (waterfall runs, quarter close pipeline).

### Key IDs
```
RE Env:      a1b2c3d4-0001-0001-0003-000000000001
Fund:        a1b2c3d4-0003-0030-0001-000000000001  (Institutional Growth Fund VII)
Quarter:     2026Q1
Investment:  9689adf7-6e9f-43d4-a4db-e0c3b6a979a3  (Meridian Office Tower)

Consulting Env:   62cfd59c-a171-4224-ad1e-fffc35bd1ef4  (Novendor)
Business ID:      225f52ca-cdf4-4af9-a973-d1d310ddcba1
```

---

## TRACK A — RE PLATFORM FIXES

### A1 — Fix `re_partner` FK Constraint (BLOCKER)
**Unblocks:** A2, T1, T8, T9 (LP Waterfall)

**Problem:** `POST /api/re/v2/seed` with `{ fund_id, env_id }` fails:
```
insert or update on table "re_partner" violates foreign key constraint "re_partner_business_id_fkey"
```
The `business_id` being inserted into `re_partner` does not exist in the `businesses` table.

**Fix:**
1. Inspect the `re_partner` table schema and trace what `business_id` value the seed function is passing.
2. In the seed handler, before inserting into `re_partner`, ensure the `business_id` row exists in `businesses`. If it doesn't, either:
   - Insert a stub row into `businesses` for this env/business combo, or
   - Look up the correct `business_id` from the env record rather than using `env_id` directly.
3. Make the seed operation fully idempotent (use `INSERT ... ON CONFLICT DO NOTHING` throughout).
4. Verify: `POST /api/re/v2/seed` with `{ fund_id: "a1b2c3d4-0003-0030-0001-000000000001", env_id: "a1b2c3d4-0001-0001-0003-000000000001" }` returns 200 and LP partners are visible in the LP Summary tab.

---

### A2 — Fix Investment Rollup Endpoint (BLOCKER)
**Unblocks:** T2 (NAV Reconciliation), T5 (Fund NAV Column)

**Problem:** `GET /api/re/v2/funds/{fundId}/investment-rollup/2026Q1` returns `[]`.
The fund NAV column in the investment table shows `—` for all 12 investments. Fund-level NAV is ~$425M but the rollup aggregation returns nothing.

**Fix:**
1. Open the route handler for `/api/re/v2/funds/[fundId]/investment-rollup/[quarter]`.
2. Inspect the query — likely a JOIN or WHERE clause is filtering out all rows (wrong `env_id`, wrong `quarter` format, or the `fund_nav_contribution` column isn't being populated by Quarter Close).
3. Verify that Quarter Close writes `fund_nav_contribution` per investment to whatever table the rollup reads from. If the write-back is missing, add it.
4. Verify: after a Quarter Close run, `GET /api/re/v2/funds/{fundId}/investment-rollup/2026Q1` returns an array of 12 objects each with `nav`, `fund_nav_contribution`, and `investment_id` fields. The sum of `fund_nav_contribution` should reconcile to fund-level NAV (~$425M).

---

### A3 — Fix Quarter Close Returns Write-Back
**Unblocks:** T6 (Returns Tab)

**Problem:** The Returns tab shows *"No return metrics available. Run a Quarter Close first."* even after a successful Quarter Close (run `e1540a03`). The pipeline runs but doesn't write return metrics to the database.

**Fix:**
1. Find the Quarter Close pipeline code (likely in the Railway API service or a server action).
2. Locate the returns calculation step — IRR, MOIC, TWR, distributions. It likely computes these values but has a missing or broken write-back to the `re_returns` (or equivalent) table.
3. Add the DB write after calculation. The write should include: `fund_id`, `quarter`, `investment_id` (per-investment), `irr`, `moic`, `twr`, `gross_return`, `net_return`, `distributions`.
4. If a `re_returns` table doesn't exist, create it with a migration.
5. Verify: run Quarter Close for `2026Q1`, then `GET /api/re/v2/funds/{fundId}/returns/2026Q1` returns populated metrics. Returns tab no longer shows the empty state message.

---

### A4 — Fix Waterfall Scenario Schema + UI
**Unblocks:** T9 (Waterfall Scenario Tab)

**Problem (two separate bugs):**
1. `POST /api/re/v2/funds/{fundId}/scenarios` → 500: `column "model_id" does not exist`
2. The scenario creation UI form has no `name` input field, so the name can't be set from the UI.

**Fix — DB Schema:**
1. Run a migration: add `model_id` column to the `re_scenarios` (or equivalent) table, or remove the reference to `model_id` in the POST handler if it's not needed. Determine which is correct based on the intended data model.

**Fix — UI:**
1. In the Waterfall Scenario tab component, add a `name` text input to the scenario creation form. It should be required.
2. Ensure the form POST body includes `{ name, fund_id, quarter, ... }`.

**Verify:**
- Create a scenario named "Base Case" from the UI.
- It appears in the scenario dropdown.
- No 500 errors in the network tab.

---

### A5 — Fix Investment Detail: Missing Fields + Cap Rate
**Unblocks:** T3 (Investment Detail Completeness)

**Problem:** For investment `9689adf7-6e9f-43d4-a4db-e0c3b6a979a3` (Meridian Office Tower):
- Acquisition Date shows `—` (not populated)
- Hold Period shows `—` (not populated)
- LTV shows 0.0% (debt not populated)
- Cap Rate shows 34.78% — clearly wrong, should be ~8%

**Fix — Missing fields:**
1. Verify that `acquisition_date` and `hold_period_months` (or equivalent) are seeded in the investment record. If not, add them to the seed data.
2. Verify the investment detail API handler returns these fields and the UI renders them.
3. For LTV / debt: ensure `total_debt` or `loan_balance` is populated and that LTV = debt / gross_value.

**Fix — Cap Rate calculation:**
Cap Rate = NOI / Gross Value. With NOI = $4.5M and Gross Value = $51.8M, the correct cap rate is ~8.7%. The current 34.78% suggests NOI is being divided by a much smaller number (likely `nav` = $38.5M instead of gross value, giving $4.5M / $12.9M ≈ wrong — or some other base).

1. Find the cap rate calculation in the API handler or frontend component.
2. Change to: `cap_rate = noi / gross_value` (not `noi / nav` or `noi / invested_capital`).

---

### A6 — Implement Wave 2 Backend Routes
**Unblocks:** T7, T11, T12, T13, T14

These five tests are fully blocked by missing API routes. Implement each as a Next.js API route handler.

#### A6a — Benchmarks
```
GET /api/re/v2/funds/[fundId]/benchmarks/[quarter]
```
Returns comparison of fund-level returns against external benchmarks (NCREIF, ODCE, custom). Expected response shape:
```typescript
{
  quarter: string,
  fund_irr: number,
  fund_moic: number,
  benchmarks: Array<{
    name: string,       // e.g. "NCREIF Property Index"
    irr: number,
    total_return: number
  }>
}
```
Seed at least 2 benchmark records for `2026Q1`.

#### A6b — Debt Covenants / Capital Stack
```
GET /api/re/v2/funds/[fundId]/debt-covenants
```
Returns per-investment debt covenant status. Expected response shape:
```typescript
Array<{
  investment_id: string,
  investment_name: string,
  lender: string,
  loan_balance: number,
  ltv: number,
  ltv_covenant: number,      // covenant threshold, e.g. 0.75
  dscr: number,
  dscr_covenant: number,     // covenant threshold, e.g. 1.25
  maturity_date: string,
  status: "compliant" | "watch" | "breach"
}>
```
Seed at least 3 debt records including one with `status: "watch"` to test the covenant alert (T12).

#### A6c — Sensitivity Matrix
```
GET /api/re/v2/funds/[fundId]/sensitivity
```
Returns a cap-rate × rent-growth IRR sensitivity matrix. Expected response shape:
```typescript
{
  investment_id: string,
  cap_rate_range: number[],     // e.g. [0.06, 0.07, 0.08, 0.09, 0.10]
  rent_growth_range: number[],  // e.g. [-0.02, 0.00, 0.02, 0.04]
  irr_matrix: number[][]        // [cap_rate_index][rent_growth_index] → IRR
}
```
The matrix must be monotonically decreasing in IRR as cap rate increases, and monotonically increasing as rent growth increases. Compute analytically or use seed values.

---

## TRACK B — LOOP INTELLIGENCE FIXES

### B1 — Deploy `/bos/api/consulting/loops` Backend Routes (BLOCKER)
**Unblocks:** All of QA-3 through QA-9

**Problem:** All loop API routes return 404:
```
GET  /bos/api/consulting/loops/summary?env_id=…&business_id=…  → 404
GET  /bos/api/consulting/loops?env_id=…&business_id=…          → 404
POST /bos/api/consulting/loops                                  → 404
```
The `clients` endpoint at `/bos/api/consulting/clients` returns 200 and can serve as a reference for how the routes should be structured.

**Fix — Create the following Next.js API routes:**

```
app/bos/api/consulting/loops/summary/route.ts   → GET handler
app/bos/api/consulting/loops/route.ts           → GET + POST handlers
app/bos/api/consulting/loops/[loopId]/route.ts  → GET + PATCH + DELETE handlers
```

**GET `/bos/api/consulting/loops`** — query params: `env_id`, `business_id`, optional `domain`, `status`, `client_id`. Returns:
```typescript
Array<{
  id: string,
  name: string,
  client_id: string | null,
  client_name: string | null,
  process_domain: string,
  status: "observed" | "documented" | "controlled" | "optimized",
  frequency_per_year: number,
  control_maturity_stage: number,
  automation_readiness_score: number,
  avg_wait_time_minutes: number,
  rework_rate: number,
  annual_cost: number,   // computed: sum of (role_hourly_rate * active_minutes/60 * frequency_per_year) across roles
  roles: Array<{ role_name: string, hourly_rate: number, active_minutes: number }>
}>
```

**GET `/bos/api/consulting/loops/summary`** — query params: `env_id`, `business_id`. Returns:
```typescript
{
  total_annual_cost: number,
  loop_count: number,
  avg_maturity_stage: number,
  top_cost_driver: { name: string, annual_cost: number } | null
}
```

**POST `/bos/api/consulting/loops`** — body: loop creation payload including roles array. On success, return the created loop object with its `id`. The frontend expects a redirect to `/loops/{id}` after creation.

**Database:** Create a `consulting_loops` table (if not already present) with columns: `id uuid PK`, `env_id uuid`, `business_id uuid`, `name text`, `client_id uuid nullable`, `description text`, `process_domain text`, `trigger_type text`, `frequency_type text`, `frequency_per_year int`, `status text`, `control_maturity_stage int`, `automation_readiness_score int`, `avg_wait_time_minutes int`, `rework_rate numeric`, `created_at timestamptz`, `updated_at timestamptz`.

Create a `consulting_loop_roles` table: `id uuid PK`, `loop_id uuid FK → consulting_loops.id`, `role_name text`, `loaded_hourly_rate numeric`, `active_minutes int`, `notes text`.

---

### B2 — Seed Demo Loop Data for Novendor Env
**Depends on:** B1

After routes are live, seed 5 representative loops for `env_id = 62cfd59c-a171-4224-ad1e-fffc35bd1ef4`, `business_id = 225f52ca-cdf4-4af9-a973-d1d310ddcba1`. Suggested loops:

| Name | Domain | Frequency | Maturity | Role Cost Example |
|---|---|---|---|---|
| Monthly Financial Reporting | reporting | 12/yr | 2 | Senior Analyst $95/hr 90min + Controller $75/hr 45min |
| Quarterly Board Deck | reporting | 4/yr | 1 | Director $150/hr 180min + Analyst $80/hr 120min |
| Weekly Status Update | operations | 52/yr | 3 | PM $110/hr 45min |
| Client Invoice Reconciliation | finance | 12/yr | 2 | Finance Manager $120/hr 60min + Staff $70/hr 30min |
| New Client Onboarding | sales | 24/yr | 1 | Account Exec $130/hr 120min + Ops $85/hr 90min |

Verify: Loop Intelligence list page shows 5 rows, summary card shows correct Total Annual Loop Cost.

---

### B3 — Fix Domain Filter State Leak
**Depends on:** B1

**Problem:** The Domain filter text input on the Loop Intelligence list page retains the text "reporting" after a user navigates away from the New Loop form (where "reporting" was typed into the Process Domain field). This is a cross-route state leak.

**Fix:**
1. Locate the state management for the Domain filter on the loops list page.
2. Ensure the domain filter value is initialized from URL query params only (not from any shared form state or component-level module variable).
3. On navigation to `/loops`, clear any filter state that was not explicitly set via URL params.

---

### B4 — Improve Empty State UX (No Data / Not Found)
**Depends on:** B1

**Problem:** When the loops API returns 404, the page shows a raw "Not Found" error banner at the top of every page load. This is confusing when the env simply has no loops yet.

**Fix:**
1. In the Loop Intelligence page component, distinguish between:
   - **404 / empty env**: show a friendly empty state — "No loops yet. Add your first loop to start tracking recurring workflow costs." (no error banner)
   - **5xx / real error**: show the error banner with a request ID for debugging
2. The summary card should show zeros cleanly when there's no data, with no error banner.

---

### B5 — Implement + Test Loop Detail, Edit, and Interventions
**Depends on:** B1, B2

Once B1 and B2 are complete and loops can be created, implement and verify:

**Loop Detail (`GET /bos/api/consulting/loops/[loopId]`):**
- Shows all loop fields
- Annualized cost = `sum(role.hourly_rate * role.active_minutes / 60 * frequency_per_year)` across all roles
- Role breakdown table visible

**Edit Flow (`PATCH /bos/api/consulting/loops/[loopId]`):**
- Editing frequency_per_year should recalculate and update `annual_cost`
- Editing a role's `active_minutes` or `loaded_hourly_rate` should recalculate and update `annual_cost`
- Cost recalculation must happen server-side (not just displayed client-side)

**Interventions (`POST /bos/api/consulting/loops/[loopId]/interventions`):**
- Add intervention with: `title`, `description`, `intervention_date`, `before_snapshot` (JSON snapshot of loop state at time of intervention)
- After adding, the intervention appears in a timeline on the loop detail page
- `before_snapshot` must capture the loop's annual_cost and maturity stage at the time of the intervention

---

## VERIFICATION CHECKLIST

After completing all fixes, run the test suites and confirm the following pass:

**RE Platform (target: 12+/15):**
- [ ] T1: Seed runs without FK error; LP partners visible
- [ ] T2: `/investment-rollup/2026Q1` returns 12 non-empty rows
- [ ] T3: Acquisition Date, Hold Period, Debt/LTV, Cap Rate (~8-9%) all showing
- [ ] T4: Quarter Close (already passing — do not regress)
- [ ] T5: Fund NAV column populated for all 12 investments
- [ ] T6: Returns tab shows IRR/MOIC/TWR after Quarter Close
- [ ] T7: `/benchmarks/2026Q1` returns fund vs benchmark data
- [ ] T8: LP Summary tab shows partners and gross-net bridge
- [ ] T9: Scenario creation works; scenario appears in dropdown
- [ ] T10: Shadow Run (already passing — do not regress)
- [ ] T11: `/debt-covenants` returns loan data for investments
- [ ] T12: At least one covenant shows "watch" or "breach" status
- [ ] T13: `/sensitivity` returns IRR matrix
- [ ] T14: IRR matrix is monotone (increases with rent growth, decreases with cap rate)
- [ ] T15: Full E2E — all tabs populated

**Loop Intelligence (target: 8+/9):**
- [ ] QA-1: Navigation (already passing — do not regress)
- [ ] QA-2: Summary cards (already passing — do not regress)
- [ ] QA-3: 5 seeded loops visible in list
- [ ] QA-4: Filters work on live data
- [ ] QA-5: Create loop → redirects to detail page
- [ ] QA-6: Loop detail shows cost breakdown and roles
- [ ] QA-7: Edit frequency → annual cost updates
- [ ] QA-8: Add intervention → appears in timeline
- [ ] QA-9: No persistent error banner; no state leaks; 0 console errors
