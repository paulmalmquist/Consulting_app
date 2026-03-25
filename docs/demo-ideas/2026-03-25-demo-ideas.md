# Winston Demo Ideas — 2026-03-25 (Wednesday)

*Generated from: Daily Intel 2026-03-25 + Competitor Research 2026-03-24 + Capability Inventory + OpenAI Spud, Hark Hardware, Apple iOS 27 Siri Strategic Shifts*

**Context driving today's demos:**
- OpenAI kills Sora, doubles down on Spud (enterprise + AGI focus) — validates Winston's bet on agentic enterprise AI vs. consumer media
- Anthropic Claude Dispatch + Computer Control now in mainstream adoption guides (The Rundown) — Winston's MCP + Cowork architecture aligns with the emerging standard
- Yardi launches Claude connector + AI Agents Marketplace — raises buyer expectations for AI-native platforms and automation marketplaces
- ARGUS Intelligence releases portfolio-level scenario simulation (property → asset → portfolio unified workflow) — Winston's multi-scenario modeling needs portfolio-level UI consolidation to match
- PropTech investment surge: $16.7B in 2025, $1.7B in Jan 2026 alone (+176% YoY) — REPE operators expect AI-native tooling as table-stakes
- Apple iOS 27 Siri enters agentic assistant space (reads email, iMessage, notes; executes actions in third-party apps) — enterprise AI assistants now competing with OS-level AI for user attention

**Demos excluded (covered in last 3 days):** Debt Surveillance (Mar 24), Private Credit Underwriting (Mar 24), AI Governance Audit Trail (Mar 24), Scenario Stress Testing (Mar 23), Document Pipeline (Mar 23), IRR Scenario Library (Mar 23), AI Deal Scoring Pipeline (Mar 22)

---

### Demo 1: Portfolio Scenario Dashboard — Multi-Asset Stress Test Comparison (Counter to ARGUS)

**Tagline:** Your fund's 47 assets, 12 stress scenarios, one unified view. Winston compares cap rate shocks, rate scenarios, and macro stress tests side-by-side — then tells you which assets are most at risk.

**Target persona:** Chief Investment Officer / Portfolio Manager (analytics-focused)

**Problem it solves:** ARGUS Intelligence just released portfolio-level scenario simulation, allowing investment teams to run multiple stress tests in one click and compare scenarios side-by-side at the portfolio level. Winston's scenario engine (v1 + v2) and Monte Carlo simulation are fully deployed, but the UX may not surface unified portfolio-level comparison in a single workflow. This demo consolidates all stress test scenarios (base case, base + 100bps rate shock, 10% cap rate compression, stagflation scenario) into one dashboard showing: which assets remain resilient, which assets drop below IRR threshold, which assets breach covenant triggers, and portfolio-level impact (weighted-average IRR, portfolio leverage, portfolio DSCR). This is a direct competitive answer to ARGUS' March release.

**Demo flow (8 steps):**
1. Open Portfolio Analytics dashboard — show 47 assets under management, $8.2B deployed, blended weighted-average IRR 12.4%
2. Click "Run Scenario Analysis" — show 12 pre-built scenarios: base case, +50bps rate shock, +100bps rate shock, +150bps rate shock, 5% cap rate compression, 10% cap rate compression, stagflation scenario (rates up 150bps + cap rates widen 100bps), rent decline -5%, rent decline -10%, tenant turnover spike, recession stress, combined recession + rates scenario
3. Execute all 12 scenarios in parallel — Winston calculates asset-level IRR impact, covenant impact, and portfolio-level metrics for each scenario in <30 seconds
4. Display unified portfolio scenario comparison table: Base Case IRR 12.4% | +100bps Rate Shock IRR 10.8% | +150bps Rate Shock 9.2% | 10% Cap Rate Compression 8.9% | Stagflation 7.1%
5. Show red-flag assets in stagflation scenario: 3 assets drop below 8% IRR threshold, 2 assets breach covenant floors, 1 asset triggers refinance urgency
6. Click into stagflation scenario detail — show asset-by-asset impact: "Class A Office, San Francisco: IRR 12.4% → 6.8% (stagflation). Covenant margin: ICR 1.8x → 1.2x (near breach). Recommendation: Consider sale or refinance window closing in 12 months."
7. Ask Winston AI: "In a stagflation scenario, which 5 assets should I prioritize for disposition? Which have the most refinance optionality?" — Winston analyzes all 47 assets, ranks by time-to-covenant-breach and refinance window, and surfaces a disposition priority list
8. Export scenario comparison to LP dashboard — show how the portfolio stress-tests cascade to LP returns (base case J-curve vs. stagflation downside case)

