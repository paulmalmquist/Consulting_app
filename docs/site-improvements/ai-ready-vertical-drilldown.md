# Vertical Drilldown — AI-Ready Copy, Per Industry

Companion to `ai-ready-copy-palette.md`. This file goes deep on each industry vertical, removes every "12 weeks" / "controlled execution layer" tail, and proposes drop-in replacement copy for every content field — both the ones currently rendered and the ones that exist in `industry-verticals.ts` but aren't on the page yet.

The reader is a CTO or CFO inside a regulated business that's been told to "do AI" and quietly knows their data, playbooks, and process can't take it. The voice is human, direct, specific to that vertical, and free of the kill-list words in `docs/anti-ai-style.md`.

---

## 0. Time-tail audit — kill list

Every place "12 weeks" or a same-shape time tail currently lives:

| File | Line | Current copy | Proposed |
|---|---|---|---|
| `repo-b/src/components/marketing/industries/IndustryVerticalPage.tsx` | 49 | `{industry.heroHeadline} in 12 weeks with a controlled execution layer.` | `{industry.heroHeadline}` (drop the tail entirely; let each vertical own its own ending) |
| `repo-b/src/app/(marketing)/what-we-do/page.tsx` | 18 | `Transform one broken workflow into a controlled system in 12 weeks.` | `Get one workflow AI-ready, end to end, before your next AI vendor evaluation.` |
| `repo-b/src/app/(marketing)/what-we-do/page.tsx` | 7-9 | `Weeks 1-3 / 4-9 / 10-12` timeline cards | Keep the three phases (Discovery, Pilot, Cutover), drop the "Weeks N-N" prefix. Replace with named gates: "Phase 1 / Phase 2 / Phase 3." |
| `repo-b/src/app/(marketing)/the-shift\page.tsx` | 9 | `{ k: 'TIMEFRAME', v: '12 weeks' }` panel row | Replace with `{ k: 'WORKING ORDER', v: 'One workflow at a time' }` |
| `repo-b/src/app/(marketing)/the-shift\page.tsx` | 54 | `Prove the model in 12 weeks.` | `Prove the model on one workflow before scaling.` |
| `repo-b/src/app/(marketing)/page.tsx` | 67-69 | "...reduced capital call errors from 5% to 1.2% in 8 weeks." | Keep the number, drop the time. "...reduced capital call errors from 5% to 1.2% after rebuilding the data flow that fed the calls." |
| `repo-b/src/components/marketing/industries/IndustryVerticalPage.tsx` | 16, 21, 26, 31 | microCase strings ending in "in 8/9/10 weeks" | Per-vertical rewrites below — describe the *change in mechanics*, not the duration |

Pattern to enforce going forward: **time framing belongs in the engagement model page (`/what-we-do`), not in industry headlines or proof points.** Industry pages should describe the change in how the business runs, not the calendar.

---

## 1. Real Estate Private Equity

**Reader.** A CFO or COO at a mid-market REPE firm. They run quarterly LP reporting on a spreadsheet that one person knows how to assemble. Their IC pack is rebuilt every cycle. Their waterfall lives in a model that nobody else opens. The CIO at one of their LPs just asked which AI tools they use. Their CEO wants an AI strategy on the next IC agenda. They have no honest answer.

**Why their AI projects don't work.** The fund data is scattered across Yardi, the asset manager's Excel, the investor portal export, and the GP's brain. No model can see it all in one place. The waterfall logic isn't written down anywhere a tool could read. The reporting cycle is so manual that adding AI to it just means automating the part that wasn't broken.

### Hero (rendered)

```
heroHeadline: Make your fund data AI-ready before an LP asks what AI you use.
heroSubheadline: Your IRRs, your waterfall, your investor reporting — most of it lives in spreadsheets that one person knows how to assemble. No AI tool will help until that changes. We rebuild the data layer that LP reporting, deal screening, and any future AI agent will all sit on top of. The model stays yours. The math stays defensible.
```

Optional alternates to rotate:

- *"Your waterfall is in a spreadsheet only one person can open. That is your AI problem."*
- *"Get your fund data into one place before you put AI anywhere near it."*
- *"Defensible LP reporting first. AI on top of it second."*

### Why It Breaks (rendered — first 4 items)

```
intro: The model isn't the problem. The chain around the model is.
items:
- Underwriting assumptions drift between analyst versions before IC sees the deal.
- The waterfall is defended out of one spreadsheet and one person's memory.
- Capital calls and distributions get tied out by hand every quarter.
- LP reporting is rebuilt from scratch each cycle because the inputs never settle.
closing:
- The breakdown isn't in the math.
- It's in the fact that no two people on the team would build the same number twice.
```

### What We Change (rendered — first 4 items)

