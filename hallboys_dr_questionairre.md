# Hall Boys AI Discovery Questionnaire
**Audience:** Technical Senior COO (self-serve, async, probing follow-ups)
**Purpose:** Surface the highest-ROI AI opportunity across GC, new construction plumbing, and nationwide equipment logistics — without building custom software, and leveraging the existing Claude Cowork deployment.
**Design principle:** Every question is anchored in construction-specific artifacts (RFIs, submittals, bid levels, dispatch boards, punch lists, foremen, inspections, deadhead miles). Every section forces quantification in hours, dollars, headcount, percent of projects, or number of incidents. "Last time this happened" prompts replace abstractions with anchored incidents.

> **How to use this document:** The final, improved version is in **Part B** after the self-critique. Part A is the first-pass draft. If you only have time for one pass, **skip to Part B**.

---

## PART A — FIRST-PASS DRAFT

### Section 1 — Business Priorities

**Section insight note.** This section identifies which of the four verticals carries the most strategic weight *right now* and which one has the widest gap between revenue potential and execution capacity. It maps to ROI by anchoring every downstream question to a dollar-weighted priority (capacity increase, loss avoidance, or headcount leverage). If we can't rank verticals, we can't rank opportunities.

1. If Hall Boys had to grow revenue 25% next year with zero new hires, which of the four verticals (GC, plumbing, equipment logistics, or a combined play) would carry the load, and what is the binding constraint today — estimator capacity, PM capacity, field labor, or dispatch bandwidth?
2. Rank the four verticals by (a) current EBITDA contribution, (b) EBITDA volatility project-to-project, and (c) the one you personally spend the most hours per week firefighting. Where do the rankings diverge — and why?
3. For each vertical, what is the one metric you check first on Monday morning? (E.g., equipment utilization %, open RFIs older than 7 days, subcontractor no-show count, change order aging.) If that metric is missing or stale, what breaks?
4. What is the single largest dollar loss Hall Boys absorbed in the last 12 months that — in hindsight — better information or a faster decision could have prevented? Quantify: dollar amount, vertical, and the decision window that was missed.
5. Where are you currently paying for capacity you can't fully deploy? (Idle equipment, estimators at 60% utilization, PMs carrying too few projects, plumbing foremen with crew gaps.) Give a number.
6. If you could eliminate one category of work from your team's week — not reduce headcount, just free up the hours — what category would deliver the biggest capacity unlock?
7. What is your current bid-hit ratio on GC work and on plumbing work, and what would a 20% improvement in win rate or 2x bid volume be worth annually?

   **Dig deeper:**
   - For the #1 vertical you named in Q1 — walk me through the last project that either hit or missed its target margin by more than 3 points. What was the decisive factor?
   - Of the "firefighting" hours in Q2, how many are repeatable patterns vs. genuinely novel problems?
   - When you said "better information would have prevented" the loss in Q4 — was the information missing, late, in the wrong format, or in someone's head?

---

### Section 2 — Current Workflows (By Vertical)

**Section insight note.** This section maps the actual work — not the org chart — across each vertical so we can identify where human time is spent on low-judgment, pattern-driven work (AI leverage) vs. high-judgment work (leave alone). It maps to ROI by surfacing specific, quantifiable handoff points where minutes or hours leak.

#### 2A. General Contracting (PM + Subcontractor Coordination)

