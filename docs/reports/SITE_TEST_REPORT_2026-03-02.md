# paulmalmquist.com — Production Test Report
**Date:** 2026-03-02
**Environment:** Meridian Capital Management (Real Estate)
**Fund Tested:** Institutional Growth Fund VII ($425M NAV)
**Tester:** Claude (automated browser test)
**Previous Test:** February 27, 2026

---

## Overall Score: 5/10 Tests Passing

| # | Test | Result | vs Last Test |
|---|------|--------|-------------|
| 1 | Fund List & Navigation | ✅ PASS | → Same |
| 2 | Fund Detail — Overview Tab | ⚠️ PARTIAL | → Same |
| 3 | Scenarios Tab | ❌ FAIL | 🔴 NOT FIXED |
| 4 | LP Summary Tab | ❌ FAIL | 🔴 NOT FIXED |
| 5 | Supporting Tabs (Variance, Returns, Run Center) | ⚠️ PARTIAL | ✅ IMPROVED |
| 6 | Investment Detail Pages | ⚠️ PARTIAL | → Same |
| 7 | Debug Footer | ✅ PASS (with warning) | → Same |
| 8 | Error Handling / Scenario Validation | ❌ BLOCKED | 🔴 BLOCKED BY TEST 3 |
| 9 | Mobile Responsiveness | ⚠️ PARTIAL | → Same |
| 10 | Console Errors & Network | ❌ FAIL | ⚠️ NEW ISSUE FOUND |

---

## What Improved Since Last Test ✅

- **Variance (NOI) tab now works with live data** — NOI Actual $5.1M, Plan $4.6M, Variance $433K (+9.3%). Was returning 502 before.
- **Run Center tab now has full UI** — Shows "Run Quarter Close" + "Run Waterfall (Shadow)" buttons, quarter 2026Q1, budget baseline "Institutional V2 Underwrite". Was 502 before.
- **Returns (Gross/Net) tab loads** — No more 502. Shows empty state ("Run a Quarter Close first") which is expected if no quarter close has been run.
- **New Waterfall Scenario tab added** — Loads correctly, shows scenario dropdown + "Run Scenario Waterfall" button.
- **Portfolio Valuation section** added to Overview: $321.0M portfolio, $216.0M equity, 5.27% cap rate, 32.7% LTV. Good addition.

---

## What Was NOT Fixed (Asked Last Time) 🔴

These issues were flagged in the Feb 27 test and remain unresolved:

### 1. Scenarios Tab — Interactive UI Completely Missing
**Status: NOT FIXED**
The entire "New Sale Scenario" button and interactive scenario panel is gone. The tab now shows:
> *"No scenarios created yet. Create a scenario via the API to start modeling."*

The test plan required an interactive UI for creating sale scenarios in-browser. This blocks TEST 8 (error handling) entirely.

### 2. LP Summary — No Partner Data Seeded
**Status: NOT FIXED**
Still shows:
> *"No LP data available. Seed partners and capital ledger entries first."*

The test plan expected a 4-partner table (Winston Capital GP + 3 LPs), waterfall bridge, and per-partner allocations.

### 3. Investment-Level Committed Capital & Financial Metrics Empty
**Status: NOT FIXED**
On both the fund overview table and investment detail pages, Committed, Called, Distributed, NAV, IRR, MOIC all show "—". Only one investment (Suburban Office Park) shows a Fund NAV of $216.0M.

### 4. Asset Expansion Missing Property Details
**Status: NOT FIXED**
Clicking the expand arrow on an investment shows the asset but cost, market, units are all "—". Test expected: property type ✅, 250,000 sf ❌, Downtown Chicago ❌, $45,000,000 cost ❌.

---

## New Issues Found This Run 🆕

### 5. RSC Prefetch TypeError — 8 Console Errors on Fund Page Load
**Severity: HIGH**
Every time the fund detail page loads, Next.js attempts to prefetch RSC (React Server Component) payloads for all 12 investment links. This fails with:

```
TypeError: Cannot read properties of undefined (reading 'includes')
  at window.fetch (page-31ea185165ec2e10.js:1:28816)
```

This fires 8 times — once for each investment link + the sustainability link. The page still works (falls back to browser navigation), but:
- It generates 8 red console errors on every page load
- It slows down navigation to investment details (no prefetch = full page load)
- It confirms a bug in the fund page's custom `window.fetch` wrapper

**Exact fix location:** `app/lab/env/[envId]/re/funds/[fundId]/page.tsx` or a shared fetch utility. The `window.fetch` override reads `.includes()` on a value that can be `undefined` during prefetch. Look for something like:

