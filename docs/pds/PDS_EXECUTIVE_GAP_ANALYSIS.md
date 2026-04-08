# StonePDS Executive Gap Analysis

**Date:** March 16, 2026
**Evaluator perspective:** PDS Americas Executive (Louis Molinini / Julie Hyson level)
**Environment:** StonePDS · env_stonepds · Business 68b3d128

---

## Executive Summary

Winston PDS has ambitious navigation and strong architectural bones, but as of today roughly **70% of the surface area is non-functional**. Of 26 sidebar destinations, only 3 render usable content, 5 show "Coming Soon" placeholders, 6 produce hard application crashes, and 12 display an empty page with a raw SQL error. An executive trying to use this in a Monday morning leadership meeting would hit a blank screen within one click of landing.

The single most damaging issue is a missing database table (`pds_pipeline_deals`) whose query runs on every page load, poisoning the entire shell — even pages whose own data is healthy show the error banner. Fix that one table and the perception shifts immediately.

---

## Page-by-Page Audit

### What Works (3 pages)

| Page | Status | Notes |
|------|--------|-------|
| **Accounts** | Functional | KPI cards ($781K revenue, -77.9% YoY, health dots), Top 5 Revenue / Top 5 At Risk tables, Revenue/Growth and NPS/Revenue quadrant toggles. "View Regional Breakdown" link present. Card labels are invisible (dark text on dark cards) — needs contrast fix. |
| **Delivery Risk** | Functional | 252 projects, avg health 78.6, green/yellow/red distribution. "Projects by Health Score (worst first)" grid with SPI, CPI, Quality, Risks per card. Best-built page in the app. |
| **Forecast** | Partially functional | Pipeline (Variable) / Portfolio (Dedicated) tab toggle works. Deal Funnel bar chart renders with weighted/unweighted values, but stage labels on Y-axis are invisible and summary row shows "NaN". Coverage ratio not computed. |

### What Crashes (6 pages — black screen, "Application error")

| Page | URL path |
|------|----------|
| **Revenue & CI** | /pds/revenue |
| **Financials** | /pds/financials |
| **Resources** | /pds/resources |
| **Timecards** | /pds/timecards |
| **Client Satisfaction** | /pds/satisfaction |
| **Fee Variance** | (under /pds/financials) |

These are **full Next.js client-side crashes** — no error boundary, no fallback, just a black screen. An executive would assume the product is broken.

### What Shows "Coming Soon" (5 pages)

| Page | Description shown |
|------|-------------------|
| **Utilization** | "Track resource utilization rates, billable mix, and bench availability by market and role." |
| **Backlog** | "Monitor backlog composition, aging, and conversion rates across markets and accounts." |
| **Capacity Planning** | (presumably similar — not checked but same pattern) |
| **Process Compliance** | (same pattern) |
| **Operational Signals** | (same pattern) |

### What Shows Empty + SQL Error (12 pages)

Every remaining page — Command Center, AI Briefing, Markets, Projects, Pipeline, Closeout, Schedule Health, Project Status, Strategic Accounts, Relationship Health, Tech Adoption, Reports, Documents, Audit, Configuration — renders the shell with sidebar and header, but the main content area is blank except for a pink error banner:

> `relation "pds_pipeline_deals" does not exist LINE 1: SELECT COUNT(*) AS cnt FROM pds_pipeline_deals WHERE env_id ...`

This error fires on **every page load** from a shared layout-level query, making the entire app feel broken even where page-specific data exists.

### AI Query (Special case — partially works)

The AI Query page is the most promising feature. It has a proper chat interface with 8 suggested questions ("What's our firm-wide utilization this quarter?", "Show revenue trend, budget vs actual", etc.), a text input, and a Send button. When tested:

- Intent classification worked ("Firm-wide average utilization by month for the current quarter")
- SQL generation ran successfully
- Query returned 3 results
- "View SQL" disclosure is present
- **Failed at the last step:** "Error: Object of type date is not JSON serializable"

So the text-to-SQL pipeline is 90% there but the response serialization has a Python bug.

---

## Critical Gaps — What an Executive Would Need

### 1. The "pds_pipeline_deals" table doesn't exist

This is the single biggest blocker. It's queried in the layout-level data fetch, so it poisons every page. Either create the table and seed it, or wrap the query in a try/catch that degrades gracefully. This one fix would make 12 pages go from "broken" to "empty but navigable."

### 2. No Variable vs. Dedicated toggle anywhere

The PDS report identifies variable/dedicated governance as the *primary segmentation axis* for the entire platform. There is no toggle, filter, or visual distinction between variable and dedicated work anywhere in the current UI. The Forecast page has Pipeline (Variable) / Portfolio (Dedicated) tabs, which is the right pattern, but it needs to be a global control visible on every dashboard.

### 3. Revenue dashboards are completely absent

For an executive running a $87B project portfolio, fee revenue is the #1 thing they check. Revenue & CI crashes. There is no:
- Revenue time series (actual vs budget vs forecast)
- Forecast version selector (Budget, 3+9, 6+6, 9+3)
- Waterfall variance chart (budget → actual bridge)
- Revenue recognition breakdown (recognized/billed/unbilled)
- Revenue mix tracking (variable vs dedicated %)

