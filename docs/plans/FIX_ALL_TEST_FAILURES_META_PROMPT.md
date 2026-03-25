---
id: fix-all-test-failures-meta-prompt
kind: prompt
status: archived
source_of_truth: false
topic: legacy-fix-all-test-failures
owners:
  - docs
intent_tags:
  - docs
  - build
triggers:
  - fix all test failures
  - test failures meta prompt
entrypoint: false
handoff_to: []
when_to_use: "Use only as historical reference for the older paulmalmquist.com failure-recovery prompt."
when_not_to_use: "Do not use as the primary execution prompt for current routing or new implementation work."
surface_paths:
  - docs/plans/
notes:
  - Archived in favor of CLAUDE.md plus active routed skills and playbooks.
---

# Meta Prompt: Fix All paulmalmquist.com Test Failures
**Generated:** 2026-03-02
**Based on:** SITE_TEST_REPORT_2026-03-02.md
**Target score:** 10/10 tests passing (currently 5/10)

> Archived reference. Kept for historical context; do not use as the primary execution prompt.

---

Paste the following prompt into Claude Code from the repo root:

---

```
You are fixing a series of confirmed production bugs and missing data issues on the
paulmalmquist.com RE analytics platform. All issues were verified by automated browser
testing on 2026-03-02. Work through them in priority order (P0 → P1 → P2). For each
fix, search the codebase first, confirm the exact file and line, make the change, and
explain what you did. Do not skip or reorder items.

The app is a Next.js 14 app router project (repo-b). The RE module lives under
app/lab/env/[envId]/re/. The Supabase project ref is ozboonlsplroialdwuxj.
The backend API is at https://authentic-sparkle-production-7f37.up.railway.app.

---

## P0-A — Fix RSC Prefetch TypeError (8 console errors on every fund page load)

**Symptom:** Every time the fund detail page loads, the browser console logs 8 identical
errors:
  "Failed to fetch RSC payload for [.../re/investments/UUID]. Falling back to browser
   navigation. TypeError: Cannot read properties of undefined (reading 'includes')"

The stack trace always points to:
  window.fetch (app/lab/env/[envId]/re/funds/[fundId]/page-*.js:1:28816)

**What to do:**
1. Search the codebase for any file that monkey-patches or overrides window.fetch:
     grep -r "window.fetch" app/ --include="*.ts" --include="*.tsx"
   Also check for fetch interceptors in middleware or layout files:
     grep -r "originalFetch\|fetchInterceptor\|window\.fetch\s*=" app/ --include="*.ts" --include="*.tsx"

2. Once found, locate every place inside that override where .includes() is called on a
   value derived from the Response object (e.g., headers.get(), response.type,
   response.url). These values can be null/undefined when the request is a prefetch for
   an unloaded route.

3. Add optional chaining (?.) before every .includes() call in that fetch wrapper.
   Example pattern:
     BEFORE: response.headers.get('content-type').includes('text/x-component')
     AFTER:  response.headers.get('content-type')?.includes('text/x-component')

4. If the override is in the fund page itself (page.tsx), consider moving it to a
   useEffect so it only runs client-side after mount, not during SSR/prefetch.

5. Verify the fix by opening the fund detail page in the browser and confirming the
   console shows zero red errors on load.

---

## P0-B — Restore Interactive Scenario UI on Scenarios Tab

**Symptom:** The Scenarios tab at /lab/env/[envId]/re/funds/[fundId] shows only:
  "No scenarios created yet. Create a scenario via the API to start modeling."
The "New Sale Scenario" button and entire scenario creation panel are missing.

**What to do:**
1. Find the Scenarios tab component — it will be in a file named something like:
     app/lab/env/[envId]/re/funds/[fundId]/_tabs/ScenariosTab.tsx
   or it may be inlined in the fund page. Search:
     grep -r "No scenarios created" app/ --include="*.tsx"

2. The component likely has an early return or conditional that renders the empty state
   when scenarios.length === 0. It should instead render the creation UI alongside the
   empty state message. Restore (or add) the following UI elements:

   a) A "New Sale Scenario" primary button (blue) at the top of the tab
   b) A collapsible/modal panel that opens on click, containing:
      - Investment picker: a <select> dropdown populated by fetching
        GET /api/re/v2/funds/{fundId}/investments  (returns array of {id, name})
      - Sale Price: currency input (positive numbers only, >0 validation)
      - Sale Date: date picker
      - Disposition Fee %: number input (0-10 range, 2 decimal places)
      - "Add Sale Assumption" button (green)
      - List of added sale assumptions with [Remove] button per row
   c) "Compute Impact" button (appears after at least 1 assumption is added)
   d) Results section: a comparison table showing Base vs Scenario for:
      Gross IRR | Net IRR | Gross TVPI | Net TVPI — with delta column and
      green/red color coding for positive/negative deltas

3. Wire "Compute Impact" to:
     POST /api/re/v2/funds/{fundId}/scenario-compute
   Body: { sales: [{ investmentId, salePrice, saleDate, dispositionFeePct }] }
   The response should include base_metrics and scenario_metrics objects.

4. Add input validation that fires before "Add Sale Assumption":
   - Sale price must be > 0 → show inline error "Sale price must be > $0"
   - Sale date must be after the investment's acquisition_date → warn
     "Sale date cannot be before acquisition date"
   - At least one sale required before "Compute Impact" → show message
     "Please add at least one sale assumption"

5. The scenario selector dropdown should still show any existing scenarios fetched from
     GET /api/re/v2/funds/{fundId}/scenarios
   The "New Sale Scenario" UI is additive on top of the existing selector.

---

## P1-A — Seed LP Partner Data

**Symptom:** LP Summary tab shows "No LP data available. Seed partners and capital
ledger entries first." No partner table, no gross-net bridge.

**What to do:**
1. Find the RE seed script. Search for:
     grep -r "re_partner\|repe_partner\|lp_partner" scripts/ supabase/ --include="*.ts" --include="*.sql" -l
   Also check:
     grep -r "seed" scripts/ --include="*.ts" -l

2. In that seed script (or create a new one at scripts/seed-re-partners.ts), insert
   the following data for fund ID a1b2c3d4-0003-0030-0001-000000000001:

   Partners (table: re_partner or repe_partner):
   - Winston Capital | type: GP  | committed: 10_000_000  | carry_pct: 20
   - State Pension    | type: LP  | committed: 200_000_000 | carry_pct: 0
   - Univ. Endowment  | type: LP  | committed: 150_000_000 | carry_pct: 0
   - Sovereign Wealth | type: LP  | committed: 140_000_000 | carry_pct: 0

   Capital ledger entries (table: re_capital_ledger or capital_call):
   For each partner, insert called capital at ~85% of committed and distributions
   at ~6.8% of committed:
   - Winston Capital:    called =  8_500_000  | distributed =   680_000
   - State Pension:      called = 170_000_000 | distributed = 13_600_000
   - Univ. Endowment:    called = 127_500_000 | distributed = 10_200_000
   - Sovereign Wealth:   called = 119_000_000 | distributed =  9_520_000

   Fee accrual (table: re_fund_fee_accrual or re_fund_metrics.fees):
   For quarter 2026Q1:
   - Management fees: 375_000
   - Fund expenses:   255_000
   - Carry (GP 20%):  960_000
   (These power the gross-net bridge visualization)

3. Run the seed script against the production Supabase instance:
     npx ts-node scripts/seed-re-partners.ts
   or via the Supabase dashboard SQL editor.

4. After seeding, verify by navigating to the LP Summary tab and confirming:
   - 4 rows in partner table with correct committed/distributed/NAV/TVPI values
   - Gross-net bridge shows: Gross $7M → Fees → Net $5.41M
   - Winston Capital shows 20% carry allocation

---

## P1-B — Seed Investment-Level Financial Metrics

**Symptom:** On both the fund overview investment table and individual investment detail
pages, all financial columns show "—": Committed, Called, Fund NAV, IRR, MOIC, NOI,
Gross Value, Debt, LTV, Acquisition Date, Hold Period.

**What to do:**
1. Find the investment metrics table. Search:
     grep -r "re_investment_metrics\|repe_investment_metrics" supabase/ --include="*.sql" -l
   and check the schema file for column names.

2. For each of the 12 investments under fund a1b2c3d4-0003-0030-0001-000000000001,
   insert or update the following for quarter 2026Q1. Use proportional values based on
   the fund's $425M NAV. Example values (adjust proportionally per investment):

   Meridian Office Tower (est. ~$45M acquisition):
     acquisition_date: '2021-06-15' | hold_period_months: 54
     gross_value: 55_000_000 | debt: 20_000_000 | nav: 35_000_000
     noi: 2_800_000 | ltv: 0.364 | irr: 0.142 | moic: 1.22

   Apply similar logic to all 12 investments, ensuring:
   - Total fund NAV across investments sums near $425M
   - LTV values are between 0 and 0.65
   - IRR values are between 0.08 and 0.18 (realistic REPE range)

3. Also update the re_investment table itself with:
     UPDATE re_investment
     SET acquisition_date = '...', hold_period_months = ..., committed_capital = ...
     WHERE fund_id = 'a1b2c3d4-0003-0030-0001-000000000001';

4. Verify by loading an investment detail page (e.g., Meridian Office Tower) and
   confirming NAV, NOI, IRR, MOIC, LTV all show real values instead of "—".

---

## P1-C — Seed Committed/Called/Distributed at Fund Header Level

**Symptom:** The fund detail page header shows Committed: $0, Called: $0, Distributed: $0
even though NAV correctly shows $425.0M.

**What to do:**
1. Check where the fund header metrics are sourced. Search for the query that fetches
   the fund detail:
     grep -r "committed\|called\|distributed" app/lab/env/\[envId\]/re/funds/ --include="*.ts" --include="*.tsx"
   Also check the API route:
     grep -r "committed\|called\|distributed" app/api/re/ --include="*.ts" -l

2. If committed/called/distributed are derived from the capital ledger (i.e., summed
   from partner records), then completing P1-A (seeding partners) should auto-fix this.
   Verify after running the partner seed.

3. If they are stored separately on the fund record itself, update the re_fund table:
     UPDATE re_fund
     SET committed_capital = 500_000_000,
         called_capital = 425_000_000,
         distributed_capital = 34_000_000
     WHERE id = 'a1b2c3d4-0003-0030-0001-000000000001';

4. Expected values after fix:
   Committed: ~$500M | Called: ~$425M | Distributed: ~$34M

---

## P1-D — Seed a Quarter Close Run for 2026Q1

**Symptom:** Run Center shows "No runs yet." Returns (Gross/Net) tab shows
"No return metrics available. Run a Quarter Close first."

**What to do:**
1. Option A (preferred) — Run it through the UI:
   Navigate to the fund's Run Center tab at:
     /lab/env/a1b2c3d4-0001-0001-0003-000000000001/re/funds/a1b2c3d4-0003-0030-0001-000000000001
   Click the "Run Center" tab → confirm quarter is 2026Q1 → click "Run Quarter Close"
   Wait for completion. This should:
   - Create a run log entry (fixing "No runs yet")
   - Compute return metrics for 2026Q1 (fixing Returns tab)

2. Option B — Seed directly via SQL if the Run Center button is broken:
   Find the run log table:
     grep -r "re_run_log\|re_quarter_close\|run_log" supabase/ --include="*.sql" -l
   Insert a completed 2026Q1 run for the fund with status='completed' and
   appropriate timestamps.

---

## P2-A — Fix Asset Expansion Property Details

**Symptom:** Clicking the ▸ expand arrow on an investment in the fund overview shows
the asset row but cost, units, and market are all "—". Only type (Office) and
ownership structure (Direct) display.

**What to do:**
1. Find the asset expansion component:
     grep -r "cost_basis\|property_type\|units\|market" app/lab/env/\[envId\]/re/ --include="*.tsx" -l

2. Check the query that fetches asset details for the expansion. It should be hitting
   something like:
     GET /api/repe/deals/[dealId]/assets
   or fetched inline when the row expands. The SQL should JOIN to re_property_asset
   (or repe_property_asset) to get: cost_basis, units, market, property_type.

3. If the data is being fetched but the columns are not rendered, find the expansion
   row component and add the missing cells:
     <td>{asset.units ? `${asset.units.toLocaleString()} sf` : '—'}</td>
     <td>{asset.market ?? '—'}</td>
     <td>{asset.cost_basis ? formatCurrency(asset.cost_basis) : '—'}</td>

4. If the data is missing from the database, update the re_property_asset table:
   For "Meridian Office Tower" asset, set:
     units = 250000 | market = 'Downtown Chicago' | cost_basis = 45_000_000
   Apply similar values to the other 11 investment assets.

---

## P2-B — Fix AUM Showing $0 on Fund List Page

**Symptom:** The Fund Portfolio list shows AUM: $0 for all 3 funds. NAV is correct.
AUM should equal total committed capital (not NAV).

**What to do:**
1. Find the fund list query:
     grep -r "aum\|AUM" app/lab/env/\[envId\]/re/ app/api/re/ --include="*.ts" --include="*.tsx" -l

2. Check if AUM is a separate column on the re_fund table or if it's computed:
     SELECT column_name FROM information_schema.columns
     WHERE table_name = 're_fund' AND column_name ILIKE '%aum%';

3. If AUM is a stored column, update it:
     UPDATE re_fund SET aum = committed_capital WHERE env_id = 'a1b2c3d4-0001-0001-0003-000000000001';

4. If AUM should be computed (sum of all partner committed capital), fix the query
   in the fund list endpoint to include a subquery:
     (SELECT COALESCE(SUM(committed), 0) FROM re_partner WHERE fund_id = re_fund.id) AS aum

---

## P2-C — Add Mobile Hamburger Menu for Sidebar

**Symptom:** At 375px width, the sidebar (8 nav items) renders as a full-width
vertical stack above the main content, forcing ~400px of scrolling before the user
sees any fund data. There is no way to collapse or hide it.

**What to do:**
1. Find the RE layout component that renders the sidebar + main content:
     grep -r "Funds\|Investments\|Assets\|Pipeline" app/lab/env/\[envId\]/re/ --include="*.tsx" -l
   It will likely be a layout.tsx or a shared sidebar component.

2. Add responsive behavior:
   a) In the sidebar wrapper, add a Tailwind class to hide on mobile:
        className="hidden md:flex md:flex-col w-[200px] ..."

   b) Add a hamburger button visible only on mobile in the top header bar:
        <button
          className="md:hidden p-2 rounded"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle navigation"
        >
          <MenuIcon className="h-5 w-5" />
        </button>

   c) When sidebarOpen is true, render the sidebar as a fixed overlay:
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
            <nav className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl p-4">
              {/* same nav items */}
            </nav>
          </div>
        )}

   d) Ensure useState is at the top of the component:
        const [sidebarOpen, setSidebarOpen] = useState(false);

   e) Also fix the top nav button bar — wrap it in a horizontally scrollable container
      at mobile breakpoints:
        className="flex overflow-x-auto gap-2 px-4"
      and ensure each button has min-w to stay tappable.

3. After implementing, test by resizing to 375px. The fund detail page should show
   only the header + main content on initial load, with the sidebar accessible via
   the hamburger icon.

---

## Verification Checklist

After completing all fixes above, re-run the full test suite by visiting
paulmalmquist.com in a browser and confirming:

- [ ] Fund page loads with 0 console errors (no more RSC TypeError)
- [ ] Scenarios tab shows "New Sale Scenario" button
- [ ] Can add a sale assumption and click "Compute Impact" → see delta table
- [ ] LP Summary shows 4-row partner table (Winston, State Pension, Univ. Endow., Sovereign)
- [ ] LP Summary shows gross-net bridge with fee breakdown
- [ ] Fund header: Committed ~$500M, Called ~$425M, Distributed ~$34M
- [ ] Investment table: Committed and Fund NAV columns show values (not "—")
- [ ] Investment detail page: NAV, NOI, IRR, MOIC all show real values
- [ ] Acquisition date and hold period visible on investment detail
- [ ] Run Center shows at least one completed 2026Q1 run
- [ ] Returns (Gross/Net) tab shows return metrics (not empty state)
- [ ] Asset expansion shows cost, units, market for Meridian Office Tower
- [ ] AUM shows real values on fund list page
- [ ] At 375px width, sidebar is hidden by default with hamburger button visible
- [ ] Console: 0 red errors on any page

Target: 10/10 tests passing.
```