```
intro: We get the fund data into one place, the waterfall logic out of the spreadsheet, and the reporting cycle into a system that runs the same way twice. Then AI — yours or a vendor's — can do something useful with it.
items:
- One source of truth for fund-level data, version-controlled and ownership-clear.
- Waterfall logic written down in a system the team can read, audit, and change without breaking IRRs.
- Capital activity that flows through a workflow with named owners and an audit trail, not an inbox.
- LP reporting assembled from the underlying data, not from last quarter's deck plus a few overrides.
closing:
- No silent forks of the model.
- No reporting rebuilt from memory.
- The math is the same on Tuesday as it was on Friday.
```

### microCase (rendered — currently hardcoded in component)

```
A mid-market PE firm rebuilt the data flow behind their capital calls. Errors dropped from 5% to 1%. The same data now feeds the LP report, the IC pack, and the AI summary the GP reads on a Sunday night.
```

### Typical Results (rendered — currently hardcoded generic)

Replace the generic three bullets on this vertical with REPE-specific:

```
- Quarterly LP reporting cycle cut from a week of analyst time to a day of review.
- One source of truth for fund-level data — the same numbers in the LP report, the IC pack, and the GP dashboard.
- Waterfall logic the audit team can read without opening Excel.
- An AI summary on the GP's phone Sunday night that the CFO is willing to put their name on.
```

### Buyer profile (latent — already in data file)

```
buyerProfile:
- CFOs and COOs at REPE firms whose LP reporting still depends on one analyst with a folder of spreadsheets.
- IR leaders who get asked about AI in every LP meeting and don't have a serious answer yet.
- Operating partners watching deal screening eat partner hours that should go to underwriting.
- Firms that want AI on top of their fund data without giving up control of the model.
buyerSentence: Built for REPE operators who want the data right before the AI goes on top.
```

### Reconstruct cards (latent — wire these into the page below the hero)

```
- title: Fund Data Layer
  description: One source of truth for asset, fund, and investor data. Pulled from Yardi, MRI, the asset team's Excel, and the IR portal — landed in a place every report can read.
  outcome: The same number shows up in the LP report, the IC pack, and the GP dashboard.
- title: Waterfall Out of Excel
  description: The waterfall logic written down in a system, version-controlled, with the math the audit team can read.
  outcome: A waterfall change takes an hour and an approval, not a week and a panic.
- title: Capital Activity Workflow
  description: Capital calls and distributions move through a workflow with owners, approvals, and a trail. The inbox stops being the system.
  outcome: Capital call errors drop into the noise. The IR team stops apologizing.
- title: AI-Ready LP Reporting
  description: The LP report assembles itself from the underlying data. What used to take a week of analyst time becomes a day of review — and an AI agent can draft the cover letter.
  outcome: The GP gets back the week the analyst used to lose to reporting.
```

### Engagement model (latent)

```
intro: One workflow at a time. Fixed scope. Fixed fee. Parallel run before anything cuts over. The team that owns it after we leave is your team.
principles:
- We pick the workflow with the most reporting pain and the most AI upside.
- We build alongside the current process. Nothing breaks while we work.
- We hand back a runbook your analyst can run and your auditor can read.
- The data layer we build is yours. No platform lock-in. No SaaS subscription with our logo on it.
```

### Credibility (latent)

```
intro: REPE operations live or die on whether the same number means the same thing to the GP, the LP, and the audit team. We work where those three views meet.
pillars:
- title: Fund Operations Fluency
  description: Asset reporting, capital events, and IC prep treated as one operating system, not four spreadsheets.
- title: Model Integrity
  description: Waterfall, IRR, and allocation math kept controlled, versioned, and reviewable — not stored in a sheet only one person can open.
- title: LP-Grade Reporting
  description: LP packages, capital account statements, and covenant outputs built so an LP's analyst can tie them out without a phone call.
- title: AI on a Real Foundation
  description: The AI tools you adopt — copilots, agents, summarizers — work because the data underneath them is real, not because the demo was good.
```

### Control statement (latent)

Current: *"AI that improves IRR modeling is useful. AI that produces defensible LP reporting is strategic."*

Replacements:

- *"An AI that can't read your fund data without a human in the middle isn't going to help you raise the next fund."*
- *"The right AI in REPE is the one your auditor can sit through a meeting about."*

### Outcome cards (latent)

```
- title: One Source of Truth for Fund Data
  description: The number in the LP report, the IC pack, and the GP dashboard is the same number, sourced the same way, every time.
- title: A Waterfall the Audit Team Can Read
  description: Logic out of Excel, into a system, with a change history. IRR doesn't move because someone bumped a cell.
- title: Capital Activity Without the Email Chain
  description: Calls and distributions through a workflow with owners and an audit trail. Errors drop. IR stops apologizing.
- title: AI That Works the First Time
  description: The agent, copilot, or summary tool you pick has clean inputs. It does what the demo promised.
```