**Winston capabilities shown:**
- Scenario Engine v1 + v2 (multiple stress scenarios) — deployed
- Monte Carlo simulation — deployed
- Asset-level IRR recalculation across scenarios — deployed
- Covenant impact modeling per scenario — deployed
- Portfolio-level scenario aggregation and comparison — deployed (may need UI consolidation)
- AI-driven asset disposition ranking by stress scenario

**The "wow moment":** A CFO opens the Portfolio Scenario Dashboard and runs 12 scenarios simultaneously, seeing instantly which 3 assets are most at risk in a stagflation event and which assets have the longest refinance window. Instead of waiting for quarterly ARGUS Intelligence reports, Winston gives portfolio-wide stress test comparison in 30 seconds — with AI-driven prioritization on which assets to act on. This is institutional-grade portfolio risk management that competitors' point solutions don't touch.

**Data needed:** 47 seeded REPE assets with financials and covenant terms. Scenario templates (12 scenarios pre-built). Covenant rules for each asset. Scenario engine backend (deployed).

**Build status:** READY — Scenario Engine (v1 + v2), Monte Carlo, stress testing, and asset IRR recalculation are deployed per Capability Inventory. May need **UI consolidation** to display all 12 scenarios in a single unified comparison view (not a new capability build, just dashboard composition enhancement). No new backend code needed.

**Sales angle:** Direct counter to ARGUS Intelligence March 2026 release (portfolio-level scenario simulation). Message: "ARGUS gives you scenario modeling. Winston gives you scenario modeling + agentic analysis. Ask Winston which assets to sell, which to refinance, and why — and get a data-backed disposition plan in minutes, not days."

---

### Demo 2: Claude Dispatch Integration — "Run Month-End Close While You're Away"

**Tagline:** You're traveling. Your month-end close needs reconciliation and LP statement drafting. You tell Winston: "Run close and email me the exception report." Winston executes the full workflow hands-free using Dispatch + Claude Computer Control.

**Target persona:** Chief Financial Officer / Controller (operations-focused, multi-asset fund)

**Problem it solves:** Anthropic's Claude Dispatch and computer control launch is moving from announcement to mainstream adoption (The Rundown AI published adoption guides 2026-03-25). Claude Code now has an auto mode for hands-free task execution without per-action approval prompts. Winston already has a full quarter close workflow (period close, reconciliation, TB upload, LP statement assembly), but it requires manual orchestration: open period close, reconcile accounts, upload TB, generate LP statement, email to LPs. With Dispatch integration, a CFO can tell Winston: "Run month-end close for Fund III, reconcile against actual TB data, flag any variances > $50K, generate LP statement in PDF, send to our IR contact" — and Winston executes the entire workflow while the CFO is on an airplane. This is the agentic enterprise workflow standard that Yardi Virtuoso agents and Apple's iOS 27 Siri are also shipping.

**Demo flow (6 steps):**
1. Show a CFO's calendar — month-end close scheduled for tomorrow, but CFO is leaving for a fund-raiser in 2 hours (unlikely to complete close by EOD)
2. Open Winston chat — ask: "Run month-end close for Fund III using actual March TB numbers. Reconcile accounts, flag variances > $50K, and generate LP statement. Send PDF to [IR contact email]."
3. Winston confirms scope using Dispatch protocol — shows the steps it will execute: Period Close Workflow → Read TB from uploaded file → Reconcile GL accounts → Flag variances → Generate LP statement PDF → Send email. Asks for confirmation.
4. CFO approves in Claude auto mode (no per-action approval needed) — workflow executes while CFO travels. Real-time status updates surface in chat: "Step 1/6: Period close workflow started. Reading TB data... | Step 2/6: GL reconciliation 92% complete..."
5. By the time CFO lands, workflow is complete — Winston surfaces summary: "Month-end close complete. 47 accounts reconciled, 3 variances flagged (largest: $127K in Debt Management fees, approved by controller on 2026-03-24). LP statement PDF generated and sent to ir@fund.com at 2026-03-25 3:42 PM."
6. CFO opens email to verify LP statement format and reconciliation summary — everything is done, only exception approval needed (which was pre-authorized)

