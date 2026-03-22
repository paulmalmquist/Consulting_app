# Winston Platform — Page Cards
**Date:** 2026-03-03
**Format:** One card per distinct page/view. Status: ✅ Pass | ⚠️ Partial | ❌ Broken | 🚫 Not Implemented

---

## ADMIN SHELL

---

### CARD: Environments / Control Tower
**URL:** `/lab/environments`
**Status:** ✅ Functional

**What it does:** Lists all provisioned client environments. Two featured quick-launch cards at top (Institutional Demo, Executive Command Center Demo). Below: Provision Environment form + Environment Control Tower search/grid.

**CTAs:**
- Open Institutional Demo → opens Meridian Capital Management
- Open Meridian Apex → opens Meridian Apex Holdings ECC
- Provision Environment (form with Client Name, Industry, Notes)
- Per-env: Open / Settings / Delete

**Data shown:** Environment name, product type badge, Active/Archived/Failed status pill, Open/Settings/Delete actions.

**Bugs / Issues:**
- Delete button is red and permanently destructive — no confirmation dialog observed in the UI pattern
- "Failed" tab exists in the filter but purpose and recovery flow are unclear
- Sector/Industry filter dropdown present but relationship to provisioning form industry field is unclear

---

### CARD: Pipeline (Admin)
**URL:** `/lab/pipeline`
**Status:** ✅ (not deeply tested — admin-level view)

**What it does:** Global pipeline overview across all environments.

---

### CARD: Chat (Intelligence)
**URL:** `/lab/chat`
**Status:** ✅ (RAG chat, not deeply tested)

---

---

## RE PLATFORM — MERIDIAN CAPITAL MANAGEMENT

---

### CARD: Fund List / RE Home
**URL:** `/lab/env/{envId}/re`
**Status:** ✅ Functional

**What it does:** Lists funds in the RE environment.

**Data shown:** Fund name, fund ID, NAV, quarter.

---

### CARD: Fund Detail — Overview Tab
**URL:** `/lab/env/{envId}/re/funds/{fundId}`
**Status:** ⚠️ Partial

**What it does:** Shows 12 investments in Institutional Growth Fund VII. Table of investments with Fund NAV column.

**Data shown correctly:**
- Investment names (12 rows)
- NAV per investment
- IRR, MOIC
- Sector tags

**Bugs / Issues:**
- Fund NAV column shows "—" for all 12 investments — rollup endpoint returns `[]`
- No column sort or filter on the investment table
- No export capability visible

---

### CARD: Fund Detail — Variance Tab
**URL:** `/lab/env/{envId}/re/funds/{fundId}?tab=variance`
**Status:** ✅ Functional

**What it does:** Shows NOI variance: budget vs. actual.

**Data shown:** $5.1M vs $4.6M NOI, variance chart.

---

### CARD: Fund Detail — Returns Tab
**URL:** `/lab/env/{envId}/re/funds/{fundId}?tab=returns`
**Status:** ❌ Broken

**What it does:** Should show IRR / MOIC / TWR after Quarter Close.

**Actual state:** "No return metrics available. Run a Quarter Close first." — persists even after successful Quarter Close run `e1540a03`. Pipeline computes returns but does not write them to DB.

**CTAs visible:** None (empty state only).

---

### CARD: Fund Detail — Run Center Tab
**URL:** `/lab/env/{envId}/re/funds/{fundId}?tab=run-center`
**Status:** ⚠️ Functional but duplicated

**What it does:** Quarter Close + Waterfall Shadow run triggers.

**Bugs / Issues:**
- **DUPLICATE PAGE** — identical functionality exists at top-nav `/re/run-center`. Two entry points to the same feature with no differentiation of scope.
- "Budget Baseline (UW Version)" dropdown present but no tooltip explaining what UW Version means.

---

### CARD: Fund Detail — Scenarios Tab
**URL:** `/lab/env/{envId}/re/funds/{fundId}?tab=scenarios`
**Status:** ❌ Broken

**What it does:** Should allow creating and comparing waterfall scenarios.

**Actual state:** Scenario dropdown shows "No scenarios available." Scenario creation form has no `name` field. API returns 500: `column "model_id" does not exist`.

---

### CARD: Fund Detail — LP Summary Tab
**URL:** `/lab/env/{envId}/re/funds/{fundId}?tab=lp-summary`
**Status:** ❌ Broken (blocked by FK constraint)