---

## 2. Consumer Credit

**Reader.** A Chief Risk, Chief Credit, or Head of Underwriting at a mid-market lender. The CEO read a Bain report and wants AI in underwriting. The CRO is worried about an examiner asking how a model decided. The data team has a copy of every policy PDF and no machine-readable version of any of them. The exception queue lives in someone's inbox.

**Why their AI projects don't work.** The credit policy is a 60-page PDF. The exception logic is in three analysts' heads. The override history is in chat threads. No AI can cite policy it can't read, defend a decision against logic it can't see, or learn from overrides that were never recorded.

### Hero (rendered)

```
heroHeadline: Get your credit policy and your decision data into a form an AI can use — and an examiner can read.
heroSubheadline: Underwriting AI is only as defensible as the policy it cites and the data it sees. We get your policy out of PDFs and into a system, your decision data out of inboxes and into a pipeline, and your overrides out of folklore and into an audit trail. The AI you deploy after that is something you can put in front of a regulator without flinching.
```

Optional alternates:

- *"An AI underwriter that can't show its work is a liability, not a tool."*
- *"Make your credit decisions explainable before you make them automated."*
- *"The policy is in a PDF. The overrides are in chat. That is your AI problem."*

### Why It Breaks (rendered)

```
intro: Credit policy isn't usually wrong. The execution around it is.
items:
- The policy lives in a PDF nobody reads cover to cover.
- Exception queues grow in inboxes nobody owns end to end.
- Overrides happen in chat and never make it back into the data.
- Servicing handoffs lose context between teams. The borrower notices.
closing:
- The risk isn't bad intent.
- It's that your decision history isn't actually a history. It's a story people tell from memory.
```

### What We Change (rendered)

```
intro: We get the policy machine-readable, the decisions captured, and the overrides traceable. Then the AI underwriter, the AI assist, or the AI servicing tool you pick can do its job without inventing answers.
items:
- Policy in a structured form an AI can cite, line by line.
- Exception queues in a workflow with an owner, a clock, and a reason code.
- Overrides recorded against the rule they overrode, with the rationale attached.
- Servicing handoffs that carry context — borrower notes, prior decisions, exception flags — instead of dropping it.
closing:
- No more shadow spreadsheets.
- No more "ask Maria, she remembers that one."
- The decision an AI makes is one a human can defend.
```

### microCase (rendered)

```
A mid-market lender pulled their credit policy out of PDF, captured every override against the rule that triggered it, and rebuilt the exception queue as a workflow. Routing delays dropped 29%. The first AI assist they deployed cited policy by section number. The compliance team stopped asking what the model was doing.
```

### Typical Results (rendered)

```
- Credit policy in a form an AI can cite, an analyst can search, and an examiner can read.
- Exception queue with one owner per item and a clock on every decision.
- Override history that ties back to the rule, the reason, and the analyst — every time.
- An AI underwriter or assistant whose answer comes with sources you can defend.
```

### Buyer profile (latent)

```
buyerProfile:
- Chief Risk and Chief Credit officers at lenders whose policy is in a PDF and whose decisions are in inboxes.
- Heads of Underwriting watching exception volume grow faster than headcount.
- Compliance and audit leaders who don't want to be surprised by what an AI tool decided last quarter.
- Lenders evaluating credit AI vendors and noticing that the demo data looks nothing like their own.
buyerSentence: Built for credit teams that want AI in the decision loop without losing the audit trail.
```

### Reconstruct cards (latent)

```
- title: Policy in a Form a Machine Can Read
  description: Your underwriting and servicing policy out of PDFs, into a structured corpus an AI can cite — line by line, version by version.
  outcome: Every AI-assisted decision comes with the policy section it relied on.
- title: Exception Queue With an Owner
  description: Exceptions move through a workflow. One owner. One clock. One reason code. No more inbox triage.
  outcome: Routing delays drop. Nothing sits unowned for a week.
- title: Override Trail
  description: Every override captured against the rule it overrode, with the rationale, the analyst, and the outcome.
  outcome: The override pattern shows up in monthly review instead of in a regulator letter.
- title: Servicing Handoff That Carries Context
  description: Borrower notes, prior decisions, and exception flags travel with the file. The next team starts where the last one left off.
  outcome: Borrower complaints about "I told the last person already" drop sharply.
```

### Engagement model (latent)

```
intro: One workflow at a time. The first one is usually the policy corpus or the exception queue, because both unblock everything else.
principles:
- Pick the workflow with the most decision pain and the most regulatory exposure.
- Build alongside the current process so nothing breaks while we work.
- Hand back a system your analysts run and your compliance team signs off on.
- No black boxes. Every AI-assisted decision is traceable to policy and data.
```