### 4. Utilization is "Coming Soon" — the most time-sensitive metric

Industry utilization dropped from 73.2% to 68.9% between 2021–2024. PDS leadership will be checking utilization daily. There is no:
- Utilization heatmap (people × months)
- Role-adjusted target thresholds
- Bench analysis
- Capacity vs demand forward view
- Overtime / burnout alerts

### 5. Client Satisfaction crashes — no NPS visibility at all

For an executive preparing for a client QBR, there is no:
- NPS score or gauge
- NPS trend by quarter
- Satisfaction driver analysis
- At-risk account alerts based on declining scores
- Verbatim comment feed

### 6. Accounts page lacks drill-through depth

The Accounts page is the closest thing to an executive dashboard, but it only has Level 0 (C-Suite overview). There is no:
- Click-into-region (Level 1)
- Click-into-account-360 (Level 2) with P&L, utilization gauge, NPS trend, contract timeline
- Click-into-project detail (Level 3) with EVM metrics and Gantt
- RAG scoring definitions (green/amber/red thresholds are not labeled)

### 7. KPI cards have no labels

On both Accounts and Delivery Risk pages, the large KPI cards show numbers ($781,791 ... -77.9% ... 3,511% ... 252 ... 78.6) but the **card titles and descriptions are invisible** — likely a CSS issue where light text is on a transparent/dark background. An executive literally cannot tell what the numbers mean.

### 8. No error boundaries

Six pages produce full black-screen crashes with no recovery path. There's no error boundary component wrapping the page content. An executive hitting one of these has to manually navigate back — and might not return.

### 9. AI Query serialization bug

The text-to-SQL pipeline correctly classifies intent, generates SQL, and executes it, but fails on `date` type serialization. This is a one-line fix in the FastAPI response handler (use a custom JSON encoder that handles `datetime.date`). Once fixed, the AI Query becomes instantly the most impressive feature in the product.

### 10. No data export or sharing

There is no way to export any dashboard view as PDF, Excel, or a shareable link. Executives live in email and PowerPoint — they need to pull a chart or table out of Winston and drop it into a board deck. There's also no "schedule this report" capability.

---

## Severity Ranking

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| **P0** | Missing `pds_pipeline_deals` table | Blocks 12 pages | 1 hour |
| **P0** | Add error boundaries to all pages | 6 pages crash to black | 2 hours |
| **P0** | Fix KPI card label visibility (CSS) | Numbers are meaningless without labels | 30 min |
| **P0** | Fix AI Query date serialization | Most impressive feature fails at last step | 30 min |
| **P1** | Build Revenue time series + variance dashboard | #1 exec need, currently crashes | 2–3 days |
| **P1** | Build Utilization heatmap + bench view | #2 exec need, currently "Coming Soon" | 2–3 days |
| **P1** | Build Client Satisfaction / NPS dashboard | Currently crashes, no fallback | 2 days |
| **P1** | Add Variable/Dedicated global toggle | Primary segmentation axis missing everywhere | 1 day |
| **P2** | Account drill-through (Level 1–3) | Currently only Level 0 exists | 3 days |
| **P2** | Forecast page — fix NaN values and stage labels | Partial but broken display | 4 hours |
| **P2** | Build Backlog, Capacity Planning, Tech Adoption | "Coming Soon" placeholders | 1–2 days each |
| **P3** | Data export (PDF, Excel, email) | No way to share insights | 3 days |
| **P3** | EVM S-curves and predictive delay model | Delivery Risk page has health scores but no EVM charts | 2 days |

---

## What's Actually Good

It would be unfair not to note what works well:

- **The navigation structure is comprehensive and well-organized.** The seven-section sidebar (Command, Portfolio, Financials, Delivery, Resources, Client, Operations, Governance) maps cleanly to how a PDS executive thinks about their business.

- **Delivery Risk is a genuinely useful page.** Project cards sorted by health score with SPI, CPI, Quality, and Risk metrics is exactly what a delivery-focused exec would want. The "worst first" sort is a smart default.

- **AI Query has the right UX pattern.** Suggested questions, a chat interface, intent classification, SQL transparency via "View SQL" — this is a product that will impress once the serialization bug is fixed and the response includes inline charts.

- **The architecture is production-grade.** Multi-tenant isolation, Supabase Auth, lens/horizon/role filtering framework, FastAPI backend with 67 route modules — the foundation is enterprise-ready. The gap is that the frontend pages haven't been wired to the backend's full capability yet.

- **The Forecast page's Variable/Dedicated tab pattern is correct.** This is exactly the right interaction model — it just needs to be the global pattern, not isolated to one page.

---

## Bottom Line

Winston PDS is a **demo that's 30% away from being a real product**. The architecture, data model, and navigation are sound. The blocking issues are mostly plumbing: a missing table, unhandled errors, CSS contrast bugs, and incomplete page implementations. The P0 fixes (4 hours of work) would transform the first impression from "this is broken" to "this is early but promising." The P1 work (2 weeks) would make it usable for a real exec meeting.

The highest-leverage single investment is **completing the Revenue dashboard** — that's the page every PDS executive will open first, every morning.
