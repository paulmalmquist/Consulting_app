# Meta Prompt: Fix Remaining paulmalmquist.com Failures (Run 2 → 10/10)
**Generated:** 2026-03-02
**Based on:** SITE_TEST_REPORT_2026-03-02_RUN2.md
**Current score:** 7/10
**Target score:** 10/10

**Resolved in previous round (do NOT re-touch):**
- P0-A RSC TypeError → fixed ✅
- P0-B Scenarios interactive UI → fixed ✅
- P1-C Fund header Committed/Called/Distributed → fixed ✅
- P2-C Mobile hamburger menu → fixed ✅

---

Paste the following prompt into Claude Code from the repo root:

---

```
You are fixing the remaining confirmed production failures on the paulmalmquist.com
RE analytics platform. All issues below were verified by automated browser testing
on 2026-03-02 (Run 2). The score is currently 7/10 — these fixes will bring it to 10/10.

Work through items in order. Every section starts with the exact symptom observed
in testing, what was confirmed about the root cause, and what to do. Do not skip or
reorder items.

App: Next.js 14 App Router (repo-b)
RE module: app/lab/env/[envId]/re/
Supabase project: ozboonlsplroialdwuxj
Backend API: https://authentic-sparkle-production-7f37.up.railway.app
Fund ID: a1b2c3d4-0003-0030-0001-000000000001
Env ID:  a1b2c3d4-0001-0001-0003-000000000001

---

## ROOT BLOCKER — Apply the RE Schema Migration

**Symptom confirmed in testing:**
Every page load fires `POST /api/re/v2/seed → 500`. Clicking "Run Quarter Close"
in the Run Center tab shows a pink banner: "RE schema not migrated." This single
unresolved migration blocks P1-A (LP data), P1-B (investment metrics), and P1-D
(Quarter Close / Returns tab).

**What was confirmed:**
- The seed endpoint (`POST /api/re/v2/seed`) attempts to run on every fund page load
  and returns HTTP 500
- The error text "RE schema not migrated" is returned to the client and displayed
  in the Run Center UI when attempting a Quarter Close
- All data-seeding endpoints are gated behind this migration check

**What to do:**

1. Find the migration file that is failing. Search for the migration check:
     grep -r "RE schema not migrated\|schema not migrated\|re schema" \
       app/api/re/ supabase/ --include="*.ts" --include="*.sql" --include="*.js" -l

2. Open that file and read the migration check logic. It likely does something like:
     const tableExists = await checkTableExists('re_lp_partner') // or similar
     if (!tableExists) throw new Error('RE schema not migrated')

   Identify the exact table(s) or column(s) it is checking for.

3. Find the corresponding migration SQL file:
     ls supabase/migrations/ | grep -i "re\|real_estate\|repe"
   If there is a pending migration file, apply it:
     npx supabase db push
   or via the Supabase dashboard SQL editor — open the migration SQL and run it
   against project ozboonlsplroialdwuxj.

4. If there is no migration file but the migration check code references specific
   tables, create those tables now. The minimum schema needed (infer exact column
   names from the seed script and API routes) is:
   - re_lp_partner (or re_partner): fund_id, name, type (GP/LP), committed, carry_pct
   - re_capital_ledger (or re_capital_call): partner_id, fund_id, called, distributed
   - re_investment_metrics: investment_id, fund_id, quarter, nav, noi, gross_value,
     debt, ltv, irr, moic
   - re_run_log (or re_quarter_close_log): fund_id, quarter, status, created_at

5. After applying the migration, restart the dev/prod server and verify:
     curl -X POST https://www.paulmalmquist.com/api/re/v2/seed \
       -H 'Content-Type: application/json' \
       -d '{"envId":"a1b2c3d4-0001-0001-0003-000000000001"}' \
       -w "\nHTTP %{http_code}"
   Expected: HTTP 200 (not 500).

6. ALSO investigate why the seed endpoint auto-fires on every page load and whether
   that is intentional. If it should only run once (on environment setup), add a
   guard to the calling code:
     grep -r "re/v2/seed" app/ --include="*.ts" --include="*.tsx" -l
   If called from a useEffect or layout, add a flag to prevent repeated calls:
     if (alreadySeeded) return;  // or check a localStorage / server-side flag

---

## P1-A — Seed LP Partner Data (unblocked after schema migration above)

**Symptom confirmed in testing:**
LP Summary tab shows "No LP data available. Seed partners and capital ledger
entries first." This has been the same in every test run.

**What to do:**

1. After the schema migration is applied, find or create the partner seed script:
     grep -r "re_partner\|repe_partner\|lp_partner\|Winston Capital" \
       scripts/ supabase/ --include="*.ts" --include="*.sql" -l

2. Confirm the exact table name by checking the migration SQL you just applied.
   Use that exact table name throughout.

3. INSERT the following 4 partners for fund a1b2c3d4-0003-0030-0001-000000000001.
   Use UUIDs for IDs — generate with crypto.randomUUID() or a UUID library:

   Partners:
   | name                       | type | committed   | carry_pct |
   |----------------------------|------|-------------|-----------|
   | Winston Capital (GP)       | GP   | 10,000,000  | 20        |
   | State Pension Fund         | LP   | 200,000,000 | 0         |
   | University Endowment       | LP   | 150,000,000 | 0         |
   | Sovereign Wealth Fund      | LP   | 140,000,000 | 0         |

   Capital ledger entries (called ~85% of committed, distributed ~6.8%):
   | partner                | called      | distributed |
   |------------------------|-------------|-------------|
   | Winston Capital        | 8,500,000   | 680,000     |
   | State Pension Fund     | 170,000,000 | 13,600,000  |
   | University Endowment   | 127,500,000 | 10,200,000  |
   | Sovereign Wealth Fund  | 119,000,000 | 9,520,000   |

   Fund-level fee accrual for quarter 2026Q1 (for gross-net bridge chart):
   | item             | amount    |
   |------------------|-----------|
   | management_fees  | 375,000   |
   | fund_expenses    | 255,000   |
   | carry_accrual    | 960,000   |

4. Run the seed script:
     npx ts-node scripts/seed-re-partners.ts
   or execute the INSERT statements directly in the Supabase dashboard SQL editor.

5. Verify: Navigate to LP Summary tab. Confirm:
   - Table shows 4 rows with Winston Capital, State Pension, Univ. Endowment,
     Sovereign Wealth
   - Committed totals ~$500M, Called totals ~$425M, Distributed totals ~$34M
   - Gross-net bridge section is visible with fee line items
   - Winston Capital shows 20% carry allocation line

---

## P1-B — Seed Investment-Level Financial Metrics

**Symptom confirmed in testing:**
All 12 investments show "—" in the Committed and Fund NAV columns in the fund
overview table. On investment detail pages (e.g., Meridian Office Tower at
/lab/env/.../re/investments/[uuid]), ALL financial fields are empty: NAV, NOI,
Gross Value, Debt, LTV, IRR, MOIC, Acquisition Date, Hold Period.

**What to do:**

1. First, identify the actual investment UUIDs by querying Supabase:
     SELECT id, name FROM re_investment
     WHERE fund_id = 'a1b2c3d4-0003-0030-0001-000000000001'
     ORDER BY name;

2. Then find and check the investment metrics table (confirmed as re_investment_metrics
   or similar from the schema migration). Check if any rows exist:
     SELECT COUNT(*) FROM re_investment_metrics
     WHERE fund_id = 'a1b2c3d4-0003-0030-0001-000000000001';

3. For each of the 12 investments, INSERT or UPSERT metrics for quarter 2026Q1.
   Distribute the fund's $425M NAV proportionally. Use the values below as a guide
   (actual investment names as seen in the UI — match by name to the UUIDs from step 1):

   | Investment Name              | nav ($M) | noi ($M) | gross ($M) | debt ($M) | ltv  | irr   | moic |
   |------------------------------|----------|----------|------------|-----------|------|-------|------|
   | Meridian Office Tower        | 38.5     | 2.80     | 55.0       | 20.0      | 0.36 | 0.142 | 1.22 |
   | Harborview Logistics Park    | 52.0     | 3.60     | 72.0       | 28.0      | 0.39 | 0.167 | 1.44 |
   | Cascade Multifamily          | 44.0     | 3.10     | 62.0       | 24.0      | 0.39 | 0.153 | 1.33 |
   | Summit Retail Center         | 28.0     | 1.95     | 38.0       | 14.0      | 0.37 | 0.118 | 1.08 |
   | Ironworks Mixed-Use          | 35.0     | 2.45     | 49.0       | 19.0      | 0.39 | 0.131 | 1.15 |
   | Lakeside Senior Living       | 31.5     | 2.20     | 44.0       | 17.0      | 0.39 | 0.124 | 1.11 |
   | Pacific Gateway Hotel        | 42.0     | 2.90     | 60.0       | 23.0      | 0.38 | 0.148 | 1.28 |
   | Riverfront Apartments        | 38.0     | 2.65     | 53.0       | 20.0      | 0.38 | 0.139 | 1.19 |
   | Tech Campus North            | 48.0     | 3.35     | 67.0       | 26.0      | 0.39 | 0.162 | 1.39 |
   | Harbor Industrial Portfolio  | 33.0     | 2.30     | 46.0       | 18.0      | 0.39 | 0.127 | 1.12 |
   | Downtown Mixed-Use           | 29.0     | 2.00     | 40.0       | 15.0      | 0.38 | 0.120 | 1.09 |
   | Suburban Office Park         | 6.0      | 0.42     | 8.5        | 3.3       | 0.39 | 0.082 | 0.89 |

   Total NAV should sum to approximately $425M.

4. Also update the re_investment table to add acquisition dates and hold periods:
     UPDATE re_investment SET
       acquisition_date = '2021-06-15',
       hold_period_months = 54,
       committed_capital = [proportional value]
     WHERE name = 'Meridian Office Tower' AND fund_id = 'a1b2c3d4-0003-0030-0001-000000000001';

   Use acquisition dates in the 2019-2022 range to give realistic hold periods
   of 36-60 months as of 2026Q1.

5. Verify by navigating to any investment detail page and confirming NAV, NOI,
   IRR, MOIC, LTV, Acquisition Date, and Hold Period all show values. Also
   verify the fund overview table now shows values in the Committed and Fund NAV
   columns for all 12 investments.

---

## P1-D — Run Quarter Close for 2026Q1 (unblocked after schema migration)

**Symptom confirmed in testing:**
Run Center shows "No runs yet." Clicking "Run Quarter Close" shows error banner:
"RE schema not migrated." Returns (Gross/Net) tab shows "No return metrics
available. Run a Quarter Close first."

**What to do:**

1. After the schema migration is applied (ROOT BLOCKER above), navigate to:
   https://www.paulmalmquist.com/lab/env/a1b2c3d4-0001-0001-0003-000000000001/re/funds/a1b2c3d4-0003-0030-0001-000000000001
   Click the "Run Center" tab.

2. Confirm the quarter shows "2026Q1" and click "Run Quarter Close."
   Wait for the run to complete (spinner → success state).

3. After the run completes, verify:
   - Run Center now shows a completed run entry in the run history table
   - Returns (Gross/Net) tab now shows Gross IRR, Net IRR, Gross TVPI, Net TVPI metrics

4. If the Run Quarter Close button still fails after the migration is applied,
   debug the compute endpoint it calls. Check the server logs or the Network tab
   for the POST response body and address any remaining errors.

   To seed a completed run directly if the button is still broken:
     INSERT INTO re_run_log (id, fund_id, quarter, status, run_type, created_at, completed_at)
     VALUES (
       gen_random_uuid(),
       'a1b2c3d4-0003-0030-0001-000000000001',
       '2026Q1',
       'completed',
       'quarter_close',
       NOW() - INTERVAL '1 hour',
       NOW()
     );

---

## P2-A — Seed Asset Expansion Property Details

**Symptom confirmed in testing:**
Clicking the ▸ expand arrow on any investment row in the fund overview table shows
the asset row, but the following fields show "—": cost basis, square footage (units),
and market/submarket. Only property type and ownership structure display correctly.

**What to do:**

1. Identify the asset table name:
     grep -r "cost_basis\|sq_ft\|submarket\|re_property_asset\|repe_asset" \
       supabase/ app/api/ --include="*.ts" --include="*.sql" -l

2. Check how many assets exist and which fields are null:
     SELECT id, investment_id, property_type, cost_basis, units, market
     FROM re_property_asset  -- or repe_property_asset
     WHERE investment_id IN (
       SELECT id FROM re_investment
       WHERE fund_id = 'a1b2c3d4-0003-0030-0001-000000000001'
     )
     LIMIT 5;

3. If cost_basis, units, and market are NULL, update them:
   Run UPDATEs joining on investment name. Example values per investment:

   | Investment Name              | units (sf) | market               | cost_basis ($) |
   |------------------------------|------------|----------------------|----------------|
   | Meridian Office Tower        | 250,000    | Downtown Chicago     | 45,000,000     |
   | Harborview Logistics Park    | 420,000    | Seattle Port         | 52,000,000     |
   | Cascade Multifamily          | 312 units  | Portland Metro       | 48,000,000     |
   | Summit Retail Center         | 185,000    | Denver Suburbs       | 31,000,000     |
   | Ironworks Mixed-Use          | 210,000    | Oakland/East Bay     | 38,000,000     |
   | Lakeside Senior Living       | 220 units  | Minneapolis Metro    | 34,000,000     |
   | Pacific Gateway Hotel        | 285 keys   | San Francisco Bay    | 46,000,000     |
   | Riverfront Apartments        | 240 units  | Austin Downtown      | 41,000,000     |
   | Tech Campus North            | 380,000    | Silicon Valley       | 56,000,000     |
   | Harbor Industrial Portfolio  | 650,000    | Los Angeles Port     | 36,000,000     |
   | Downtown Mixed-Use           | 195,000    | Nashville Core       | 32,000,000     |
   | Suburban Office Park         | 120,000    | Denver Tech Corridor | 8,200,000      |

4. If the expansion row component is rendering these fields but the query doesn't
   return them, locate the expansion query and confirm the SELECT includes cost_basis,
   units (or sq_ft), and market (or submarket):
     grep -r "asset\|expand" app/lab/env/\[envId\]/re/funds/ --include="*.tsx" -l

5. Verify: Expand any investment row in the fund overview. Confirm all 3 property
   detail fields now show values alongside type and ownership structure.

---

## P2-B — Fix AUM Showing $0 on Fund List

**Symptom confirmed in testing:**
The Fund Portfolio list at /lab/env/[envId]/re shows AUM: $0 for all 3 funds.
This was present in both Run 1 and Run 2. NAV correctly shows $425M, $765M, $510M.

**What to do:**

1. Find where AUM is queried for the fund list:
     grep -rn "aum\|AUM" app/lab/env/\[envId\]/re/ app/api/re/ \
       --include="*.ts" --include="*.tsx"

2. Check the re_fund table for what's stored:
     SELECT id, name, nav, aum, committed_capital FROM re_fund
     WHERE env_id = 'a1b2c3d4-0001-0001-0003-000000000001';

3. Choose the right fix based on what you find:

   Option A — If aum is a stored column that is 0/null, update it directly:
     UPDATE re_fund
     SET aum = CASE
       WHEN name ILIKE '%Growth Fund VII%'         THEN 500000000
       WHEN name ILIKE '%Real Estate Fund III%'    THEN 765000000
       WHEN name ILIKE '%Credit Opportunities%'    THEN 510000000
       ELSE aum
     END
     WHERE env_id = 'a1b2c3d4-0001-0001-0003-000000000001';

   Option B — If aum should be computed from partner committed capital (after P1-A
   is seeded), fix the fund list API endpoint to compute it dynamically:
     -- In the fund list query, add a subquery:
     (SELECT COALESCE(SUM(committed), 0)
      FROM re_partner
      WHERE fund_id = re_fund.id) AS aum

   Option C — If the API returns the right value but the UI isn't rendering it,
   find the fund card component and confirm it's reading the aum field (not
   accidentally reading committed_capital or another field name):
     grep -rn "aum\|AUM" app/lab/env/\[envId\]/re/ --include="*.tsx"

4. Verify: Fund Portfolio list shows AUM ~$500M, ~$765M, ~$510M for the 3 funds.

---

## P2-PARTIAL — Add Inline Validation Errors to Scenario Form

**Symptom confirmed in testing:**
The Scenarios tab now has a working "New Sale Scenario" form (fixed in prior round).
However, when invalid inputs are submitted, the form silently does nothing rather
than displaying error messages:
- Clicking "Add Sale Assumption" with no investment selected → no message shown
- Clicking "Add Sale Assumption" with sale price $0 → no message shown

The spec requires explicit inline error messages immediately below the relevant input.

**What to do:**

1. Find the sale scenario form component:
     grep -r "Add Sale Assumption\|sale_price\|salePrice" \
       app/lab/env/\[envId\]/re/ --include="*.tsx" -l

2. The form likely has a submission handler. Find where it validates inputs and
   add inline error state. Example pattern to implement:

   Add state for field-level errors:
     const [errors, setErrors] = useState<{
       investment?: string;
       salePrice?: string;
       saleDate?: string;
     }>({});

   In the "Add Sale Assumption" click handler, before adding to the list:
     const newErrors: typeof errors = {};
     if (!selectedInvestmentId) {
       newErrors.investment = 'Please select an investment';
     }
     if (!salePrice || salePrice <= 0) {
       newErrors.salePrice = 'Sale price must be greater than $0';
     }
     if (!saleDate) {
       newErrors.saleDate = 'Sale date is required';
     }
     if (Object.keys(newErrors).length > 0) {
       setErrors(newErrors);
       return;  // stop — don't add to list
     }
     setErrors({});  // clear errors on success
     // ... proceed to add assumption

3. Render the error messages directly below each input field:
     {errors.investment && (
       <p className="text-sm text-red-600 mt-1">{errors.investment}</p>
     )}
     {errors.salePrice && (
       <p className="text-sm text-red-600 mt-1">{errors.salePrice}</p>
     )}
     {errors.saleDate && (
       <p className="text-sm text-red-600 mt-1">{errors.saleDate}</p>
     )}

4. Also add a check before "Compute Impact":
   If no sale assumptions have been added, show a message instead of calling the API:
     if (saleAssumptions.length === 0) {
       setComputeError('Please add at least one sale assumption before computing.');
       return;
     }

5. Verify: Try submitting an empty form — red error messages should appear inline
   under the relevant fields. Enter valid data and confirm errors clear on success.

---

## Verification Checklist

After completing all fixes, reload paulmalmquist.com and confirm every item:

- [ ] POST /api/re/v2/seed returns 200 (not 500) on page load — check Network tab
- [ ] Clicking "Run Quarter Close" in Run Center completes successfully (no "RE schema not migrated" banner)
- [ ] LP Summary tab shows 4-row partner table: Winston Capital, State Pension, Univ. Endowment, Sovereign Wealth
- [ ] LP Summary shows gross-net bridge with management fees, fund expenses, and carry lines
- [ ] Investment table (fund overview): Committed and Fund NAV columns show values for all 12 investments
- [ ] Investment detail page (Meridian Office Tower): NAV, NOI, IRR, MOIC, LTV all show real values
- [ ] Investment detail: Acquisition date and hold period shown
- [ ] Run Center tab: Shows at least one completed 2026Q1 run in run history
- [ ] Returns (Gross/Net) tab: Shows Gross IRR, Net IRR, Gross TVPI, Net TVPI (not empty state)
- [ ] Asset expand row: Cost, square footage, and market/submarket show values (not "—")
- [ ] Fund Portfolio list: AUM shows ~$500M, ~$765M, ~$510M (not $0)
- [ ] Scenario form: Submitting empty investment selection shows "Please select an investment"
- [ ] Scenario form: Submitting $0 price shows "Sale price must be greater than $0"
- [ ] Console: 0 red errors on any page (keep watching — RSC TypeError must stay fixed)
- [ ] POST /api/re/v2/seed no longer fires on every page load (or returns 200 consistently)

All 15 items passing = 10/10 test score.
```