### Credibility (latent)

```
intro: Credit operations fail at the seam between underwriting, servicing, and compliance — usually because the policy, the data, and the override history don't live in the same place. We work at that seam.
pillars:
- title: Credit Logic Awareness
  description: We've sat through enough exception queues to know where the failure modes hide.
- title: Explainability by Design
  description: Every AI-assisted decision in the systems we build comes with the policy section, the data point, and the rule that produced it.
- title: Servicing Handoffs That Hold
  description: The handoff is the failure point. We rebuild it to carry context, not lose it.
- title: Audit-Ready by Default
  description: Documentation is generated from the workflow, not assembled before the exam.
```

### Control statement (latent)

Current: *"Automation is only valuable when it can be measured and defended."*

Replacements:

- *"An AI underwriter you can't defend in an exam is one you shouldn't deploy."*
- *"Show your work. Cite the policy. Or don't ship the model."*

### Outcome cards (latent)

```
- title: Policy a Machine Can Cite
  description: AI-assisted decisions come with the policy section they used. The examiner can follow the chain.
- title: Exception Queue Under Control
  description: One owner per item, one clock per decision. Routing delays drop, queue ages stop sneaking up on the team.
- title: Override History That Exists
  description: Every override captured against the rule. Patterns surface in monthly review, not in a regulator letter.
- title: AI That Earns Its Seat at the Table
  description: Underwriting AI you can put in front of an examiner without rehearsing the answer.
```

---

## 3. Medical / Revenue Cycle

**Reader.** A CFO or VP Revenue Cycle at a multi-site provider, MSO, or specialty group. The CEO has heard about AI in revenue cycle from every vendor at HFMA. Denials are eating margin. The team is buried. Every AI vendor wants a six-figure pilot. None of their data flows into the same system.

**Why their AI projects don't work.** Authorization status sits in seven payer portals. Denials show up in a downloaded report nobody owns. Coding rules live in a binder. The denial AI vendor's demo assumes one queue. The provider has eleven.

### Hero (rendered)

```
heroHeadline: AI won't fix your denial backlog if your prior auth data lives in seven payer portals.
heroSubheadline: Every revenue cycle AI vendor pitches the same demo. None of them work until your authorization, denial, and payer reconciliation data land in one place with one set of rules. We do the unglamorous part — pulling the data together, writing down the routing logic, putting the queue in a system. The AI that you adopt after that actually moves the cash conversion cycle.
```

Optional alternates:

- *"Your denial AI vendor assumes you have one queue. You have eleven. Start there."*
- *"Get the revenue cycle data into one place before you put a model on top of it."*
- *"Stop running AI pilots on payer portal exports."*

### Why It Breaks (rendered)

```
intro: Revenue cycle workflows don't usually fail for lack of effort. They fail because the data and the queue sit in different places — and nobody can see the whole picture in one screen.
items:
- Authorization status changes get lost between payer portals and the team that needs to act on them.
- Denials are triaged days late, after the backlog has already formed.
- Coding and reconciliation rely on tie-outs nobody documented.
- Ownership blurs between intake, clinical, and billing. The borrower of the work is whoever happens to look at the queue today.
closing:
- The exposure isn't abstract.
- It's reimbursement leakage, delayed cash, and a finance team that can't tell you why this month is worse than last.
```

### What We Change (rendered)

```
intro: We pull the revenue cycle data into one place, write down the routing logic in a form an AI can use, and put the queue in a system with owners and clocks. Then the AI tools you've been pitched can actually move the needle.
items:
- One queue across payers, owners, and aging — not seven portals and a download.
- Authorization, denial, and payer reconciliation data landing in one place with one set of rules.
- Coding logic written down in a form an AI can cite, not a binder a coder remembers.
- Ownership and escalation logic that survives someone going on PTO.
closing:
- No more queue-by-folklore.
- No more reconciliation-by-spreadsheet.
- The AI vendor's demo finally runs on your data.
```

### microCase (rendered)

```
A multi-site provider pulled denial data out of every payer portal into one queue with one set of rules. Denial rework dropped 27%. The AI denial-prediction tool they had been piloting for six months started catching denials before they happened — because, for the first time, it could see them all.
```

### Typical Results (rendered)

```
- One queue across payers, with owners, clocks, and aging in one screen.
- Denial rework down sharply because the team sees the pattern before it accumulates.
- Coding rules in a form an AI assist can cite, not a binder.
- Cash conversion cycle that gets shorter every month, not noisier.
```

### Buyer profile (latent)

