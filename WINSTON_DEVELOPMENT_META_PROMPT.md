# Winston RE Platform — Development Meta Prompt
## Wave 1 (Fix) + Wave 2 (Build) + Verification Tests

**Context:** paulmalmquist.com — Next.js 14 App Router RE analytics platform ("Winston").
After 3 rounds of production testing the platform scores ~8/10. The UI layer is strong.
Almost all remaining failures are data-layer or compute-pipeline issues, not UI bugs.
This prompt covers both fixing the foundation and building meaningful new features on top.

**Stack:** Next.js 14 App Router · TypeScript · Supabase (project ref: `ozboonlsplroialdwuxj`) · Railway backend (`authentic-sparkle-production-7f37.up.railway.app`) · TailwindCSS

**Test environment:** Meridian Capital Management · envId: `a1b2c3d4-0001-0001-0003-000000000001`
**Primary fund:** Institutional Growth Fund VII · fundId: `a1b2c3d4-0003-0030-0001-000000000001`

---

## PART 1 — WAVE 1: FIX THE FOUNDATION

### FIX 1-A: Apply the RE Schema Migration
**Root cause:** `POST /api/re/v2/seed → 500` fires on every page load with "RE schema not migrated".

**Steps:**
1. Find the check: `grep -r "RE schema not migrated" ./` — locate the guard condition in the seed handler
2. Find the migration file it's gating on — look for a Supabase migration in `supabase/migrations/` that targets RE-specific tables (`re_fund`, `re_investment`, `re_lp_partner`, `re_lp_capital_ledger`, `re_investment_metrics`, `re_property_asset`, `re_return_metrics`, `re_run_log`)
3. Apply any unapplied migrations to production: `supabase db push --project-ref ozboonlsplroialdwuxj`
4. If migrations are up to date but the guard still fires, the check itself may be stale — update it to verify the schema by querying a specific column that exists in the current schema (e.g., `SELECT column_name FROM information_schema.columns WHERE table_name = 're_return_metrics'`) rather than a version string

**Verification:** `POST /api/re/v2/seed` must return `200` with a JSON success body. Not 500.

---

