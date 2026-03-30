# Winston Demo Ideas — 2026-03-30 (Monday)

*Generated from: LATEST.md 2026-03-30 + Monday Pipeline Review 2026-03-30 + Competitor Research 2026-03-27 + Meridian Health 2026-03-27 + Stone PDS Health 2026-03-27 + Revenue Operating Program §2/§3/§5 + Target Account Queue 2026-03-27 + Demo Friction Log 2026-03-27 + Objection Log 2026-03-27*

**Context driving today's demos:**
- Pipeline is pre-revenue. Zero outreach sent, zero proof assets built. This week is make-or-break: Marcus Partners, GAIA Real Estate, and ACG South Florida outreach must ship this week or the April discovery call target slips.
- Juniper Square + Kudu Investment Management partnership announced 3/27: 32 partner firms, ~$150B AUM, $1T LP capital on platform. This is an ecosystem-scale play. Winston must counter-position as the *investment intelligence layer* that Juniper Square doesn't provide.
- Yardi antitrust: FPI settled $2.8M, judge denied dismissal, discovery active. REPE firms are evaluating vendor diversification.
- New prospect this week: Sciens Building Solutions / Carlyle Group (PE roll-up, 9 FL acquisitions, score 3.75). Integration complexity from multi-company consolidation is a strong diagnostic fit.
- Stone PDS was 27/28 PASS on 3/27 with three P0/P1 bugs FIXED. Demo-ready assumed but health check is 3 days stale.
- Meridian REPE remains DEGRADED: AI chat broken (500 error), equity fund performance metrics contradictory (TVPI 0.21x vs AI summary 2.59x), investment sub-records missing. Core pages (fund list, fund detail, debt tabs) were PASS on 3/27.

**Demos excluded (covered in last 5 days):** PDS Operational Signals (Mar 27), REPE Deal Decisioning Layer (Mar 27), PDS Resource Intelligence (Mar 27), LP Capital Flow Intelligence (Mar 26), PDS Executive Briefing (Mar 26), ARGUS Refugee Pitch (Mar 26), Debt Surveillance Dashboard (Mar 24), Private Credit Loan Underwriting (Mar 24), AI Governance Audit Trail (Mar 24), Scenario Stress Testing (Mar 23), Document Pipeline (Mar 23), IRR Scenario Library (Mar 23)

---

## Assumptions

1. **Pipeline state:** Pre-revenue. 8 CRM accounts (all stale 31 days, zero activity). 15 signal-sourced prospects, none promoted to CRM. Zero outreach sent, zero proposals, zero opportunities. `[source: docs/revenue-ops/monday-pipeline-2026-03-30.md]` `[HIGH]`

2. **Active deals/targets:** No deals at Stage 3+. Top targets for outreach this week: Marcus Partners (4.25, REPE Pilot $35K), GAIA Real Estate (3.75, AI Diagnostic $7.5K, local), ACG South Florida (3.75, workshop channel, DealMAX 28 days away). New this week: Sciens/Carlyle (3.75, PE roll-up diagnostic). `[source: docs/revenue-ops/monday-pipeline-2026-03-30.md, docs/revenue-ops/target-account-queue.md]` `[HIGH]`

3. **Demo friction — Meridian Capital (REPE):** STALE health check (3/27, 3 days old). AI Chat returns 500 server error. Equity fund metrics contradictory (P0 demo-killer). Debt fund tabs and fund list were PASS. `[source: docs/env-tasks/meridian/health/health-2026-03-27.md, docs/revenue-ops/demo-friction-log.md]` `[HIGH]`

4. **Demo friction — Stone PDS:** STALE health check (3/27, 3 days old). Was 27/28 PASS. Three former P0/P1 bugs confirmed FIXED (Tech Adoption crash, Forecast NaN, Satisfaction NaN). Remaining issues: Client risk scores 0.0 (LOW), Pipeline empty state (LOW), 3 "Coming Soon" nav stubs (LOW). `[source: docs/revenue-ops/demo-friction-log.md]` `[HIGH]`

5. **Existing demo scripts:** None in `docs/proof-assets/demo-scripts/`. Prior demo ideas in `docs/demo-ideas/` provide walkthrough scripts but are not formalized as reusable assets. `[source: file system check]` `[HIGH]`

