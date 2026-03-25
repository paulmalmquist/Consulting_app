# Winston Platform — Overlaps, Duplications & Crossed Wires
**Date:** 2026-03-03
**Severity:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## Executive Summary

The Winston platform has accumulated significant structural duplication across all three environments (RE, Consulting, ECC). The overlaps range from identical pages appearing in two nav locations (critical) to tab labels that navigate to entirely different content (crossed wire). A further class of problem — metrics that display but don't compute — means the user sees plausible-looking dashboards that silently lie. These are not cosmetic issues: they create trust failures with any sophisticated user.

---

## Category 1 — Literal Duplicates (same page, two entry points)

### OW-1: Run Center duplicated in RE
**Severity:** 🟠 High

**Locations:**
1. Top nav → "Run Center" → `/re/run-center`
2. Fund detail → "Run Center" tab → `/re/funds/{fundId}?tab=run-center`

**What happens:** Both routes render functionally identical UIs — Quarter Close trigger, Waterfall Shadow trigger, Budget Baseline dropdown, run history. No difference in scope, filters, or data. A user who opens a fund detail and clicks Run Center will be confused about whether they're running a fund-scoped operation or a global one.

**Underlying design question:** Is Run Center intended to be fund-scoped (only runs affecting this fund) or global (all pipelines across all funds)? The answer should determine whether to keep one or both, and if kept separate, requires distinct scoping and labeling.

**Fix:** Pick one canonical location. If fund-scoped: remove the top nav item and keep only the fund-detail tab. If global: remove the fund-detail tab and add a fund selector to the top-nav Run Center. Do not maintain both.

---

### OW-2: Revenue page duplicates Command Center
**Severity:** 🟠 High

**Locations:**
1. Consulting → "Command Center" → `/consulting`
2. Consulting → "Revenue" → `/consulting/revenue`

**What happens:** The Revenue page renders an identical set of metric cards to Command Center (pipeline value, lead count, revenue total). There is no additional breakdown, chart, cohort analysis, or time series on Revenue that isn't already on Command Center.

**Fix:** Either (a) delete Revenue as a nav item and fold any revenue-specific views into Command Center as a sub-section, or (b) make Revenue genuinely different — add revenue by client, by month, by service line, with charts showing trend. The current state is a dead page that erodes trust in the nav structure.

---

## Category 2 — Crossed Wires (label says one thing, destination is another)

### OW-3: ECC "Search" tab navigates to VIP Directory
**Severity:** 🟠 High

**Location:** ECC bottom nav → "Search"
**Actual destination:** `/ecc/vips` — "VIP Routing: Tiered contacts and SLA windows"

**What happens:** A user tapping "Search" in the ECC expects a search interface — a text input, filtered results, maybe cross-object search across emails/approvals/contacts. Instead they land on a static contacts list. There is no search input on the destination page at all.

**Fix:** Either (a) rename the tab to "VIPs" or "Contacts" to match the actual content, or (b) build a real search interface at this tab and move the VIP list elsewhere.

---

### OW-4: ECC "Settings" tab navigates to Demo Admin Controls
**Severity:** 🔴 Critical

**Location:** ECC bottom nav → "Settings"
**Actual destination:** `/ecc/admin` — "Demo Controls: Deterministic, resettable, auditable"

**What happens:** A user tapping "Settings" expects account settings, notification preferences, or ECC configuration. Instead they land on a developer/demo reset panel with a prominent "Reset Demo" button that wipes all seeded state. A confused end user could accidentally destroy the demo environment.

**Fix:** Immediately either (a) move Demo Controls behind an admin-only gate (require admin session or a separate route not surfaced in the user-facing nav), or (b) rename the tab to "Admin" or "Demo" with appropriate access control. This is the highest-risk crossed wire in the platform.

---

### OW-5: Consulting "+ Lead" / "+ Proposal" CTAs navigate to list pages
**Severity:** 🟡 Medium

**Locations:**
- "+ Lead" button (various consulting pages)
- "+ Proposal" button (various consulting pages)

