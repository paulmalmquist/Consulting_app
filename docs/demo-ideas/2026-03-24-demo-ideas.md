# Winston Demo Ideas — 2026-03-24 (Tuesday)

*Generated from: Daily Intel 2026-03-24 + Competitor Research 2026-03-23 + Capability Inventory + Special Servicing Market Signal*

**Context driving today's demos:**
- Anthropic's remote computer control / Dispatch shipping validates agentic UI as enterprise standard — Winston's copilot + MCP architecture is the REPE application of this pattern
- Meta mandating Claude-powered agents in performance reviews — signals enterprise adoption of AI agents moving from optional to required in 2026
- Governance + security becoming a buying criterion — Winston's MCP permission model and audit policy are now table-stakes differentiators
- Special servicing rate hit 11.13% in February (second-highest since GFC) — direct signal for Debt Surveillance and covenant tracking use cases
- Juniper Square JunieAI + Tenor Nia integration now live — Winston needs to counter with private credit + document workflow automation demos
- ARGUS Intelligence portfolio scenario release — Winston's Monte Carlo + stress testing depth is the counter-demo

**Demos excluded (covered in last 3 days):** Scenario Stress Testing (Mar 23), Document Pipeline (Mar 23), IRR Scenario Library (Mar 23), AI Deal Scoring Pipeline (Mar 22), Capital Projects Draw Audit (Mar 22), CRM Intelligence (Mar 22), LP Waterfall Letter (Mar 20), Portfolio Digest (Mar 19)

---

### Demo 1: Debt Surveillance Dashboard — Real-Time Loan Covenant Health Across the Portfolio

**Tagline:** Your loan book is under stress. Winston monitors every debt covenant in real-time, flags which assets are at risk of breach, and surfaces refinance urgency before your lender calls.

**Target persona:** Chief Financial Officer / Portfolio Manager (debt-focused)

**Problem it solves:** Special servicing rates hit 11.13% in February — the second-highest level since the GFC. This is a live market signal: distressed assets are spiking, refinance rates are elevated, and covenant breaches are becoming a material risk. Most REPE firms monitor debt covenants manually — pulling loan docs, calculating compliance metrics quarterly, and hoping nothing breaks between quarter-ends. A $5B portfolio with 200+ loans means tracking 800+ covenant metrics manually. One missed calculation = loan acceleration or default. Winston's Debt Surveillance module monitors every loan continuously: tracks interest coverage ratio, debt service coverage ratio, loan-to-value, leverage multiples, and custom covenants. When an asset's financials deteriorate, Winston flags the covenant margin, estimates time to breach, and surfaces refinance urgency — with a side-by-side comparison: "At current rent growth trajectory, you breach your ICR covenant in 18 months unless you refinance at rates below 4.5%."

**Demo flow (8 steps):**
1. Open Portfolio Analytics — show loan book summary: 200 loans, $3.2B outstanding, blended weighted-average interest rate 4.3%, covenant cushion by loan (green/yellow/red)
2. Filter to "loans at risk" — show 12 loans with covenant margin <15% (colored red), 28 loans with margin 15-30% (yellow)
3. Click on a red-zone multifamily loan (Class B office in Denver, $28M, 65% LTV, deteriorating occupancy) — show the Debt Surveillance dashboard
4. Display current covenant status: Interest Coverage Ratio 1.8x (covenant floor: 1.25x; margin 0.55x = 30% cushion), DSCR 1.2x (covenant floor: 1.15x), LTV 68% (covenant floor: 70%)
5. Open the covenant trajectory chart — show historical ICR trend (down 0.4x over last 12 months due to rent decline), project forward 24 months assuming current rent trajectory: ICR falls to 1.3x (breaches covenant in ~18 months)
6. Point out refinance scenarios: *"If you refinance today at 5.2%, you reset the loan term and lower the interest expense; ICR improves to 2.1x and you get 8+ years of cushion. If you wait 12 months for rates to fall, you're at covenant breach risk."*
7. Open Winston AI chat: *"Show me which of my top 10 highest-leverage assets are most at risk of covenant breach in the next 24 months if rates stay elevated and rent growth stays flat. Which ones should I refinance proactively?"* — Winston analyzes the full portfolio's loan book, stress-tests against multiple rate/rent scenarios, and returns a prioritized refinance list
8. Ask: *"For my top 3 refinance candidates, what leverage level and interest rate environment gets me back to a 2.0x+ ICR floor?"* — Winston calculates the refinance parameters required and surfaces lender availability by rate level

**Winston capabilities shown:**
- Debt Surveillance module (loan monitoring, rate sensitivity analysis) — deployed
- Covenant tracking and breach probability modeling — deployed
- Portfolio loan aggregation and covenant roll-up — deployed
- Rate sensitivity analysis with multiple scenarios — deployed
- AI-driven "what-if" refinance analysis triggered from chat
- Real-time covenant margin tracking across 200+ loans