6. **Competitor context:** Juniper Square + Kudu ($1T LP capital, 40K+ funds). Yardi antitrust active. Dealpath Connect at 65% institutional brokerage. Cherre Agent.STUDIO operational. ARGUS portfolio scenarios shipped. `[source: docs/competitor-research/daily-summary/2026-03-27.md]` `[HIGH]`

7. **What Paul may have done over the weekend:** Unknown. Outreach, LinkedIn posts, or conversations outside the system are not captured. Scoreboard may underreport. `[MEDIUM]`

---

## Demo Concept 1: PDS Post-Acquisition Integration Dashboard — "9 Companies, 9 Systems, 1 View"

**Demo title:** Post-Acquisition Integration Intelligence for PE Roll-Ups

**Target persona:** Operating Partner / VP Operations at a PE-backed platform company running a multi-company roll-up
**Target segment:** Segment E: PE-Backed Companies in Transition — specifically Sciens Building Solutions / Carlyle Group (new prospect, score 3.75) and Hidden Harbor Capital / R.L. James (Boca Raton, score 3.50) `[source: docs/revenue-ops/monday-pipeline-2026-03-30.md, docs/revenue-ops/target-account-queue.md]`
**Offer tier:** AI Operations Diagnostic ($7,500) positioned as post-acquisition integration assessment, bridging to Workflow Automation Sprint ($15,000) `[source: docs/REVENUE_OPERATING_PROGRAM.md §3, Offers 1-2]`
**Specific objection it answers:** OB-03: "We're not ready for AI" / "Can you just tell us what to do?" — The diagnostic is specifically about mapping integration workflows, not deploying AI. It answers: "Which of your 9 acquisitions has the most operational friction, and what's the fix?" `[source: docs/revenue-ops/objection-log.md OB-03]`

**Setup required:**
- Stone PDS demo environment — Home Dashboard, Accounts page (`/pds/accounts`), Operational Signals page (`/pds/operational-signals`), Process Compliance page (`/pds/process-compliance`)
- All four pages confirmed PASS in 2026-03-27 health check
- Reframe the 67 accounts in the Account Command Center as "acquired subsidiaries" or "portfolio companies" during narration
- No AI chat dependency

**5-minute walkthrough script:**
1. **[0:00-0:45] Open PDS Home Dashboard.** Show executive KPIs: Fee Revenue $2,517,000, 252 active projects, Backlog $4.7M. Say: "Sciens just completed their 9th Florida acquisition. That means 9 different service management systems, 9 compliance record formats, 9 scheduling platforms, and probably 9 different ways of tracking billable hours. This dashboard is what it looks like when all of that is unified into a single operating view."
2. **[0:45-2:00] Navigate to Accounts.** Show the Account Command Center: 67 accounts at risk, 68 staffing issues. Click into a specific account. Say: "Each of these accounts represents an acquired company. Right now, your operating partners are calling each subsidiary's GM on Monday morning asking 'how are things going?' Winston replaces that call with real-time data. This company has 3 staffing gaps, 2 delinquent timecards, and a revenue variance of -7.4%. You know that before the GM picks up the phone."
3. **[2:00-3:15] Navigate to Operational Signals.** Show the 12 critical issues. Walk through a Revenue Risk signal and a Staffing/Utilization signal. Say: "After 9 acquisitions, the question isn't 'do we have problems' — it's 'which problems are costing us the most money right now?' These 12 signals are synthesized from staffing, revenue, timecard, and client data across the entire portfolio. Your ERP gives you each piece separately. Winston connects them."
4. **[3:15-4:15] Navigate to Process Compliance.** Show "People to Call Today" action cards. Say: "Your Carlyle operating partner wants to know two things: are we hitting EBITDA targets, and are we integrating on schedule? This page answers both. L. Morgan is at 43% utilization with 2 delinquent timecards — that's not just a management problem, it's a margin problem. And it's prioritized: critical issues first, warnings second."
5. **[4:15-5:00] Closing pitch.** Say: "For a PE roll-up doing 2 acquisitions per quarter, the integration diagnostic answers a $7,500 question: across your 9 companies, which 3 workflows are losing you the most money, and what's the 90-day fix? You're not paying for AI software — you're paying for a map of where integration is breaking down and a prioritized plan to fix it."