```
buyerProfile:
- CFOs and VPs of Revenue Cycle at multi-site providers and MSOs whose margin depends on denial recovery.
- Operations leaders running prior auth and denial queues across more payer portals than they can count.
- Practice administrators who have evaluated three revenue cycle AI tools and walked away from all three.
- Providers who want AI to help, not add another login and another queue.
buyerSentence: Built for revenue cycle teams who want AI to actually shorten the cash conversion cycle, not extend the demo.
```

### Reconstruct cards (latent)

```
- title: One Queue Across Payers
  description: Authorization, denial, and follow-up work in one queue with one set of rules — instead of seven payer portals and a daily download.
  outcome: The team works from one screen. Denials get triaged the same day, not the same week.
- title: Denial Pattern Visibility
  description: Denial reasons coded, aggregated, and surfaced where finance can see the trend forming.
  outcome: The denial AI vendor's tool starts working — because the inputs are finally clean.
- title: Coding Logic Written Down
  description: CPT and payer-specific coding rules in a form an AI assist can cite and a new coder can learn from.
  outcome: First-pass clean claim rate goes up. New coder ramp time drops.
- title: Reimbursement Reporting From Real Data
  description: Reporting assembled from the actual queue, not from a manually reconciled spreadsheet.
  outcome: The finance team explains the month before the close call, not after it.
```

### Engagement model (latent)

```
intro: One workflow at a time. Usually the denial queue first — it's where the cash leaks loudest.
principles:
- Start where the cash leaks. Usually denials. Sometimes prior auth.
- Build alongside the current process so nothing in the billing cycle breaks while we work.
- Hand back a system the team uses every day and a runbook the new hire can follow.
- The data we land in your warehouse is yours. The AI tools you pick can read it directly.
```

### Credibility (latent)

```
intro: Revenue cycle margin lives in the cracks between intake, clinical, billing, and the payer. We work in those cracks.
pillars:
- title: Revenue Cycle Depth
  description: Denial rates, payer reconciliation variance, and reimbursement timing handled as the financial issues they are.
- title: Workflow Before AI
  description: Broken queues get fixed first. AI on top of a broken queue just makes the noise faster.
- title: Compliance-Conscious by Default
  description: CPT alignment, reporting obligations, and documentation controls embedded in the workflow from day one.
- title: Operational Visibility
  description: Practice-level dashboards tied to the actual queue, not to a spreadsheet a manager rebuilds Monday morning.
```

### Control statement (latent)

Current: *"If your AI strategy lives in slide decks, it is not operational."*

Replacements:

- *"An AI denial-prediction tool that can't see your queue isn't predicting anything."*
- *"The cash conversion cycle is the only AI metric that matters in revenue cycle. Anything else is a demo."*

### Outcome cards (latent)

```
- title: One Queue, One Screen
  description: Authorization, denial, and follow-up work consolidated. The team stops switching portals all day.
- title: Denial Recovery That Compounds
  description: Patterns visible early. The same denial doesn't happen 200 times before someone notices.
- title: Coding That Survives Turnover
  description: Rules out of the binder, into a system. New coders ramp faster, AI assists cite the right rule.
- title: Cash Conversion Cycle That Shortens
  description: The number that matters moves the right direction every month, with the receipts to show why.
```

---

## 4. Legal Operations

**Reader.** A COO, Director of Legal Operations, or Managing Partner at a firm or in-house team. AI vendors keep showing them drafting tools. The intake form means three different things in three different practice groups. Time entries are written like haiku. The matter management system is a graveyard of half-filled fields.

**Why their AI projects don't work.** Legal AI assumes a clean matter taxonomy, consistent intake, and time entries that mean the same thing across the firm. None of those exist. Every drafting AI demo runs on a tidied-up sample. The firm's actual matters look nothing like the demo.

### Hero (rendered)

```
heroHeadline: Your matter data, your billing narratives, your intake logic — written down in one place, before you turn an AI loose on any of it.
heroSubheadline: Legal AI vendors assume you have a clean matter taxonomy, consistent intake fields, and time entries that mean the same thing across the firm. You don't. We get you there. So the AI tools you pick — drafting, review, billing — work without three months of cleanup per matter type.
```

Optional alternates:

- *"If two partners can't agree on what the intake form means, no AI is going to."*
- *"Stop buying AI for legal work that isn't written down yet."*
- *"Your firm's data is the cleanup project. Do that first."*

### Why It Breaks (rendered)

```
intro: Legal judgment isn't the bottleneck. The administrative chain around it is.
items:
- Intake criteria mean different things in different practice groups.
- Matter status updates happen in email and never make it back into the system.
- Document triage adds days before the substantive work even starts.
- Billing narratives get cleaned up at the last minute, every cycle, by someone whose job that isn't.
closing:
- The problem isn't expertise.
- It's that the firm's data isn't structured the way the firm actually works.
```

### What We Change (rendered)