**The "wow moment":** A CFO opens the Debt Surveillance dashboard and immediately sees that 3 of 12 red-zone loans will breach covenants in 12–18 months at current rent trajectories. Instead of waiting for quarterly covenant reports from the lender (when it's too late), Winston flags the risk 12 months early and surfaces the refinance parameters needed to prevent breach. This is institutional-grade debt risk management that competitors like Juniper Square's Tenor Nia (loan agreement OCR) doesn't touch.

**Data needed:** Loan book with 40+ seeded loans, covenant terms, historical financial data (exists — REPE fund data seeded). Debt Surveillance module (deployed). Rate sensitivity analysis (deployed).

**Build status:** READY — Debt Surveillance (loan monitoring, rate sensitivity), covenant tracking, portfolio loan aggregation, and AI integration are all deployed per Capability Inventory. No code changes needed.

**Sales angle:** Special servicing rates at 11.13% (second-highest since GFC) = market signal. Most REPE firms are undermonitoring debt risk until covenants are near breach. Winston gives you 12 months of early warning + refinance prescriptions. Counter Juniper Square's Tenor Nia (which automates loan agreement parsing) with a forward-looking use case: "Tenor reads your loan docs once. Winston monitors your loan risk continuously and tells you when to act before breach."

---

### Demo 2: Private Credit Loan Underwriting — Automated Decisioning for Non-QM Deal Flow

**Tagline:** You source a $50M loan opportunity. Winston evaluates it against your credit policy in 90 seconds, flags underwriting exceptions, and surfaces approval recommendation with risk factors.

**Target persona:** Chief Credit Officer / Head of Underwriting (credit-focused PE firm)

**Problem it solves:** Juniper Square's Tenor acquisition added private credit OCR + workflow automation to their platform. Winston's credit decisioning engine is deployed but underutilized for the private credit use case. A $500M+ credit fund receives 15–20 loan opportunities per month; most are non-QM, sponsor-intensive, or cross-border deals that don't fit standard credit metrics. Today, a credit underwriter manually evaluates each deal: reads the loan package, calculates key metrics (LTV, DSCR, sponsor net worth, collateral value), and compares against the fund's underwriting policy (e.g., "max 70% LTV, min 1.2x DSCR, sponsor net worth >$50M"). This process takes 2–4 hours per deal. Winston's credit decisioning engine can accelerate this: upload the loan package (offering memo + financial statements), Winston's extraction pipeline pulls key data, the decisioning engine evaluates against policy, flags any exceptions (e.g., "LTV 72% exceeds policy max of 70%"), and surfaces an approval recommendation with confidence levels. This is not a replacement for human underwriting — it's a speed layer that gets a human underwriter to the policy exception in 90 seconds instead of 2 hours.

**Demo flow (7 steps):**
1. Open the Credit Decisioning module — show recent loan decisions (40 approvals, 8 exceptions, 2 declines)
2. Click "New Credit Case" — upload a sample loan package (acquisition financing for commercial real estate: $50M loan, 3-year term, 6.5% rate, construction guarantee)
3. Winston extracts key data from the loan package: LTV 65%, DSCR 1.35x, sponsor net worth $200M, collateral type "office complex, Class B, secondary market"
4. Show the policy evaluation: compare extracted metrics against fund underwriting policy (max LTV 70%, min DSCR 1.2x, min sponsor net worth $25M, collateral approval list includes "office Class B")
5. Display the decisioning output: "Recommendation: APPROVE" — all metrics within policy, no exceptions, confidence 94%
6. Open a second loan case with an exception (sponsor net worth $18M, below policy floor of $25M) — show the exception flag and manual review workflow
7. Ask Winston AI: *"Show me the risk factors for approving loans with sponsor net worth below policy. What's the default rate correlation?"* — Winston analyzes historical credit cases, shows exception approvals that defaulted vs. performed, and surfaces risk intelligence to inform the underwriting committee

**Winston capabilities shown:**
- Credit decisioning engine (policy evaluation, risk assessment, decision generation) — deployed
- Document extraction (OCR, text parsing, custom profiles) — deployed
- Loan case management with exception tracking — deployed
- Policy rule evaluation engine — deployed
- Historical default/performance analysis by exception type
- AI-driven risk intelligence from historical cases

**The "wow moment":** A credit officer uploads a new loan package and gets an instant decisioning recommendation in 90 seconds instead of waiting 2 hours for manual review. The system flags exactly which policy exceptions (if any) require committee approval, and surfaces historical performance data on similar exceptions. This is institutional-grade credit decisioning that Tenor's OCR-to-workflow automation doesn't touch.

**Data needed:** Credit policy rules (can be configured per fund). Sample loan packages (can seed with synthetic OM PDFs). Historical credit cases with default/performance outcomes (can seed). Credit case schema (deployed).

**Build status:** READY — Credit decisioning engine (policy evaluation, decision generation), document extraction, loan case management, and exception tracking are all deployed per Capability Inventory. No code changes needed.

**Sales angle:** Direct counter to Juniper Square's Tenor Nia (loan agreement OCR). Message: "Tenor automates the extraction of loan terms. Winston automates the underwriting decision and flags policy exceptions. If you're making $500M+ in credit decisions, you need decision intelligence, not just data extraction." Especially relevant for distressed / non-QM / specialty credit funds where policy exceptions are common.

---

### Demo 3: AI Governance Audit Trail — Who Did What, When, and Why (Compliance + AI Transparency)

**Tagline:** Your audit committee asks: "Who approved this $100M acquisition? What was the decision logic?" Winston shows the exact AI prompts, model choices, and human approvals in a tamper-proof audit trail.

**Target persona:** Chief Compliance Officer / Audit Committee / GPs at regulated funds

**Problem it solves:** Governance and security are becoming buying criteria for enterprise AI (AWS + SailPoint partnership, Nudge Security 80% over-permission finding). Regulated REPE funds (especially those with LP audit rights or institutional LPs requiring AI transparency) need a clear audit trail for AI-assisted decisions. When a fund uses Winston to evaluate a deal (AI generates a scoring recommendation), approve a loan (AI flags policy exception), or forecast portfolio outcomes (AI stress-tests assumptions), there's a compliance question: "What was the AI's reasoning? What data did it use? Who approved overriding the AI recommendation?" Today, this is invisible — the AI makes a suggestion, a human approves or rejects, and there's no trace of the AI's logic. Winston's audit policy captures: prompt sent to the AI, model selected (Claude 3.5, GPT-4), response generated, context used, human override (if any), and decision timestamp. For a $100M acquisition deal where the AI scored it as "avoid" but a partner approved it anyway, the audit trail shows: "AI: 'High market risk, low acquisition history for this asset class' | Model: Claude 3.5 | Partner override: approved | Reason: Strategic fit with existing portfolio | Timestamp: 2026-03-24 2:15 PM."

**Demo flow (6 steps):**
1. Open a recent $100M acquisition deal — show deal detail with AI recommendation: "Score: 6.2/10 (Conditional Proceed), IRR forecast: 9.8%"
2. Click "Audit Trail" — show the timeline of decisions: AI analysis (timestamp), human review (partner name), decision (approve/decline), actual override reason (if any)
3. Expand the AI analysis step — show the exact prompt sent to Winston: *"Evaluate this multifamily acquisition in Denver. Key metrics: 150 units, $28M price, 5.0% cap rate, B tenant profile. Compare against our acquisition strategy: [fund constraints]. What's your risk assessment?"*
4. Show the AI response stored in audit trail (truncated): "Positive factors: ... | Risk factors: Market rent decline risk, tenant turnover sensitivity | Recommendation: Proceed with rate lock to mitigate refinance risk"
5. Show human override: Partner reviewed the AI assessment, noted "strategic portfolio diversification," and approved despite AI's risk flags — decision timestamp + approver name + override reason logged
6. Open Compliance Dashboard: show all deals in the fund that had AI recommendations overridden (8 total), filter by override reason, see approval patterns by partner — useful for audit committee review: *"Of 8 AI-overridden deals, 6 performed above forecast, 2 underperformed by >100 bps."*

**Winston capabilities shown:**
- AI Gateway with full request/response logging — deployed
- Audit trail infrastructure (governance logging service) — deployed
- MCP permission model with tool authorization tracking — deployed
- Human override and approval tracking — deployed
- Compliance reporting dashboard with pattern analysis
- Tamper-proof decision history for regulatory review

**The "wow moment":** An audit committee asks "Why did we approve this deal when AI said it was risky?" and the partner immediately shows the exact AI reasoning, the human override decision, and the actual outcome (beat/missed forecast). This is institutional-grade AI transparency that competitors don't offer — and it's increasingly table-stakes for regulated funds and institutional LPs requiring AI transparency.

**Data needed:** Historical AI decisions with overrides (can seed with synthetic cases). Audit trail schema (deployed). Approval workflow logs (can be backfilled). Compliance reporting views (simple aggregation on existing audit data).

**Build status:** READY — Audit trail infrastructure (governance logging, AI request/response capture), approval tracking, and MCP permission model are all deployed per Capability Inventory. The Compliance Dashboard view is a light aggregation layer on existing data — no major code changes needed.

**Sales angle:** Market signal: Governance + security are now buying criteria (Nudge Security, AWS + SailPoint, NVIDIA + Salesforce on-premises regulated agents). Message: "While competitors add AI features, Winston adds AI transparency. Every AI decision has a complete audit trail — model choice, reasoning, human approval, outcome. This is table-stakes for regulated funds and institutional LPs." Especially relevant for fund-of-funds, insurance company LPs, pension fund LPs requiring board-level AI governance.

---

## Impact Statement

Demos ready to run TODAY without any code changes: 3 (Debt Surveillance Dashboard, Private Credit Loan Underwriting, AI Governance Audit Trail)

New demo ideas not previously suggested: 3