**Key "wow moment":** The Account Command Center showing 67 subsidiaries with real-time risk flags, staffing gaps, and revenue variances in a single view. No PE operating partner has this today — they have a spreadsheet that gets updated monthly.

**Closing question:** "After 9 acquisitions, how long does it take your team to produce a consolidated operating report today? What if it was instant?"

**Build status:** READY (assumed) `[source: docs/revenue-ops/demo-friction-log.md 2026-03-27]`
- Home Dashboard: PASS (3/27) `[HIGH]`
- Accounts (`/pds/accounts`): PASS (3/27) — Account Command Center, 67 at risk, drill-down working `[HIGH]`
- Operational Signals (`/pds/operational-signals`): PASS (3/27) — 12 critical issues `[HIGH]`
- Process Compliance (`/pds/process-compliance`): PASS (3/27) — action cards with severity `[HIGH]`
- Health check is 3 days old. No deploys reported that would affect PDS pages. `[MEDIUM]`
- **Demo-ability today:** YES (assumed) — all 4 pages were PASS on 3/27. No AI chat dependency. Script avoids all known friction points (Pipeline empty, Client risk 0.0, Coming Soon stubs).

**Readiness confidence:** `[MEDIUM]` — pages verified 3 days ago. Stone PDS was stable across all health checks since 3/26. High confidence in stability, but marking MEDIUM because health check is >2 days old per protocol.

---

## Demo Concept 2: REPE LP Reporting Compliance Layer — "When Your LP Is the Florida SBA"

**Demo title:** Institutional LP Reporting Intelligence — ILPA-Ready Fund Analytics

**Target persona:** CFO / Head of IR at a mid-size REPE fund ($200M-$2B AUM)
**Target segment:** Segment B: REPE Funds (National) — specifically Marcus Partners ($875M Fund V, score 4.25) and Canopy Real Estate Partners ($75M inaugural fund, score 3.85) `[source: docs/revenue-ops/monday-pipeline-2026-03-30.md]`
**Offer tier:** Winston REPE Pilot ($35,000 for 90 days) `[source: docs/REVENUE_OPERATING_PROGRAM.md §3, Offer 3]`
**Specific objection it answers:** OB-01: "Juniper Square already handles our LP relationships" — Counter: Juniper Square manages pre-close fundraising and investor onboarding. Winston manages post-close performance intelligence: waterfall calculations, capital call analytics, distribution tracking, and AI-drafted LP communications. For funds whose LPs include institutional allocators (pensions, endowments, sovereign wealth), the reporting bar is ILPA-grade — not a CRM feature. `[source: docs/revenue-ops/objection-log.md OB-01, docs/competitor-research/daily-summary/2026-03-27.md]`

**Setup required:**
- Meridian Capital demo environment — fund list (3 funds, $2.0B), debt fund detail (MCOF I — cleanest data), capital calls page, distributions page
- CRITICAL: Demo ONLY the debt fund (MCOF I). Equity funds (IGF VII, MRF III) have contradictory performance metrics (P0 demo-killer). Do NOT click into IGF VII or MRF III detail pages.
- Capital calls and distributions pages confirmed PASS on 3/27
- Distributions now showing Total Paid $123.8M (was $0, fixed)
- No AI chat dependency (broken, 500 error)