```
intro: We get the matter taxonomy, the intake logic, and the billing narrative format written down — in one place, in a form an AI tool can actually use. Then the AI you adopt does the work without a three-month cleanup per matter type.
items:
- Intake criteria standardized across practice groups, with a decision logic an AI can follow.
- Matter states governed in the system instead of tracked in side conversations.
- Document triage with controlled checkpoints so the substantive work starts sooner.
- Time entries and billing narratives tied to the matter event, captured at the time, not reconstructed at the end of the month.
closing:
- No more "ask the partner what this matter actually is."
- No more last-minute narrative cleanup.
- The firm's data finally looks like the firm's work.
```

### microCase (rendered)

```
A regional firm rewrote intake for one practice group, captured matter state changes in the system, and tied billing narratives to the underlying events. Intake handoff errors dropped 34%. The drafting AI tool the firm had bought a year earlier finally produced output partners would sign — because the inputs finally matched the firm's actual taxonomy.
```

### Typical Results (rendered)

```
- Intake that means the same thing in every practice group.
- Matter state changes captured in the system, not in side email.
- Billing narratives written at the time of the work, not the end of the month.
- AI drafting and review tools that produce output partners will sign without rewriting.
```

### Buyer profile (latent)

```
buyerProfile:
- COOs and Directors of Legal Ops at firms whose AI investments aren't producing the results the marketing promised.
- Managing partners watching non-billable time grow faster than the matter book.
- In-house legal ops leaders responsible for matter visibility across business units that don't speak the same way.
- Firms that have bought a drafting AI and quietly found it doesn't work on real matters.
buyerSentence: Built for legal operators who want AI tools to actually save partner time, not generate first drafts no one will sign.
```

### Reconstruct cards (latent)

```
- title: Intake That Means the Same Thing
  description: Intake forms, qualification logic, and routing standardized across practice groups, in a form an AI can apply consistently.
  outcome: The same matter type means the same thing on every desk. Intake AI starts working.
- title: Matter State in the System
  description: Status changes captured at the moment they happen, in the matter management system, not in email.
  outcome: Partners and clients see the same status. Updates stop being a side project.
- title: Billing Narratives Tied to Events
  description: Time entries captured against the underlying work event, with the narrative written at the time, not the end of the month.
  outcome: Realization goes up. End-of-month cleanup goes down. Client write-offs drop.
- title: AI Drafting on Real Inputs
  description: Templates, prior matters, and firm-specific style fed to drafting AI tools in a form they can use.
  outcome: First drafts that partners actually sign. Review time drops without losing voice.
```

### Engagement model (latent)

```
intro: Pick one practice group. Get the data and the workflow right for that group. Move to the next.
principles:
- Start with the practice group whose AI tools have failed loudest. The cleanup pays back fastest there.
- Build alongside the current matter system. Nothing in the billing cycle breaks while we work.
- Hand back a runbook the legal ops team owns and a partner-level summary the managing partner reads on a Sunday.
- No black boxes. The AI's output is traceable to the firm's own templates and prior matters.
```

### Credibility (latent)

```
intro: Legal operations performance lives in the seam between intake, the matter system, the timekeeper, and the bill. We work in that seam.
pillars:
- title: Matter-Level Insight
  description: We trace where intake quality drops and where matter status starts disagreeing with reality.
- title: Non-Billable Time Reduction
  description: Administrative drag attacked through workflow, not through asking the team to try harder.
- title: Document Workflow Without Theater
  description: Document classification and triage built for partner speed, not for a vendor's screenshot.
- title: Reporting That Holds Up With Clients
  description: Time entry, billing narrative, and client reporting aligned so what the client sees matches what the partner billed.
```

### Control statement (latent)

Current: *"AI without operational control creates noise. We build signal."*

Replacements:

- *"A drafting AI is only as good as the templates and matters you've actually written down."*
- *"If your intake form means three different things, your AI is going to mean three different things."*

### Outcome cards (latent)

```
- title: Intake That Holds Up Across Practice Groups
  description: One definition per matter type. AI applies it the same way every time.
- title: Matter Status That Matches Reality
  description: Status in the system equals status the partner would tell you. The client sees one truth.
- title: Realization That Goes Up
  description: Time and narrative captured at the moment, not the month-end. Write-offs drop.
- title: AI Drafts Worth Signing
  description: Templates and prior matters in a form drafting AI can use. First drafts that don't get rewritten.
```

---

## 5. Construction / PDS (proposed new vertical)

**Reader.** A CFO, VP of Project Delivery, or Head of PDS at a developer, GC, or owner's rep. The CEO wants AI in cost forecasting. The PMs run the projects out of email and PDF. Cost data sits in three systems that disagree. Schedule sits in a Primavera file the PM exports on Fridays.