8. Walk through the lifecycle of a typical RFI on a mid-size GC project: who opens it, how it's routed, how long it sits at each step, and how many touch it before closure. What is your median RFI cycle time today, and where in the chain does the slowest step live? (Industry median is ~6–10 days; AIA benchmark ~5.2 days; each RFI costs ~$1,080 to process per Navigant.) [Source](https://www.procore.com/library/rfi-construction) [Source](https://www.ruh.ai/blogs/rfi-response-in-minutes-not-days-how-ai-agents-eliminate-construction-s-biggest-scheduling-blocker)
9. For submittals: what is your average first-pass rejection rate, average turnaround, and what percentage of your schedule slippage in the last 12 months traces back to submittal cycles? (Industry first-pass rejection rate averages ~35%, at ~$805 per rejection.) [Source](https://buildsync.ai/resources/complete-guide-to-construction-submittal-reviews)
10. How many change orders did you process last year across all GC projects, what was the average dollar value, and what percentage were owner-driven vs. E&O-driven vs. site-condition-driven? (Industry: COs run 10–15% of contract value on major projects; A/E errors & omissions typically 3–5%.) [Source](https://www.rhumbix.com/blog/change-orders-construction-definitive-guide)
11. On your last three GC projects, where did the PM spend the most hours: coordinating subs, chasing documents, writing reports, or running OAC meetings? Put a percentage on each bucket.
12. How do you currently detect schedule slippage — before it hits a milestone? Who pulls which data, how often, and what's the lag between a trade falling behind and your knowing?

   **Dig deeper:**
   - Tell me about the last time a subcontractor no-show or late mobilization cost you more than one day of schedule. Walk me through how you found out and who you called first.
   - On the last E&O change order you approved, how many of the spec/drawing conflicts were discoverable from the documents themselves — meaning a machine could have flagged them in preconstruction?

#### 2B. New Construction Plumbing

13. What's your current first-pass rough-in inspection pass rate, and when you fail, what are the top 3 failure categories (slope, venting, support, fixture spacing, code updates)?
14. What percentage of your plumbing projects experience a material shortage or long-lead item (e.g., R-454B equipment, specific fittings) that impacts the schedule, and how far in advance do you typically discover it? [Source](https://buildsync.ai/resources/complete-guide-to-construction-submittal-reviews)
15. How do you currently sequence rough-in across multiple active sites — spreadsheet, whiteboard, Procore, phone calls? What's the manual coordination cost per week across your plumbing PMs / supers?
16. Prefab vs. field fab: what percentage of your plumbing scope is prefabbed today, and where is the decision made? Is there a consistent rule or is it per-foreman judgment?
17. When MEP coordination fails on a GC project Hall Boys self-performs plumbing on, who catches it — the plumbing super, the GC PM, or the inspector? What's the typical rework cost?

   **Dig deeper:**
   - Describe the last failed plumbing rough-in inspection in detail. What was missed, by whom, and what would the foreman have needed to see on the morning-of to catch it?
   - How often do you discover a material shortage within 72 hours of when you needed it installed? Give me a monthly frequency.

#### 2C. Equipment Logistics (Nationwide Dispatch & Sourcing)

18. What is your current fleet utilization rate, deadhead (empty-mile) percentage, and idle time percentage? (Industry healthy utilization is ~70–80%; deadhead has hovered around ~20% industry-wide since the 1990s.) [Source](https://opsima.com/blog/kpis/fleet-utilization/) [Source](https://www.orbcomm.com/en/resources/guides/fleet-manager-guide-trailer-kpis)
19. Walk through a typical dispatch decision: a job calls in needing a piece of equipment. Who takes the call, what systems do they consult, and how many minutes from call to confirmed dispatch? Where does the bottleneck live?
20. What percentage of your dispatches in the last 90 days were sourced from third-party rental partners because your own fleet couldn't cover, and what was the margin delta vs. owning the asset out?
21. How do you make the "buy vs. rent vs. reposition" decision today, and what's the typical delay before an underutilized asset is redeployed?
22. What does maintenance downtime look like — MTTR, planned vs. unplanned ratio, and how often does an unplanned breakdown cost you a dispatch you had to decline or outsource? (Best-in-class MTTR <6 hrs vs. industry 12–18 hrs.) [Source](https://heavyvehicleinspection.com/blog/post/heavy-equipment-maintenance-kpis-contractors-fleet-managers)

   **Dig deeper:**
   - Tell me about the last dispatch you had to decline or sub out due to sourcing or timing. Cost of that miss?
   - On your top 10% of deadhead routes, do you know which ones are structurally unavoidable vs. which ones repeat because of poor backhaul matching?

---

### Section 3 — Bottlenecks & Failure Points

**Section insight note.** This section isolates the recurring, non-novel failure patterns across the business — the ones that repeat project after project. These are the highest-ROI AI targets because pattern repetition = leverage. It maps to ROI by surfacing loss events ($ avoidance) and queue-time problems (capacity unlock).

23. Across the last 12 months, what is the single most frequent reason work stops on site (waiting on RFI, material shortage, sub no-show, equipment not delivered, inspection fail, weather, missing approval)? How many hours of stopped work per month, per vertical?
24. Where does tribal knowledge live that you're one retirement or resignation away from losing? Name the person and the domain (bid assumptions, vendor rolodex, dispatch routing logic, plumbing code interpretations).
25. When a bid goes out, how much variance do you see between the estimator's line-item pricing and what the same project actually costs in the field? What's the dollar impact of that variance annually?
26. What's the last near-miss or actual loss event that should have been caught in preconstruction but wasn't — contract terms, insurance gaps, spec conflicts, scope overlaps between subs?
27. In quote comparison / bid leveling for subcontractor packages, how long does your team spend per trade package comparing scope line-by-line across 3–5 sub bids, and how often do you award to a sub only to discover a scope gap later? (Industry rejected-scope gaps are a leading cause of mid-project COs.) [Source](https://www.smaestimating.com/understanding-construction-bids-from-definition-to-winning-strategies/)
28. Safety: how many recordable incidents last year, and what percentage had a root cause that was identifiable on a pre-task plan but wasn't caught?

   **Dig deeper:**
   - Tell me about the last bid leveling exercise where a sub's low number turned out to be too low because of a missing scope item. How did you find out, and when?
   - When a foreman makes a judgment call that turns out wrong, is it usually a knowledge gap, a communication gap, or a pressure/shortcut gap?

---

### Section 4 — Current AI / Claude Usage

**Section insight note.** This section reveals what's working, what's being forced, and what's being avoided in the existing Claude Cowork deployment. It maps to ROI by exposing the gap between current adoption (desktop, file-centric) and the agentic workflows that haven't yet been attempted — which is where the next unit of value sits. [Source](https://www.anthropic.com/product/claude-cowork)

29. Which roles at Hall Boys use Claude Cowork today, how many seats are active weekly, and what's the median number of tasks delegated per user per week?
30. What are the top 3 use cases Claude Cowork is currently handling well — file organization, draft documents, data synthesis, scheduling, something else?
31. What are the top 3 places where employees have *tried* Claude Cowork and dropped it? Why did they drop it — accuracy, trust, speed, integration friction, or "faster to just do it myself"?
32. Has anyone tried to use Claude to summarize a set of drawings, level a set of sub bids, draft an RFI response, review a submittal, or draft a schedule update? What happened?
33. Where is Claude *not* being used but obviously should be, and what's blocking that? (Data access, file format, trust, change-management, permissioning.)
34. Any prior automation attempts — Procore AI, Autodesk Construction Cloud AI, Togal, Document Crunch, zapier/n8n, custom scripts — that were tried and abandoned? Why? [Source](https://www.forconstructionpros.com/construction-technology/news/21903465/togalai-togalai-integration-now-available-on-the-procore-marketplace) [Source](https://www.documentcrunch.com/)

   **Dig deeper:**
   - Of the dropped use cases, is the issue that Claude got the answer wrong or that the handoff back to a human process was too clunky?
   - When you personally use Claude, what's the one workflow where you've thought, "If this worked 10% better, I'd use it every day"?

---

### Section 5 — Decision-Making & Visibility Gaps

**Section insight note.** This section identifies the decisions the COO makes reactively or blindly today — not because data is missing, but because it's scattered, stale, or locked in tribal knowledge. AI with access to existing tools (Claude Cowork, Procore, accounting, dispatch) can close these gaps without new systems. Maps directly to loss avoidance and capacity increase.

35. What are the top 5 recurring decisions you make weekly that you wish you had better inputs for (go/no-go on a bid, whether to reposition equipment, when to intervene on a slipping project, whether to self-perform or sub out, whether to hire)?
36. Which of your direct reports gives you the most confident answer when asked "how is Project X actually doing?" and which one do you trust the least — and why?
37. On the last 3 projects that ended up losing money, at what % complete did you *first suspect* there was a problem, vs. when the numbers confirmed it? What's the lag?
38. How do you currently roll up status across all active projects — a report someone compiles, a dashboard, a meeting? How current is that view, and how often is it wrong?
39. What decisions do you currently punt to your PMs or supers that you'd take back if you had the information at the time — and inversely, what do you get pulled into that shouldn't need your desk?
40. Across GC, plumbing, and logistics, where is there a meaningful lag between a field-level event (sub didn't show, inspection failed, equipment broke) and it showing up in your weekly view?

   **Dig deeper:**
   - When a project starts slipping, what's the first signal that's *actually* reliable vs. the first signal that's just noise?
   - If you could get a single morning brief every Monday — 5 bullets — what would need to be in it to change your week?

---

### Section 6 — ROI & Constraint Validation

**Section insight note.** This section pressure-tests whether the opportunities surfaced above clear the bar: real headcount leverage, real capacity increase, or real loss avoidance. It also validates the constraints (IT team of 3, resistance to custom builds, non-technical workforce) so we don't design something that dies on contact.

41. For each top-3 opportunity we've surfaced so far, what dollar value of ROI would you need to see in year one to green-light a 60-day pilot?
42. What's the adoption profile you're willing to tolerate — a tool 5 power users love, or a tool 150 field employees use 10% effectively? Which one wins for this company?
43. What's the last technology rollout at Hall Boys that succeeded, and the last one that failed? What was the difference — training, executive sponsorship, integration, ROI clarity, or something else?
44. You have a 3-person IT team and internal resistance to custom software. For each opportunity, is the right answer (a) a Claude skill/agent on top of existing tools, (b) a purchased vertical SaaS, (c) no change, or (d) a Claude agent *plus* a vendor tool?
45. What vendors or tools can you *not* remove or displace — Procore, Sage, Viewpoint, specific dispatch software, specific accounting? AI must work around these, not replace them.
46. What would kill this initiative 6 months in — a bad first pilot, a field rebellion, an integration that broke, a security concern, a CFO question about ongoing cost?

   **Dig deeper:**
   - If the top opportunity required one of your non-technical foremen or dispatchers to change their daily workflow by 15 minutes, would it survive? What's the change-management playbook that has worked before?
   - What's the dollar threshold below which you won't even pilot something, regardless of strategic fit?

---

## SELF-CRITIQUE

**Generic / consultant-speak problems in Part A:**
- **Q1** ("if you had to grow 25%...") is a classic consulting prompt. A technical COO would skim past it.
- **Q6** ("eliminate one category of work") is too open-ended; no construction artifact anchors it.
- **Q23** lists failure reasons but doesn't force the COO to rank them with data.
- **Q29** is a lightweight "how many seats" question that any SaaS vendor asks — not probing.
- **Section 5** leans introspective rather than construction-specific. A skeptical COO will shrug.

**Places where ROI clarity is weak (COO could answer without revealing $ / hours / volume):**
- Q11 ("put a percentage on each bucket") — easy to give vague %s with no anchor.
- Q16 (prefab %) — no ROI hook; prefab decisions alone don't prove AI value.
- Q31 (top 3 dropped use cases) — surfaces narrative, not dollars.
- Q35 (top 5 decisions) — too broad; no forcing function.
- Q43 (last tech rollout) — lesson-learned framing, not ROI framing.

**What a skeptical technical COO would scoff at or skip:**
- Q2's "rank verticals by EBITDA, volatility, and personal hours" — three-way ranking without a concrete incident; feels like a survey.
- Q24 ("tribal knowledge") — too soft, no artifact.
- Q36 ("which direct report do you trust least") — politically loaded; will get skipped or sanitized.
- Q42 ("adoption profile") — feels like a product-marketing question.
- Q46 ("what would kill this") — too abstract to answer usefully.

**Sections that feel templated rather than Hall-Boys-specific:**
- Section 5 reads like a generic "visibility gaps" assessment. It needs to drag in dispatch boards, Procore project views, daily log rollups, and the specific cadence of construction reporting.
- Section 6 is the biggest offender — it's a standard "ROI / constraints" checklist. It needs to reference Hall Boys' actual toolchain (Claude Cowork, Procore-or-equivalent, dispatch/accounting), the 3-person IT team, the non-technical foremen, and the specific multi-vertical structure.

**Missing construction-specific depth:**
- Bid leveling is only briefly covered (Q27). Needs its own anchored scenario.
- Critical path / float consumption isn't explicitly asked about.
- Weather delay attribution and float tracking aren't present.
- Nationwide dispatch routing / backhaul matching needs a concrete incident anchor.
- Plumbing-specific: no question on inspection scheduling coordination with AHJ, which is a known bottleneck.
- No question on foreman daily huddle / pre-task plan variance by crew.
- Nothing on job cost reporting lag (WIP, committed cost, % complete mismatch).

---

## PART B — FINAL IMPROVED VERSION

> This is the version to send to the COO. It replaces abstractions with specific incidents, forces numeric answers everywhere, references Hall Boys' specific tool stack, and removes everything a skeptical operator would skip.

---

### Section 1 — Business Priorities
*What insight: Which vertical carries strategic weight, where is the largest dollar gap between potential and execution, and which loss category can't repeat. Maps to: loss avoidance ($), capacity increase (revenue per PM / per dispatcher / per estimator).*

1. **Revenue-per-PM and revenue-per-dispatcher.** What is revenue-per-PM on GC, revenue-per-foreman on plumbing, and revenue-per-dispatcher on equipment logistics today? Which number would have to move to unlock a 15% growth year without new hires, and by how much?
2. **The $250K+ miss.** What's the single largest avoidable loss (> $100K) Hall Boys took in the last 12 months? For that incident, tell me: (a) the vertical, (b) the decision that, if made 48 hours earlier or with better inputs, would have prevented or halved the loss, (c) who made it, and (d) what information they didn't have.
3. **The Monday morning signal.** For each vertical, name the one number you open first on Monday. If that number was wrong for 3 weeks in a row, how would you find out — and what's the cost of finding out late?
4. **Bid capacity ceiling.** What's your current GC bid-hit ratio and your plumbing bid-hit ratio? How many additional qualified bids per month could you *submit* if estimator takeoff time dropped 60%? (Beam AI and Togal report 75–80% takeoff time reduction and 3x bid throughput.) [Source](https://www.ibeam.ai/) [Source](https://www.togal.ai/blog/how-to-choose-an-estimating-software-for-construction) At your current hit rate, what's that worth in booked revenue?
5. **The capacity you're paying for but not deploying.** Across the four verticals, quantify in dollars per month: (a) idle equipment (units × days × day-rate), (b) non-billable estimator hours, (c) PM under-utilization (projects carried vs. projects capable of carrying), (d) plumbing foremen with incomplete crews. Which of these is structural vs. solvable?
6. **The ROI bar.** You've said AI must reduce headcount, add capacity, or avoid real loss. Of those three, which one are you most willing to act on first — and what's the minimum annualized dollar figure that clears the bar for a 60-day pilot vs. a 12-month deployment?

   **Dig deeper:**
   - For the $100K+ loss in Q2: was the root cause missing information, information trapped in someone's head, information that existed but wasn't synthesized, or a judgment call with complete information?
   - In Q5, which capacity line item has existed at roughly the same dollar level for 3+ years? (That's the structural one — and the highest-leverage AI target.)

---

### Section 2 — Current Workflows (By Vertical)

#### 2A. General Contracting — PM, Subs, RFIs, Submittals, Change Orders
*What insight: Where project-management hours leak on pattern-driven work. Maps to: PM capacity increase and avoided schedule/CO losses.*

7. **RFI cycle anatomy.** Pull the last 50 RFIs across your active GC projects. What's the median days-to-close? What's the P90? Where does the time actually go — drafting, sub-to-GC transit, GC review, GC-to-architect, architect review, or back-distribution? (Industry median is ~6–10 days; P90 often > 14; AIA benchmark ~5.2.) [Source](https://www.procore.com/library/rfi-construction) [Source](https://www.ruh.ai/blogs/rfi-response-in-minutes-not-days-how-ai-agents-eliminate-construction-s-biggest-scheduling-blocker) Of those 50, how many required pure lookup from specs / prior RFIs / drawings (machine-doable) vs. true engineering judgment?
8. **Submittal rejection and resubmit.** On the last 3 projects, what was your first-pass submittal rejection rate? (Industry is ~35% at ~$805 direct cost per rejection, 2–4 weeks schedule cost.) [Source](https://buildsync.ai/resources/complete-guide-to-construction-submittal-reviews) How many of those rejections were on catchable spec mismatches (wrong refrigerant, wrong pressure class, wrong UL listing) that a document-reading agent would have flagged before submission?
9. **Change order origin breakdown.** Of your last 100 change orders: what % were owner-requested, what % were A/E errors & omissions, what % were unforeseen conditions, and what % were your own scope/estimating miss? (Industry: COs run 10–15% of contract value; A/E E&O typically 3–5%.) [Source](https://www.rhumbix.com/blog/change-orders-construction-definitive-guide) [Source](https://gowightman.com/resources/change-orders-in-building-projects) On the E&O bucket, how many conflicts were identifiable in the spec/drawing set itself?
10. **Bid leveling time and gap rate.** For the last 5 trade packages you leveled (MEP rough, drywall, glazing, etc.), how many hours did estimating spend line-by-line-normalizing 3–5 sub bids per package? How often did you later discover a scope gap on the awarded sub's number — and what was the average cost recovery per gap?
11. **Sub no-show / late mobilization volume.** In the last 90 days, how many times did a scheduled sub fail to mobilize on the planned day? For each, how many dependent trades were affected, and what was the cascading cost (liquidated damages exposure, overtime, rework)?
12. **OAC / coordination meeting load.** How many hours per week across your PMs and supers are consumed by (a) weekly OAC prep, (b) subcontractor coordination calls, (c) writing daily/weekly reports? If 50% of that prep was drafted by an agent using the project's existing file tree, what's the PM-hour reclaim worth per year?

   **Dig deeper:**
   - Tell me about the last RFI that cascaded into a schedule slip > 3 days. Walk me through the exact timeline: who opened it, where it sat, who finally answered.
   - On the last sub no-show: did your team know the sub was at risk 48 hours prior based on any signal (past schedule adherence, crew calls, material deliveries), or was it genuinely surprise?

#### 2B. New Construction Plumbing
*What insight: Where plumbing-specific execution variability lives. Maps to: avoided rework/inspection losses, foreman capacity, supervisor leverage.*

13. **Rough-in inspection pass rate.** What's your first-pass rough-in pass rate across residential/commercial? Top 3 failure categories by frequency (slope, venting, hanger spacing, support, fixture rough heights, code-edition mismatch)? On a failed inspection, what's the typical rework cost + schedule hit per incident, and how many per month?
14. **AHJ scheduling friction.** How many hours per week does your team spend scheduling, rescheduling, or waiting for AHJ inspection slots across active sites? When an inspector arrives and work isn't ready, how often does that happen per month and what's the reinspection fee + crew idle cost?
15. **Material lead-time surprise.** In the last 6 months, on how many projects did you discover a long-lead plumbing item (fixtures, specialty valves, refrigerant-affected equipment) within 2 weeks of need? What was the typical delay cost? How far upstream in the submittal/procurement chain was the data that could have warned you?
16. **Foreman-to-foreman variance.** Pick your best plumbing foreman and your median one. On comparable scope, what's the labor-hour variance per fixture unit or per rough-in? What's the dollar impact if the median foreman performed at the 75th percentile?
17. **Prefab decision consistency.** What % of plumbing scope is prefabbed? Is that decision made by a central estimator, the PM, or the foreman? Where do you see prefab *under-used* (should have been prefab but wasn't) and what did it cost?
18. **MEP coordination failures on self-performed plumbing.** When Hall Boys plumbing collides with another trade's installed work, who catches it — plumbing super, GC PM, or the inspector? How many collisions per quarter, and what's the rework dollar average? (Rework is ~$15B/yr industry-wide and MEP is the largest single source.) [Source](https://rimkus.com/article/what-does-mep-stand-for-in-construction/)

   **Dig deeper:**
   - Last failed rough-in: what did the foreman *not* see the morning of? Would a photo-based pre-inspection checklist have caught it?
   - Last long-lead surprise: if someone had read the approved submittal + supplier lead-time on day of approval and cross-referenced the schedule, would the surprise have surfaced 4 weeks earlier?

#### 2C. Equipment Logistics — Nationwide Dispatch & Sourcing
*What insight: Where margin leaks in routing, sourcing, and idle fleet. Maps to: deadhead reduction ($), utilization lift ($), avoided outsourcing margin loss.*

19. **Utilization, deadhead, idle.** What's your rolling 90-day fleet utilization, deadhead-mile %, and idle-time %? (Industry healthy utilization is ~70–80%; deadhead has held at ~20% for 30 years; 58% of truckloads move with empty trailer space per Flock Freight 2024.) [Source](https://opsima.com/blog/kpis/fleet-utilization/) [Source](https://www.orbcomm.com/en/resources/guides/fleet-manager-guide-trailer-kpis) For each point of utilization above 70%, what's the annualized margin impact?
20. **Dispatch decision anatomy.** From inbound call to confirmed dispatch: how many minutes, how many systems consulted, and how many humans touch the decision? On a given day, how many dispatches does your dispatcher actually run vs. their theoretical ceiling?
21. **Outsourced dispatches.** What % of dispatches in the last 90 days were covered by third-party rental partners because your own fleet couldn't cover? What was the margin delta vs. owning? Of those outsources, how many were caused by (a) genuine capacity shortage, (b) wrong asset in wrong region, (c) scheduling conflict that better forecasting could have resolved?
22. **Reposition decision lag.** When an asset comes off a job, how many days until it's dispatched to a new one? What's the target, what's the actual, and what's each day of lag worth per asset?
23. **Maintenance downtime cost.** MTTR today (industry best-in-class <6 hrs vs. average 12–18 hrs)? [Source](https://heavyvehicleinspection.com/blog/post/heavy-equipment-maintenance-kpis-contractors-fleet-managers) Planned vs. unplanned maintenance ratio? How many dispatches per quarter were declined or outsourced because an asset was unexpectedly down?
24. **Sourcing and pricing visibility.** When the dispatcher needs to source externally, how do they compare rental vendor pricing, availability, and delivery ETAs across partners? Is that a phone tree, a spreadsheet, or a system? Hours per week spent on that sourcing?

   **Dig deeper:**
   - Last dispatch you outsourced: if your dispatcher had seen a same-region idle asset on the board, would it have been used? Why wasn't it surfaced?
   - Show me your top 5 most-frequent deadhead lanes by mile. How many of those are structural (no backhaul possible) vs. solvable with better load-matching?

---

### Section 3 — Bottlenecks & Failure Points
*What insight: Which failure patterns repeat across projects — pattern repetition = AI leverage. Maps to: loss avoidance ($), avoided rework ($).*

25. **The top-3 work-stoppage causes.** In the last 90 days, what are the top 3 reasons crews were idle on site? Give me a rough hour count per month for each (waiting on RFI, waiting on material, waiting on approval, waiting on inspection, waiting on equipment, waiting on sub). Which of these are information-driven vs. physical?
26. **Critical-path awareness lag.** On your last 3 projects, from the moment a critical-path activity slipped to the moment it showed up in your weekly report — what was the lag in days? Who had to know first for that lag to close, and what would they have needed to see?
27. **Tribal knowledge concentration risk.** Name the 3 people at Hall Boys whose departure would cost you real money in the next 90 days because of knowledge that only lives in their head: bidding assumptions, vendor contacts, dispatch routing heuristics, code interpretations, client-relationship history. For each, estimate the 12-month cost of their unexpected absence.
28. **Bid-to-actual variance.** On the last 10 completed GC projects, what was the average variance between estimator line-item cost and field-realized cost? Which line items show the largest recurring variance — labor productivity, specific material categories, subcontractor markup assumptions, general conditions?
29. **Preconstruction miss rate.** In the last year, how many contract-terms / insurance / scope-overlap issues were discovered *after* contract signing that should have been caught in preconstruction review? What was the cumulative dollar exposure? (Document Crunch-style contract review tools report catching 5–10 material issues per large contract.) [Source](https://www.documentcrunch.com/)
30. **Punch list and rework volume.** Average punch list size at substantial completion, average days-to-close, and what % of punch items are recurring patterns across projects (same trade, same defect type)? Industry rework spend is ~$15B/year. [Source](https://rimkus.com/article/what-does-mep-stand-for-in-construction/)

   **Dig deeper:**
   - The #1 work-stoppage cause in Q25: on the last project that killed the schedule, could the stop have been predicted 24–48 hours earlier from signals that already existed in your systems?
   - Bid-to-actual variance in Q28: is the miss usually in the same direction (consistently under-estimating certain items) or random? Consistent = learnable pattern = AI target.

---

### Section 4 — Current AI / Claude Cowork Usage
*What insight: What's working, what's forced, what's avoided in the existing Claude Cowork footprint, and what adjacent agentic workflow is the next win. Maps to: capacity increase without IT build.*

Background: Claude Cowork is Anthropic's desktop agent that operates on local files/folders and synthesizes work across multiple sources. It is designed for non-technical knowledge workers. [Source](https://www.anthropic.com/product/claude-cowork) [Source](https://www.datacamp.com/tutorial/claude-cowork-tutorial) Anthropic's positioning is that users delegate outcomes, not prompts.

31. **Active usage inventory.** By role (COO, PM, estimator, dispatcher, super, accounting, HR), how many people have Claude Cowork seats? How many are weekly active? What's the median number of delegated tasks per user per week? Where is usage concentrated (estimating? admin? document drafting?), and where is it dead?
32. **The three it does well.** Name the top 3 specific workflows Claude Cowork is handling well today at Hall Boys. For each, what was the before-state and what's the time/headcount delta today?
33. **The three people dropped.** Name 3 workflows where someone tried Claude Cowork and went back to manual. For each, what actually broke — wrong output, output-format-not-usable, downstream handoff too clunky, slower-than-doing-it-yourself, or trust/verification cost too high? These dropped attempts are the best pointer to where the next agentic layer (not Cowork alone) needs to live.
34. **The construction-specific use cases not yet tried.** For each of the following, has anyone attempted it, and what was the result? (a) drafting an RFI response from specs + prior RFIs, (b) reviewing a submittal package against specs for compliance, (c) bid-leveling 4 sub quotes across line items, (d) drafting a weekly owner report from daily logs, (e) summarizing a 200-page contract for risk terms, (f) reconciling a dispatcher's board against job tickets, (g) generating a pre-task safety plan from a scope statement, (h) drafting punch list responses.
35. **Tool stack Claude must respect.** What are the non-negotiable existing systems Claude must work *with*, not replace? (Likely candidates: Procore or equivalent PM, Sage/Viewpoint/Foundation accounting, a dispatch system, QuickBooks, an estimating tool, SharePoint/Drive.) For each, what's the data access situation today — API, exports, files on a drive, or locked in someone's laptop?
36. **Prior automation graveyard.** What other AI/automation tools have been trialed and abandoned — Procore AI/Helix [Source](https://www.procore.com/helix-intelligence), Autodesk Build, Togal, Document Crunch, Beam, zapier, custom scripts? For each, what specifically killed it — accuracy, integration, price, adoption, or no ROI?
37. **Data readiness.** 95% of construction project data goes unused industry-wide. [Source](https://dancumberlandlabs.com/blog/construction-technology-trends/) Of Hall Boys' last 5 years of project data (bids, daily logs, RFIs, submittals, change orders, job-cost), what % is (a) in structured systems, (b) in PDFs/emails, (c) in someone's OneDrive, (d) on paper?

   **Dig deeper:**
   - On the dropped workflows in Q33: was the failure Claude's output, or was it that the *next step* in the human process wasn't ready to consume Claude's output? (This distinction determines whether we need a better agent or a better workflow.)
   - In Q34, which untried use case would *you personally* bet on as the highest-value — and why that one?

---

### Section 5 — Decision-Making & Visibility Gaps
*What insight: Where the COO is making calls blind or late. AI with access to existing systems + Claude Cowork can close these without a custom build. Maps to: loss avoidance ($) and capacity increase by unlocking delegation.*

38. **The decisions you make with incomplete inputs.** List the 5 recurring decisions you make weekly that you wish had better inputs. Examples to rule in or out: go/no-go on a bid, whether to reposition an asset, whether to intervene on a slipping project, whether to self-perform vs. sub out, whether to authorize overtime, whether to approve a COR. For each, what's the information gap?
39. **Project heat map staleness.** How current is your view of "which projects are actually at risk"? A PM's weekly report? A gut feel from the super? A WIP report from accounting that's 2 weeks delayed? Quantify the lag between a project entering trouble and your dashboard reflecting it.
40. **The PM confidence asymmetry.** When you ask 5 PMs "how's Project X?" — how often do the answers you get track to how the project actually closes out? Is there a systematic tendency (optimism bias, hiding bad news, inconsistent definition of "on track")? What's the dollar cost of late surprises?
41. **Field-to-office event lag.** When a sub no-shows, an inspection fails, a piece of equipment breaks, or a material is short on site — what's the median time until it shows up in a view you see? Which of these events, if you saw them within 2 hours, would change your day?
42. **The Monday 5-bullet brief.** If you got a single 5-bullet brief every Monday 7am, auto-generated from Procore / accounting / dispatch / daily logs by an agent, what would *have* to be in it to change how you spent the week? Be specific — not "project status" but "projects where committed cost exceeded budget this week" or "dispatches where same-region idle assets exist but were outsourced."
43. **Dispatcher / estimator / PM workflow hand-offs that lose information.** Name the 3 hand-offs inside Hall Boys where information gets lost or deformed (estimator → PM on scope assumptions, PM → super on change-order scope, super → accounting on labor coding, dispatcher → billing on chargeable hours). For each, what does the loss cost per quarter?

   **Dig deeper:**
   - The last time you were surprised by a project loss: what was the earliest "weak signal" in the data that existed but no one synthesized? (Weak signals are the easiest AI wins because they require synthesis, not judgment.)
   - Which of the 5 decisions in Q38 do you *want* to delegate downward but can't, because your direct report doesn't have the visibility you have?

---

### Section 6 — ROI & Constraint Validation
*What insight: Does the surfaced opportunity clear the hard ROI bar and fit the Hall Boys constraint set (3-person IT, anti-custom-build, non-technical 300-person workforce, Claude Cowork already in place). Maps to: gate before pilot approval.*

44. **Dollarize the top 3.** Based on the answers above, the three highest-promise opportunities likely cluster around: (a) subcontractor/RFI/submittal document automation, (b) estimating/takeoff/bid-leveling capacity lift, (c) dispatch + deadhead reduction. For each, what's your best-estimate annualized ROI envelope (low / likely / high)? Below what figure is it not worth the attention cost?
45. **Build vs. buy vs. Claude-skill.** For each opportunity, which path do you want tested first: (i) a Claude Cowork skill / agent orchestration on top of existing files and tools, (ii) a purchased vertical SaaS (Document Crunch for contracts, Togal/Beam for takeoff, a TMS/dispatch tool for logistics), (iii) Claude agent *plus* vendor tool, or (iv) no change?
46. **The 3-person IT reality.** Your IT team is 3 people. What's their current capacity for (a) integration / API work, (b) admin of a new SaaS tool, (c) writing Claude skills? Where is the hard ceiling?
47. **Change management for a 300-person non-technical workforce.** Of the ~300 employees, how many would actually need to change their daily behavior for each opportunity to work? For the opportunities that require foreman/super/dispatcher behavior change, what's the historical adoption rate of a comparable rollout (e.g., Procore field adoption, safety app adoption)? A majority of construction digital transformations fail on change management, not technology. [Source](https://dancumberlandlabs.com/blog/construction-technology-trends/)
48. **The failure mode that kills this 6 months in.** What's the single likeliest reason a deployed AI agent ends up unused by month 6? Is it trust, accuracy, the last-mile handoff, IT burden, a single vocal skeptic, or cost creep?
49. **The irreversible decisions to protect.** Which decisions must *always* stay with a human (safety stand-downs, contract signing, scope commitments, hiring/firing, client communications)? Where are you comfortable letting an agent act autonomously vs. only draft for human approval?
50. **The 60-day pilot criterion.** If we run a 60-day pilot on the top opportunity, what are the 3 metrics that must move, and by how much, for you to green-light a full rollout? What's your kill criterion?

   **Dig deeper:**
   - On Q47: for the rollout that historically worked best at Hall Boys, what was the one thing the sponsor did that made adoption stick?
   - On Q50: is there a comparable 60-day bar you've used for a past technology pilot? What did you measure and what did you ignore?

---

## Notes on Sources and Benchmarks Used

The industry benchmarks referenced in this questionnaire are drawn from public sources and should be treated as directional, not definitive, for Hall Boys' specific regions and project mix.

- **RFI cycle time ~6–10 days average, AIA benchmark ~5.2, ~$1,080 per RFI:** Navigant/Guidehouse study of 1,362 projects and 1M+ RFIs. [Source](https://www.procore.com/library/rfi-construction) [Source](https://superconstruct.io/blog/rfi-in-project-management/)
- **Submittal first-pass rejection ~35% at ~$805 per rejection, 2–4 weeks delay:** BuildSync industry synthesis. [Source](https://buildsync.ai/resources/complete-guide-to-construction-submittal-reviews) Claimed 35% → 5% reduction with AI review is vendor-reported and should be validated, not assumed.
- **Change orders 10–15% of contract value on major projects; A/E E&O typically 3–5%:** [Source](https://www.rhumbix.com/blog/change-orders-construction-definitive-guide) [Source](https://gowightman.com/resources/change-orders-in-building-projects)
- **85% of projects experience cost overrun; average overrun 28%; only 25% of projects finish within 10% of original deadline:** McKinsey / Propeller synthesis. [Source](https://www.propelleraero.com/blog/10-construction-project-cost-overrun-statistics-you-need-to-hear/)
- **Fleet utilization healthy range 70–80%; deadhead ~20% industry-wide; 58% of 2024 truckloads had empty trailer space (Flock Freight):** [Source](https://opsima.com/blog/kpis/fleet-utilization/) [Source](https://www.orbcomm.com/en/resources/guides/fleet-manager-guide-trailer-kpis)
- **Heavy equipment best-in-class MTTR <6 hrs vs. industry 12–18 hrs; OEE best-in-class >85% vs. 60–65% average:** [Source](https://heavyvehicleinspection.com/blog/post/heavy-equipment-maintenance-kpis-contractors-fleet-managers)
- **Rework is ~$15B/yr industry-wide; MEP coordination is a leading source:** [Source](https://rimkus.com/article/what-does-mep-stand-for-in-construction/)
- **95% of construction project data goes unused; construction firms use avg. 6.2 technologies; most digital transformations fail on change management, not tech:** [Source](https://dancumberlandlabs.com/blog/construction-technology-trends/)
- **Takeoff automation (Togal, Beam) reports 75–80% time reduction, up to 3x bid volume; Togal reports 97–98% accuracy and 76% faster vs. competitors per a 2025 Kansas University study (vendor-cited):** [Source](https://www.togal.ai/blog/how-to-choose-an-estimating-software-for-construction) [Source](https://www.ibeam.ai/) [Source](https://www.g2.com/products/togal-ai/reviews) Vendor-reported numbers should be validated in a pilot, not assumed.
- **Claude Cowork positioning — desktop agent for non-technical knowledge work, operating on local files and apps:** [Source](https://www.anthropic.com/product/claude-cowork) [Source](https://www.datacamp.com/tutorial/claude-cowork-tutorial)
- **Document Crunch — AI contract review for GCs, positioned as a Procore complement:** [Source](https://www.documentcrunch.com/)
- **Procore's native AI (Helix / Agent Studio) is their own AI layer — any agent strategy must respect this if Procore is in use:** [Source](https://www.procore.com/helix-intelligence)

> **Caveat on vendor-reported metrics:** Many of the "X% time saved" and "Y% accuracy" claims above come from the vendors themselves or their marketing case studies. For any opportunity that moves past questionnaire stage, treat these as hypotheses for pilot validation — not as committed baselines.