**5-minute walkthrough script:**
1. **[0:00-0:45] Open Meridian Capital fund list.** Show 3 funds, $2.0B total commitments. Say: "Juniper Square just announced $1 trillion in LP capital on their platform with 40,000 funds. They're the fundraising layer. Great. But Marcus Partners just closed Fund V at $875 million. Your LPs — the Florida SBA just allocated $2 billion into PE and RE this quarter — don't need a fundraising platform. They need institutional-grade reporting. ILPA Q1 2026 templates are now standard. That's what Winston delivers."
2. **[0:45-2:00] Click into Meridian Credit Opportunities Fund I (debt fund).** Show Loan Book: $534M UPB, Weighted Avg Coupon 6.0%, DSCR 1.34, Portfolio LTV 77.4%, 8 loans, maturity profile. Say: "This is your credit book. Every loan, every covenant, every maturity date — tracked in real time. When your institutional LP asks about your exposure to floating-rate debt, or your DSCR coverage across the portfolio, this is a 10-second answer, not a 3-day Excel exercise."
3. **[2:00-3:15] Navigate to Capital Calls.** Show capital call history and analytics. Say: "Canopy Real Estate Partners just closed a $75M inaugural fund. First-time funds have the highest LP scrutiny — every capital call needs to be documented, every deployment tracked, and the pace needs to match the PPM commitment schedule. Winston tracks all of this and flags when deployment pace is off-plan."
4. **[3:15-4:15] Navigate to Distributions.** Show Total Paid $123.8M, distribution events by fund. Say: "Distribution waterfall calculations are where most fund accounting teams spend 20+ hours per quarter. Winston computes them continuously. When your LP asks for an updated distribution schedule, it's already done. For a fund like Marcus Partners managing $875M across East Coast markets, that's the difference between LP confidence and LP anxiety."
5. **[4:15-5:00] Closing pitch — the Juniper Square counter.** Say: "Juniper Square manages your LPs. Winston manages your investments. When the Florida SBA or a university endowment asks for an ILPA-compliant performance report, Juniper Square gives them a portal login. Winston gives them analytics: waterfall calculations, covenant tracking, scenario projections, and AI-drafted LP communications. The pilot is $35,000 for 90 days — we deploy against your actual fund data and prove the value before you commit."

**Key "wow moment":** The debt fund loan book showing 8 loans with real-time DSCR, LTV, coupon, and maturity data in a single view, positioned against the ILPA compliance narrative. Most mid-size REPE funds track this in Excel. The "Florida SBA just allocated $2B" data point makes LP reporting pressure tangible and specific.

**Closing question:** "Your LPs are institutions that manage billions. How much time does your team spend each quarter producing reports that meet their standards? What if the reports wrote themselves?"

**Build status:** NEEDS WORK (equity fund metrics) `[source: docs/env-tasks/meridian/health/health-2026-03-27.md]`
- Fund list: PASS (3/27) `[HIGH]`
- Debt fund detail (MCOF I — Loan Book, covenants, maturity): PASS (3/27) — cleanest data in Meridian `[HIGH]`
- Capital calls: PASS (3/27) `[HIGH]`
- Distributions: PASS (3/27) — Total Paid now $123.8M (fixed from $0) `[HIGH]`
- Equity fund detail: FAIL — contradictory metrics (0.21x TVPI vs AI 2.59x). DO NOT DEMO. `[HIGH]`
- AI chat: FAIL — 500 server error. Not used in demo. `[HIGH]`
- Health check is 3 days old. `[MEDIUM]`
- **Demo-ability today:** YES with strict guardrails — demo ONLY debt fund, capital calls, distributions. Never click IGF VII or MRF III detail. Script is designed for this constraint.

**Readiness confidence:** `[MEDIUM]` — debt fund pages were verified 3 days ago. High confidence in debt fund data quality (no known issues). Marking MEDIUM because health check is >2 days old and Railway deploy status is unconfirmed. Recommend a quick manual check of fund list and MCOF I detail before scheduling with Marcus Partners.

---

## Demo Concept 3: PDS Satisfaction & Forecast Intelligence — "Know Which Clients Are At Risk Before They Call"

**Demo title:** Client Satisfaction Intelligence — From NPS to Revenue Retention

**Target persona:** CEO / Managing Director at a professional services or construction firm (100-500 employees)
**Target segment:** Segment A: South Florida Mid-Market — also applicable to Segment E: PE-backed firms where client retention drives EBITDA. Could demo for Hidden Harbor / R.L. James (Boca Raton, 24 portfolio companies, score 3.50) or Michelli / Summit Park (Jacksonville, score 3.35). `[source: docs/revenue-ops/target-account-queue.md]`
**Offer tier:** AI Operations Diagnostic ($7,500) `[source: docs/REVENUE_OPERATING_PROGRAM.md §3, Offer 1]`
**Specific objection it answers:** OB-04: "We can do this ourselves with ChatGPT" — This demo shows integrated operational intelligence (NPS + forecast + delivery risk) that ChatGPT cannot replicate because it requires structured data from multiple internal systems, not a chat interface. `[source: docs/revenue-ops/objection-log.md OB-04]`

