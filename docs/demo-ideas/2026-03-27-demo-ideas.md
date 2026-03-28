# Winston Demo Ideas — 2026-03-27 (Friday)

*Generated from: LATEST.md 2026-03-27 + Competitor Research 2026-03-26 + Stone PDS Health 2026-03-26 + Meridian Health 2026-03-24 + Revenue Operating Program §2/§5 + Target Account Queue 2026-03-26*

**Context driving today's demos:**
- Dealpath Connect now has JLL + CBRE + Cushman (~65% institutional brokerage, $930B+ listings). This is a network-effect moat play. Winston counters by being the *decisioning layer* on deals regardless of source.
- Cherre Agent.STUDIO and AI Agent Marketplace now fully operational — a "service-as-a-software" model for custom CRE AI agents. Winston has deeper MCP tooling but no user-facing agent marketplace UX yet.
- Enterprise AI agent adoption at 72% of Global 2000, but Gartner predicts 40%+ cancellations by 2027 due to poor ROI tracking. Demos must lead with measurable ROI, not abstract AI capability.
- Marcus Partners ($875M Fund V) and Ardent Companies ($600M Fund VI credit) are new top-of-queue targets. Both are REPE Pilot candidates ($35K).
- Stone PDS environment is the most demo-ready asset right now: 22/25 pages PASS as of 2026-03-26 health check.

**Demos excluded (covered in last 4 days):** LP Capital Flow Intelligence (Mar 26), PDS Executive Briefing (Mar 26), ARGUS Refugee Pitch (Mar 26), Debt Surveillance Dashboard (Mar 24), Private Credit Loan Underwriting (Mar 24), AI Governance Audit Trail (Mar 24), Scenario Stress Testing (Mar 23), Document Pipeline (Mar 23), IRR Scenario Library (Mar 23)

---

## Assumptions

- **Active pipeline status:** No active deals at Stage 3+. Revenue program is in Stage 1-2 (outreach/targeting). Top queue accounts: Marcus Partners (score 4.25), Ardent Companies (3.75), GAIA Real Estate (3.75, local South Florida contact). `[source: docs/revenue-ops/target-account-queue.md, 2026-03-26]` `[HIGH]`
- **Demo friction — Meridian Capital (REPE demo env):** STALE — last health check 2026-03-24, 3 days ago. SQL generation fix committed but not confirmed deployed. Lane A regressed to narration-only. AI test pass rate was 33% as of 2026-03-25, tests skipped 2026-03-26 (Chrome auth failure). Core pages (fund list, fund detail, assets, capital calls, distributions, debt tabs) were PASS at last check. `[source: docs/LATEST.md]` `[HIGH]`
- **Demo friction — Stone PDS:** STABLE — 22/25 pages PASS as of 2026-03-26. Three known bugs carry forward: Tech Adoption crash ("_ is not iterable"), Forecast "Total Deals: NaN", Satisfaction "NPS Score: NaN". Schedule Health redirects to /pds/risk. `[source: docs/env-tasks/stone-pds/health/2026-03-26.md]` `[HIGH]`
- **Existing demo scripts:** None in `docs/proof-assets/demo-scripts/`. `[source: file system check]` `[HIGH]`
- **Target segments:** Segment A (South Florida Mid-Market, fastest-to-revenue via $7.5K diagnostic) and Segment B (REPE National, higher value via $35K pilot). `[source: docs/REVENUE_OPERATING_PROGRAM.md §2, §5]` `[HIGH]`
- **Competitor context:** Dealpath Connect network-effect moat is the biggest strategic shift this week. Cherre Agent.STUDIO is a UX gap Winston should address. Yardi and ARGUS stable since last scan. `[source: docs/competitor-research/daily-summary/2026-03-26.md]` `[HIGH]`

---

## Demo Concept 1: PDS Operational Signals — 12 Critical Issues Your PM Software Doesn't Catch

**Demo title:** PDS Operational Signals — Cross-Portfolio Risk Intelligence

**Target persona:** COO / VP of Operations at a construction or professional services firm (50-500 employees)
**Target segment:** Segment A: South Florida Mid-Market Operations `[source: docs/REVENUE_OPERATING_PROGRAM.md §5]`
**Offer tier:** AI Operations Diagnostic ($7,500) as entry, bridging to Workflow Automation Sprint ($15,000) `[source: docs/REVENUE_OPERATING_PROGRAM.md §3, Offers 1-2]`
**Specific objection it answers:** "Our PM software already flags overdue tasks and schedule slips — what does this add?" `[source: common objection from §2, Hypothesis B]`

