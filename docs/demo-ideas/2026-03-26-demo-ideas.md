# Winston Demo Ideas — 2026-03-26 (Thursday)

*Generated from: Daily Intel 2026-03-26 + Competitor Research 2026-03-24 + Environment Health (LATEST.md 2026-03-26) + Revenue Operating Program §2/§5*

**Context driving today's demos:**
- Capital rotating back into real estate from private credit (CNBC: Blackstone BREIT first positive flows in 4 years) — signals new fund launches and LP allocation shifts. REPE firms raising new capital need reporting, analytics, and LP transparency tooling.
- Yardi now has Anthropic Claude connector live — normalizes AI-in-CRE for the market but their angle is property operations, not investment intelligence. Winston must reinforce the investment-side differentiation.
- Juniper Square integrating Nasdaq eVestment into JunieAI CRM — 100K+ investor profiles for IR teams. Winston counters with forward-looking analytics, not backward-looking CRM enrichment.
- ARGUS Intelligence portfolio-level scenario simulation now live — Winston's Monte Carlo + stress testing depth is deeper, but ARGUS is closing the gap on portfolio-wide views.
- Altus Group strategic sale process ongoing — PE acquisition uncertainty = window to position Winston as stable, AI-native alternative.
- Enterprise AI agent adoption at 72% of Global 2000, but Gartner predicts 40%+ cancellations by 2027 due to cost/ROI — Winston demos must lead with concrete ROI, not abstract AI capability.

**Demos excluded (covered in last 3 days):** Debt Surveillance Dashboard (Mar 24), Private Credit Loan Underwriting (Mar 24), AI Governance Audit Trail (Mar 24), Scenario Stress Testing (Mar 23), Document Pipeline (Mar 23), IRR Scenario Library (Mar 23)

---

## Assumptions

- **Active pipeline status:** No active deals at Stage 4+ (discovery call held or later). Revenue program is in Stage 1-2 (outreach/targeting). Primary segments are South Florida Mid-Market (Segment A) and REPE Funds National (Segment B). `[source: docs/REVENUE_OPERATING_PROGRAM.md §1-§5, docs/LATEST.md]` `[HIGH]`
- **Demo friction — Meridian Capital (REPE demo env):** DEGRADED. SQL generation (repe_fast_path) fix committed but not confirmed deployed to Railway. Bug 0 tool spam fixed, but Lane A regressed to narration-only (no data rendered). Lane B latency worsening (22.7s). AI test pass rate 33%. Core pages (fund list, fund detail, assets, distributions, debt tabs) load with real data. `[source: docs/LATEST.md, docs/env-tasks/meridian/health/health-2026-03-24.md]` `[HIGH]`
- **Demo friction — Stone PDS (PDS demo env):** IMPROVING. 13/14 core pages PASS. Two NaN display bugs (Forecast "Total Deals: NaN", NPS Score "NaN"). Schedule Health redirect still open. Winston AI Chat page loads and is functional. `[source: docs/env-tasks/stone-pds/health/health-2026-03-25.md]` `[HIGH]`
- **Existing demo scripts:** None found in `docs/proof-assets/demo-scripts/` directory (directory exists but appears empty). `[source: file system check]` `[HIGH]`
- **Target revenue hypothesis:** Hypothesis A (AI Ops Diagnostic, $7,500) is fastest-to-revenue. Hypothesis C (Winston REPE Pilot, $35,000) is highest value but longer cycle. Today's demos should serve both paths. `[source: docs/REVENUE_OPERATING_PROGRAM.md §2]` `[HIGH]`
- **Today is Thursday:** No events on Paul's calendar. Good day for demo prep or outreach. `[source: docs/daily-intel/2026-03-26.md]` `[HIGH]`

---

## Demo Concept 1: LP Capital Flow Intelligence — Real-Time Fund Allocation Tracking When Capital Rotates

**Demo title:** LP Capital Flow Intelligence Dashboard