```typescript
// BROKEN — someValue might be undefined
if (response.headers.get('content-type').includes('text/x-component')) {

// FIX — add null check
if (response.headers.get('content-type')?.includes('text/x-component')) {
```

Or more likely in a prefetch interceptor — find where the fund page overrides `window.fetch` and add null/undefined guards on any property access.

---

## Detailed Test Results

### TEST 1 — Fund List & Navigation ✅ PASS
- Site loads at paulmalmquist.com ✅
- Admin login works (pre-filled code) ✅
- Control Tower shows 4 active environments ✅
- Meridian Capital Management (Real Estate, Active) present ✅
- Clicking "Open" navigates to `/lab/env/[id]/re` ✅
- Fund Portfolio loads with all 3 funds ✅:
  - Institutional Growth Fund VII — $425.0M NAV, Investing ✅
  - Meridian Real Estate Fund III — $765.0M NAV, Investing ✅
  - Meridian Credit Opportunities Fund I — $510.0M NAV, DEBT, Investing ✅
- Fund names are clickable blue links ✅
- **⚠️ Minor:** AUM shows $0 for all funds on fund list page

---

### TEST 2 — Fund Detail Overview Tab ⚠️ PARTIAL PASS
**What works:**
- Fund name: "Institutional Growth Fund VII" ✅
- NAV: $425.0M ✅
- IRR: 12.4% (spec: 12.0%) ✅ close enough
- TVPI: 1.21x (spec: 1.20x) ✅ close enough
- DPI: 0.14x (spec: 0.08x) ⚠️ — higher than expected, worth investigating
- 7 tabs present: Overview, Variance (NOI), Returns (Gross/Net), Run Center, Scenarios, LP Summary, Waterfall Scenario ✅
- All 12 investments listed with type/stage ✅
- Investment names are clickable blue links AND "Detail →" links ✅
- Asset expand arrow works: shows Office type, Direct ownership ✅
- Portfolio Valuation section: $321.0M value, $216.0M equity, 5.27% cap rate, 32.7% LTV ✅

**What fails:**
- Committed: $0 ❌ — should be ~$500M total across all partners
- Called: $0 ❌ — should reflect capital deployment
- Distributed: $0 ❌ — should be ~$34M based on spec
- Scenarios count: 0 ❌ — spec expected 3 seeded scenarios
- Committed column in investment table: "—" for 11/12 investments ❌
- Fund NAV column in investment table: "—" for 11/12 investments ❌
- Asset expand details (cost, units, market): "—" ❌

---

### TEST 3 — Scenarios Tab ❌ FAIL (NOT FIXED FROM LAST TEST)

The entire interactive scenario UI is missing. Expected:
- Scenario Selector dropdown with "Base Scenario" default ❌
- "New Sale Scenario" button ❌
- Sale Scenario Panel (investment picker, sale price, date, disposition fee) ❌
- Compute Impact button ❌
- Metric comparison table (Base vs Scenario) ❌

Actual:
> "No scenarios created yet. Create a scenario via the API to start modeling."

**Fix required (detailed):**

This likely means the `Scenarios` tab component was refactored to be read-only, requiring scenarios to be pre-created via API rather than through the UI. To restore the interactive flow:

1. In `app/lab/env/[envId]/re/funds/[fundId]` — find the `ScenarioTab` or equivalent component
2. Add a "New Sale Scenario" button that opens a panel/modal
3. The panel needs: investment dropdown (fetched from `/api/re/v2/funds/{fundId}/investments`), sale price input, sale date picker, disposition fee % input, "Add Sale Assumption" button
4. Wire "Compute Impact" to `POST /api/re/v2/funds/{fundId}/scenario-compute`
5. Display a delta comparison table showing Base vs Scenario metrics for IRR, TVPI, Net IRR, Net TVPI

Alternatively, if the API-first approach is intentional, seed the 3 base scenarios (Base, Upside, Downside) into the database so the dropdown shows meaningful options.

---

### TEST 4 — LP Summary Tab ❌ FAIL (NOT FIXED FROM LAST TEST)

Expected: 4-partner table, gross-net bridge, per-partner waterfall breakdown.
Actual: "No LP data available. Seed partners and capital ledger entries first."

**Fix required (detailed):**

The partner/LP data is not being seeded when the environment is provisioned. To fix:

1. In the seed script for the `re` environment (likely `scripts/seed-re.ts` or similar):
   - Insert 4 `re_partner` records for the fund:
     - Winston Capital (GP): $10M committed, 20% carry
     - State Pension (LP): $200M committed
     - University Endowment (LP): $150M committed
     - Sovereign Wealth (LP): $140M committed
   - Insert corresponding `capital_ledger` entries with called capital (~85% called) and distributions

