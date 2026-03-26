# Novendor Revenue Operating Program

> **Purpose:** Executable operating program designed to produce first revenue. Not strategy — structure, logic, records, and recurring task framework for execution.
>
> **Last updated:** 2026-03-25
>
> **Operating surface:** Winston / Novendor environment (CRM, pipeline, autonomous tasks, proof assets)

---

## 1. Revenue-Backwards Pipeline Framework

Work backwards from cash collected. Each stage has clear entry/exit criteria, required evidence, and supporting artifacts.

### Stage 7: Revenue Received

- **Objective:** Cash collected; engagement officially started or deliverable accepted.
- **Entry criteria:** Signed agreement + payment received (or NET-30 invoice sent with confirmed PO).
- **Exit criteria:** Revenue recorded in CRM; engagement status set to `active`.
- **Owner:** Paul
- **Evidence required:** Signed SOW/MSA, payment confirmation or invoice receipt, CRM opportunity moved to `closed_won`.
- **Likely blockers:** Procurement delays, legal review of MSA, budget reallocation.
- **Supporting artifacts:** MSA template, invoice template, onboarding checklist.

### Stage 6: Proposal Accepted

- **Objective:** Client has verbally or in writing agreed to the proposal.
- **Entry criteria:** Proposal sent (`cro_proposal.status = 'sent'`) and client has responded positively.
- **Exit criteria:** Written acceptance (email or signed document). CRM opportunity moves to `negotiation` or `closed_won`.
- **Owner:** Paul
- **Evidence required:** Acceptance email or signed proposal. `cro_proposal.accepted_at` set.
- **Likely blockers:** Scope disagreements, pricing objections, internal champion loses political capital, competitor counter-offer.
- **Supporting artifacts:** Proposal template, scope-clarification FAQ, pricing justification doc.

### Stage 5: Proposal Sent

- **Objective:** A specific, priced proposal has been delivered to the prospect.
- **Entry criteria:** Discovery call completed, pain validated, scope agreed. CRM opportunity exists with `stage_key = 'proposal'`.
- **Exit criteria:** Proposal delivered via email or shared doc. `cro_proposal.sent_at` set.
- **Owner:** Paul
- **Evidence required:** `cro_proposal` record with `status = 'sent'`, sent_at timestamp, linked to `crm_opportunity`.
- **Likely blockers:** Scope creep during proposal drafting, client goes dark after discovery, inability to price confidently.
- **Supporting artifacts:** Proposal template (per offer tier), ROI framing doc, competitive comparison one-pager.

### Stage 4: Discovery Call Held

- **Objective:** Live or async conversation where pain is validated, budget is explored, and scope is discussed.
- **Entry criteria:** Qualified lead has agreed to a call. CRM opportunity at `qualified` stage.
- **Exit criteria:** Call completed. Notes captured in `crm_activity`. Pain confirmed. Next step agreed (proposal or decline).
- **Owner:** Paul
- **Evidence required:** `crm_activity` record of type `call` or `meeting`, notes with pain/budget/timeline captured.
- **Likely blockers:** No-shows, prospect not decision-maker, pain is aspirational not urgent, discovery reveals bad fit.
- **Supporting artifacts:** Discovery call script, diagnostic questionnaire, demo environment ready.

### Stage 3: Qualified Lead Identified

- **Objective:** A prospect has been assessed and meets minimum qualification criteria.
- **Entry criteria:** Lead exists in CRM (`crm_account` + `cro_lead_profile`). Initial research done.
- **Exit criteria:** Lead score ≥ 60 (from `cro_lead_profile.lead_score`). `qualification_tier` set to `hot` or `warm`. Decision-maker identified.
- **Owner:** Paul + autonomous signal tasks
- **Evidence required:** `cro_lead_profile` with `qualification_tier`, `pain_category`, `estimated_budget`, `contact_name`, `contact_title`.
- **Likely blockers:** Can't identify decision-maker, pain is speculative, no clear budget authority.
- **Supporting artifacts:** Lead scoring rubric, qualification checklist.

### Stage 2: Target Account Selected

- **Objective:** A company has been identified as a plausible buyer for a Novendor offer.
- **Entry criteria:** Signal detected (hiring, funding, pain indicator, referral, event attendance, content engagement).
- **Exit criteria:** `crm_account` created with `account_type = 'prospect'`. Assigned to a target segment.
- **Owner:** Autonomous tasks (sales-signal-discovery, monday-pipeline-review) + Paul
- **Evidence required:** Signal source documented. Industry, company size, and initial offer hypothesis recorded.
- **Likely blockers:** Weak signals, no path to decision-maker, company too small for paid engagement.
- **Supporting artifacts:** Target segment definitions, signal detection criteria.