**What it does:** Should show LP partner data and gross-net bridge.

**Actual state:** "No LP data available. Seed partners and capital ledger entries first." — blocked by `re_partner_business_id_fkey` FK violation.

---

### CARD: Fund Detail — Waterfall Scenario Tab
**URL:** `/lab/env/{envId}/re/funds/{fundId}?tab=waterfall`
**Status:** ❌ Broken

**What it does:** Should allow running LP waterfall distribution scenarios.

**Actual state:** Tab renders but scenario creation is blocked by missing `model_id` column and missing UI name field.

---

### CARD: Investment Detail — Meridian Office Tower
**URL:** `/lab/env/{envId}/re/investments/{investmentId}`
**Status:** ⚠️ Partial

**What it does:** Shows per-investment metrics, financials, documents.

**Data shown correctly:**
- NAV: $38.5M ✅
- NOI: $4.5M ✅
- Gross Value: $51.8M ✅
- IRR: 11.6% ✅
- MOIC: 1.22x ✅
- Committed Capital: $45.3M ✅
- Invested Capital: $38.5M ✅
- Distributions: $2.7M ✅
- Fund NAV Contribution: $33.8M ✅
- Sector Exposure widget ✅

**Bugs / Issues:**
- Acquisition Date: "—" — not seeded/populated
- Hold Period: "—" — not seeded/populated
- LTV: 0.0% — debt data missing
- Cap Rate: **34.78%** — calculation bug (NOI being divided by wrong denominator; correct ~8.7%)
- Orphaned "0" rendered below the NOI bar chart (axis label rendering artifact)
- Investment Documents section uses raw, unstyled browser `<input type="file">` ("Choose File / No file chosen") — no drag-drop, no file list, completely out of style system

---

### CARD: Sustainability
**URL:** `/lab/env/{envId}/re/sustainability`
**Status:** ❌ Broken (all sub-tabs)

**What it does:** Should show ESG/sustainability data across portfolio.

**Sub-tabs:** Overview, Portfolio Footprint, Asset Sustainability, Utility Bills, Certifications, Regulatory Risk, Decarbonization Scenarios.

**Bugs / Issues:**
- Every sub-tab shows the "Not Found" error banner at top
- All show empty states (no charts, no data)
- Portfolio Footprint sub-tab body text contains raw UUID: `"Showing footprint for fund a1b2c3d4-0003-0030-0001-000000000001 in 2026."` — UUID never replaced with fund name

---

### CARD: Run Center (Top Nav)
**URL:** `/lab/env/{envId}/re/run-center`
**Status:** ✅ Functional (but duplicated — see Fund Detail Run Center tab)

**What it does:** Triggers Quarter Close and Waterfall Shadow pipeline runs. Shows run history.

**CTAs:**
- Quarter Close (selects fund + quarter)
- Run Waterfall (Shadow)
- Budget Baseline (UW Version) dropdown

**Working runs observed:**
- `e1540a03`: QUARTER_CLOSE 2026Q1 SUCCESS
- `6178dee8`: Waterfall Shadow success

---

---

## CONSULTING PLATFORM — NOVENDOR

---

### CARD: Command Center
**URL:** `/lab/env/{envId}/consulting`
**Status:** ⚠️ Partial

**What it does:** Executive dashboard for consulting operations. Shows pipeline metrics, revenue, lead counts.

**Data shown:**
- All metric cards display **0** despite 8 leads seeded in the database
- Rendering issue: metrics pipeline is not reading live data

**Header bug:** Displays raw UUIDs in the environment context: `62cfd59c-a171-4224-ad1e-fffc35bd1ef4 · 225f52ca` — never replaced with human-readable names.

---

### CARD: Pipeline (Consulting)
**URL:** `/lab/env/{envId}/consulting/pipeline`
**Status:** ❌ HARD CRASH

**What it does:** Should show deal/lead pipeline visualization.

**Actual state:** Full-page blank screen / unhandled Next.js error.

**Error:** `TypeError: e.toFixed is not a function` — a null or undefined value from the database is passed to a numeric formatter without a null guard. The entire page crashes to a black screen with no error recovery UI.

**CTAs:** None (page is inaccessible).

---

### CARD: Outreach
**URL:** `/lab/env/{envId}/consulting/outreach`
**Status:** ⚠️ Partial

**What it does:** Shows outreach activities and lead scoring.

