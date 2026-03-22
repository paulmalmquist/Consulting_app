# Winston Platform — Frontend Consolidation Plan
**Date:** 2026-03-03
**Priority:** P0 (immediate, blocks demos) | P1 (this sprint) | P2 (next sprint) | P3 (backlog)

---

## How to Read This Document

Each consolidation item describes the current state, the target state, and the implementation path. Items are ordered by priority. "Consolidation" includes both merging duplicated pages and removing dead weight that is currently confusing users and eroding product trust.

The philosophy: **fewer pages that work are worth more than more pages that are empty or broken.** Every nav item is a promise. Every broken or empty page is a broken promise.

---

## P0 — Immediate: Fix Crashes and Data Leaks

These items must be resolved before any client or investor demo. They are not UX issues — they are correctness issues that happen to have a UX surface.

---

### CON-P0-1: Add null guard to Pipeline page numeric formatter
**Current:** Consulting → Pipeline crashes to black screen (`TypeError: e.toFixed is not a function`). Page is completely inaccessible.
**Target:** Page renders gracefully even when underlying data contains null/undefined values.
**Path:**
1. Find every call to `.toFixed()`, `toLocaleString()`, `parseFloat()`, or similar numeric formatting in the Pipeline page and its child components.
2. Wrap each with a null guard: `value != null ? value.toFixed(2) : '—'`
3. Add a top-level React error boundary to the Pipeline route so that if another unguarded value causes a crash, the page shows a recoverable error state instead of a blank screen.
4. Add error boundaries to all other consulting pages as a systemic fix.

---

### CON-P0-2: Remove raw SQL from StonePDS error response
**Current:** StonePDS loads with raw SQL fragment visible in the browser: `column "industry_type" does not exist LINE 2: ... SELECT env_id::text, client_name, industry, industry_t...`
**Target:** Any DB error surfaces as a generic, styled error message. SQL never reaches the browser.
**Path:**
1. Fix the underlying migration to add the `industry_type` column.
2. Add a global error handler in the StonePDS API route(s) that catches DB errors and returns `{ error: "Internal server error", requestId: "..." }` — no stack trace, no SQL.
3. On the frontend, render this as a styled error state with a "Contact support" or "Try again" CTA.

---

### CON-P0-3: Move ECC Demo Controls out of user-facing "Settings" tab
**Current:** ECC "Settings" tab leads to `/ecc/admin` with "Reset Demo" button accessible to any user who navigates there.
**Target:** Demo Controls are accessible only from the admin shell (e.g., per-environment Settings panel in `/lab/environments`), not from within the ECC itself.
**Path:**
1. Remove the "Settings" tab from the ECC bottom nav entirely.
2. Move Demo Controls to the existing Settings button on the Environment Control Tower card (the gear icon next to each env in `/lab/environments`).
3. If an admin needs ECC-specific demo controls during a live demo, add a keyboard shortcut or URL param (`?adminMode=true`) that surfaces them without exposing them in the default nav.

---

### CON-P0-4: Fix all UUID-to-name interpolation failures
**Current:** Three locations where UUIDs appear instead of human-readable names:
- Consulting header: `62cfd59c-a171-4224-ad1e-fffc35bd1ef4 · 225f52ca`
- RE Portfolio Footprint: `"Showing footprint for fund a1b2c3d4-0003-0030-0001-000000000001 in 2026."`
**Target:** All user-visible text uses human-readable names. UUIDs never appear in the UI.
**Path:**
1. Create a `resolveEntityName(id)` utility that looks up any env/fund/investment/business ID and returns its display name.
2. Audit all template strings in the codebase for UUID interpolations.
3. Replace each with `resolveEntityName(id)` — falling back to "Unknown [Entity Type]" rather than the raw UUID if lookup fails.

---

## P1 — This Sprint: Consolidate Duplicate Pages

---

### CON-P1-1: Eliminate Run Center duplication in RE
**Current:** Run Center exists at (a) top nav `/re/run-center` and (b) Fund Detail tab `/re/funds/{fundId}?tab=run-center`. Both are identical.
**Target:** One Run Center with clear scope.

**Decision required:** Is Run Center fund-scoped or global?

**Option A — Fund-scoped (recommended):**
- Keep only the Fund Detail tab version
- Remove the top-nav Run Center entirely
- Add a fund selector to the tab if users need to switch funds without leaving

**Option B — Global:**
- Keep only the top-nav version
- Remove the Fund Detail tab
- In the top-nav Run Center, default the fund selector to the most recently viewed fund

**Either way:** The duplicate must be eliminated. The current state where both exist trains users to use two different navigation paths for the same operation, creating confusion about which run is "authoritative."

---

### CON-P1-2: Eliminate Revenue page duplication in Consulting
**Current:** Revenue page (`/consulting/revenue`) renders the same metric cards as Command Center. No additional content.
**Target:** Revenue page either (a) deleted and nav item removed, or (b) substantially differentiated.

**Option A — Delete (recommended for now):**
- Remove "Revenue" from the Consulting nav
- Redirect any `/consulting/revenue` requests to `/consulting`
- 8 nav items > 9 nav items when the 9th is a duplicate

**Option B — Differentiate:**
- Add revenue breakdown by client, by month, by service line
- Add a trend chart (trailing 12 months)
- Make Revenue the financial analytics page that Command Center links to for deeper drill-down

**Implementation path for Option A:**
1. Remove nav item from the consulting sidebar component
2. Add a Next.js redirect in `next.config.js` or a route handler

---

### CON-P1-3: Fix ECC bottom nav labels
**Current:**
- "Search" tab → navigates to VIP directory
- "Settings" tab → navigates to Demo Admin (will be removed per CON-P0-3)

**Target:**
- "VIPs" or "Contacts" tab → VIP directory
- Remove "Settings" entirely (post P0-3)