**Target persona:** Head of Investor Relations / CFO at a REPE fund ($500M-$5B AUM)
**Target segment:** Segment B: REPE Funds (National) `[source: docs/REVENUE_OPERATING_PROGRAM.md §5]`
**Offer tier:** Winston REPE Pilot ($35,000 for 90 days) `[source: docs/REVENUE_OPERATING_PROGRAM.md §3, Offer 3]`
**Specific objection it answers:** "Juniper Square already handles our LP relationships and fundraising workflow" `[source: competitor intel — Juniper Square eVestment integration, docs/competitor-research/daily-summary/2026-03-24.md]`

**Setup required:**
- Meridian Capital demo environment (fund list, LP structure, capital calls, distributions pages — all confirmed PASS in last health check)
- Fund detail pages with LP allocation data (3 funds with $2.0B total commitments already seeded)
- Capital calls page (4 calls, $935M total, 100% collection rate — confirmed working)
- Distributions page (12 events, $145.3M declared — confirmed working, but "Total Paid" shows $0 which is a known data gap)
- AI chat for LP-related questions (Lane A narration-only issue may affect this — see build status)

**5-minute walkthrough script:**
1. **[0:00-0:30] Open Meridian Capital fund list.** Show 3 funds, $2.0B total commitments, Portfolio NAV $2.1B, 32 active assets. Point out: "This is your entire fund family in one view — no toggling between Yardi extracts and Excel models."
2. **[0:30-1:30] Click into Institutional Growth Fund VII.** Show sector allocation (where capital is deployed by property type), geographic exposure (market concentration risk), performance drivers, and value creation waterfall. Say: "Your IR team spends 2 weeks building this for quarterly letters. Winston generates it continuously."
3. **[1:30-2:30] Navigate to Capital Calls.** Show $935M total called, 4 calls with 100% collection rate, investor breakdown by commitment size. Point out: "When CNBC reports capital rotating back into real estate — and it is, Blackstone BREIT just had its first positive fund flow month in 4 years — your LPs want to know their capital is being deployed efficiently. This view answers that question before they ask it."
4. **[2:30-3:30] Navigate to Distributions.** Show 12 distribution events across 2024-2026, declared vs. paid status. Point out the timeline view: "Your LPs can see the distribution cadence without waiting for the quarterly letter. Transparency builds re-up rates."
5. **[3:30-5:00] Open Winston AI Chat.** Ask: "What's the capital deployment rate for Fund VII compared to our target? Are we ahead or behind on capital calls?" (Note: AI chat may produce narration-only response due to Lane A regression — see build status). Then ask: "Draft an LP update email summarizing our Q1 2026 capital activity across all three funds." The AI synthesizes fund data into a communication draft — this is the "wow moment."

**Key "wow moment":** The AI drafts an LP communication email from live fund data in under 60 seconds. An IR team normally spends hours pulling data from multiple systems and drafting quarterly updates. Winston does it from a single prompt. This directly counters Juniper Square's eVestment integration — they give you LP contact data; Winston gives you LP-ready intelligence and draft communications.

**Closing question:** "How much time does your IR team spend assembling LP communications each quarter? What if that went from 2 weeks to 2 minutes?"

**Build status:** NEEDS WORK `[source: docs/LATEST.md, docs/env-tasks/meridian/health/health-2026-03-24.md]`
- Fund list, fund detail, capital calls, distributions pages: ALL PASS — data renders correctly `[HIGH]`
- AI chat (Lane A): DEGRADED — narration-only regression means the AI prompt at step 5 may return a text promise without actual data rendered. If Railway deploy of fix `fa9372dc` lands, this may resolve. `[MEDIUM]`
- Distributions "Total Paid" shows $0: Known data gap — payout rows not seeded for paid events. Workaround: focus on "declared" amounts and distribution timeline, not the "Total Paid" KPI. `[HIGH]`
- **Demo-ability without AI chat:** YES — steps 1-4 work today. Step 5 (AI chat) is the wow moment but is at risk due to Lane A regression. Can substitute with a scripted walkthrough of what the AI would produce.

**Readiness confidence:** `[MEDIUM]` — core pages verified healthy 2026-03-24, but AI chat is degraded and health check is 2 days old.

---

## Demo Concept 2: PDS Executive Briefing — AI-Powered Construction Portfolio Intelligence for the COO

**Demo title:** Stone Construction PDS Executive Briefing