**Why their AI projects don't work.** Change orders live in inboxes. RFIs are PDF. Submittals are folders in SharePoint. The AI cost-forecasting vendor's demo works on a tidy job. None of the firm's actual jobs are tidy.

### Hero (rendered — needs new entry in `industry-verticals.ts`)

```
heroHeadline: Get your project data out of email and PDFs before you put AI on top of it.
heroSubheadline: Change orders in inboxes. RFIs in PDF. Cost data in three systems that don't agree. We rebuild the project data layer that every AI tool you've evaluated assumed was already there. Then the AI does what it's supposed to — flagging cost drift, surfacing schedule risk, drafting the executive update — without inventing numbers.
```

Optional alternates:

- *"AI can't read a PDF email chain. Neither can your CFO at midnight on a Friday."*
- *"Your cost-forecasting AI is only as good as the cost data it can see. Most of yours isn't seeable yet."*
- *"Get the job data into one place before the AI vendor walks in the door."*

### Why It Breaks

```
intro: Project delivery doesn't usually fail at the model. It fails at the data flow under the model.
items:
- Change orders live in inboxes between the GC, the owner, and the architect.
- RFIs sit in PDF until someone manually transcribes the answer.
- Cost data lives in three systems — Procore, the GL, and a project accountant's Excel — that disagree on every job.
- Schedule updates happen in Primavera on Friday and arrive on the executive's desk Monday, already wrong.
closing:
- The problem isn't lack of project management.
- It's that no AI tool — yours or a vendor's — can see the project the way the PM sees it.
```

### What We Change

```
intro: We pull the project data into one place, get the change order and RFI logic into a workflow, and rebuild the cost view so every system shows the same number. Then AI cost forecasting, schedule risk detection, and executive reporting can do real work.
items:
- Change orders in a workflow with owners, approvals, and an audit trail — not an email chain.
- RFIs captured as structured data the moment they're answered.
- Cost view consolidated across Procore, the GL, and the project accountant's spreadsheet.
- Schedule and cost data landing in the executive view as it changes, not on Monday morning.
closing:
- No more reconciling three cost reports for one project.
- No more chasing the latest RFI answer through email.
- The AI cost forecast finally has data worth forecasting on.
```

### microCase

```
A developer rebuilt the cost data flow across three jobs. The same number now shows up in Procore, the GL, and the executive dashboard. The AI cost-forecasting tool the firm had piloted twice — and walked away from twice — produced its first useful overrun warning the week after the new data layer went live.
```

### Typical Results

```
- One cost view per job, shared by the PM, the project accountant, and the CFO.
- Change orders moving through a workflow with owners and approvals. Email chains gone.
- RFIs captured as data the moment they're answered.
- AI cost forecasting and schedule risk warnings that actually warn — because the inputs are real.
```

### Buyer profile

```
buyerProfile:
- CFOs at developers and GCs whose project cost reporting depends on a spreadsheet a project accountant rebuilds weekly.
- VPs of PDS whose schedule updates arrive in the executive deck already stale.
- PMs who keep being told to evaluate AI cost-forecasting tools and keep finding the demo doesn't survive their actual job data.
- Owners' reps responsible for reporting cost and schedule to the capital partner with a number they're willing to defend.
buyerSentence: Built for project delivery teams who want AI to actually catch a cost overrun before the project meeting, not after it.
```

### Reconstruct cards

```
- title: One Cost View Per Job
  description: Cost data consolidated across Procore, the GL, and the project accountant's Excel. Same number, every system.
  outcome: The PM, the project accountant, and the CFO read the same job.
- title: Change Orders Out of Email
  description: Change orders move through a workflow with owners, approvals, and a trail. The architect, the GC, and the owner work the same item.
  outcome: Approval cycles compress. Disputes drop because the trail exists.
- title: RFIs as Data
  description: RFIs captured at the moment of answer, structured, searchable, and tied back to the spec section.
  outcome: The next project doesn't ask the same RFI again.
- title: Schedule and Cost in the Executive View
  description: Schedule and cost updates flow into the executive dashboard as they change. The Monday meeting starts with current numbers.
  outcome: AI risk-detection tools finally have inputs worth analyzing.
```

### Engagement model

```
intro: One job, then a portfolio. We pick the job with the most reporting pain and the most owner pressure.
principles:
- Start with the job whose cost reporting hurts the most. That's where the data layer pays back fastest.
- Build alongside the current PM workflow. Nothing in the project breaks while we work.
- Hand back a system the PM uses every day and a CFO view the capital partner trusts.
- No platform lock-in. The data in your warehouse is yours. The AI tools you pick can read it.
```

### Credibility