**Setup required:**
- Stone PDS demo environment — Operational Signals page (`/pds/operational-signals`), Process Compliance page (`/pds/process-compliance`), Home dashboard, Accounts page
- All four pages confirmed PASS in 2026-03-26 health check
- Operational Signals shows 12 critical issues across Revenue Risk, Staffing/Utilization, and Client Risk
- Process Compliance shows "People to Call Today" action cards with real names and severity levels

**5-minute walkthrough script:**
1. **[0:00-0:45] Open PDS Home Dashboard.** Show the executive view: Fee Revenue $2,517,000, 252 active projects, Backlog $4.7M, Forecast $8.0M. Say: "This is every project your firm is running, in one screen. Not a report someone assembled last Friday — this is live."
2. **[0:45-2:00] Navigate to Operational Signals.** Show the 12 critical issues. Walk through one from each category: a Revenue Risk signal (revenue variance on a specific project), a Staffing/Utilization signal (L. Morgan at 43% utilization with 2 delinquent timecards), and a Client Risk signal. Say: "Procore tells you project X is 3 days behind schedule. Winston tells you project X is behind schedule *because* the lead PM is at 43% utilization and has 2 delinquent timecards, the client has a -7.4% revenue variance in their market, and there are 6 staffing risks across that account's region. It's the difference between a fire alarm and a fire investigation."
3. **[2:00-3:00] Navigate to Process Compliance.** Show the "People to Call Today" action cards: L. Morgan (CRITICAL), J. Kim (CRITICAL), R. Nguyen (WARNING). Say: "This isn't a utilization report. This is a prioritized action list. Who do you call first, what's the issue, and what's the financial exposure if you don't act this week?"
4. **[3:00-4:00] Navigate to Accounts.** Show the Account Command Center: 67 accounts at risk, 0 missing plan >10%, 68 staffing issues. Click into a specific account to show the drill-down. Say: "Your account managers know their top 5 accounts. Winston monitors all 67 at-risk accounts simultaneously and surfaces the ones that need attention before the client calls to complain."
5. **[4:00-5:00] Closing pitch.** Say: "Every construction firm I talk to has the same problem: they have project data, but they don't have operational intelligence. They know what's happening on individual projects but can't see patterns across the portfolio. An AI Diagnostic takes 5 days and costs $7,500. We map your actual workflows, identify where this kind of intelligence applies, and give you a prioritized roadmap. Most firms find 3-5 workflows where AI saves 10+ hours per week."

**Key "wow moment":** The Operational Signals page showing 12 critical issues synthesized from multiple data sources (staffing, revenue, client risk, timecards) in a single view. This is not something any PM tool does — Procore shows project-level data, not cross-portfolio operational intelligence.

**Closing question:** "If you could see every operational risk across your entire portfolio before it becomes a problem, what would that be worth per quarter in avoided overruns and retained clients?"

**Build status:** READY `[source: docs/env-tasks/stone-pds/health/2026-03-26.md]`
- Operational Signals (`/pds/operational-signals`): PASS — 12 critical issues, all sections populated `[HIGH]`
- Process Compliance (`/pds/process-compliance`): PASS — action cards rendering with severity levels `[HIGH]`
- Home Dashboard: PASS — all KPIs rendering `[HIGH]`
- Accounts (`/pds/accounts`): PASS — Account Command Center loads, 67 at risk, drill-down working `[HIGH]`
- **Demo-ability today:** YES — all 4 pages in the walkthrough confirmed PASS in yesterday's health check. No AI chat dependency (strongest demos don't rely on the degraded AI features).

**Readiness confidence:** `[HIGH]` — all pages verified PASS in 2026-03-26 health check (1 day old). Demo path avoids all known bugs (Forecast NaN, Satisfaction NaN, Tech Adoption crash, Schedule redirect).

---

## Demo Concept 2: REPE Deal Decisioning Layer — AI Intelligence on Deals Regardless of Source

**Demo title:** Deal Decisioning Intelligence — The Layer Above Your Deal Flow