### FIX 1-B: Complete Investment Detail Seed Data
**Root cause:** `re_investment` records are missing `acquisition_date`, `hold_period_months`. `re_investment_metrics` records are missing `gross_value`, `debt`. These fields read "—" on the detail page and cause LTV = 0% and Cap Rate = 34.78% (abnormally high because it's using the wrong denominator).

**Required fields to seed for all 12 investments (use Meridian Office Tower as the canonical example):**

```sql
-- re_investment table
UPDATE re_investment SET
  acquisition_date = '2021-03-15',
  hold_period_months = 60  -- 5-year target hold
WHERE id = '[meridian-office-tower-id]';

-- re_investment_metrics table
UPDATE re_investment_metrics SET
  gross_value = 51800000,   -- market value of the asset
  debt = 23310000           -- ~45% LTV on $51.8M → LTV = 45.0%
WHERE investment_id = '[meridian-office-tower-id]' AND quarter = '2026Q1';
```

**Cap Rate formula check:** Verify the cap rate formula in the UI/API is:
```
cap_rate = noi / gross_value   // NOT noi / nav or noi / invested
```
Correct value for Meridian Office Tower: `$4.5M / $51.8M = 8.69%` — realistic for Class A office.

**Seed values for all 12 investments:** Use a realistic spread of acquisition dates (2019–2023), hold periods (48–84 months), debt loads (35–60% LTV), and gross values anchored to the existing NAV + 5–15% unrealized appreciation.

**Verification:** Investment detail page shows:
- Acquisition Date: a real date (not "—")
- Hold Period: e.g. "36 months" or "3.0 years" (not "—")
- Gross Value: populated KPI (not "—")
- Debt: populated KPI (not "—")
- LTV: 35–60% range (not 0.0%)
- Cap Rate: 5–10% range (not 34.78%)

---

### FIX 1-C: Complete Quarter Close → Returns Write-Back
**Root cause:** The Quarter Close pipeline runs successfully and writes to `re_run_log` but does NOT write return metrics to the table the Returns tab reads from. The pipeline is a stub — it logs completion without executing the computation.

**Steps:**
1. Find the Quarter Close handler: `grep -r "QUARTER_CLOSE" ./app/api` — find the route and its execution logic
2. Trace what it does on success — it likely writes to `re_run_log` and stops
3. Add a computation step that runs AFTER the log entry is written:

```typescript
// After writing the run log entry, compute and persist return metrics:

async function computeAndPersistReturnMetrics(fundId: string, quarter: string) {
  // 1. Pull all investments with their metrics for this quarter
  const investments = await getInvestmentMetricsForQuarter(fundId, quarter);

  // 2. For each investment, compute:
  //    - Gross IRR (before fees/carry)
  //    - Net IRR (after fees/carry)
  //    - MOIC (NAV + Distributions) / Total Invested
  //    - TVPI, DPI, RVPI at fund level

  // 3. Aggregate to fund level:
  //    - Fund-level TWR (time-weighted return)
  //    - Gross vs Net spread (mgmt fee + carry impact)

  // 4. INSERT INTO re_return_metrics (fund_id, quarter, gross_irr, net_irr, moic, tvpi, dpi, rvpi)
  //    ON CONFLICT (fund_id, quarter) DO UPDATE ...
}
```

4. The Returns tab component should read from `re_return_metrics` (or whatever table you write to) — confirm the query and the table name match

**Verification test (clever):** Run this sequence and assert at each step:
```
Step 1: GET /api/re/v2/funds/[fundId]/returns/2026Q1 → expect 404 or empty
Step 2: POST /api/re/v2/funds/[fundId]/quarter-close { quarter: "2026Q1" }
Step 3: Poll until run status = SUCCESS
Step 4: GET /api/re/v2/funds/[fundId]/returns/2026Q1 → MUST return populated metrics
Step 5: Assert gross_irr > net_irr (fees must reduce returns)
Step 6: Assert tvpi = (nav + distributions) / invested_capital ± 0.01
```
If step 4 returns empty after step 3 reports success, the pipeline is still a stub.

---

### FIX 1-D: Seed LP Partner Data + Capital Ledger
**Prerequisite:** FIX 1-A (schema migration) must be applied first.

**Seed the following 4 LP partners:**

```sql
-- Partners
INSERT INTO re_lp_partner (id, fund_id, name, type, committed_capital, carry_rate, mgmt_fee_rate) VALUES
  ('lp-winston-gp',   '[fundId]', 'Winston Capital GP',    'GP', 10000000,  20.0, 0.0),
  ('lp-state-pension','[fundId]', 'State Teachers Pension', 'LP', 200000000, 0.0, 1.5),
  ('lp-univ-endow',   '[fundId]', 'University Endowment',  'LP', 150000000, 0.0, 1.5),
  ('lp-sovereign',    '[fundId]', 'Sovereign Wealth Fund', 'LP', 140000000, 0.0, 1.25);

-- Capital Ledger (called ~85%, distributed ~6.8% of committed)
INSERT INTO re_lp_capital_ledger (lp_partner_id, fund_id, quarter, called_amount, distributed_amount, nav) VALUES
  ('lp-state-pension', '[fundId]', '2026Q1', 170000000, 13600000, 146400000),
  ('lp-univ-endow',    '[fundId]', '2026Q1', 127500000, 10200000, 117300000),
  ('lp-sovereign',     '[fundId]', '2026Q1', 119000000,  9520000, 109480000),
  ('lp-winston-gp',    '[fundId]', '2026Q1',   8500000,    680000,   7820000);
```

**Fee accrual logic:** The LP Summary tab should show the gross-to-net bridge. Verify the management fee calculation is:
```
mgmt_fee = committed_capital × mgmt_fee_rate × (days_in_quarter / 365)
net_distribution = gross_distribution - mgmt_fee - carried_interest
```

**Verification:**
- LP Summary tab shows a 4-row table with Name / Type / Committed / Called / Distributed / NAV
- A gross-to-net bridge table shows: Gross Return → Management Fee deduction → Carried Interest → Net Return
- Each LP's Called / Committed = ~85% ± 3%

---

### FIX 1-E: Fix Fund NAV Column in Investment Overview Table
**Root cause:** The investment overview table's `Fund NAV` column shows "—" for all 12 rows. Investment detail pages correctly show NAV. The rollup query or component field mapping is broken for the overview.

**Steps:**
1. Find the overview table component — look for the investment list/table in the fund detail page
2. Find what API endpoint it calls for the row data
3. Compare the API response shape to what the detail page uses — the `nav` field is likely present in the API response but the column mapping in the table uses the wrong key (e.g. `fund_nav` vs `nav` vs `nav_contribution`)
4. Fix the field mapping. Do not change the API response — fix the component.

**Verification:** Every row in the Institutional Growth Fund VII investment overview table shows a non-"—" value in the Fund NAV column. Sum of all Fund NAV values should be within 2% of the fund-level NAV KPI ($425M).

---

## PART 2 — WAVE 2: BUILD NEW FEATURES

---

### BUILD 2-A: LP Waterfall Calculator

**What it is:** A computational module + UI tab that shows how fund distributions are split between GP and LPs after applying preferred return, catch-up, and carried interest. This is the core economics feature any LP-facing tool needs.

**Data prerequisites:** FIX 1-D (LP data must be seeded)

**Waterfall mechanics to implement (standard 2-and-20 structure):**
```
Step 1 — Return of Capital
  Each LP receives back their full invested capital before any profit split.
  Amount: sum of called capital per LP

Step 2 — Preferred Return (Hurdle Rate)
  LPs receive preferred return on invested capital (typically 8% IRR).
  Amount: called_capital × ((1 + 0.08) ^ years_invested - 1)

Step 3 — GP Catch-Up
  GP receives 100% of distributions until it has received its carry percentage
  of total profits (e.g., 20% carry → GP catches up to 20% of Step 2 profits).
  Amount: (step2_total × carry_rate) / (1 - carry_rate)

Step 4 — Residual Split
  Remaining profits split: 80% LP / 20% GP (or per carry_rate)
```

**Schema additions needed:**
```sql
CREATE TABLE re_waterfall_scenario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID REFERENCES re_fund(id),
  quarter TEXT NOT NULL,
  hurdle_rate DECIMAL(5,4) DEFAULT 0.08,
  carry_rate DECIMAL(5,4) DEFAULT 0.20,
  catch_up_rate DECIMAL(5,4) DEFAULT 1.00,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE re_waterfall_distribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID REFERENCES re_waterfall_scenario(id),
  lp_partner_id UUID REFERENCES re_lp_partner(id),
  step INTEGER,  -- 1=return_of_capital, 2=preferred, 3=catchup, 4=residual
  amount DECIMAL(18,2),
  cumulative_amount DECIMAL(18,2)
);
```

**UI:** Add a "Waterfall" tab to the fund detail page. Show:
1. A stacked bar showing total distributable proceeds broken into the 4 waterfall steps
2. A table per LP showing their allocation at each step
3. Summary row: Total GP economics ($) / Total LP economics ($) / Effective GP carry %

**Clever test for waterfall math:**
```
Given:
  Fund NAV: $425M
  Total invested capital: $425M (85% of $500M committed)
  Total distributions to date: $34M
  Hurdle rate: 8% per year, 5-year hold

Expected waterfall on full exit at $425M NAV:
  Step 1: Return $425M capital pro-rata to LPs
  Step 2: Preferred return = $425M × ((1.08^5) - 1) = $424M × 0.469 = ~$198.6M
    (this exceeds distributions, so preferred return is unmet → test this edge case!)
  Step 3: GP catch-up = 0 (preferred return not yet fully met)
  Step 4: Residual = $0 (all proceeds go to return + preferred)

Assert: if preferred return is unmet, GP carry = $0 and GP only receives its contributed capital back.
This is the most important edge case — a fund that hasn't cleared hurdle should show $0 GP carry.
```

---

### BUILD 2-B: Returns Tab — Benchmark Comparison

**What it is:** After FIX 1-C completes the Quarter Close pipeline, extend the Returns tab to show fund returns versus NCREIF ODCE (Open-End Diversified Core Equity) benchmark — the standard institutional RE benchmark.

**Implementation:**
```sql
CREATE TABLE re_benchmark (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_name TEXT NOT NULL,  -- 'NCREIF_ODCE', 'NCREIF_NPI'
  quarter TEXT NOT NULL,
  gross_return DECIMAL(8,4),     -- quarterly total return
  net_return DECIMAL(8,4),       -- after fees
  income_return DECIMAL(8,4),    -- income component
  appreciation_return DECIMAL(8,4)  -- appreciation component
);

-- Seed NCREIF ODCE trailing 8 quarters (use publicly available data)
-- 2024Q1: 0.52%, 2024Q2: 0.71%, 2024Q3: 0.89%, 2024Q4: 1.02%
-- 2025Q1: 0.95%, 2025Q2: 1.14%, 2025Q3: 1.28%, 2025Q4: 1.45%
-- 2026Q1: 1.18% (estimated)
```

**UI additions to Returns tab:**
1. Add a "vs Benchmark" column to the returns table: Fund Return | NCREIF ODCE | Alpha (spread)
2. A line chart showing rolling 4-quarter returns: Winston (gross) vs Winston (net) vs NCREIF ODCE
3. A summary callout: "Winston outperforms NCREIF ODCE by X bps on a net basis over trailing 4 quarters"

**Clever test:** Assert `gross_irr > net_irr > benchmark_return` is NOT always true — there should be quarters where the fund underperforms the benchmark. If your test data always shows outperformance, the benchmark data or fee calculation is wrong.

---

### BUILD 2-C: Debt & Capital Stack Tracking

**What it is:** A proper loan/mortgage tracker per investment that enables real LTV calculations, debt service coverage ratios (DSCR), and covenant monitoring.

**Schema:**
```sql
CREATE TABLE re_investment_debt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID REFERENCES re_investment(id),
  lender_name TEXT NOT NULL,
  loan_amount DECIMAL(18,2),
  interest_rate DECIMAL(6,4),           -- e.g. 0.0625 for 6.25%
  rate_type TEXT CHECK (rate_type IN ('fixed', 'floating')),
  spread_bps INTEGER,                    -- for floating: SOFR + spread
  maturity_date DATE,
  amortization_type TEXT CHECK (amortization_type IN ('interest_only', 'amortizing')),
  annual_debt_service DECIMAL(18,2),     -- computed or manual
  origination_date DATE,
  prepayment_penalty TEXT               -- 'yield_maintenance', 'defeasance', 'stepdown', 'none'
);
```

**Computed fields to add to the investment detail page:**
```
LTV = loan_amount / gross_value  (fix the 0.0% issue)
DSCR = noi / annual_debt_service  (typical covenant: DSCR > 1.25x)
Debt Yield = noi / loan_amount    (typical covenant: >7.0%)
```

**UI:** Add a "Debt" panel to the investment detail page showing:
- Loan summary card (lender, amount, rate, maturity)
- LTV gauge (colored: green < 60%, yellow 60–70%, red > 70%)
- DSCR indicator with covenant threshold line
- A "Covenant Status" row: ✅ DSCR 1.42x (covenant: >1.25x) / ⚠️ Debt Yield 6.8% (covenant: >7.0%)

**Covenant alert logic:** If any investment has DSCR < 1.25 or LTV > 75%, surface it as a warning banner on the fund detail page: "1 investment approaching covenant breach — review Meridian Office Tower."

**Clever test:** Seed one investment intentionally in covenant breach (DSCR = 1.18x < 1.25x threshold) and assert the warning banner appears on the fund page. Then fix the NOI to bring DSCR to 1.31x and assert the warning disappears. This tests the alert logic end-to-end.

---

### BUILD 2-D: Scenario Sensitivity Matrix

**What it is:** Upgrade the Scenarios tab from single-point sale assumption to a multi-variable sensitivity matrix. The user picks two variables (e.g., Exit Cap Rate and NOI Growth), defines a range for each, and the compute engine returns an IRR grid displayed as a heat map.

**UI interaction:**
```
Variable 1 (X axis): Exit Cap Rate
  Range: 5.0% → 7.5%, step 0.5% → 6 columns

Variable 2 (Y axis): NOI Growth (annual)
  Range: -2.0% → +4.0%, step 1.0% → 7 rows

Output: IRR at each (cap_rate, noi_growth) intersection
  Color scale: red (< 8% IRR) → yellow (8–12%) → green (> 12%)

Highlight cell: current base case assumption
```

**Implementation:** The existing `computeScenario()` function is called once per cell (N×M calls, typically 6×7=42 calls). Run these in parallel with `Promise.all()` — do not run sequentially.

**API change:** Add a `/api/re/v2/investments/[id]/scenarios/sensitivity` endpoint:
```typescript
// Request
{
  variable1: { name: "exit_cap_rate", min: 0.05, max: 0.075, step: 0.005 },
  variable2: { name: "noi_growth_annual", min: -0.02, max: 0.04, step: 0.01},
  baseAssumptions: { holdPeriod: 5, acquisitionCost: 45000000 }
}

// Response: matrix of { x, y, irr, moic } objects
```

**Clever test:** Assert the matrix is monotonically correct in both dimensions:
- Higher exit cap rate → lower IRR (all else equal) — assert every row is descending left to right
- Higher NOI growth → higher IRR (all else equal) — assert every column is ascending top to bottom
- If any cell violates these monotonicity constraints, the IRR formula has a bug

---

## PART 3 — VERIFICATION TESTS

These are the clever tests to run after all work is complete. Each one is designed to catch the specific failure modes found in testing, not just "does the page render."

---

### TEST SUITE: Data Layer Integrity

**T1 — Seed idempotency (critical):**
Run `POST /api/re/v2/seed` twice back-to-back. Query `SELECT COUNT(*) FROM re_lp_partner WHERE fund_id = '[fundId]'` before and after the second call. Count must remain 4 — not 8. The seed endpoint must use `INSERT ... ON CONFLICT DO NOTHING` or equivalent.

**T2 — NAV consistency check:**
```sql
-- Assert investment-level NAVs sum to fund-level NAV (within 2%)
SELECT
  ABS(SUM(m.nav) - f.nav) / f.nav AS variance_pct
FROM re_investment_metrics m
JOIN re_fund f ON f.id = m.fund_id
WHERE m.quarter = '2026Q1' AND f.id = '[fundId]'
HAVING ABS(SUM(m.nav) - f.nav) / f.nav > 0.02;
-- Zero rows expected — any row returned is a data integrity failure
```

**T3 — Cap rate sanity check:**
```sql
SELECT i.name, m.noi / m.gross_value AS cap_rate
FROM re_investment_metrics m
JOIN re_investment i ON i.id = m.investment_id
WHERE m.quarter = '2026Q1' AND m.fund_id = '[fundId]'
  AND (m.noi / m.gross_value < 0.03 OR m.noi / m.gross_value > 0.12);
-- Zero rows expected — any cap rate outside 3–12% is a seeding error
```

**T4 — LTV sanity check:**
```sql
SELECT i.name, d.loan_amount / m.gross_value AS ltv
FROM re_investment_debt d
JOIN re_investment_metrics m ON m.investment_id = d.investment_id
JOIN re_investment i ON i.id = d.investment_id
WHERE m.quarter = '2026Q1'
  AND (d.loan_amount / m.gross_value > 0.80 OR d.loan_amount / m.gross_value < 0.20);
-- Zero rows expected — any LTV outside 20–80% is a seeding error
```

**T5 — LP capital ledger balance check:**
```sql
SELECT lp.name,
  lp.committed_capital,
  SUM(cl.called_amount) AS total_called,
  SUM(cl.called_amount) / lp.committed_capital AS call_pct
FROM re_lp_capital_ledger cl
JOIN re_lp_partner lp ON lp.id = cl.lp_partner_id
WHERE cl.fund_id = '[fundId]'
GROUP BY lp.name, lp.committed_capital
HAVING SUM(cl.called_amount) / lp.committed_capital NOT BETWEEN 0.80 AND 0.95;
-- Zero rows expected — all LPs should be 80–95% called
```

---

### TEST SUITE: Pipeline Correctness

**T6 — Quarter Close actually writes returns (the known stub test):**
```typescript
// 1. Delete any existing return metrics for the quarter
await supabase.from('re_return_metrics').delete().match({ fund_id: fundId, quarter: '2026Q1' });

// 2. Run Quarter Close
const runResponse = await fetch('/api/re/v2/funds/[fundId]/quarter-close', { method: 'POST', body: JSON.stringify({ quarter: '2026Q1' }) });
const { runId } = await runResponse.json();

// 3. Poll until complete
await waitForRunCompletion(runId);  // poll re_run_log until status = SUCCESS

// 4. Check return metrics were written
const { data } = await supabase.from('re_return_metrics').select('*').match({ fund_id: fundId, quarter: '2026Q1' });
assert(data.length > 0, 'Quarter Close did not write return metrics — pipeline is a stub');
assert(data[0].gross_irr > data[0].net_irr, 'Gross IRR must exceed Net IRR after fees');
```

**T7 — Waterfall GP carry is zero when preferred return unmet:**
```typescript
// Scenario: fund has only distributed 6.8% of committed capital
// Hurdle rate is 8% IRR — clearly not met after 5 years
const waterfall = await computeWaterfall({ fundId, quarter: '2026Q1', hurdleRate: 0.08, carryRate: 0.20 });

assert(waterfall.gp_carry_amount === 0, 'GP should earn $0 carry when fund has not cleared hurdle');
assert(waterfall.steps.step2.amount > waterfall.total_distributions,
  'Unpaid preferred return should exceed total distributions (hurdle not met)');
```

**T8 — Sensitivity matrix monotonicity:**
```typescript
const matrix = await computeSensitivityMatrix({
  investmentId: meridianOfficeTowerId,
  variable1: { name: 'exit_cap_rate', values: [0.05, 0.055, 0.06, 0.065, 0.07] },
  variable2: { name: 'noi_growth', values: [0.00, 0.02, 0.04] }
});

// Higher cap rate = lower value = lower IRR: each row must be strictly descending
matrix.rows.forEach(row => {
  for (let i = 1; i < row.irrs.length; i++) {
    assert(row.irrs[i] < row.irrs[i-1], `IRR should decrease as cap rate increases (row ${row.noi_growth})`);
  }
});

// Higher NOI growth = higher IRR: each column must be strictly ascending
matrix.columns.forEach(col => {
  for (let i = 1; i < col.irrs.length; i++) {
    assert(col.irrs[i] > col.irrs[i-1], `IRR should increase as NOI growth increases (col ${col.cap_rate})`);
  }
});
```

**T9 — Covenant breach alert surfaces correctly:**
```typescript
// Seed one investment with DSCR below threshold
await seedTestDebt({ investmentId: testInvestmentId, noi: 2000000, annualDebtService: 1800000 });
// DSCR = 2.0M / 1.8M = 1.11x < 1.25x covenant

const fundPage = await loadFundDetailPage(fundId);
assert(fundPage.hasCovenantWarning(), 'Covenant breach banner should appear when DSCR < 1.25x');
assert(fundPage.covenantWarningMentions(testInvestmentId), 'Banner should name the specific investment');

// Fix the DSCR and confirm banner disappears
await seedTestDebt({ investmentId: testInvestmentId, noi: 2500000, annualDebtService: 1800000 });
// DSCR = 2.5M / 1.8M = 1.39x > 1.25x — clear

await fundPage.reload();
assert(!fundPage.hasCovenantWarning(), 'Covenant warning should clear when DSCR is healthy');
```

**T10 — Returns tab shows benchmark outperformance only when warranted:**
```typescript
// Seed benchmark return HIGHER than fund return for one quarter
await seedBenchmark({ quarter: '2024Q2', benchmark: 'NCREIF_ODCE', net_return: 0.0195 });
await seedFundReturn({ fundId, quarter: '2024Q2', net_irr_quarterly: 0.0140 });

const returnsTab = await loadReturnsTab(fundId);
const q2row = returnsTab.getQuarterRow('2024Q2');

assert(q2row.alpha < 0, 'Alpha must be negative when fund underperforms benchmark');
assert(q2row.benchmarkLabel === 'NCREIF ODCE', 'Benchmark label must be shown');
// This test catches a common error: always showing green/positive alpha
```

---

## COMPLETION CHECKLIST

Work through in order — later items depend on earlier ones:

**Wave 1 (Foundation)**
- [ ] FIX 1-A: `POST /api/re/v2/seed` returns 200 (schema migration applied)
- [ ] T1: Seed idempotency confirmed
- [ ] FIX 1-B: All investment detail fields populated (acquisition date, hold period, gross value, debt, LTV 35–60%, cap rate 5–10%)
- [ ] T2: NAV consistency check passes
- [ ] T3: Cap rate sanity check passes (all 3–12%)
- [ ] T4: LTV sanity check passes (all 20–80%)
- [ ] FIX 1-C: Returns tab populated after Quarter Close
- [ ] T6: Pipeline completeness test passes (Quarter Close writes return metrics)
- [ ] FIX 1-D: LP Summary shows 4-row partner table + gross-net bridge
- [ ] T5: LP capital ledger balance check passes (80–95% called)
- [ ] FIX 1-E: Fund NAV column in investment overview table populated (all rows non-"—")

**Wave 2 (New Features)**
- [ ] BUILD 2-A: LP Waterfall tab visible on fund detail page
- [ ] T7: Waterfall GP carry = $0 when fund below hurdle
- [ ] BUILD 2-B: Returns tab shows NCREIF ODCE benchmark column + alpha
- [ ] T10: Benchmark underperformance quarter shows negative alpha
- [ ] BUILD 2-C: Debt panel on investment detail (LTV gauge, DSCR, Debt Yield, covenant status)
- [ ] T9: Covenant breach → warning banner → fix → warning disappears
- [ ] BUILD 2-D: Sensitivity matrix on Scenarios tab
- [ ] T8: Sensitivity matrix monotonicity holds in both dimensions

**Final regression (run after all above):**
- [ ] All 10 original production tests still pass at 10/10
- [ ] Zero console errors on any page
- [ ] `POST /api/re/v2/seed` still returns 200 (idempotency maintained)
- [ ] Mobile (375px): all new tabs/features accessible and not broken

---

*Meta prompt prepared 2026-03-02. Platform context: Winston RE analytics, Meridian Capital Management test environment.*