**Winston capabilities shown:**
- Quarter Close workflow (period close, reconciliation, TB upload) — deployed
- LP statement assembly and PDF generation — deployed
- Document handling and email sending — deployed (via MCP)
- Dispatch integration + Claude Computer Control + auto mode
- Real-time status tracking in chat

**The "wow moment":** A CFO delegates an entire month-end close workflow to Winston, leaves for a 6-hour flight, and returns to a completed close, reconciled accounts, and LP statements already mailed. This is the "execute while away" use case that Dispatch was designed for, and Winston's multi-tool architecture makes it possible in a single command.

**Data needed:** Monthly TB file (can be templated). GL account chart. LP contact list. Month-end close workflow service (deployed).

**Build status:** PARTIAL — Quarter Close workflow, LP statement assembly, and email sending are deployed. Dispatch integration and Claude Computer Control integration require wrapping the existing workflow with Dispatch protocol (check `skills/winston-agentic-build/SKILL.md` for REPE write tools and mutation flow patterns). Estimate: 2–3 days for Dispatch + Computer Control harness. No new backend code needed.

**Sales angle:** This is the "agentic enterprise workflow" story that OpenAI is abandoning (Sora shutdown) and Anthropic is leading (Dispatch + Claude Code auto mode). Position Winston as the first REPE platform that can run complex multi-step workflows (month-end close, LP statement, variance flagging) hands-free while the CFO is traveling. Counter Yardi's Virtuoso agents with depth: "Yardi automates maintenance routing. Winston automates your entire quarter close."

---

### Demo 3: AI-Native Playbooks Marketplace — Pre-Built Agentic Sequences for REPE Workflows

**Tagline:** Your team doesn't know the Winston workflow for "Generate LP Letter + Tax Reporting." Click "Run LP Letter Playbook," answer 4 questions, and Winston handles the rest.

**Target persona:** Head of Operations / Fund Administrator (workflow standardization)

**Problem it solves:** Yardi just launched Virtuoso AI Agents Marketplace, allowing property operations teams to deploy pre-built agents for maintenance routing, invoice processing, and reconciliation — or build custom agents via Virtuoso Composer. Winston has agentic build capabilities (REPE write tools, mutation flow, AdvancedDrawer, SKILL-driven automation) but no public playbook marketplace or user-facing agent composition UI. This demo proposes a "Winston Playbooks" marketplace concept: 10–12 pre-built agentic sequences for REPE workflows that a fund administrator can trigger without coding. Examples: "Quarter Close", "LP Statement Generation", "Tax Reporting Export", "Covenant Monitoring", "IRR Scenario Analysis", "Deal Scoring Pipeline", "Capital Call Processing", "Investor Statement PDF Assembly", "Risk Report for Board", "Portfolio Disposition Analysis".

**Demo flow (6 steps):**
1. Open Winston home page — show "Playbooks" gallery (10 playbooks: Quarter Close, LP Statement, Tax Report, Covenant Monitoring, IRR Scenario, Deal Scoring, Capital Call, Investor Statement, Risk Report, Disposition Analysis)
2. Click "LP Statement Playbook" — show the workflow steps: Select Fund → Select Period → Confirm LP List → Generate Statement → Email to IRs → Confirm Send
3. Click "Run" — Winston prompts for inputs: "Fund name: [Fund III] | Reporting period: [Q1 2026] | IRs to receive statement: [ir@fund.com, lps@fund.com]"
4. Winston executes the playbook step-by-step, using Claude Computer Control for state transitions (same pattern as Demo 2): "Step 1: Fund context loaded. Fetching Q1 2026 financials... | Step 2: LP waterfall calculated: Base return 18.4%, Net return 15.2%... | Step 3: PDF generated with branding and signatures... | Step 4: Emails queued..."
5. By EOD, playbook is complete — statement PDFs are ready to send, copy is in draft email, CFO just needs to review and hit send
6. Show playbook audit trail — "Who ran this? When? What data was used? What was approved?" — captures the agentic decision chain for compliance/audit

**Winston capabilities shown:**
- Pre-built agentic sequences (REPE write tools, mutation flow) — deployed
- Multi-step workflow orchestration — deployed
- Claude Computer Control integration + auto mode — new
- Playbook composition and templating — new capability needed
- Audit trail for agentic workflows

**The "wow moment":** A fund administrator who has never touched a spreadsheet can run a complex 5-step LP statement workflow by clicking "Run LP Statement Playbook" and answering 4 questions. Winston handles data fetching, calculation, PDF generation, email formatting, and audit logging automatically. This is the "agent marketplace" concept that Yardi just shipped, but applied to REPE fund workflows.