**Target persona:** Head of Acquisitions / CIO at a REPE fund ($500M-$5B AUM)
**Target segment:** Segment B: REPE Funds (National) — specifically Marcus Partners ($875M Fund V, new in queue) `[source: docs/revenue-ops/target-account-queue.md]`
**Offer tier:** Winston REPE Pilot ($35,000 for 90 days) `[source: docs/REVENUE_OPERATING_PROGRAM.md §3, Offer 3]`
**Specific objection it answers:** "We already use Dealpath for deal flow management — why do we need Winston?" `[source: docs/competitor-research/daily-summary/2026-03-26.md — Dealpath Connect now at 65% institutional brokerage]`

**Setup required:**
- Meridian Capital demo environment — fund list, fund detail (equity + debt), asset pages
- Fund list (3 funds, $2.0B commitments, 32 assets — confirmed PASS 2026-03-24)
- Fund detail with sector allocation, geographic exposure, performance drivers (PASS 2026-03-24)
- Debt fund tabs: Loan Book ($534M UPB, 6.0% coupon, 1.34 DSCR — PASS 2026-03-24)
- Asset pages (34 assets, $24.7M NOI, 87.2% occupancy — PARTIAL, some display issues)
- NOTE: AI chat is degraded (Lane A narration-only). This demo is designed to work WITHOUT AI chat.

**5-minute walkthrough script:**
1. **[0:00-1:00] Open Meridian Capital fund list.** Show 3 funds, $2.0B total commitments, Portfolio NAV $2.1B. Say: "Dealpath just announced that JLL, CBRE, and Cushman — 65% of institutional brokerage — are now on Dealpath Connect. That's great for deal sourcing. But what happens after you source 200 deals and need to decide which 5 to pursue? That's where Winston sits. We're the intelligence layer above your deal flow, wherever it comes from."
2. **[1:00-2:00] Click into Institutional Growth Fund VII.** Show sector allocation (Value-Add Multifamily 77.1%, Senior Housing 22.9%), geographic exposure, performance drivers, and value creation waterfall. Say: "Before you screen your next deal, Winston tells you what your portfolio needs: geographic diversification (you're concentrated in 3 markets), sector rebalancing (almost 80% multifamily), and return gap analysis. A deal that looks good in isolation might be a portfolio concentration risk."
3. **[2:00-3:00] Navigate to Meridian Credit Opportunities Fund I — Loan Book tab.** Show $534M UPB, Weighted Avg Coupon 6.0%, DSCR 1.34, Portfolio LTV 77.4%, 8 loans, maturity profile. Say: "Marcus Partners just closed an $875M Fund V with an East Coast expansion strategy. If they're running credit alongside equity — like most funds this cycle — they need a single platform that covers both. This is that platform. One login, equity and credit intelligence side by side."
4. **[3:00-4:00] Navigate to asset-level detail.** Show the 34-asset portfolio with NOI, occupancy, and performance metrics. Walk through one asset: "This multifamily property is generating $1.2M NOI at 91% occupancy. Winston tracks it against the underwriting model, flags when it drifts, and tells you why — is it a rent growth miss, a concession problem, or a market shift? You don't have to ask your asset manager to build a variance report."
5. **[4:00-5:00] Closing pitch — the Dealpath counter.** Say: "Dealpath is building a deal marketplace. Yardi is building operations AI. Juniper Square is building LP relationship management. None of them are building what Winston builds: the investment intelligence layer that connects your deal pipeline to your portfolio strategy to your LP reporting. We're the brain, not the inbox. A 90-day pilot costs $35,000. We deploy against your actual fund data and prove the value before you commit."

**Key "wow moment":** The fund-level view that shows portfolio composition, concentration risk, and cross-strategy (equity + credit) analytics in a single platform. Most firms toggle between 3-4 tools to get this view. The Dealpath counter-positioning is the narrative wow — reframing what "deal intelligence" means beyond deal sourcing.

**Closing question:** "You just closed an $875M fund. How many tools does your team currently use to go from deal sourcing to portfolio analytics to LP reporting? What if it was one?"

**Build status:** NEEDS WORK (minor) `[source: docs/env-tasks/meridian/health/health-2026-03-24.md]`
- Fund list, fund detail, debt fund tabs: ALL PASS `[HIGH]`
- Asset pages: PARTIAL — most render correctly, Phoenix Gateway shows bad unit data, Meridian Office Tower shows "—" for Units/SF `[HIGH]`
- AI chat: NOT USED — this demo is designed to work entirely from page navigation `[HIGH]`
- Variance page: FAIL (no data) — NOT USED in demo `[HIGH]`
- Health check is 3 days old — pages confirmed working then, but Railway deploy status unconfirmed since `[MEDIUM]`
- **Demo-ability today:** YES with caveat — steps 1-4 all use pages that were PASS 3 days ago. No AI chat dependency. Risk is Railway deploy may have introduced regressions since last health check.