2. If seeding is correct but the LP Summary query is broken, check the endpoint: `GET /api/re/v2/funds/{fundId}/lp-summary` or equivalent — verify it's returning partner data from the database.

3. The gross-net bridge requires fund-level fee accrual data (management fees, fund expenses, carry). Ensure these are seeded in `re_fund_metrics` or `re_fund_fee_accrual` for quarter 2026Q1.

---

### TEST 5 — Supporting Tabs ⚠️ IMPROVED

| Tab | Status | Notes |
|-----|--------|-------|
| Variance (NOI) | ✅ PASS | NOI $5.1M actual vs $4.6M plan, $433K variance (+9.3%). Full line items visible. |
| Returns (Gross/Net) | ⚠️ PARTIAL | Loads (no 502 ✅). Empty state: "Run a Quarter Close first." |
| Run Center | ⚠️ PARTIAL | Loads with buttons ✅, but "No runs yet." — expected seeded 2026Q1 run. |
| Waterfall Scenario | ✅ NEW | New tab loads correctly. Empty (no scenarios). |

**To fix Returns tab:** Run a Quarter Close from the Run Center tab for 2026Q1. This will populate return metrics.

**To fix Run Center "No runs yet":** Either run a Quarter Close manually from the UI, or seed a completed run in the `re_run_log` table for quarter 2026Q1.

---

### TEST 6 — Investment Detail Pages ⚠️ PARTIAL PASS

- Navigation from fund overview to investment detail works ✅
- URL correctly structured: `/lab/env/[envId]/re/investments/[investmentId]` ✅
- Investment name displayed ✅
- Fund context shown in subtitle ✅
- "Back to Fund" button present ✅
- Assets (1) section with asset type and structure ✅
- Documents section present ✅

**All financial data empty:**
- NAV, NOI, Gross Value, Debt, LTV, IRR, MOIC all "—" ❌
- Committed, Invested, Distributions, Cap Rate, MOIC all "—" ❌
- "No NOI data available" ❌
- Acquisition date: "—", Hold period: "—" ❌

**Fix:** Seed investment-level metrics. For each `re_investment` record, ensure:
- `acquisition_date` and `hold_period_months` are populated
- `re_investment_metrics` table has rows for 2026Q1 with NAV, NOI, gross value, debt, LTV, IRR, MOIC values
- Or if using a computed approach, verify the metrics computation query runs correctly against seeded asset data

---

### TEST 7 — Debug Footer ✅ PASS (with warning)

- Debug footer appears with `?debug=1` ✅
- Shows envId: `a1b2c3d4-0001-0001-0003-000000000001` ✅
- Shows fundId: `a1b2c3d4-0003-0030-0001-000000000001` ✅
- Shows businessId, API URL (Railway), supabase project ref ✅
- **⚠️ Warning:** Debug footer also shows the RSC prefetch TypeError in the "last:" field — surfacing the same error documented in TEST 10.

---

### TEST 8 — Error Handling ❌ BLOCKED

Entirely blocked by TEST 3 failing. The scenario input validation tests (invalid investment, negative price, past date, compute with no sales) cannot be run because the "New Sale Scenario" UI does not exist.

---

### TEST 9 — Mobile Responsiveness ⚠️ PARTIAL PASS

Tested at 375px width:

- Content accessible ✅ (no full crash or blank page)
- Fund name visible ✅
- Metric cards wrap to 2-column grid ✅
- Debug footer wraps cleanly ✅

**Issues:**
- **Sidebar has no hamburger/collapse on mobile** ❌ — All 8 nav items (Funds, Investments, Assets, Pipeline, Models, Reports, Run Center, Sustainability) render as a full-width vertical list before the fund content, forcing users to scroll past ~400px of nav before seeing any data
- **Top nav bar crowds at 375px** ⚠️ — "Home | Fund | Investment | Asset" buttons are squeezed, some may not be comfortably tappable (< 44px)
- **Investment table likely overflows** ⚠️ — The multi-column table (Investment | Type | Stage | Committed | Fund NAV | Link) is not reformatted as cards on mobile

**Fix for mobile sidebar:**
```tsx
// In the layout component, add a state toggle for mobile nav:
const [sidebarOpen, setSidebarOpen] = useState(false);

// On mobile (< 768px), show hamburger button in header,
// sidebar renders as overlay/drawer when sidebarOpen is true
// Add CSS: @media (max-width: 768px) { sidebar { display: none } }
// When hamburger clicked: setSidebarOpen(true) → sidebar shows as overlay
```

---

### TEST 10 — DevTools Console & Network ❌ FAIL