**Bugs / Issues:**
- Raw database enum value `research_loop` visible in at least one card — not mapped to a human-readable label
- Scoring inconsistency: some leads show score 38, others 98, with no explanation of scale, methodology, or thresholds visible in the UI
- No tooltip or legend for the scoring system

---

### CARD: Strategic Outreach
**URL:** `/lab/env/{envId}/consulting/strategic-outreach`
**Status:** ⚠️ Partial

**What it does:** 6-sub-tab strategic outreach hub — Heatmap, Active Leads, Trigger Signals, Outreach Queue, Diagnostics, Deliverables Sent.

**Bugs / Issues:**
- Two scoring systems visible (38 vs 98) with no explanation; unclear if these are the same scale or different scoring models
- "Seed Novendor Targets" utility button exposed in production view — dev/test utility visible to end users
- Heatmap visualization works but is missing a legend explaining what the color intensity means

---

### CARD: Proposals
**URL:** `/lab/env/{envId}/consulting/proposals`
**Status:** ⚠️ Partial

**What it does:** Should list proposals with status filter tabs.

**Data shown:** Empty (no proposals).

**Bugs / Issues:**
- Page has **no title** — the main `<h1>` region is blank; no "Proposals" heading anywhere on the page
- Status filter tabs present (5 statuses): All, Draft, Sent, Accepted, Rejected
- No "+ New Proposal" CTA on the page itself (only top-nav link leads here)

---

### CARD: Clients
**URL:** `/lab/env/{envId}/consulting/clients`
**Status:** ⚠️ Partial

**What it does:** Should list clients.

**Data shown:** Empty.

**Bugs / Issues:**
- Page has **no title** — same missing `<h1>` pattern as Proposals
- No "+ Add Client" CTA visible

---

### CARD: Loop Intelligence — List
**URL:** `/lab/env/{envId}/consulting/loops`
**Status:** ⚠️ Partial (frontend rendered, backend 404)

**What it does:** Should list recurring workflow loops with cost analysis.

**What works:**
- Summary cards render (all zeros): Total Annual Loop Cost $0, Loops 0, Avg Maturity Stage 0.0, Top Cost Driver — ($0)
- Filter controls render: Client dropdown (✅ populated from working clients API), Status dropdown, Domain text input
- Add Loop button present

**Bugs / Issues:**
- Persistent "Not Found" error banner on every page load — API returns 404
- Domain filter retains "reporting" text from a previous form navigation (cross-route state leak)
- All loop API routes return 404: GET /summary, GET (list), POST (create)
- 6+ 404 network requests on every page load

---

### CARD: Loop Intelligence — New Loop Form
**URL:** `/lab/env/{envId}/consulting/loops/new`
**Status:** ⚠️ Partial

**What it does:** Form to create a new workflow loop with multi-role cost modeling.

**What works:**
- All form fields render: Name, Client, Description, Process Domain, Trigger Type, Frequency Type, Frequency Per Year, Status, Maturity Stage, Automation Readiness Score, Avg Wait Time, Rework Rate
- Roles section with Add Role button — supports multiple roles
- Multi-role entry tested: Role 1 (Senior Analyst, $95/hr, 90min) + Role 2 (Controller, $75/hr, 45min) both filled

**Bugs / Issues:**
- Form submission fails — POST to `/bos/api/consulting/loops` returns 404
- Error banner displayed after failed submission with request ID
- No redirect to loop detail occurs

---

### CARD: Authority
**URL:** `/lab/env/{envId}/consulting/authority`
**Status:** ⚠️ Placeholder

**What it does:** Unknown — shows "Coming Soon" placeholder with no description of intended functionality.

**CTAs:** None.

---

### CARD: Revenue
**URL:** `/lab/env/{envId}/consulting/revenue`
**Status:** ⚠️ Partial (duplicate content)

**What it does:** Should show revenue analytics.

**Actual state:** Displays the same metric cards as Command Center — total revenue, pipeline value, lead counts. No additional analysis, breakdown, or chart beyond what Command Center already shows.

**Bugs / Issues:**
- Entire page is a duplicate of Command Center metrics — no additional value
- Represents a wasted nav slot

---

---

## ECC — MERIDIAN APEX HOLDINGS

---

### CARD: ECC Queue
**URL:** `/lab/env/{envId}/ecc`
**Status:** ✅ Mostly functional

