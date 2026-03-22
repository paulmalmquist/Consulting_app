# Winston Platform — Frontend Guardrails
**Date:** 2026-03-03
**Purpose:** Prevent the categories of defect found in this audit from recurring. These are rules, not suggestions. Each rule is traceable to a specific finding in this audit.

---

## How to Use This Document

These guardrails should be:
1. Added to the project's `CONTRIBUTING.md` or engineering handbook
2. Included as checklist items in the PR review template
3. Referenced in design reviews before new features are built

Each guardrail cites the audit finding that motivated it.

---

## GUARDRAIL GROUP 1 — Data Safety

### GR-1: Never render raw database identifiers in the UI
**Rule:** No UUID, database ID, schema name, table name, column name, or internal key may appear in any user-visible element — including page titles, headings, body text, breadcrumbs, error messages, and toast notifications.

**Applies to:** All text rendering, all template strings, all error formatters.

**What to do instead:** Look up the human-readable name for any ID before rendering. If the lookup fails, render "Unknown [Entity Type]" — not the raw ID. Never fall back to the ID.

**Traceability:** OW-11 (Consulting header UUID), OW-12 (Portfolio Footprint UUID), AE-2, AE-3.

**PR checklist item:** "Does this PR render any ID, UUID, or internal key directly to the UI? If yes, block."

---

### GR-2: Never expose database error messages or stack traces to the browser
**Rule:** Any error originating from Postgres, Prisma, Supabase, or any ORM/query layer must be caught before reaching the API response. The API must return a sanitized error object: `{ error: "Internal server error", requestId: "..." }`. No SQL fragment, column name, table name, or stack trace may appear in any HTTP response returned to the client.

**Applies to:** All API route handlers, all server actions, all edge functions.

**What to do instead:**
```typescript
try {
  // DB operation
} catch (err) {
  console.error('[DB Error]', err); // log full error server-side
  return NextResponse.json({ error: 'Internal server error', requestId: generateId() }, { status: 500 });
}
```

**Traceability:** AE-14, CON-P0-2 (StonePDS raw SQL in browser).

**PR checklist item:** "Does any API route in this PR forward raw error objects or DB errors to the response? If yes, block."

---

### GR-3: Guard all numeric formatting calls against null/undefined
**Rule:** Any call to `.toFixed()`, `.toLocaleString()`, `parseFloat()`, `Number()`, or any numeric utility must be preceded by a null/undefined check. Never assume a value from the database is a number.

**Pattern:**
```typescript
// BAD
value.toFixed(2)

// GOOD
value != null ? Number(value).toFixed(2) : '—'
```

**Applies to:** All metric cards, all chart data transformations, all financial formatters.

**Traceability:** AE-13, CON-P0-1 (Pipeline crash from `e.toFixed`).

**PR checklist item:** "Does this PR call any numeric formatter without a null guard? If yes, block."

---

## GUARDRAIL GROUP 2 — Navigation Integrity

### GR-4: Every nav item must lead to a page that works
**Rule:** No navigation item (sidebar link, bottom tab, breadcrumb, in-page link) may point to:
- A page that crashes
- A page that shows only an error banner
- A page that is purely "Coming Soon" with no description or timeline
- An API endpoint that returns 404 for its primary data fetch

**What to do instead:**
- If a feature is not ready: hide the nav item behind a feature flag
- If a feature has no data yet: show a clean empty state (see GR-7)
- If a feature is coming soon: show a description + estimated availability

**Traceability:** OW-2 (Revenue duplicates Command Center), AE-10 (7 empty Sustainability tabs), AE-12 (Authority "Coming Soon" with no description), Loop Intelligence broken nav.

**PR checklist item:** "Does this PR introduce or modify a nav item? If yes, verify the destination page renders correctly with no data and with data."

---

### GR-5: CTA labels must match their navigation behavior
**Rule:** The label of any button, link, or CTA must accurately describe what happens when it is clicked.

Specific patterns prohibited:
- A "+" prefix implies creation. A button labeled "+ Lead" must navigate to a lead creation form, not a lead list.
- A tab labeled "Search" must navigate to a search interface with a search input, not a static list.
- A tab labeled "Settings" must navigate to user-configurable settings, not a developer admin panel.

**Traceability:** OW-3 (ECC "Search" → VIP list), OW-4 (ECC "Settings" → Demo Controls), OW-5 ("+ Lead" → list page).

**PR checklist item:** "Does every CTA in this PR navigate to a destination that matches its label?"

---

### GR-6: Duplicate routes are prohibited
**Rule:** No page or feature may have two separate navigation paths that lead to functionally identical pages without a documented, intentional distinction between them.

**What constitutes a violation:**
- Two nav items that render the same component with the same data
- A top-level nav item and a tab within a sub-page that both lead to the same view

**What is allowed:**
- Two nav paths to the same page with different default filter/scope (e.g., "My Leads" in top nav and "All Leads" in a sub-tab) — but only if the distinction is visually evident

**Traceability:** OW-1 (Run Center in top nav + fund detail tab), OW-2 (Revenue = Command Center).

**PR checklist item:** "Does any destination in this PR's nav changes already exist elsewhere in the nav tree? If yes, document the intentional distinction or remove the duplicate."

---

## GUARDRAIL GROUP 3 — State Management

### GR-7: List page filters must initialize from URL params only
**Rule:** The value of any filter on a list page (text input, dropdown, date range, etc.) must be initialized exclusively from the URL query string. Filter state must never be read from:
- React context shared with other routes
- Module-level variables
- localStorage or sessionStorage
- Component state from a sibling route

**On navigation to a list page:** if the relevant URL param is absent, the filter must be empty/default regardless of any prior in-memory state.