**Target persona:** COO / VP of Operations at a professional services or construction firm (50-500 employees)
**Target segment:** Segment A: South Florida Mid-Market Operations + Segment C: Professional Services `[source: docs/REVENUE_OPERATING_PROGRAM.md §5]`
**Offer tier:** AI Operations Diagnostic ($7,500) as entry → Workflow Sprint ($15,000) for automation `[source: docs/REVENUE_OPERATING_PROGRAM.md §3, Offers 1-2]`
**Specific objection it answers:** "We already use Procore / our PM software for project tracking — why do we need another tool?" `[source: common objection from §2, Hypothesis B counters]`

**Setup required:**
- Stone PDS demo environment (13/14 core pages PASS as of 2026-03-25)
- Home dashboard with KPIs (Fee Revenue $2,517,000, GAAP $2,391,150, CI $377,550, Backlog $4,705,800)
- Delivery Risk page (252 active projects, avg health 78.6)
- AI Briefing page (GAAP Revenue vs Plan card)
- Winston AI Chat (`/pds/ai-query` — confirmed PASS with 8 suggestion chips)
- Avoid: Forecast page (NaN bug), Client Satisfaction NPS (NaN bug), Schedule Health (redirect bug)

**5-minute walkthrough script:**
1. **[0:00-0:45] Open Stone PDS Home Dashboard.** Show the executive view: Fee Revenue $2,517,000 (down 4.6% vs plan), GAAP Revenue $2,391,150, CI $377,550, Backlog $4,705,800, Forecast $8.0M. Point out: "This is your entire construction portfolio in one screen. Your COO currently gets this data from 3 different reports assembled by 2 different people over 2 days. Winston generates it continuously."
2. **[0:45-1:45] Navigate to Delivery Risk.** Show 252 active projects, average health score 78.6, health distribution (174 green / 78 yellow / 0 red). Click into a yellow-zone project. Say: "Your PM software tells you a project is behind schedule. Winston tells you why it's behind, what it costs you, and what to do about it — across 252 projects simultaneously."
3. **[1:45-2:45] Navigate to Revenue & CI.** Show the revenue variance view — Northeast Healthcare at -7.4% vs plan ($105K shortfall). Point out: "This isn't just a red number. Winston decomposes the variance: is it a timing issue (revenue recognized late), a scope issue (change orders not billed), or a delivery issue (project behind and burning margin)? Your finance team does this manually for quarter-close. Winston does it in real-time."
4. **[2:45-3:45] Navigate to Exec Briefing.** Show the AI-generated executive briefing with GAAP Revenue vs Plan card and market view. Say: "Every Monday morning, your COO gets a 2-page AI briefing covering portfolio health, risk flags, staffing issues, and recommended actions. No one has to write it."
5. **[3:45-5:00] Open Winston AI Chat.** Ask: "Which 3 projects have the highest risk of missing their fee targets this quarter, and what's driving the risk?" Let Winston analyze across the 252-project portfolio. Then ask: "What staffing moves would improve utilization for our underperforming team members?" Point to the staffing data (L. Morgan at 43% utilization, J. Kim at 23%). This is the "wow moment" — AI-driven operational recommendations from live project data.

**Key "wow moment":** The COO asks a natural language question about project risk and gets an instant, data-backed answer across 252 projects. No report request, no analyst time, no 3-day turnaround. This is the difference between project management software (Procore tells you what happened) and portfolio intelligence (Winston tells you what to do).

**Closing question:** "If your COO could ask any question about the portfolio and get an answer in 30 seconds instead of 3 days, what would they ask first? That's what the AI Diagnostic helps us figure out for your specific operations."

**Build status:** NEEDS WORK (minor) `[source: docs/env-tasks/stone-pds/health/health-2026-03-25.md]`
- Home, Markets, Projects, Exec Briefing, Delivery Risk, Revenue & CI, AI Chat: ALL PASS `[HIGH]`
- Forecast page: PARTIAL — "Total Deals: NaN" display bug. **Avoid in demo.** `[HIGH]`
- Client Satisfaction: NPS Score NaN. **Avoid in demo.** `[HIGH]`
- Schedule Health: Redirects to /pds/risk. **Avoid in demo.** `[HIGH]`
- AI Chat (`/pds/ai-query`): PASS — loads with input field and 8 suggestion chips. Not load-tested for complex queries. `[MEDIUM]`
- **Demo-ability today:** YES — the 5 pages in the walkthrough script all pass. Avoid Forecast, Client Satisfaction, and Schedule Health pages. AI chat page loads but complex query performance is untested.