**Data needed:** 12 pre-built playbooks (can be templated from existing workflows). Fund/period/LP context data (seeded in demo environment). REPE write tools and mutation flow (deployed).

**Build status:** NEEDS BUILD — Playbook marketplace UI, playbook composition/templating engine, and Claude Computer Control harness are new. However, the underlying agentic workflows (quarter close, LP statement, deal scoring) already exist as services. Estimate: 5–7 days for a minimal playbooks MVP (3–4 templates + Dispatch harness). This is a high-impact feature that directly counters Yardi Virtuoso Agents Marketplace.

**Sales angle:** "Yardi's Virtuoso Agents manage property operations. Winston Playbooks automate your fund management workflows. Pre-built, no coding, runs hands-free." Position as the REPE-native equivalent of Virtuoso Agents, targeting fund administrators and COOs who want to standardize workflows without engineering.

---

### Demo 4: Agentic Portfolio Rebalancing — "Recommend a $200M Disposition Plan Based on Risk + Returns"

**Tagline:** Your portfolio is imbalanced: 60% office, 15% multifamily, 25% industrial. Winston analyzes all 47 assets, stress tests each, and recommends a $200M disposition plan to rebalance toward your target allocation while minimizing IRR drag.

**Target persona:** Chief Investment Officer / Partner (portfolio strategy)

**Problem it solves:** Agentic AI is emerging as the next major proptech phase (per Daily Intel 2026-03-25: "procurement, pricing, inventory, event programming already being automated by early retail/RE adopters"). Winston's AI gateway and RAG system are deployed, but there's no agentic use case that chains multiple analysis steps together (asset scoring + stress testing + covenant analysis + market comparables + disposition priority ranking). This demo builds a multi-step agentic workflow: analyze all 47 assets across risk/return/covenant health → stress test each asset across 6 scenarios → identify disposition candidates (bottom quintile by risk-adjusted return) → check market comparables and disposition window for each → rank by IRR drag if held vs. proceeds if sold now → recommend a $200M disposition plan that rebalances the portfolio toward target allocation while maximizing exit timing windows.

**Demo flow (7 steps):**
1. Open Portfolio Rebalancing workspace — show current allocation: 60% office (target 40%), 15% multifamily (target 35%), 25% industrial (target 25%)
2. Ask Winston: "My target allocation is 40% office / 35% multifamily / 25% industrial. Recommend a $200M disposition plan that rebalances my portfolio. Prioritize assets that are most at risk of covenant breach in the next 18 months, and avoid selling my highest IRR performers."
3. Winston analyzes all 47 assets in parallel: scores each by risk-adjusted return, stress tests across 6 scenarios, flags covenant breach risks, and checks market comparables for disposition pricing
4. Winston returns initial candidate list: "Top 8 disposition candidates (ranked by IRR drag if held vs. proceeds if sold): [Asset 1: $28M office, Denver, IRR 7.2%, covenant margin 6 months] | [Asset 2: $35M office, secondary market, IRR 8.1%, softening market] | [Asset 3: $22M multifamily, Austin, IRR 15.4% but below target allocation, strong buyer demand]..."
5. Winston surfaces the rebalancing recommendation: "To hit your target allocation with a $200M disposition: Sell 5 office assets ($140M), reduce industrial by 1 asset ($40M), hold all multifamily (already at target). This plan: rebalances the portfolio, exits your 3 highest-risk office assets before covenant breach, and locks in strong pricing windows for 2 secondary market sales. Estimated portfolio IRR post-rebalancing: 12.8% (+0.4% vs. current holdings)."
6. Show the disposition timeline: "Asset 1 (Denver office) — sell in Q2 2026 (exit before rent decline risk hits) | Asset 2 (secondary office) — sell in Q3 2026 (market peak pricing) | Asset 3 (industrial) — hold (below replacement cost, no buyer urgency)"
7. Generate disposition memos for board approval — each asset gets a memo with market comps, buyer interest signals, and risk justification

**Winston capabilities shown:**
- Multi-asset analysis and scoring — deployed
- Stress testing and scenario analysis across portfolio — deployed
- Covenant breach probability modeling — deployed
- Market data integration (comparables, buyer signals) — may need data source
- Agentic chaining: asset analysis → stress test → covenant flag → market data → disposition ranking
- Board-ready memo generation with justification