**Pattern:**
```typescript
// GOOD
const domain = searchParams.get('domain') ?? '';

// BAD
const domain = filterContext.domain; // reads from shared context
```

**Traceability:** OW-8 (domain filter retains "reporting" from New Loop form), B3 in BUILD_PROMPT.

**PR checklist item:** "Does any filter in this PR read its initial value from anything other than URL search params? If yes, block."

---

### GR-8: Navigation between routes must not carry form state
**Rule:** When a user navigates away from a form (creation, edit, or any multi-field input), all form state scoped to that route must be cleared. No field value from a form route may be readable from a subsequent navigation to a different route.

**What to do instead:** Store form state in component-local state (useState) only. Do not use React context, global store, or module-level variables for form field values unless those values are explicitly intended to persist across routes (e.g., a saved draft).

**Traceability:** OW-8, B3 (Loop domain filter state leak).

---

## GUARDRAIL GROUP 4 — Error Handling and Empty States

### GR-9: Every route must have a React error boundary
**Rule:** Every Next.js App Router route segment must have an `error.tsx` file that implements a React error boundary. The boundary must render:
1. A human-readable error description ("Something went wrong")
2. A "Try again" button that resets the boundary
3. A "Go back" link to the previous page or dashboard
4. A request ID or error code for debugging

No route may crash to a blank screen or a raw Next.js error overlay in production.

**Traceability:** AE-13 (Pipeline crash to black screen), CON-P0-1.

**PR checklist item:** "Does this PR introduce a new route? If yes, does it have an error.tsx file?"

---

### GR-10: API 404 on a data endpoint must not render an error banner
**Rule:** When a frontend page fetches data from an API and receives 404, the UI must distinguish between:
- **"No data yet"** (the resource exists but is empty) → render a friendly empty state, no error banner
- **"Route does not exist"** (404 because the API route was never deployed) → render a "Feature unavailable" state, still no raw error banner
- **"Server error"** (5xx) → render an error state with request ID and retry

The "Not Found" error banner must never be the primary user-facing message for an empty or undeployed feature.

**Pattern:**
```typescript
if (response.status === 404) {
  return <EmptyState type="no-data" message="No loops yet. Add your first loop." />;
}
if (!response.ok) {
  return <EmptyState type="error" requestId={requestId} />;
}
```

**Traceability:** OW-4 variant (Loop Intelligence Not Found banner), B4 in BUILD_PROMPT.

---

## GUARDRAIL GROUP 5 — Demo / Admin Hygiene

### GR-11: Dev and demo utilities must never appear in product nav
**Rule:** Any button, link, or nav item that:
- Seeds or resets data
- Toggles demo mode
- Runs test operations
- Exposes admin controls

...must live exclusively in the admin shell (`/lab/environments` → per-env settings) or behind an explicit admin-only route guard. It must never appear in the product nav of a client-facing environment.

**Traceability:** OW-13 ("Seed Novendor Targets" button in Strategic Outreach), OW-14 (ECC Demo Controls in "Settings" tab), CON-P0-3.

**PR checklist item:** "Does this PR add any seeding, resetting, or demo utility to a user-facing route? If yes, block."

---

### GR-12: Demo mode indicators must be visible when demo mode is active
**Rule:** If an environment is running in demo mode (seeded, non-production data), a persistent indicator must be visible to the user at all times — e.g., a "Demo" badge in the header or a subtle banner. This prevents users from mistaking demo data for production data and prevents confusion about why data resets.

**Traceability:** ECC Demo Controls — Demo Mode is "On" but nothing in the ECC UI indicates the user is in a demo environment.

---

## GUARDRAIL GROUP 6 — Naming and Labeling Conventions

### GR-13: Tier/priority numbering must follow industry convention
**Rule:** When using numeric tier labels (Tier 1, Tier 2, Tier 3), lower numbers must always represent higher priority. Tier 1 = highest urgency/importance. This matches SLA tiers, support tiers, customer segmentation tiers, and investor priority conventions universally.

If a product use case requires the inverse, use named tiers (e.g., "Priority / Standard / Extended") rather than numbers.

**Traceability:** OW-10 (ECC Tier 3 = highest priority — inverted).

---

### GR-14: Scoring metrics must always display their scale and methodology
**Rule:** Any numeric score rendered in the UI must include:
1. The scale (e.g., "/ 100" or "0–10")
2. A tooltip, legend, or linked methodology description explaining what the score measures
3. Visual threshold markers if applicable (green/yellow/red zones)

A score without context is not information — it's noise.

**Traceability:** OW-9 (Outreach scoring 38 vs 98 with no legend or methodology).

---

## PR Review Checklist (Composite)

Copy this into your PR template for any feature that touches the frontend:

```markdown
## Frontend Guardrail Checklist

- [ ] GR-1: No UUIDs or internal IDs rendered in any user-visible element
- [ ] GR-2: No DB error messages or stack traces can reach the browser via any API route
- [ ] GR-3: All numeric formatting calls are null-guarded
- [ ] GR-4: Every new nav item leads to a working, styled page (crash, pure empty, or "Coming Soon" = fail)
- [ ] GR-5: Every CTA label accurately describes its destination/action
- [ ] GR-6: No duplicate nav destinations without documented intentional distinction
- [ ] GR-7: All list page filters initialize from URL params only
- [ ] GR-8: Form state does not leak across route navigations
- [ ] GR-9: All new routes have an error.tsx error boundary
- [ ] GR-10: API 404 on data routes renders empty state, not error banner
- [ ] GR-11: No dev/demo utilities added to user-facing product nav
- [ ] GR-12: Demo mode is visibly indicated when active
- [ ] GR-13: Numeric tier labels follow Tier 1 = highest priority convention
- [ ] GR-14: All numeric scores display scale and methodology
```

---

*Generated by frontend coherence audit — 2026-03-03*