### Stage 1: Outreach / Content / Referral Motion Initiated

- **Objective:** Activity has started to create awareness and conversation with potential buyers.
- **Entry criteria:** Revenue program is active. Target segments defined. At least one offer packaged.
- **Exit criteria:** First outreach sent, first content published, or first referral conversation had. `cro_outreach_log` records exist.
- **Owner:** Paul + autonomous tasks (wednesday-outreach-push, linkedin-content-generator)
- **Evidence required:** Outreach logs, LinkedIn posts, workshop registration page, referral asks made.
- **Likely blockers:** No packaged offer to reference, no proof assets, no clear target list, outreach feels generic.
- **Supporting artifacts:** Outreach templates, LinkedIn content calendar, workshop outline, referral script.

---

## 2. First-Revenue Hypotheses

Ranked by speed-to-revenue and plausibility. Bias: things Paul can sell this month.

### Hypothesis A: AI Operations Diagnostic (FASTEST)

- **Offer name:** AI Operations Diagnostic
- **Target buyer:** COO, VP Ops, or CEO of a 50-500 person company in South Florida (or REPE firm nationally)
- **Pain point:** "We know AI matters but don't know where to start or what's real vs. hype"
- **Why they would pay now:** Every board meeting someone asks about AI. They need an answer that's not a vendor pitch.
- **Likely price range:** $5,000 - $10,000 (sweet spot: $7,500)
- **Expected sales cycle:** 1-3 weeks (short because it's low commitment and outcome is concrete)
- **Proof/assets needed:** One-page offer sheet, 15-question diagnostic questionnaire, sample diagnostic output report, 2-minute Winston demo showing AI workflow analysis
- **Risks and objections:** "We can do this ourselves with ChatGPT," "What makes you qualified?", "We're not ready for AI yet"
- **Counter to objections:** The diagnostic isn't about ChatGPT — it's about your operations. We map your actual workflows, identify where AI creates ROI, and give you a prioritized implementation plan. Paul has built enterprise AI systems (Winston is the proof) — not just used them.
- **Suggested next action:** Draft the diagnostic questionnaire + one-page offer sheet this week. Send to 5 warm contacts.

### Hypothesis B: Workflow Automation Sprint

- **Offer name:** Workflow Automation Sprint
- **Target buyer:** Department head or COO at a company with obvious manual process pain (data entry, reporting, approvals, document processing)
- **Pain point:** "We have 3 people doing work that should be automated but IT won't prioritize it"
- **Why they would pay now:** Direct labor cost savings — easy to justify to a CFO
- **Likely price range:** $10,000 - $20,000 (sweet spot: $15,000)
- **Expected sales cycle:** 2-4 weeks
- **Proof/assets needed:** Before/after workflow diagram, ROI calculator showing labor savings, case-study narrative, live Winston demo of document processing or data extraction
- **Risks and objections:** "Our IT team should do this," "How do we know it will work?", "We've tried automation before"
- **Counter to objections:** Your IT team has a backlog. This is a 2-week sprint with a guaranteed deliverable — a working automated workflow, not a proposal for one. Novendor builds the thing, not a deck about the thing.
- **Suggested next action:** Identify 3 companies with known manual process pain. Draft outreach with specific workflow examples.

### Hypothesis C: Winston REPE Pilot

- **Offer name:** Winston REPE Intelligence Platform — 90-Day Pilot
- **Target buyer:** CFO, COO, or Head of Asset Management at a REPE fund ($500M-$5B AUM)
- **Pain point:** "Our quarterly reporting takes 3 weeks, our LPs are demanding more transparency, and Yardi/Juniper Square don't give us AI-powered insights"
- **Why they would pay now:** LP pressure for reporting quality and speed; competitive pressure from firms already using AI
- **Likely price range:** $25,000 - $50,000 (sweet spot: $35,000 for 90-day pilot)
- **Expected sales cycle:** 4-8 weeks (requires internal champion, possibly committee)
- **Proof/assets needed:** Live Meridian Capital demo environment showing fund analytics, IRR models, LP reporting, AI-driven variance analysis. Competitive positioning vs. Yardi/Juniper Square. ROI model.
- **Risks and objections:** "We're locked into Yardi," "Can you integrate with our existing systems?", "What happens after the pilot?"
- **Counter to objections:** Winston doesn't replace Yardi — it sits alongside it and provides the intelligence layer Yardi can't. The pilot is deliberately scoped to prove value before you commit further.
- **Suggested next action:** Fix top 3 Meridian demo friction points. Draft REPE-specific outreach. Target 5 REPE firms showing hiring or fund-launch signals.

### Hypothesis D: AI Leadership Workshop

- **Offer name:** "AI for Operations Leaders" Half-Day Workshop
- **Target buyer:** Local business networks, industry associations, peer groups (YPO, Vistage, local chambers)
- **Pain point:** "I keep hearing about AI but can't separate signal from noise"
- **Why they would pay now:** Group buy-in reduces individual risk. Social proof from peers attending.
- **Likely price range:** $200 - $500 per seat (target 15-30 attendees = $3,000 - $15,000)
- **Expected sales cycle:** 2-4 weeks to fill, then convert attendees to consulting
- **Proof/assets needed:** Workshop outline, landing page, attendee materials, live demo segments
- **Risks and objections:** "I can watch YouTube for free," "Is this just a sales pitch?"
- **Counter to objections:** This is hands-on with your actual business challenges. Each attendee leaves with a personalized AI opportunity map for their company.
- **Suggested next action:** Draft workshop outline. Identify 3 potential host organizations (industry groups, coworking spaces).

### Hypothesis E: Fractional Chief AI Officer (CAIO)

- **Offer name:** Fractional Chief AI Officer
- **Target buyer:** CEO/COO of a 100-500 person company that's AI-curious but has no internal AI leadership
- **Pain point:** "We need AI strategy but can't justify a $300K hire"
- **Why they would pay now:** Board pressure, competitor moves, or failed internal AI projects
- **Likely price range:** $5,000 - $10,000/month retainer
- **Expected sales cycle:** 4-8 weeks (trust-based, needs relationship)
- **Proof/assets needed:** Fractional CAIO scope doc, Paul's AI systems portfolio (Winston as proof), competitive landscape showing companies that have AI leadership vs. those that don't
- **Risks and objections:** "We need someone full-time," "What does a fractional CAIO actually do?"
- **Counter to objections:** Most companies don't need a full-time CAIO yet. They need 10-20 hours/month of someone who can evaluate vendors, set AI strategy, oversee implementation, and prevent expensive mistakes.
- **Suggested next action:** Draft CAIO scope document. Target companies that recently posted and pulled AI leadership job listings.

---

## 3. Offer Architecture

### Offer 1: AI Operations Diagnostic

| Field | Detail |
|---|---|
| **Title** | AI Operations Diagnostic |
| **Value prop** | In 5 days, know exactly where AI creates ROI in your operations — and where it doesn't |
| **Who it's for** | COOs, VPs of Operations, CEOs at companies with 50-500 employees |
| **Scope** | Structured assessment of 3-5 core operational workflows. Stakeholder interviews (2-3). Data/system audit. AI opportunity scoring. |
| **Deliverables** | 1) AI Readiness Scorecard, 2) Workflow-by-workflow opportunity map with ROI estimates, 3) Prioritized implementation roadmap (90-day), 4) Executive presentation of findings |
| **Timeline** | 5 business days |
| **Pricing** | $7,500 flat fee |
| **Required inputs from client** | Access to 2-3 key stakeholders for 45-min interviews. List of core workflows/processes. Access to current tools/systems for audit. |
| **Proof points / demo** | Show Winston's document extraction, workflow analysis, and dashboard generation as examples of AI-powered operations. The diagnostic itself demonstrates AI capability. |
| **What success looks like** | Client has a clear, prioritized list of AI opportunities with ROI estimates. At least 1 opportunity is compelling enough to fund a Sprint or Pilot. |

