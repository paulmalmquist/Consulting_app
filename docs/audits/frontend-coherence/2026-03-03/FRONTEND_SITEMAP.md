# Winston Platform — Frontend Sitemap
**Date:** 2026-03-03
**Auditor:** Frontend Coherence Audit
**Base URL:** https://www.paulmalmquist.com

---

## 1. Public / Marketing Layer

| URL | Page | Status |
|---|---|---|
| `/` | Homepage / Landing | ✅ Loads |

**Homepage CTAs observed:** Log in, Get Started, and product copy blocks.

---

## 2. Admin Shell (`/lab/*`)

Entry point after login. The admin shell has a persistent left sidebar.

### 2.1 Top-Level Admin Nav

| Nav Label | URL | Notes |
|---|---|---|
| Dashboard | `/lab/dashboard` or `/lab` | Admin overview |
| Environments | `/lab/environments` | Environment Control Tower |
| Pipeline | `/lab/pipeline` | Global pipeline view |
| Uploads | `/lab/uploads` | Document upload |
| Chat | `/lab/chat` | Intelligence / RAG Chat |
| Metrics | `/lab/metrics` | HITL & platform metrics |
| AI | `/lab/ai` | AI settings |
| Audit | `/lab/audit` | System audit log |

### 2.2 Admin Nav Groups

- **OPERATIONS:** Dashboard, Environments, Pipeline, Uploads
- **INTELLIGENCE:** Chat, Metrics, AI
- **SYSTEM:** Audit

---

## 3. RE Platform — Meridian Capital Management

**Env ID:** `a1b2c3d4-0001-0001-0003-000000000001`
**Base:** `/lab/env/{envId}/re/`

### 3.1 RE Top-Level Nav

| Nav Label | URL Pattern | Status |
|---|---|---|
| (Fund list / home) | `/re` | ✅ Fund list |
| Fund Detail | `/re/funds/{fundId}` | ✅ 12 investments shown |
| Sustainability | `/re/sustainability` | ❌ Not Found banner (all sub-tabs) |
| Run Center | `/re/run-center` | ✅ Functional |
| RAG Chat | `/re/chat` | ✅ (not fully tested) |

### 3.2 Fund Detail Tabs (`/re/funds/{fundId}`)

| Tab | URL Anchor / Param | Status |
|---|---|---|
| Overview | default | ⚠️ Fund NAV column shows "—" for all 12 investments |
| Variance | `?tab=variance` | ✅ NOI data visible |
| Returns | `?tab=returns` | ❌ Empty — "No return metrics available" |
| Run Center | `?tab=run-center` | ⚠️ **DUPLICATE** of top-nav Run Center |
| Scenarios | `?tab=scenarios` | ❌ Empty — scenario creation broken |
| LP Summary | `?tab=lp-summary` | ❌ Empty — FK constraint blocks seed |
| Waterfall Scenario | `?tab=waterfall` | ❌ Disabled / creation broken (model_id missing) |

### 3.3 Investment Detail (`/re/investments/{investmentId}`)

| Section | Status |
|---|---|
| NAV, NOI, Gross Value, IRR, MOIC | ✅ |
| Sector Exposure widget | ✅ |
| Acquisition Date | ❌ Shows "—" |
| Hold Period | ❌ Shows "—" |
| LTV / Debt | ❌ 0.0% |
| Cap Rate | ❌ 34.78% (should be ~8.7%) |
| Investment Documents | ⚠️ Raw unstyled browser file input |

### 3.4 Sustainability Sub-Tabs (`/re/sustainability`)

All 7 sub-tabs return "Not Found" banner + empty state:

| Sub-Tab | Status |
|---|---|
| Overview | ❌ Not Found |
| Portfolio Footprint | ❌ Not Found + raw UUID in body text |
| Asset Sustainability | ❌ Not Found |
| Utility Bills | ❌ Not Found |
| Certifications | ❌ Not Found |
| Regulatory Risk | ❌ Not Found |
| Decarbonization Scenarios | ❌ Not Found |

---

## 4. Consulting Platform — Novendor

**Env ID:** `62cfd59c-a171-4224-ad1e-fffc35bd1ef4`
**Business ID:** `225f52ca-cdf4-4af9-a973-d1d310ddcba1`
**Base:** `/lab/env/{envId}/consulting/`

### 4.1 Consulting Nav (9 items)