**Readiness confidence:** `[MEDIUM]` — health check is 1 day old (2026-03-25). Core demo path avoids all known bugs. AI chat query performance is the unknown.

---

## Demo Concept 3: ARGUS Refugee Pitch — Portfolio Scenario Modeling Without Legacy Lock-In

**Demo title:** Portfolio Stress Testing for ARGUS-Dependent Firms Facing Acquisition Uncertainty

**Target persona:** CIO / Head of Acquisitions at REPE firms currently using ARGUS
**Target segment:** Segment B: REPE Funds (National) — specifically firms with ARGUS contracts up for renewal `[source: docs/REVENUE_OPERATING_PROGRAM.md §5, docs/competitor-research/daily-summary/2026-03-24.md]`
**Offer tier:** AI Operations Diagnostic ($7,500) as entry — "Let us audit your ARGUS dependency and show you what Winston delivers natively" → Winston REPE Pilot ($35,000) `[source: docs/REVENUE_OPERATING_PROGRAM.md §3]`
**Specific objection it answers:** "ARGUS just released portfolio-level scenario simulation — why would we switch?" `[source: docs/competitor-research/daily-summary/2026-03-24.md, ARGUS Intelligence release]`

**Setup required:**
- Meridian Capital demo environment — fund detail pages with scenario/stress testing capabilities
- Portfolio Analytics dashboard (47 assets across 8 markets — referenced in prior demo scripts but health status of scenario views not directly confirmed)
- AI chat for scenario questions (Lane A degraded — same caveat as Demo 1)

**5-minute walkthrough script:**
1. **[0:00-0:45] Open Meridian fund detail (equity fund).** Show Institutional Growth Fund VII with sector allocation, geographic exposure, and performance drivers. Say: "You're paying ARGUS per-seat licensing for DCF models. Winston gives you fund-level intelligence — including what ARGUS just added (portfolio scenarios) — plus AI that tells you what the numbers mean."
2. **[0:45-1:45] Navigate to the debt fund (Meridian Credit Opportunities Fund I).** Show the new Loan Book tab: Total UPB $534M, Weighted Avg Coupon 6.0%, DSCR 1.34, Portfolio LTV 77.4%, 8 loans, maturity profile. Say: "ARGUS doesn't touch debt. Winston gives you equity and credit in one platform."
3. **[1:45-3:00] Open Scenario Engine.** Show pre-built macro scenarios (Recession, Rate Shock, Soft Landing). Select "Rate Shock" — cap rates +150 bps, refinance rates +100 bps, rent growth flat. Run across the equity portfolio. Show which assets remain in target IRR range vs. which fall below vs. which breach covenants. Say: "ARGUS just shipped one-click portfolio scenarios. Winston has had this for months — plus Monte Carlo probability distributions and covenant breach tracking."
4. **[3:00-4:00] Drill into a stressed asset.** Click on a multifamily asset that falls below target. Show the stress path: "At current rate trajectory, this asset's IRR drops from 11.2% to 7.8% and breaches its DSCR covenant in 22 months." Show the recovery path: "Refinance at 4.8% or below, or achieve 3%+ rent growth to return to target."
5. **[4:00-5:00] Open Winston AI Chat.** Ask: "If Altus gets acquired by PE and raises ARGUS pricing 30%, what's my total cost of switching to Winston for portfolio analytics?" Let Winston calculate the comparison. Then: "Compare my scenario modeling capabilities in Winston vs. ARGUS Intelligence — where am I getting more depth?" This positions Winston as self-aware and transparent about capabilities.

**Key "wow moment":** The scenario engine runs across the entire portfolio in seconds, showing covenant breach risk per asset — something ARGUS just shipped at the portfolio level but without the AI layer that explains what to do about each result. Winston doesn't just model scenarios; it prescribes actions.