### Offer 2: Workflow Automation Sprint

| Field | Detail |
|---|---|
| **Title** | Workflow Automation Sprint |
| **Value prop** | One broken workflow → working automation in 2 weeks. Not a proposal — a deliverable. |
| **Who it's for** | Department heads, COOs, operations managers with a specific manual-process pain point |
| **Scope** | Single workflow redesign and automation. Process mapping, tool selection/build, integration, testing, handoff. |
| **Deliverables** | 1) Current-state process map, 2) Redesigned automated workflow (working, not theoretical), 3) Integration with existing tools, 4) Runbook for ongoing operation, 5) ROI measurement baseline |
| **Timeline** | 10 business days (2 weeks) |
| **Pricing** | $15,000 flat fee |
| **Required inputs from client** | Identified workflow to automate. Access to tools/systems involved. A workflow owner available for daily 15-min standups. Sample data/documents for testing. |
| **Proof points / demo** | Before/after demo of a similar workflow. Show Winston's document processing pipeline as proof of automation capability. |
| **What success looks like** | Manual process is automated. Hours saved per week are measurable. Client team is trained on the new workflow. Natural expansion into additional workflows. |

### Offer 3: Winston REPE Intelligence Platform — 90-Day Pilot

| Field | Detail |
|---|---|
| **Title** | Winston REPE Intelligence Platform — 90-Day Pilot |
| **Value prop** | AI-powered fund analytics, LP reporting, and portfolio intelligence — deployed against your actual data in 90 days |
| **Who it's for** | REPE funds ($500M-$5B AUM) with reporting bottlenecks, LP transparency demands, or analytics gaps |
| **Scope** | Winston environment configured for client's fund structure. Data ingestion from existing sources (Yardi, Excel, etc.). Core module deployment: fund analytics, asset performance, LP reporting, AI assistant. |
| **Deliverables** | 1) Configured Winston instance with client's fund/asset structure, 2) Automated data pipeline from existing systems, 3) AI-powered dashboards (portfolio rollup, fund performance, asset variance), 4) LP reporting templates, 5) Trained AI assistant with client's portfolio context, 6) ROI assessment at Day 90 |
| **Timeline** | 90 days (12 weeks) |
| **Pricing** | $35,000 pilot fee (credited toward annual subscription if client converts) |
| **Required inputs from client** | Fund structure and asset list. Historical financial data (quarterly, 2+ years). LP structure. Access to current reporting tools for integration. Internal champion for weekly check-ins. |
| **Proof points / demo** | Live Meridian Capital demo environment. Competitive positioning vs. Yardi/Juniper Square/Cherre. |
| **What success looks like** | Quarterly reporting time reduced by 50%+. LP questions answerable in minutes vs. days. At least 3 stakeholders actively using Winston weekly. Clear path to annual subscription. |