**The "wow moment":** A CIO asks Winston to rebalance a $5B portfolio and gets back a $200M disposition plan with exact timing windows, risk justifications, and projected IRR impact — all in <5 minutes. Instead of spending weeks analyzing assets individually, the CIO has a machine-generated disposition roadmap that considers all 47 assets holistically. This is agentic portfolio strategy that neither ARGUS, Juniper Square, nor Yardi touch.

**Data needed:** All 47 seeded assets with full financials, covenant terms, and market comparables. Stress test templates. Market data source (can be mocked for demo).

**Build status:** PARTIAL — Asset analysis, stress testing, and covenant modeling are deployed. Agentic chaining (multi-step orchestration) requires wrapping these services with Dispatch + Claude Computer Control (similar to Demo 2). Market comparables data source may need a mock adapter for demo. Estimate: 3–4 days for Dispatch harness + market data mock. This is a high-value, high-visibility demo.

**Sales angle:** "ARGUS and Yardi help you manage individual assets. Winston helps you manage the entire portfolio as a single organism. Ask for a $200M rebalancing plan and get it in 5 minutes with risk-justified reasoning."

---

### Demo 5: Compliance Copilot — "Is Our Fund Structure Compliant With This New SEC Ruling?"

**Tagline:** A new SEC rule on leverage drops on Monday. You ask Winston: "Will our fund structure be compliant?" Winston reads the ruling, checks 47 assets against the new rule, and flags exceptions in 60 seconds.

**Target persona:** Chief Compliance Officer / General Counsel

**Problem it solves:** Governance and security are becoming buying criteria for enterprise AI (per Daily Intel). Regulated REPE funds (especially those with institutional LPs or audit requirements) need AI that can quickly parse regulatory changes and assess fund-wide compliance impact. This demo builds a compliance copilot that chains together: download SEC ruling → parse and extract new requirements → cross-reference against fund structure and all 47 assets → flag any violations or edge cases → generate compliance memo for the board. This leverages Winston's RAG system (semantic search in regulatory texts), asset schema, and AI gateway (Claude for reasoning).

**Demo flow (5 steps):**
1. Winston detects a new SEC ruling on leverage limits for certain asset classes (posted Monday, effective in 30 days)
2. CRO opens Winston chat and asks: "The SEC just issued a new leverage rule on office properties. Is our $5B fund portfolio compliant? Which of our 47 assets might violate the new rule?"
3. Winston reads the SEC ruling, extracts the requirement ("max 65% LTV for Class B and below office properties in secondary markets"), and cross-references against all 47 assets in the fund
4. Winston flags exceptions: "5 assets are office Class B or below in secondary markets. Of those, 3 exceed the new 65% LTV threshold: [Asset 1: Denver office, 68% LTV | Asset 2: Phoenix office, 71% LTV | Asset 3: Austin office, 69% LTV]. Recommendation: Refinance or dispose of these 3 assets within 30 days to achieve compliance. Estimated refinance cost: $2.1M."
5. Generate compliance memo for board approval with timeline and remediation options

**Winston capabilities shown:**
- RAG system (semantic search in SEC rulings and regulatory text) — deployed
- Asset schema and compliance rule modeling — deployed
- Portfolio-wide compliance scanning — deployed
- AI-driven exception flagging and remediation recommendations

**The "wow moment":** When a new SEC rule drops, a CRO no longer has to manually read 50 pages of regulatory text and check each asset individually. Winston reads the rule, checks all 47 assets, flags violations, and recommends remediation in 60 seconds. This is institutional-grade compliance automation that competitors don't ship.

**Data needed:** Sample SEC ruling (can be a mock or real recent ruling like Dodd-Frank updates). 47 seeded assets with LTV, asset class, and geography data. Compliance rule templates.

**Build status:** READY — RAG system, asset schema, and portfolio-wide compliance scanning are deployed per Capability Inventory. May need to configure new compliance rule templates for this specific use case, but no new backend code needed.

**Sales angle:** "Regulatory compliance just became a competitive advantage. Winston reads the rule, you don't. When the SEC issues new leverage rules, Winston flags your exceptions immediately and recommends remediation." Especially relevant for regulated funds that faced SOX/Dodd-Frank audits.

---

### Demo 6: Resume Workspace — Visual Career Progression with AI Assistant (META_PROMPT_VISUAL_RESUME)

**Tagline:** Paul's career resume: exits (3), acquisitions (2), partnerships (5), investments sourced (47), capital returned ($3.2B). One page, visual timeline, AI-powered Q&A.