**What happens:** Clicking these CTAs navigates to the lead list or proposal list page — not to a creation form. The "+" prefix universally implies "create new" in modern web UIs. Users who click these expect to be taken to a blank form. Instead they land back on a list page that is often empty.

**Fix:** "+ Lead" must navigate to a lead creation form. "+ Proposal" must navigate to a proposal creation form. If those forms don't exist yet, remove the "+" prefix from the CTA and label it "View Leads" / "View Proposals" to match actual behavior.

---

## Category 3 — Silent Data Lies (metrics render but silently report wrong/zero values)

### OW-6: Command Center shows all-zero metrics despite seeded data
**Severity:** 🔴 Critical

**Location:** Consulting → Command Center

**What happens:** 8 leads are confirmed seeded in the database. The Command Center shows 0 leads, $0 pipeline, $0 revenue. The cards render with no error state — they look like a functioning dashboard. They're lying. A user reviewing this dashboard would conclude the platform has no activity, not that a data pipeline is broken.

**Why this is a trust failure:** A silent zero is worse than an error. An error signals "something is wrong." A zero signals "this is correct and there's nothing here." Users make decisions based on dashboards; a silently wrong dashboard is actively harmful.

**Fix:** The metric pipeline must be fixed to read live data. As a stopgap, add a data freshness indicator or last-updated timestamp so users can detect when data is stale. Never show metric cards that return zero without a "no data" explanation.

---

### OW-7: Investment Fund NAV column shows "—" while fund-level NAV shows data
**Severity:** 🔴 Critical

**Location:** RE → Fund Detail → Overview tab (investment table Fund NAV column)

**What happens:** The fund-level NAV shows ~$425M correctly. The per-investment table's "Fund NAV" column shows "—" for all 12 investments. The investment-rollup endpoint returns `[]`. The user sees a plausible fund header alongside a table that implies zero allocation has been made.

**Fix:** The investment-rollup endpoint must be fixed to join correctly and return data. Until fixed, the column should show a loading/calculating state rather than "—" which implies the data exists and is simply zero or unknown.

---

## Category 4 — State Leaks (one page's state corrupts another)

### OW-8: Domain filter on Loop Intelligence list retains state from New Loop form
**Severity:** 🟡 Medium

**Location:** Consulting → Loop Intelligence → List page Domain filter

**What happens:** After a user fills in "reporting" in the Process Domain field of the New Loop form and then navigates back to the loop list, the Domain filter text input on the list page shows "reporting" pre-filled. The filter input has inherited state from the creation form — a different page, a different component.

**Root cause:** The domain filter likely reads from a shared module-level variable or React context that is also written to by the New Loop form's domain field. When the user navigates away, the shared state is not cleared.

**Fix:** Filter state on list pages must be initialized exclusively from URL query parameters. No list-page filter should read from form component state. On navigation to the list page, if no `?domain=` param is present in the URL, the domain filter must be empty.

---

## Category 5 — Information Architecture Conflicts

### OW-9: Two scoring systems in Outreach with no explanation
**Severity:** 🟡 Medium

**Location:** Consulting → Outreach, Consulting → Strategic Outreach → Heatmap

**What happens:** Lead/prospect scores of 38 and 98 are visible simultaneously with no legend, no scale label, no methodology note. It is unclear whether these are:
- The same scoring model on a 0–100 scale (some leads strong, some weak)
- Two different scoring models being conflated in the same view
- A bug where one score is a raw value and another is normalized

**Fix:** Every scored metric must have: (1) a visible scale label (e.g., "Score / 100"), (2) a tooltip or sidebar explaining what the score measures and how it's calculated, (3) threshold markers (e.g., green/yellow/red bands). If two different scoring models exist, they must be named distinctly.

---

### OW-10: Inverted tier naming in ECC VIP hierarchy
**Severity:** 🟡 Medium

**Location:** ECC → VIPs (the "Search" tab)

**What happens:** Tier 3 contacts (family, board members) have a 1-hour SLA — the highest urgency. Tier 1 contacts (vendors) have a 24-hour SLA — the lowest urgency. This is the reverse of every industry convention where Tier 1 = highest priority.