**Setup required:**
- Stone PDS demo environment — Satisfaction page (`/pds/satisfaction`), Forecast page (`/pds/forecast`), Delivery Risk page (`/pds/risk`), Home Dashboard
- Satisfaction: PASS (3/27) — NPS Score now rendering (+42, was NaN — FIXED). Importance vs Performance scatter and verbatims available.
- Forecast: PASS (3/27) — Total Deals now rendering (202, was NaN — FIXED). Weighted Pipeline $523,990.
- Delivery Risk: PASS (3/27) — 252 projects, health distribution.
- All three formerly broken pages were FIXED and confirmed in 3/27 health check.

**5-minute walkthrough script:**
1. **[0:00-0:45] Open PDS Home Dashboard.** Show executive KPIs. Say: "Every services firm tracks revenue. Fewer track the leading indicators that predict whether that revenue will be here next quarter. This dashboard connects three data streams that most firms track separately: client satisfaction, pipeline forecast, and delivery risk."
2. **[0:45-2:00] Navigate to Satisfaction.** Show NPS Score +42, Importance vs Performance scatter, client verbatims. Say: "A +42 NPS sounds good. But look at this scatter plot — it shows you where client expectations are high but your performance is low. These quadrants are your retention risks. The verbatim comments below tell you exactly what's driving dissatisfaction. Hidden Harbor runs 24 portfolio companies. If each one has clients, that's hundreds of satisfaction signals that no one is aggregating."
3. **[2:00-3:15] Navigate to Forecast.** Show 202 deals, Weighted Pipeline $523,990, deal funnel stages. Say: "Your CRM tells you pipeline value. Winston tells you which deals are at risk based on the delivery performance of the team assigned to them. If the team delivering for Client A has a -7% revenue variance and 3 delinquent timecards, your 'weighted' pipeline value for Client A's renewal should be discounted. That's what this view computes."
4. **[3:15-4:15] Navigate to Delivery Risk.** Show 252 projects, 162 green / 90 yellow / 0 red, average health score 78.5. Say: "90 yellow projects. Each one is a client conversation waiting to happen. The question is whether you're having that conversation proactively or reactively. For a PE-backed firm where EBITDA margin is the scorecard, every yellow project that turns red is margin erosion your sponsor will notice."
5. **[4:15-5:00] Closing pitch.** Say: "The AI Diagnostic maps your actual client feedback loops, delivery health metrics, and pipeline forecasting into a single operating model. For $7,500 over 5 days, you get a prioritized list of which clients are at risk, which deals should be re-forecast, and which delivery teams need intervention. Most firms find 2-3 clients they're about to lose that nobody flagged."

**Key "wow moment":** The Satisfaction Importance vs Performance scatter plot showing exactly where client expectations diverge from delivery. Every services firm CEO knows some clients are unhappy — this shows them *which ones* and *why*, connected to revenue impact.

**Closing question:** "How many clients have you lost in the last 12 months where you didn't see it coming? What would it be worth to see the warning signs 90 days earlier?"

**Build status:** READY (assumed) `[source: docs/revenue-ops/demo-friction-log.md 2026-03-27 — all three bugs FIXED]`
- Satisfaction (`/pds/satisfaction`): PASS (3/27) — NPS +42 rendering (was NaN, FIXED). Scatter plot and verbatims working. `[HIGH]`
- Forecast (`/pds/forecast`): PASS (3/27) — 202 deals rendering (was NaN, FIXED). Weighted Pipeline $523,990. `[HIGH]`
- Delivery Risk (`/pds/risk`): PASS (3/27) — 252 projects, health distribution rendering. `[HIGH]`
- Home Dashboard: PASS (3/27) `[HIGH]`
- Health check is 3 days old. Three bugs that were P0/P1 were confirmed FIXED in 3/27 check. `[MEDIUM]`
- **Demo-ability today:** YES (assumed) — all 4 pages PASS. This demo specifically showcases the three pages that were just fixed, proving the platform is improving. No AI chat dependency.

**Readiness confidence:** `[MEDIUM]` — pages verified 3 days ago. Three former bug pages now confirmed working. Marking MEDIUM because health check is >2 days old. These pages had bugs as recently as 3/26 — while fixes were confirmed 3/27, a quick check before any live demo is prudent.

---

## Demo Readiness Verification Summary