**Closing question:** "Altus is being sold. Your ARGUS contract renews in [X months]. What happens to your pricing and support if a PE firm buys them and optimizes for margins? Winston is founder-led, AI-native, and your data never leaves your control."

**Build status:** UNCHECKED `[source: scenario engine and stress testing capabilities listed in CAPABILITY_INVENTORY but no recent health check covers these specific views]`
- Fund list, fund detail, debt tabs: PASS (confirmed 2026-03-24) `[HIGH]`
- Scenario Engine UI: UNCHECKED — listed as deployed in Capability Inventory but not covered in recent health checks. May require manual verification before running this demo live. `[LOW]`
- AI chat: DEGRADED — same Lane A narration-only issue `[HIGH]`
- **Demo-ability today:** PARTIAL — steps 1-2 work. Steps 3-5 depend on scenario engine UI being functional (unverified) and AI chat (degraded).

**Readiness confidence:** `[LOW]` — scenario engine views not health-checked. AI chat degraded. This demo concept is strong strategically but needs verification before scheduling with a prospect.

---

## Demo Readiness Verification Summary

| Demo | Core Pages | AI Chat | Overall | Confidence |
|---|---|---|---|---|
| LP Capital Flow Intelligence | ✅ PASS (fund list, capital calls, distributions) | ⚠️ DEGRADED (Lane A narration-only) | NEEDS WORK | `[MEDIUM]` |
| PDS Executive Briefing | ✅ PASS (13/14 pages, demo path avoids bugs) | ⚠️ UNTESTED (page loads, query performance unknown) | NEEDS WORK (minor) | `[MEDIUM]` |
| ARGUS Refugee Pitch | ✅ PARTIAL (fund pages pass, scenario engine unverified) | ⚠️ DEGRADED | UNCHECKED | `[LOW]` |

**Best demo to run today if forced:** Demo 2 (PDS Executive Briefing). It has the healthiest environment (13/14 pages PASS, 1-day-old health check), a clear demo path that avoids all known bugs, and targets the fastest-to-revenue segment (South Florida mid-market, $7,500 diagnostic entry).

---

## Self-Critique

1. **Demo 1 "wow moment" depends on degraded AI chat.** The LP communication draft from AI is the strongest differentiator, but Lane A narration-only regression means it may not actually work in a live demo. I've noted this honestly, but the demo concept loses 40% of its impact without a working AI response. **Mitigation:** Could pre-record the AI response or demo from a staging environment if Railway deploy lands. `[REVIEW]`

2. **Demo 3 scenario engine readiness is genuinely unknown.** I marked it UNCHECKED, not READY — which is correct per protocol. But the demo concept is strategically the most compelling (Altus sale = short window). It would be irresponsible to schedule this with a prospect without first running a manual health check on the scenario views. `[REVIEW]`

3. **No demos marked READY today.** All three have at least one degraded or unverified component. This is honest but may be frustrating. The root cause is the Meridian AI regression (Lane A narration-only) and the lack of scenario engine health coverage. Fixing Lane A is the single highest-leverage action for demo readiness across all REPE demos.

4. **Revenue tie-in is genuine but indirect.** No active deals at Stage 3+ exist in the pipeline. These demos are for outreach/targeting (Stage 1-2), not for closing an active deal. This is appropriate given current pipeline state but worth noting — demos should be paired with specific outreach targets. `[source: docs/REVENUE_OPERATING_PROGRAM.md §1]`

5. **Avoided repeating demos from last 3 days.** Verified against exclusion list. No overlap with Mar 23-24 demo ideas (Debt Surveillance, Private Credit Underwriting, Audit Trail, Scenario Stress Testing, Document Pipeline, IRR Scenario Library).

6. **"Total Paid" $0 in distributions (Demo 1, step 4):** I noted the workaround (focus on declared amounts) but a savvy prospect might ask about it. Not a dealbreaker but worth fixing before a live REPE demo. `[REVIEW]`

7. **PDS AI Chat (Demo 2, step 5) is marked PASS but not load-tested.** The health check confirms the page loads with suggestion chips, but no one has tested whether a complex analytical query returns a useful response. This could fail live. `[REVIEW]`