**Impact:** Any user who has worked in operations, SRE, customer support, or investment management will instinctively read "Tier 1" as most important. Exporting a report to a board member showing they are "Tier 3" will read as a demotion.

**Fix:** Rename tiers so that Tier 1 = family/board (SLA 1H), Tier 2 = LP/client (SLA 4H), Tier 3 = vendor (SLA 24H). Alternatively, use named tiers: "Priority", "Standard", "Extended" — eliminating the number confusion entirely.

---

### OW-11: Consulting header exposes raw UUIDs
**Severity:** 🟠 High

**Location:** Consulting environment header / breadcrumb

**What happens:** The environment header displays: `62cfd59c-a171-4224-ad1e-fffc35bd1ef4 · 225f52ca` — raw env_id and truncated business_id. No human-readable name is shown.

**Fix:** The header must resolve UUIDs to their display names before rendering. The env name is "Novendor" — display "Novendor" in the header, not the UUID. If the name lookup fails, display "Unknown Environment" — not a UUID.

---

### OW-12: Portfolio Footprint sub-tab exposes raw UUID in body text
**Severity:** 🟠 High

**Location:** RE → Sustainability → Portfolio Footprint

**What happens:** Body text reads: `"Showing footprint for fund a1b2c3d4-0003-0030-0001-000000000001 in 2026."` — the template string interpolated a UUID instead of the fund name "Institutional Growth Fund VII."

**Fix:** Fund references in any UI copy must resolve to the fund's `name` field, not its UUID. This is a template string that was tested with a named value and then regressed when the name lookup broke.

---

## Category 6 — Demo/Dev Utilities Exposed in Production Views

### OW-13: "Seed Novendor Targets" button visible in Strategic Outreach
**Severity:** 🟠 High

**Location:** Consulting → Strategic Outreach

**What happens:** A "Seed Novendor Targets" button — clearly a developer/demo utility — is visible in the production UI. This is not a user action; it's a data seeding trigger that should live in an admin panel.

**Fix:** Move all data seeding utilities to the admin shell (`/lab/environments` → Settings panel for each env) or to a protected `/admin` route. They must not appear in end-user product views.

---

### OW-14: ECC Admin/Demo Controls accessible via "Settings" tab
**Severity:** 🔴 Critical (same as OW-4 above, restated for completeness)

**Location:** ECC → "Settings" tab → `/ecc/admin`

**What happens:** Demo Controls including "Reset Demo" are exposed in a user-facing navigation slot. See OW-4 for full description.

---

## Summary Table

| ID | Issue | Severity | Environment |
|---|---|---|---|
| OW-1 | Run Center duplicated (top nav + fund tab) | 🟠 High | RE |
| OW-2 | Revenue page = Command Center copy | 🟠 High | Consulting |
| OW-3 | ECC "Search" tab → VIP directory | 🟠 High | ECC |
| OW-4 | ECC "Settings" tab → Demo admin panel | 🔴 Critical | ECC |
| OW-5 | "+ Lead" / "+ Proposal" CTAs navigate to list, not form | 🟡 Medium | Consulting |
| OW-6 | Command Center shows all-zero metrics despite seeded data | 🔴 Critical | Consulting |
| OW-7 | Fund NAV column "—" while fund-level NAV correct | 🔴 Critical | RE |
| OW-8 | Domain filter retains state from New Loop form | 🟡 Medium | Consulting |
| OW-9 | Two scoring systems with no explanation | 🟡 Medium | Consulting |
| OW-10 | Inverted tier naming (Tier 3 = highest priority) | 🟡 Medium | ECC |
| OW-11 | Consulting header exposes raw UUIDs | 🟠 High | Consulting |
| OW-12 | Portfolio Footprint body text contains raw UUID | 🟠 High | RE |
| OW-13 | "Seed Novendor Targets" dev button in prod UI | 🟠 High | Consulting |
| OW-14 | ECC Demo Controls reachable via user-facing "Settings" tab | 🔴 Critical | ECC |

**Critical count: 4 | High count: 6 | Medium count: 4**

---

*Generated by frontend coherence audit — 2026-03-03*