**Path:** Update the ECC nav component with corrected labels. This is a one-line fix once the demo controls tab is removed.

---

### CON-P1-4: Fix "+ Lead" and "+ Proposal" CTAs
**Current:** Both navigate to list pages instead of opening creation forms.
**Target:** Both open creation forms.

**If creation forms exist:**
- Update the navigation target from `/consulting/leads` to `/consulting/leads/new`
- Same for proposals

**If creation forms don't exist yet:**
- Rename CTAs from "+ Lead" to "View Leads" to match actual behavior
- Remove the "+" prefix until a creation form is built

---

### CON-P1-5: Consolidate Consulting Command Center and Revenue into a single dashboard
**Precondition:** CON-P1-2 complete (Revenue deleted or differentiated)

If Option B (differentiate) is chosen for Revenue, restructure Command Center as follows:
- Command Center: overview metrics + today's activity feed
- Revenue (renamed to "Analytics" or "Performance"): financial breakdown, cohort analysis, trends

This gives each page a distinct job and eliminates the overlap.

---

## P2 — Next Sprint: Reduce Empty Nav Items

The Consulting nav currently has 9 items. Of those:
- 1 crashes (Pipeline)
- 1 duplicates Command Center (Revenue)
- 1 is "Coming Soon" (Authority)
- 2 have no page title (Proposals, Clients)
- 1 has no functional backend (Loop Intelligence)

That means **6 of 9 nav items are partially or fully non-functional.** This is not acceptable for a client-facing product.

---

### CON-P2-1: Hide unbuilt nav items until ready
**Items to hide until functional:**
- Authority ("Coming Soon" — hide or show with clear roadmap language)
- Loop Intelligence (hide from nav until API routes are deployed, or show with "Setup required" state instead of broken banner)

**Implementation:** Add a feature flag system or environment variable that controls nav item visibility. Never show a nav item that leads to a crash, empty state with error banner, or pure placeholder.

---

### CON-P2-2: Add page titles to Proposals and Clients
**Current:** Both pages render without an `<h1>`.
**Target:** Both pages have a visible page title and a "New [Entity]" CTA in the page header.
**Path:** Standard Next.js `<PageHeader title="Proposals" action={<Button>New Proposal</Button>} />` pattern. This is a < 30-minute fix per page.

---

### CON-P2-3: Collapse Sustainability into Fund Detail when data is unavailable
**Current:** Sustainability section has its own top-nav slot and 7 sub-tabs, all broken.
**Target:** Either (a) fix Sustainability (connect API, seed data) and keep it, or (b) collapse it into a single sub-tab within Fund Detail until it's ready.

**Recommendation:** If Sustainability data is 3+ sprints away, move the Sustainability sub-section inside Fund Detail as a single placeholder tab. Remove it from the top nav to avoid the current experience of clicking a nav item and finding 7 empty screens.

---

## P3 — Backlog: Systemic Improvements

---

### CON-P3-1: Establish a unified design system component library
**Current:** Three distinct visual patterns across RE, Consulting, ECC.
**Target:** Shared component library for: cards, tables, badges, empty states, error states, page headers, metric tiles.

This doesn't mean every product must look identical — the ECC mobile experience is intentionally different. But shared primitives (typography scale, spacing tokens, color variables, component patterns for badges, buttons, and inputs) eliminate the re-invention of each pattern in each environment.

---

### CON-P3-2: Standardize empty state components
**Current:** Empty states vary: "No return metrics available. Run a Quarter Close first." / "No LP data available." / "No loops match the current filters." / "Coming Soon" / "Not Found" banner / raw SQL error.

Each is bespoke. Some are user-friendly; others are not.

**Target:** A single `<EmptyState>` component with variants:
- `type="no-data"`: friendly empty + CTA (e.g., "No loops yet. Add your first loop.")
- `type="setup-required"`: configuration needed (e.g., "Run a Quarter Close to see returns.")
- `type="coming-soon"`: with description and optional ETA
- `type="error"`: styled error with request ID and retry/back CTA

All broken or absent features must use one of these variants. The "Not Found" error banner must never appear for a 404 on an API route that returns empty when there's no data.

---

### CON-P3-3: Standardize tier/scoring naming conventions
**Current:**
- ECC: TIER 3 = highest priority (inverted)
- Consulting: scores of 38 vs 98 with no legend

**Target:**
- ECC: Tier 1 = highest priority (standard convention) OR use named tiers (Priority / Standard / Extended)
- Consulting: All scores labeled with scale (e.g., "Score: 38 / 100") and a methodology tooltip

---

### CON-P3-4: Centralize demo/admin utilities
**Current:** Dev utilities scattered across product UIs — "Seed Novendor Targets" in Strategic Outreach, Demo Controls in ECC "Settings" tab.

**Target:** A single admin panel in the environment settings (accessible from the gear icon in `/lab/environments`) that contains all: seed operations, demo reset, test data ingest, schema status. No dev utility should ever appear in a product nav item.

---

## Implementation Order Summary

| Phase | Items | Owner Dependency |
|---|---|---|
| **P0 (now)** | CON-P0-1 through P0-4 | Backend + Frontend |
| **P1 (this sprint)** | CON-P1-1 through P1-5 | Frontend |
| **P2 (next sprint)** | CON-P2-1 through P2-3 | Frontend + Product decision |
| **P3 (backlog)** | CON-P3-1 through P3-4 | Design system + Architecture |

**Estimated impact of P0 + P1 completion:** The platform goes from a product that crashes, leaks data, and shows duplicate pages to one that navigates cleanly, has no exposed SQL, and presents a coherent nav structure. Minimum viable state for client demos.

---

*Generated by frontend coherence audit — 2026-03-03*