| Nav Label | URL Pattern | Status |
|---|---|---|
| Command Center | `/consulting` or `/consulting/dashboard` | ⚠️ All metrics 0 despite 8 seeded leads |
| Pipeline | `/consulting/pipeline` | ❌ HARD CRASH — TypeError: e.toFixed is not a function |
| Outreach | `/consulting/outreach` | ⚠️ Loads; raw "research_loop" enum values; inconsistent scoring |
| Strategic Outreach | `/consulting/strategic-outreach` | ⚠️ 6 sub-tabs; two scoring systems (38 vs 98) |
| Proposals | `/consulting/proposals` | ⚠️ No page title; empty |
| Clients | `/consulting/clients` | ⚠️ No page title; empty |
| Loop Intelligence | `/consulting/loops` | ⚠️ Not Found banner; all API routes 404 |
| Authority | `/consulting/authority` | ⚠️ "Coming Soon" placeholder; no CTAs |
| Revenue | `/consulting/revenue` | ⚠️ Duplicates Command Center metrics wholesale |

### 4.2 Strategic Outreach Sub-Tabs

| Sub-Tab | Status |
|---|---|
| Heatmap | ⚠️ Loads; scoring inconsistency (38 vs 98) |
| Active Leads | ✅ |
| Trigger Signals | ✅ |
| Outreach Queue | ✅ |
| Diagnostics | ✅ |
| Deliverables Sent | ✅ |

### 4.3 Loop Intelligence Sub-Pages

| URL | Status |
|---|---|
| `/consulting/loops` | ❌ Not Found banner (API 404) |
| `/consulting/loops/new` | ⚠️ Form renders; POST fails (API 404) |
| `/consulting/loops/{id}` | ❌ BLOCKED — no loops exist |

---

## 5. StonePDS (PDS Command)

**Env ID:** (unknown — not captured)
**Base:** `/lab/env/{envId}/`

| Status | Notes |
|---|---|
| ❌ Hard error on load | DB schema mismatch: `column "industry_type" does not exist` |
| ❌ Raw SQL fragment exposed | Error message leaks: `SELECT env_id::text, client_name, industry, industry_t...` |

---

## 6. Meridian Apex Holdings — Executive Command Center (ECC)

**Env ID:** `0f2b6f58-57c2-4a54-8b11-4fda7fd72510`
**Base:** `/lab/env/{envId}/ecc`
**UX pattern:** Mobile-first, 4-tab bottom nav, dark header

### 6.1 ECC Bottom Nav Tabs

| Tab Label | Actual URL | Page Title | Status |
|---|---|---|---|
| Queue | `/ecc` | Live Queue — Decision and routing | ✅ Functional; email truncated mid-word |
| Brief | `/ecc/brief` | Evening Sweep | ⚠️ Alert pills duplicated; monospace font |
| Search | `/ecc/vips` | VIP Routing — Tiered contacts | ⚠️ Tab label "Search" ≠ page content |
| Settings | `/ecc/admin` | Demo Controls | ⚠️ Admin/demo panel exposed in user-facing tab |

### 6.2 ECC Live Queue — Card Types Observed

| Card Type | Actions Available |
|---|---|
| VIP Email (Tier 3, SLA 1H) | Reply / Delegate / Snooze / Done |
| Payroll Approval (Needs Review) | Approve / Delegate / Review / Refresh |
| Task (Unsigned contract) | (partially visible) |

### 6.3 ECC VIP Tiers (Inverted Convention)

| Tier Label | SLA Window | Implied Priority |
|---|---|---|
| TIER 3 | 1H | Highest (FAMILY, BOARD) |
| TIER 2 | 4H | Mid (LP, CLIENT, LEGAL) |
| TIER 1 | 24H | Lowest (VENDOR) |

> ⚠️ Tier numbering is inverted from industry convention (Tier 1 = highest priority everywhere else). "Tier 3" being the family/board tier will confuse every new user.

---

## 7. Demo / Provisioning Shortcuts (from Environments page)

| Button Label | Destination | Notes |
|---|---|---|
| Open Institutional Demo | Opens Meridian Capital Management (RE) | ✅ |
| Open Meridian Apex | Opens Meridian Apex Holdings (ECC) | ✅ |

---

## 8. URL Pattern Summary

| Product | Pattern |
|---|---|
| Admin shell | `/lab/{section}` |
| RE environments | `/lab/env/{envId}/re/{section}` |
| Consulting environments | `/lab/env/{envId}/consulting/{section}` |
| ECC environments | `/lab/env/{envId}/ecc/{tab}` |
| StonePDS | `/lab/env/{envId}/` (unknown suffix) |

---

## 9. Total Page Inventory

| Category | Count |
|---|---|
| Admin shell pages | ~8 |
| RE pages (nav + tabs + detail) | ~20 |
| Consulting pages | ~15 |
| ECC pages | 4 |
| StonePDS pages | 1 (broken) |
| **Total unique URLs surveyed** | **~48** |

---

*Generated by frontend coherence audit — 2026-03-03*