| Demo | Core Pages | AI Chat | Known Issues | Overall | Confidence |
|---|---|---|---|---|---|
| PDS Post-Acquisition Integration | PASS (all 4 pages, 3/27) | Not used | Health check 3 days old | READY (assumed) | `[MEDIUM]` |
| REPE LP Reporting Compliance | PASS (debt fund + capital/distrib, 3/27) | Not used | Equity funds broken (avoided in script). Health check 3 days old | NEEDS WORK (equity) / READY (debt path) | `[MEDIUM]` |
| PDS Satisfaction & Forecast | PASS (all 4 pages, 3/27) | Not used | 3 bugs recently fixed, health check 3 days old | READY (assumed) | `[MEDIUM]` |

**Best demo to run today:** Demo 1 (PDS Post-Acquisition Integration). It targets the new Sciens/Carlyle prospect (fresh signal, 2 FL acquisitions in Q1 2026), uses the most data-rich PDS pages (Accounts, Operational Signals), and the "9 companies, 9 systems, 1 view" narrative is immediately compelling to PE operating partners.

**Best demo for Marcus Partners outreach:** Demo 2 (REPE LP Reporting Compliance). The ILPA + Florida SBA narrative is specific to Marcus Partners' position (just closed $875M Fund V, institutional LP base). Must stay on debt fund path only.

**Strategic note:** All three demos continue the pattern of avoiding AI chat dependency. This is correct given the 500 error on Meridian and the 5-day gap in AI test data. Both environments need fresh health checks before any live demo is scheduled.

---

## Self-Critique

1. **Demo 1 reframes existing PDS pages for a new persona (PE operating partner) rather than building new capability.** This is a strength, not a weakness — the same pages that sell to a COO also sell to a PE operating partner when the narrative shifts from "manage your projects" to "manage your acquisitions." The Sciens/Carlyle prospect is a real signal (2 confirmed FL acquisitions in Q1 2026), not a hypothetical. `[HIGH]`

2. **Demo 2 depends on NOT clicking equity fund detail pages.** This is a real constraint. If a prospect asks "show me the equity fund," the demo breaks. Mitigation: open with "We're going to focus on your credit book today because that's where the reporting complexity lives" — true for most multi-strategy funds. But if Marcus Partners is equity-only, this demo needs the equity fund metrics fixed first. `[REVIEW — check Marcus Partners strategy mix before scheduling]`

3. **Demo 3 showcases three pages that had bugs 4 days ago.** While fixes are confirmed as of 3/27, these are the least battle-tested pages in the environment. Running this demo live requires a fresh health check. The fixes were specifically: Tech Adoption crash (null guard), Forecast NaN (length guard), Satisfaction NaN (NPS calculation). These are the kinds of fixes that can regress if new data seeds are applied. `[REVIEW — verify fixes still hold before scheduling]`

4. **All three health checks are 3 days stale.** Every readiness rating is "assumed" rather than "verified." The scheduled health checks for Meridian and Stone haven't run since 3/27, likely due to the Chrome extension disconnect (5 consecutive nights without test data, per LATEST.md). **This is the single biggest risk to demo readiness.** Recommendation: run manual health checks on both environments before any live demo this week. `[REVIEW — CRITICAL]`

5. **The Florida SBA signal in Demo 2 is indirect.** The SBA is an LP, not a direct prospect. Using "When your LP is the Florida SBA" as the demo hook is a narrative device — it makes ILPA compliance pressure tangible. But it assumes Marcus Partners' LPs include institutional allocators. This is likely true for an $875M fund but is not confirmed. `[MEDIUM]`

6. **No demo concept targets ACG South Florida (workshop channel).** ACG is the #3 priority this week and time-sensitive (DealMAX 28 days away). However, a workshop pitch is not a product demo — it's a speaking/content proposal. A demo concept would be: "Here's what an AI + PE workshop looks like" using Stone PDS or Meridian as the live example. This was excluded because it's a channel play, not a product demo. Correct exclusion per self-critique criteria. `[REVIEW — consider a separate "workshop pitch deck" asset instead]`

7. **Revenue tie-in is appropriate for Stage 1-2.** These demos support outreach (Marcus Partners, GAIA, Sciens/Carlyle) by giving Paul something concrete to reference: "I can show you in 5 minutes what your post-acquisition operating dashboard looks like." Each demo is paired with a specific target account and offer tier. `[HIGH]`