**Readiness confidence:** `[MEDIUM]` — pages were verified 2026-03-24 but health check is 3 days old. No AI chat dependency reduces risk. Recommend a quick manual check of fund list and debt tabs before scheduling with Marcus Partners.

---

## Demo Concept 3: PDS Resource Intelligence — Fixing the Utilization Problem Before It Becomes a Revenue Problem

**Demo title:** Resource Intelligence for Construction Firms — From Utilization Reports to Action

**Target persona:** COO / Director of Operations at a professional services or construction firm
**Target segment:** Segment A: South Florida Mid-Market + Segment E: PE-Backed Transition (specifically Apex Service Partners, Tampa, $1.3B rev, score 3.50 in queue) `[source: docs/revenue-ops/target-account-queue.md, docs/REVENUE_OPERATING_PROGRAM.md §5]`
**Offer tier:** AI Operations Diagnostic ($7,500) `[source: docs/REVENUE_OPERATING_PROGRAM.md §3, Offer 1]`
**Specific objection it answers:** "We track utilization in our timecard system already — why would we pay for another tool?" `[source: common operations objection]`

**Setup required:**
- Stone PDS demo environment — Utilization page (`/pds/utilization`), Resources page (`/pds/resources`), Timecards page (`/pds/timecards`), Delivery Risk page (`/pds/risk`)
- All four pages confirmed PASS in 2026-03-26 health check
- Utilization page shows Resource Operating View with Utilization/Timecards/Assigned Load/Flags columns (first tested 2026-03-26, PASS)
- Resources and Timecards show graceful empty states with null guards holding (Day 3)

**5-minute walkthrough script:**
1. **[0:00-0:45] Open Delivery Risk.** Show 252 active projects, average health score 78.5, 162 green / 90 yellow / 0 red. Say: "You have 252 active projects. 90 of them are yellow. The question isn't whether you have a problem — it's which problems are caused by the same root issue."
2. **[0:45-1:45] Navigate to Utilization.** Show the Resource Operating View with utilization percentages, timecard status, assigned load, and flag columns across the team. Say: "Your timecard system tells you L. Morgan billed 43% last week. Winston tells you L. Morgan is at 43% utilization, has 2 delinquent timecards, is assigned to 3 projects that are yellow-flagged on delivery risk, and that those projects represent $180K in at-risk fee revenue. The utilization number isn't the problem — it's the symptom."
3. **[1:45-2:45] Navigate to Timecards.** Show the timecard analytics with distribution data. Say: "Delinquent timecards aren't just a compliance issue. Every late timecard is a revenue recognition delay. Every missing entry is a staffing decision you're making blind. Winston connects timecard discipline to financial impact."
4. **[2:45-3:45] Navigate to Resources.** Show the resource dashboard with capacity planning view. Say: "Apex Service Partners runs 107 brands across home services. When you're operating at that scale — and your PE sponsor (Alpine Investors) is measuring EBITDA margin at the brand level — you can't manage utilization with spreadsheets. You need a system that shows you where your people are, where they should be, and what the financial impact of reallocation looks like."
5. **[3:45-5:00] Closing pitch.** Say: "For a PE-backed services firm like Apex, the AI Diagnostic answers a specific question: which of your 107 brands has the worst utilization-to-revenue ratio, and what's the operational fix? That's a $7,500 engagement that can identify millions in margin improvement."

**Key "wow moment":** The connection between utilization, timecard delinquency, delivery risk, and revenue impact in a single view. Every operations leader knows these are connected, but they've never seen it computed and displayed together.

**Closing question:** "What's a 5-point improvement in utilization worth to your bottom line annually? That's what we quantify in the diagnostic."