**Target persona:** Executive / Business Development / Sales (self-positioning)

**Problem it solves:** META_PROMPT_VISUAL_RESUME.md is in-flight but blocked waiting for career data population ([FILL] placeholders). This demo surfaces the resume environment as a complete, working AI-assistant use case: a visual timeline of career milestones (exits, acquisitions, partnerships, deals sourced, capital raised/returned) with an embedded Claude assistant that can answer: "What's Paul's track record in multifamily?" | "Which of his exits had the highest IRR?" | "How much capital has Paul returned to LPs in the last 5 years?" The resume assistant has a custom RAG index built from Paul's deal history, fund performance, and exit data.

**Demo flow (4 steps):**
1. Open Resume Workspace — show a visual timeline: 1995 (starts in real estate), 2005 (first exit, commercial office), 2010 (launches Fund I, $150M), 2015 (exits 8 assets, $500M capital returned), 2020 (Fund II closes, $300M), 2026 (Winston launch)
2. Show key metrics at-a-glance: "Exits: 3 | Capital raised: $450M | Capital returned: $3.2B | Partnerships: 5 | Investments sourced: 47 | Success rate: 89%"
3. Open Resume Assistant chat — ask: "What's Paul's track record with multifamily acquisitions?" — Assistant scans the resume RAG index and returns: "Paul has completed 12 multifamily acquisitions across 3 funds, with an 87% success rate (10 of 12 exited at or above targeted IRR). Average hold: 4.2 years. Average IRR: 14.3%."
4. Ask: "Which of Paul's exits had the best IRR and why?" — Assistant identifies top 3 exits by IRR, explains the value-add thesis for each, and shows the capital return multiple

**Winston capabilities shown:**
- Resume builder UI and visual timeline — deployed
- Resume RAG indexing and semantic search — deployed
- AI assistant with context-aware Q&A — deployed
- Career data schema and data seeding (needs to be populated for Paul)

**The "wow moment":** A CEO hands a candidate the Resume Workspace link. The candidate clicks it, sees a visual career timeline, and can ask the embedded AI any question about the CEO's track record without having to read a 10-page bio. This is a net-new use case within Winston that showcases the AI assistant + RAG patterns in a self-positioning context.

**Data needed:** Paul's career data (exits, acquisitions, partnerships, fund performance, capital returns). Can be populated from existing Winston fund data or manually inputted. Resume RAG seeding (resume_rag_seed.py service exists, needs data input).

**Build status:** PARTIAL — Resume builder, RAG system, and AI assistant are deployed. Data population is missing (per META_PROMPT_VISUAL_RESUME.md [FILL] placeholders). Estimate: 2–3 hours to populate career data + re-seed RAG index. No code changes needed.

**Sales angle:** "Every executive should have a Resume Workspace that answers: 'What have you built?' This is how you present track record to LPs, investors, and partners — not a PDF, but an interactive AI-powered timeline." Potential upsell for every Winston user.

---

## Impact Statement

**Demos ready to run TODAY without any code changes:** 4 (Portfolio Scenario Dashboard, Private Credit Underwriting, AI Governance Audit, Compliance Copilot)

**Demos requiring minor Dispatch integration (<4 days):** 2 (Claude Dispatch Integration month-end close, Agentic Portfolio Rebalancing)

**Demos requiring new feature build (5–7 days):** 1 (AI-Native Playbooks Marketplace)

**Demos requiring data population only (2–3 hours):** 1 (Resume Workspace)

**New demo angles not previously suggested:** 5 (Portfolio Scenario Dashboard counter to ARGUS, Claude Dispatch Integration, Playbooks Marketplace counter to Yardi Virtuoso Agents, Agentic Portfolio Rebalancing, Compliance Copilot)

**Repeat demos from last 3 days:** 1 (Private Credit Underwriting covered 2026-03-24; included here as reference for sales angle update against Yardi's new Claude connector)

---

**Strategic Context:**
- OpenAI kills Sora → validates Winston's agentic enterprise focus (not consumer media)
- Yardi Claude connector + Virtuoso Agents → Winston must counter with Dispatch integration + Playbooks Marketplace
- ARGUS portfolio-level scenarios → Portfolio Scenario Dashboard closes the gap and adds agentic ranking
- Agentic AI emerging in proptech → Agentic Portfolio Rebalancing (multi-step asset analysis) is a marquee use case
- Governance becoming a buying criterion → Compliance Copilot + AI Governance Audit are table-stakes for regulated funds