---

## 4. CRM Pipeline Structure

### Existing Infrastructure (Already Built)

The Novendor CRM is already enterprise-grade. Key tables and services:

**Core CRM:**
- `crm_account` — companies/prospects with account_type, industry, website
- `crm_opportunity` — deals with amount, expected_close_date, status, linked to account and pipeline stage
- `crm_pipeline_stage` — configurable stages with win_probability, stage_order, is_closed, is_won
- `crm_opportunity_stage_history` — full audit trail of stage transitions
- `crm_activity` — calls, meetings, emails, notes linked to accounts/opportunities
- `crm_contact` — contact records linked to accounts

**Consulting Revenue OS (CRO extension):**
- `cro_lead_profile` — consulting-specific scoring (ai_maturity, pain_category, lead_score, qualification_tier, estimated_budget, contact details)
- `cro_engagement` — active engagements with budget, actual_spend, margin_pct, status tracking
- `cro_proposal` — proposals with version history, pricing_model, margin calculation, acceptance flow
- `cro_outreach_template` — reusable outreach templates by channel with use_count/reply_count tracking
- `cro_outreach_log` — every outreach touch logged with channel, status, reply tracking
- `cro_strategic_outreach` — longer-horizon relationship-building outreach campaigns

**Backend services:** `crm.py`, `cro_leads.py`, `cro_engagements.py`, `cro_proposals.py`, `cro_outreach.py`, `cro_strategic_outreach.py`, `crm_metrics.py`

### Pipeline Stage Configuration for Revenue Program

Update default pipeline stages to match the revenue-backwards framework:

| Stage Key | Label | Order | Win Prob | Maps to Framework |
|---|---|---|---|---|
| `target` | Target Identified | 5 | 0.05 | Stage 2: Target Account Selected |
| `outreach` | Outreach Initiated | 10 | 0.10 | Stage 1: Motion Initiated |
| `qualified` | Qualified | 20 | 0.20 | Stage 3: Qualified Lead |
| `discovery` | Discovery | 30 | 0.35 | Stage 4: Discovery Call |
| `proposal` | Proposal | 40 | 0.50 | Stage 5: Proposal Sent |
| `negotiation` | Negotiation | 50 | 0.70 | Stage 6: Acceptance Pending |
| `closed_won` | Closed Won | 90 | 1.00 | Stage 7: Revenue Received |
| `closed_lost` | Closed Lost | 100 | 0.00 | Lost deal (capture reason) |

### Required CRM Hygiene Rules