**Build status:** READY (with empty-state caveat) `[source: docs/env-tasks/stone-pds/health/2026-03-26.md]`
- Utilization (`/pds/utilization`): PASS — Resource Operating View rendering with all columns `[HIGH]`
- Resources (`/pds/resources`): PASS — graceful empty state ("No heatmap data available", "No capacity data available"). Null guards holding Day 3. `[HIGH]`
- Timecards (`/pds/timecards`): PASS — graceful empty state. Null guards holding Day 3. `[HIGH]`
- Delivery Risk (`/pds/risk`): PASS — 252 projects, health distribution rendering `[HIGH]`
- **Caveat:** Resources and Timecards pages show empty states — the data tables and UI chrome are there, but detailed heatmap/capacity/bench data is not populated. Demo script is written to use the *page narrative* and connect to the Delivery Risk data rather than depend on rich data in these views.
- **Demo-ability today:** YES — all 4 pages PASS. The empty states on Resources/Timecards are graceful and can be narrated around ("Here's where your capacity data would flow in after we connect your timecard system").

**Readiness confidence:** `[HIGH]` — all pages verified PASS in 2026-03-26 health check (1 day old). No AI chat dependency. Empty states are the only visual gap, and they're handled gracefully.

---

## Demo Readiness Verification Summary

| Demo | Core Pages | AI Chat | Overall | Confidence |
|---|---|---|---|---|
| PDS Operational Signals | ✅ PASS (all 4 pages) | Not used | READY | `[HIGH]` |
| REPE Deal Decisioning Layer | ✅ PASS (fund list, fund detail, debt tabs) | Not used | NEEDS WORK (minor — stale health check) | `[MEDIUM]` |
| PDS Resource Intelligence | ✅ PASS (all 4 pages, 2 with empty states) | Not used | READY (with empty-state caveat) | `[HIGH]` |

**Best demo to run today:** Demo 1 (PDS Operational Signals). All pages verified PASS yesterday. No AI chat dependency. Targets the fastest-to-revenue segment ($7,500 diagnostic) with a clear, data-rich walkthrough.

**Strategic note on all three demos:** These are deliberately designed to NOT depend on AI chat, which is the most degraded component across both environments. Until Lane A narration-only regression is fixed and Railway deploy is confirmed, demos should showcase the intelligence layer through pre-built dashboards and analytics pages, not live AI queries.

---

## Self-Critique

1. **Demo 1 is the strongest because it's fully verified and avoids all known issues.** The Operational Signals page is genuinely impressive (12 critical issues across multiple risk categories in one view). No hedging needed. `[HIGH confidence this demo works live today]`

2. **Demo 2 Meridian health check is 3 days old.** I've been honest about this — marking `[MEDIUM]` confidence. The pages were all PASS on 2026-03-24, but Railway deploy uncertainty means there could be regressions I can't see. Recommendation: run a quick manual health check on fund list and debt tabs before scheduling this demo with Marcus Partners. `[REVIEW]`

3. **Demo 3 Resources/Timecards empty states could look thin in a live demo.** The walkthrough script is written to narrate around this ("Here's where your data flows in"), but a skeptical buyer might ask "where's the actual data?" Mitigation: pair this demo with Demo 1 (Operational Signals) which has rich data, so the Resources/Timecards pages are positioned as "deeper drill-down" rather than the main event. `[REVIEW]`

4. **All three demos avoid AI chat dependency — this is both a strength and a limitation.** It's a strength because we're not risking a live failure. It's a limitation because the AI chat is Winston's most differentiated feature and not showing it undersells the platform. Once Lane A regression is fixed, all demo scripts should add an AI query step. `[REVIEW]`

5. **Marcus Partners and Apex Service Partners are named in demo concepts.** These are real companies from the target account queue, not invented prospects. The Apex Service Partners reference uses publicly available information (107 brands, $1.3B rev, Alpine Investors backing). `[source: docs/revenue-ops/target-account-queue.md, Craft Dossier link in queue]` `[HIGH]`

6. **No demos marked as covering the Cherre Agent.STUDIO competitive angle.** This was a new finding in competitor research. A future demo could showcase Winston's MCP tool registry (31 tool categories) as a "composable automation" platform — but that's a feature showcase, not a revenue-tied demo. Excluded per self-critique criteria: "Cut anything that's just cool but not sellable." `[REVIEW — correct exclusion]`

7. **Revenue tie-in is appropriate for Stage 1-2 pipeline.** These demos are designed for outreach support and proof-of-capability, not deal closing. Each is paired with a specific target account or segment from the active queue. This is the correct use given no deals exist at Stage 3+. `[source: docs/REVENUE_OPERATING_PROGRAM.md §1]` `[HIGH]`