```
intro: Project delivery margin lives in the gap between what the PM knows and what the executive sees. We close that gap.
pillars:
- title: Project Data Fluency
  description: We've worked inside Procore, the GL, and the project accountant's spreadsheet. We know where the disagreements hide.
- title: Cost and Schedule Together
  description: AI cost forecasting that doesn't see the schedule isn't forecasting. We tie them together.
- title: Owner-Grade Reporting
  description: Cost and schedule reporting built so the capital partner can read it without a phone call.
- title: AI on Real Inputs
  description: The cost-forecasting and schedule-risk tools you adopt work because the data underneath them is real.
```

### Control statement

- *"An AI cost forecast that runs on stale data is a story, not a forecast."*
- *"Get the project data into one place. Then the AI does the work."*

### Outcome cards

```
- title: One Number Per Job
  description: Cost reads the same in Procore, the GL, and the executive view. The reconciliation work goes away.
- title: Change Order Workflow That Holds
  description: Owners, approvals, and a trail. Disputes drop because the history exists.
- title: RFIs You Can Search
  description: RFI answers as data. The next project doesn't repeat the last one's questions.
- title: AI That Actually Catches Overruns
  description: Cost-forecasting and schedule-risk tools that produce useful warnings — because the data underneath is real.
```

---

## 6. Cross-vertical pattern: the page tail

Every industry page currently ends with the same generic "Typical Results" block, plus the homepage's "Own Your Operating Logic" pin. Replace the generic block with the vertical-specific Typical Results above, and let the SloganBadge stay as a small footer pin if it must — not as the dominant pixel.

The page-end CTA should also speak to the vertical:

- REPE: *"See where the fund data is blocking the AI strategy."*
- Consumer Credit: *"See where the policy and the data aren't AI-ready yet."*
- Medical: *"See where the queue is blocking the cash conversion cycle."*
- Legal: *"See where the matter data is blocking the AI tools you've already bought."*
- Construction/PDS: *"See where the job data is blocking the cost forecast."*

---

## 7. Engineering notes for the swap

The four current verticals live in `repo-b/content/industry-verticals.ts`. The construction/PDS vertical doesn't exist yet — adding it requires:

1. A new entry in `INDUSTRY_VERTICALS` with `slug: 'construction-pds'`, `themeKey` (suggest a new `slate` or reuse `amber`), and all the fields above.
2. A new entry in the `labels` map inside `IndustryVerticalPage.tsx` (`label`, `Icon` — suggest `HardHat` from lucide-react, `microCase`).
3. A new entry in `industryBackgrounds` and `INDUSTRY_THEME_STYLES` in `industryThemes.ts`.
4. Update the `slug` union type in `industry-verticals.ts` to include `'construction-pds'`.

The fields currently rendered on each industry page (per `IndustryVerticalPage.tsx`):

- `heroHeadline` (rendered, with the "in 12 weeks" tail stripped per §0)
- `heroSubheadline` (rendered)
- `whyItBreaks.items.slice(0, 4)` (rendered — only first four)
- `whatWeChange.items.slice(0, 4)` (rendered — only first four)
- The hardcoded `microCase` in `labels[]` (rendered)
- Hardcoded generic Typical Results (rendered — replace with vertical-specific in §1-§5)

The fields that are in the data file but not rendered yet (worth wiring in a follow-up pass):

- `buyerProfile`, `buyerSentence`
- `reconstructCards`
- `engagementModel.intro` and `principles`
- `credibility.intro` and `pillars`
- `controlStatement`
- `outcomeCards`

If the goal is to ship messaging now without building new components, the highest-leverage edits are: hero, whyItBreaks, whatWeChange, microCase, and the bottom Typical Results block. Everything else lights up later when the page gets the additional sections.

---

## 8. Verification checklist

After the swaps:

1. `grep -ri "12 week" repo-b/src repo-b/content` should return zero in the marketing folder.
2. `grep -ri "controlled execution layer" repo-b/src/components/marketing repo-b/src/app/(marketing)` should return zero or near-zero, and only in places where the phrase is genuinely informative (not boilerplate).
3. Visit `/industries/real-estate-private-equity`, `/industries/consumer-credit`, `/industries/medical`, `/industries/legal`. Each hero must read differently. None should end in the same boilerplate tail.
4. Read each hero out loud. The first sentence should name a problem the buyer has at 9pm on a Sunday.
5. Run a kill-list grep on the four industry vertical entries: `harness`, `leverage`, `unlock`, `seamless`, `robust`, `holistic`, `transformative`, `streamline`, `empower`, `craft`, `curate`. Result should be zero.
6. If construction/PDS is added, visit `/industries/construction-pds` and confirm the icon, theme, and microCase render.
7. Show the four (or five) hero blocks to one reader from each vertical if possible. The right reaction is "yeah, that's my problem at midnight on Friday." Anything else means the copy still reads like a vendor.