1. **Every opportunity needs a next-step date.** No opportunity sits without `expected_close_date` or a scheduled `crm_activity`.
2. **Stage must advance or be explicitly stalled.** If an opportunity hasn't moved stages in 14 days, flag it in Monday pipeline review.
3. **Every discovery call gets a `crm_activity` with notes.** Capture: pain confirmed (Y/N), budget discussed (Y/N), decision-maker present (Y/N), next step agreed.
4. **Every proposal links to both `crm_opportunity` and `crm_account`.** No orphaned proposals.
5. **Outreach minimum: 5 touches before marking a lead cold.** Track via `cro_outreach_log` count.
6. **Lost deals require a reason.** Capture objection in `crm_activity` note when moving to `closed_lost`.
7. **Lead score auto-computed on creation.** `cro_lead_profile.lead_score` uses budget, pain urgency, AI maturity, and company size.

---

## 5. Target Account and Lead Generation Program

### Segment A: South Florida Mid-Market Operations

- **Why they're a fit:** Local proximity enables face-to-face. Mid-market (50-500 employees) big enough to pay, small enough to lack internal AI team. Operations-heavy = clear automation ROI.
- **Matched offer:** AI Operations Diagnostic ($7,500) → Workflow Sprint ($15,000) → Fractional CAIO ($5-10K/mo)
- **Proof they need:** Local references or case studies. Live demo of a workflow automation. "I met Paul at [event]" trust factor.
- **How to reach:** LinkedIn (Paul's content), local business events (Chamber, YPO, Vistage), referrals from existing network, workshops.
- **Promising signals:** New COO/VP Ops hire, "digital transformation" language on career page, complaints about manual processes in Glassdoor reviews, recent PE acquisition (new owners push for efficiency).

### Segment B: REPE Funds (National)

- **Why they're a fit:** Winston is literally built for them. Deep product-market fit. High deal values.
- **Matched offer:** Winston REPE Pilot ($35,000) or AI Diagnostic ($7,500) as entry point
- **Proof they need:** Live Meridian Capital demo. Competitive comparison showing what Yardi/Juniper Square can't do. Fund-level analytics Winston provides out of the box.
- **How to reach:** LinkedIn targeting (CFOs, COOs, Heads of Asset Management at PE/REPE firms). Conference attendance. Industry association membership. Cold outreach with demo video.
- **Promising signals:** New fund launch, new operating partner hire, LP reporting complaints (visible in fund letters or industry press), portfolio expansion (adding assets = more reporting complexity), Yardi contract renewal upcoming.

### Segment C: Professional Services / Legal / Healthcare Ops

- **Why they're a fit:** Document-heavy, process-heavy, compliance-heavy. Clear automation opportunities. Used to paying consultants.
- **Matched offer:** AI Diagnostic ($7,500) → Workflow Sprint ($15,000) focused on document processing, intake automation, or compliance workflows
- **Proof they need:** Document extraction demo. Before/after of a compliance workflow. ROI model for specific vertical.
- **How to reach:** Vertical industry events. Referrals from Paul's network. LinkedIn content targeting specific pain (e.g., "legal intake is broken").
- **Promising signals:** Hiring paralegals or ops staff (indicates scaling pain), compliance audit findings, EHR migration announcements, new practice area launch.

### Segment D: Workshop / Event Conversion Pipeline

- **Why they're a fit:** Lower barrier to entry. Social proof from group setting. Natural conversion path.
- **Matched offer:** Workshop ($200-500/seat) → AI Diagnostic ($7,500) for attendees → Sprint or Pilot for qualified
- **Proof they need:** Workshop content itself is the proof. Live demos during workshop.
- **How to reach:** Partner with local organizations (industry groups, coworking spaces, chambers of commerce). LinkedIn event promotion. Email list.
- **Promising signals:** Organization actively hosts events. Industry group looking for speaker/content. Local accelerator or incubator needs AI programming.

### Segment E: PE-Backed Companies in Transition

- **Why they're a fit:** New PE ownership means mandate for operational improvement. Budget exists. Timeline is urgent.
- **Matched offer:** AI Diagnostic ($7,500) → Workflow Sprint ($15,000) → Fractional CAIO ($5-10K/mo) if they need ongoing AI governance
- **Proof they need:** Experience with PE portfolio companies. Operational improvement playbook. Quick-win demonstration.
- **How to reach:** Track PE deal announcements (PitchBook, PE Hub, LinkedIn). Reach out 60-90 days post-acquisition (after the new team is in place but before the value creation plan is locked).
- **Promising signals:** Recent acquisition announcement, new C-suite hires at portfolio company, "operational excellence" language in PE firm's investment thesis.

---

## 6. Proof-Asset Program

Ranked by revenue impact (which deals can't close without this?) and urgency (can we sell without it today?).

### Tier 1: Must-Have Before First Sale (Build This Week)

| # | Asset | Type | Revenue Impact | Urgency | Location |
|---|---|---|---|---|---|
| 1 | AI Operations Diagnostic — 1-Page Offer Sheet | PDF | Enables Hypothesis A sales | CRITICAL | `docs/proof-assets/offer-sheets/ai-diagnostic.md` |
| 2 | AI Operations Diagnostic Questionnaire | Form/PDF | Core deliverable tool | CRITICAL | `docs/proof-assets/diagnostics/diagnostic-questionnaire.md` |
| 3 | Sample Diagnostic Output Report | PDF | Shows prospect what they'll get | HIGH | `docs/proof-assets/diagnostics/sample-output.md` |
| 4 | Lightweight Proposal Template | DOCX | Needed for any deal | HIGH | `docs/proof-assets/proposal-templates/standard-proposal.md` |
| 5 | Meridian REPE Demo — Friction Fix | Live environment | REPE sales blocked until demo works cleanly | HIGH | Tracked in `docs/env-tasks/meridian/` |

### Tier 2: Needed for Pipeline Velocity (Build Weeks 2-3)

| # | Asset | Type | Revenue Impact | Urgency |
|---|---|---|---|---|
| 6 | Workflow Sprint — 1-Page Offer Sheet | PDF | Enables Hypothesis B sales | MEDIUM |
| 7 | ROI Calculator — Workflow Automation | Spreadsheet/HTML | Justifies Sprint pricing to CFO | MEDIUM |
| 8 | Before/After Workflow Diagram (generic) | Visual | Makes automation tangible | MEDIUM |
| 9 | Winston REPE Pilot — 1-Page Offer Sheet | PDF | Enables Hypothesis C sales | MEDIUM |
| 10 | Competitive Positioning: Winston vs. Yardi vs. Juniper Square | PDF/HTML | REPE sales differentiation | MEDIUM |

### Tier 3: Acceleration Assets (Build Weeks 4-8)

| # | Asset | Type | Revenue Impact | Urgency |
|---|---|---|---|---|
| 11 | Case Study Narrative (first engagement) | PDF | Social proof for second sale | LOW (need first client) |
| 12 | Workshop Outline + Landing Page | HTML | Enables Hypothesis D | LOW |
| 13 | Fractional CAIO Scope Document | PDF | Enables Hypothesis E | LOW |
| 14 | Document Processing Demo Flow | Live demo | Proof for legal/healthcare vertical | LOW |
| 15 | Discovery Call Script | Markdown | Consistency in sales conversations | LOW |

---

## 7. Execution Scoreboard

Track these metrics weekly. The autonomous Friday revenue review task updates them.

### Leading Indicators (Activity)

| Metric | Week 1 Target | Week 4 Target | Week 8 Target | Tracking |
|---|---|---|---|---|
| Target accounts identified | 10 | 30 | 50 | `crm_account` WHERE account_type = 'prospect' |
| Outreach touches sent | 5 | 20 | 40 | `cro_outreach_log` count |
| LinkedIn posts published | 3 | 12 | 24 | `docs/linkedin-content/` count |
| Replies received | 1 | 5 | 10 | `cro_outreach_log` WHERE status = 'replied' |
| Discovery calls scheduled | 0 | 2 | 5 | `crm_activity` WHERE type = 'meeting' |

### Lagging Indicators (Revenue)

| Metric | Week 1 Target | Week 4 Target | Week 8 Target | Tracking |
|---|---|---|---|---|
| Qualified leads | 0 | 3 | 8 | `cro_lead_profile` WHERE qualification_tier IN ('hot','warm') |
| Discovery calls held | 0 | 2 | 5 | `crm_activity` WHERE type = 'call' AND completed |
| Proposals sent | 0 | 1 | 3 | `cro_proposal` WHERE status = 'sent' |
| Proposal value outstanding | $0 | $7,500 | $30,000 | SUM of `cro_proposal.total_value` WHERE status = 'sent' |
| Closed revenue | $0 | $0 | $7,500+ | `crm_opportunity` WHERE stage = 'closed_won' |

### Proof Asset Completion

| Metric | Week 1 Target | Week 4 Target | Week 8 Target |
|---|---|---|---|
| Tier 1 assets complete | 3/5 | 5/5 | 5/5 |
| Tier 2 assets complete | 0/5 | 3/5 | 5/5 |
| Demo environments clean | 0/1 | 1/1 | 1/1 |

---

## 8. Recurring Autonomous Task System

### Revenue-Specific Tasks (Already Created)

| Day | Task ID | Purpose | Inputs | Outputs | Cadence |
|---|---|---|---|---|---|
| Monday | `monday-pipeline-review` | Score pipeline, enforce hygiene, discover targets | CRM data, signal reports | `docs/revenue-ops/monday-pipeline-YYYY-MM-DD.md` | Weekly Mon 8 AM |
| Tuesday | `tuesday-proof-asset-builder` | Build one revenue-critical asset | Proof backlog (§6), pipeline context | Asset file in `docs/proof-assets/` | Weekly Tue 10 AM |
| Wednesday | `wednesday-outreach-push` | Draft outreach, manage sequences | Target list, CRM, templates | `docs/revenue-ops/wednesday-outreach-YYYY-MM-DD.md` | Weekly Wed 9 AM |
| Thursday | `thursday-demo-objection-cycle` | Fix demo friction, refine positioning | Demo health checks, objection log | `docs/revenue-ops/thursday-demo-YYYY-MM-DD.md` | Weekly Thu 10 AM |
| Friday | `friday-revenue-review` | Score the week, capture objections, reprioritize | All week's activity | `docs/revenue-ops/friday-review-YYYY-MM-DD.md` | Weekly Fri 4 PM |

### Revenue-Enhanced Daily Tasks (Updated)

| Task ID | Revenue Enhancement | Cadence |
|---|---|---|
| `sales-signal-discovery` | Now maps prospects to specific Novendor offers and feeds target account queue | Daily 4 PM |
| `linkedin-content-generator` | Now aligns content to active outreach targets, not generic thought leadership | Daily 9 AM |
| `demo-idea-generator` | Now ties demos to active deals and objections, not abstract features | Daily 2 PM |

### Which Records Each Task Updates

| Task | CRM Records Touched |
|---|---|
| monday-pipeline-review | `crm_opportunity` (stage hygiene), `crm_account` (new targets), `cro_lead_profile` (re-score) |
| tuesday-proof-asset-builder | None (produces files) |
| wednesday-outreach-push | `cro_outreach_log` (drafts), `cro_outreach_template` (new templates), `crm_activity` (follow-ups) |
| thursday-demo-objection-cycle | None (writes to docs/), feeds product backlog |
| friday-revenue-review | `crm_opportunity` (probability updates), scoreboard refresh |
| sales-signal-discovery | `docs/revenue-ops/target-account-queue.md` (append) |
| linkedin-content-generator | `docs/linkedin-content/` (produces posts aligned to pipeline) |

---

## 9. Weekly Operating Rhythm

### Monday: Pipeline + Target Review (8 AM)

- Review all open `crm_opportunity` records. Is every deal advancing or explicitly stalled?
- Enforce next-step hygiene: every opportunity must have a next action within 7 days.
- Read weekend signal reports. Add 2-3 new target accounts.
- Score and rank pipeline by weighted value (amount × win_probability).
- Decision: which 3 accounts get the most attention this week?

### Tuesday: Proof Asset + Offer Work (10 AM)

- Pick the highest-priority asset from §6 backlog that isn't built yet.
- Build it (autonomous task handles drafting, Paul reviews/refines).
- If no asset needed: refine existing offers based on Friday's objection log.

### Wednesday: Outbound / Follow-Up Push (9 AM)

- Draft personalized outreach for week's priority targets.
- Send follow-ups to anyone in active sequences (5-touch minimum enforced).
- Check LinkedIn engagement from this week's posts — anyone worth a DM?
- Log all touches in `cro_outreach_log`.

### Thursday: Demo + Objection Handling (10 AM)

- Read latest demo environment health checks.
- Fix top friction point that would embarrass us in a live demo.
- Review objection log from recent conversations.
- Update competitive positioning if new competitor intel arrived.
- Practice discovery call flow for any scheduled calls.

### Friday: Revenue Review + Reprioritization (4 PM)

- Score the week: outreach sent, replies, calls scheduled, proposals.
- Update scoreboard (§7).
- Capture any new objections, feature requests, or terminology from conversations.
- Feed product insights to Winston development backlog.
- Set Monday's top 3 priority accounts for next week.
- Write weekly summary to `docs/revenue-ops/weekly-summary-YYYY-MM-DD.md`.

---

## 10. Product-Feedback Loop into Winston

Every revenue activity produces intelligence that should improve the product. Here's the structured capture system.

### Capture Points

| Activity | What to Capture | Where It Goes |
|---|---|---|
| Discovery call | Objections, missing features, terminology, integration asks | `docs/revenue-ops/objection-log.md` (append) |
| Demo | Friction points, what impressed vs. confused the prospect | `docs/revenue-ops/demo-friction-log.md` (append) |
| Proposal | Scope items we can't deliver, features we promised | `docs/revenue-ops/scope-gap-log.md` (append) |
| Lost deal | Why we lost, what would have changed the outcome | `crm_activity` note on closed_lost opportunity |
| Workshop | Industry-specific requirements, common questions, terminology | `docs/revenue-ops/workshop-insights.md` (append) |
| Outreach | Which messages resonate (reply rate by template), which don't | `cro_outreach_template.reply_count` / `use_count` |
| Content | Which topics drive engagement and inbound | LinkedIn analytics → `docs/revenue-ops/content-performance.md` |

### Feedback Processing

The **Thursday demo-objection-cycle** task reads the logs above and:
1. Converts objections into competitive positioning updates
2. Converts missing features into feature cards for the autonomous coding session
3. Converts demo friction into environment health task priorities
4. Converts terminology into Winston's AI assistant training context

The **Friday revenue review** task:
1. Aggregates the week's feedback
2. Ranks product improvements by revenue impact
3. Writes prioritized items to `docs/revenue-ops/product-backlog-feed.md`
4. The autonomous coding session (3 PM daily) reads this as input alongside other feature sources

### ROI Feedback Loop

For every engagement that produces measurable results:
1. Capture baseline metrics (before)
2. Capture outcome metrics (after)
3. Package into case study narrative → `docs/proof-assets/` (Tier 3 assets)
4. Feed ROI data into proposal justification templates

---

## 11. Ranked Next-Actions for Immediate Execution

### This Week (March 25-28)

| Priority | Action | Owner | Deadline | Depends On |
|---|---|---|---|---|
| 1 | Draft AI Operations Diagnostic 1-page offer sheet | Tuesday proof-asset task + Paul review | Mar 26 | Nothing — start now |
| 2 | Draft the diagnostic questionnaire (15-20 questions) | Tuesday proof-asset task | Mar 26 | Nothing |
| 3 | Populate CRM with 10 target accounts (5 warm from network + 5 from signals) | Paul + monday-pipeline-review | Mar 25 | Signal reports exist |
| 4 | Send 5 warm outreach messages to people Paul already knows | Paul | Mar 26 | Offer sheet exists |
| 5 | Fix top 3 Meridian REPE demo friction points | meridian-coding task | Mar 27 | Health check identifies them |
| 6 | Create `docs/revenue-ops/target-account-queue.md` with initial 10 accounts | monday-pipeline-review | Mar 30 | Account research |
| 7 | Draft lightweight proposal template | Tuesday proof-asset task (week 2) | Apr 1 | Offer architecture done |
| 8 | Send first LinkedIn post explicitly aligned to an outreach target | Paul | Mar 26 | Content task generates it |

### Next Week (March 30 - April 4)

| Priority | Action |
|---|---|
| 1 | Follow up on all week-1 outreach (enforce 5-touch rule) |
| 2 | Build Workflow Sprint offer sheet |
| 3 | Build ROI calculator for workflow automation |
| 4 | Schedule first discovery call |
| 5 | Draft competitive positioning vs. Yardi/Juniper Square |
| 6 | Identify workshop host organization |

### Weeks 3-8 (April 7 - May 15)

| Milestone | Target Date |
|---|---|
| First discovery call held | April 7-11 |
| First proposal sent | April 14-18 |
| Workshop scheduled | April 21-25 |
| First revenue collected | May 1-15 |
| Pipeline value ≥ $30K | May 15 |

---

## Summary of What Was Created / Changed

| Item | Action | Location |
|---|---|---|
| Revenue Operating Program | Created | `docs/REVENUE_OPERATING_PROGRAM.md` (this file) |
| Revenue-ops directory | Created | `docs/revenue-ops/` |
| Proof-assets directory tree | Created | `docs/proof-assets/` (7 subdirectories) |
| Monday pipeline review task | Active | Scheduled task `monday-pipeline-review` |
| Tuesday proof-asset builder task | Active | Scheduled task `tuesday-proof-asset-builder` |
| Wednesday outreach push task | Active | Scheduled task `wednesday-outreach-push` |
| Thursday demo-objection cycle task | Active | Scheduled task `thursday-demo-objection-cycle` |
| Friday revenue review task | Active | Scheduled task `friday-revenue-review` |
| Sales signal discovery task | Updated | Now maps to offers, feeds target queue |
| LinkedIn content generator task | Updated | Now aligned to active pipeline targets |
| Demo idea generator task | Updated | Now tied to active deals and objections |
| Pipeline stages | Recommended update | See §4 — update via `crm.py` defaults |