**Console Errors (8 errors on fund page load):**

All 8 are the same error:
```
Failed to fetch RSC payload for [investment/sustainability URL]
Falling back to browser navigation.
TypeError: Cannot read properties of undefined (reading 'includes')
  at window.fetch (page-31ea185165ec2e10.js:1:28816)
```

Affected URLs:
- 7 investment detail pages
- 1 sustainability page with fundId query param

**Root cause:** The fund page (`[fundId]/page.tsx`) has a custom `window.fetch` interceptor used to detect RSC navigation responses. On prefetch attempts, a response property (likely `headers.get('content-type')`) returns `undefined`, and the code calls `.includes()` on it without a null check.

**Exact fix:**
Search in `app/lab/env/[envId]/re/funds/[fundId]/page.tsx` or any shared utility for `window.fetch =` (a monkey-patch) and find where `.includes()` is called. Add optional chaining:

```typescript
// FIND something like:
if (response.headers.get('content-type').includes('text/x-component')) {

// REPLACE WITH:
if (response.headers.get('content-type')?.includes('text/x-component')) {
```

Or if it's on the response object itself:
```typescript
// FIND:
if (response.type.includes('opaque') || ...) {

// REPLACE WITH:
if (response?.type?.includes('opaque') || ...) {
```

**Network (positive):**
- No 502 errors on any tab ✅ (major improvement from Feb 27 test)
- No CORS errors ✅
- All direct pg routes returning 200 ✅

---

## Priority Fix List

### P0 — Must Fix Now (Blocking Core Functionality)

**1. RSC Prefetch TypeError (8 console errors per fund page load)**
- File: `app/lab/env/[envId]/re/funds/[fundId]/page.tsx`
- Look for `window.fetch` override / monkey-patch
- Add `?.` optional chaining on any property read inside the fetch wrapper
- Affects: Every fund page load, surfaced in debug footer

**2. Scenarios Tab — Restore Interactive UI**
- The "New Sale Scenario" button and scenario panel need to be re-added
- If removed intentionally, seed the 3 base scenarios (Base, Upside, Downside) so the dropdown is populated
- Without this, TEST 3, TEST 8 both fail and scenario modeling is unusable

### P1 — High Priority (Data Missing)

**3. Seed LP Partner Data**
- Insert partner records + capital ledger entries for all 4 partners
- Required for LP Summary tab to show anything
- Run seed script or add partners via API

**4. Seed Investment-Level Metrics**
- Populate `re_investment_metrics` for 2026Q1 for all 12 investments
- Specifically: NAV, NOI, gross value, debt, LTV, IRR, MOIC
- Also populate: acquisition_date, hold_period_months on `re_investment` records

**5. Run Quarter Close for 2026Q1**
- The Run Center has the button — just run it
- This will populate the Returns (Gross/Net) tab and create a run in Run History
- Can be done from the UI: go to Run Center → "Run Quarter Close" → 2026Q1

**6. Seed Committed/Called/Distributed Capital at Fund Level**
- The fund header shows Committed: $0, Called: $0, Distributed: $0
- These should reflect total committed capital across all partners (~$500M total)

### P2 — Medium Priority (UX Issues)

**7. Mobile Sidebar — Add Hamburger Menu**
- Add a hamburger toggle button at ≤768px breakpoint
- Sidebar should collapse by default on mobile, show as overlay on toggle
- This is a fundamental mobile UX issue

**8. Investment Table — Populated Committed + Fund NAV Columns**
- Only 1/12 investments shows a Fund NAV value in the table
- Once investment metrics are seeded (P1 item #4), this should populate automatically

**9. Asset Expansion — Show Property Details**
- The expand arrow shows asset type/structure but not cost, units, or market
- Verify the `re_property_asset` table has these fields populated
- Check that the asset expansion query does a JOIN to fetch cost_basis, property_type, units, market

**10. AUM Showing $0 on Fund List**
- The fund portfolio list shows AUM: $0 for all 3 funds
- AUM should reflect total committed capital (separate from NAV)
- Check the fund list endpoint and whether AUM is a separate field from NAV

---

## What Is Working Well ✅

- Platform loads reliably with no 500/502 errors on any tab
- Variance (NOI) tab is fully functional with real data
- Run Center UI is complete and ready for use
- All 12 investments visible and navigable
- Asset-level type and ownership structure is correctly stored and displayed
- Portfolio valuation aggregate ($321M, 5.27% cap rate, 32.7% LTV) is a strong new addition
- Admin dashboard and environment management work cleanly
- Debug footer is useful for diagnostics

---

*Report generated by automated browser test on 2026-03-02. Environment: Chrome, 1440x900.*