**What it does:** Live prioritized action queue for executive decision-making. Categories: RED ALERTS, VIP REPLIES, APPROVALS, CALENDAR, GENERAL.

**Live counts observed:** Red Alerts 5, VIP Replies 11, Approvals 5, Calendar 2, General 9.

**CTAs per card:**
- Email cards: Reply / Delegate / Snooze / Done
- Approval cards: Approve / Delegate / Review / Refresh

**Bugs / Issues:**
- Email preview truncated mid-word: "I have not heard bac" (text cutoff before "k" — likely a CSS overflow issue)
- Quick Capture textarea has static placeholder that doesn't clear when focused (standard UX)

---

### CARD: ECC Brief
**URL:** `/lab/env/{envId}/ecc/brief`
**Status:** ⚠️ Partial

**What it does:** End-of-day summary sweep with financial position metrics.

**Data shown:**
- Cash Today: $216,200
- Due 72H: $245,300
- Overdue: $81,850
- Receivables: $317,000
- Exposure: $250,500

**Bugs / Issues:**
- Alert pills section **duplicated** — same 4 pills appear both above the brief text and again below it within the same view
- Brief summary text rendered in a **monospace/code font** — looks like raw terminal output rather than a styled executive brief
- No narrative context: the numbers are shown without trend arrows, benchmarks, or comparison to prior period

---

### CARD: ECC VIPs (mislabeled "Search")
**URL:** `/lab/env/{envId}/ecc/vips`
**Status:** ⚠️ Partial (content/label mismatch)

**What it does:** Lists tiered VIP contacts with SLA response windows.

**Data shown:**
- Amelia Hale — TIER 3, SLA 1H (FAMILY, SPOUSE)
- Evelyn Price — TIER 3, SLA 1H (BOARD)
- Martin Greene — TIER 2, SLA 4H (LP)
- Noah Bennett — TIER 2, SLA 4H (CLIENT)
- Rebecca Stone — TIER 2, SLA 4H (LEGAL)
- Astera Events — TIER 1, SLA 24H (CLIENT)
- Northline Marketing Agency — TIER 1, SLA 24H (VENDOR)

**Bugs / Issues:**
- Bottom nav tab is labeled **"Search"** but navigates to a VIP directory page — fundamental label mismatch
- **Tier numbering is inverted** from industry convention: TIER 3 = highest priority (family/board), TIER 1 = lowest. Standard expectation is Tier 1 = top. This will confuse every new user and every external stakeholder reading exported reports.
- No search or filter capability on this page despite the nav tab being labeled "Search"

---

### CARD: ECC Admin / Demo Controls (mislabeled "Settings")
**URL:** `/lab/env/{envId}/ecc/admin`
**Status:** ⚠️ Dev tool exposed in production

**What it does:** Demo environment controls: reset state, toggle demo mode, ingest quick capture.

**CTAs:**
- Demo Mode toggle (On/Off) — currently On; controls: Messages 180, Payables 5, Tasks 35, Red Alerts 5
- Reset Demo button — resets all seeded demo state
- Ingest Quick Capture button
- Manual Forward / Share textarea (pre-filled with: "Forwarded from iPhone: Please approve the emergency vendor wire for $12,400 before 2pm today.")

**Bugs / Issues:**
- Bottom nav tab labeled **"Settings"** but navigates to `/ecc/admin` — another label mismatch
- **Demo Controls panel is exposed in what appears to be a user-facing view** — "Reset Demo" is a dangerous operation that should be behind an admin-only gate, not surfaced as a user tab
- The pre-filled placeholder text (`Forwarded from iPhone: Please approve...`) is realistic enough to be mistaken for a real pending action item

---

---

## STONEPDS

---

### CARD: StonePDS Workspace
**URL:** `/lab/env/{stonePdsEnvId}/`
**Status:** ❌ Hard error on load

**What it does:** PDS Command workspace — full functionality unknown due to crash.

**Actual state:** Blank page with DB error exposed to the UI:
```
column "industry_type" does not exist
LINE 2: ... SELECT env_id::text, client_name, industry, industry_t...
                                                                   ^
```

**Bugs / Issues:**
- **Raw SQL query fragment exposed** in the user-visible error message — serious security and professionalism issue
- Schema migration mismatch: `industry_type` column referenced in query but does not exist in the table
- Entire environment is inaccessible until migration is fixed
- No error recovery, no retry button, no contact information

---

*Generated by frontend coherence audit — 2026-03-03*
