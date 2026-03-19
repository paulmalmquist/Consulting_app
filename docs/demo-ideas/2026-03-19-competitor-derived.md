# Competitor-Derived Demo Ideas — 2026-03-19

---

### Demo: Covenant Alert — Inspired by Yardi Debt Manager

**The competitor claim:** "Yardi Debt Manager provides centralized loan data and simplified covenant tracking with automated alerts for covenant compliance."

**The Winston version:**
Winston pulls up a live asset (e.g., Ashford Commons or a demo portfolio property), shows the current DSCR at 1.19x against a covenant floor of 1.25x, and surfaces a "Covenant At Risk" alert in real time. The user then asks Winston via the AI chat: "What's our debt exposure if NOI drops another 5%?" — Winston calculates the projected DSCR, confirms a covenant breach scenario, and drafts a lender notification. All from one screen.

**Demo flow (7 steps):**
1. Open the asset detail view for a leveraged property showing current DSCR/LTV metrics
2. Show the Covenant Dashboard section with per-loan covenant thresholds (DSCR min, LTV max, debt yield)
3. The DSCR reads 1.19x — 5% below the 1.25x floor — triggering a "Covenant At Risk" flag
4. Click the alert to see full covenant breakdown: which threshold, which loan, what the current vs. required value is
5. Switch to Winston AI chat: "If NOI drops 5% this quarter, what happens to our DSCR covenant on Ashford Commons?"
6. Winston calculates: "Projected DSCR: 1.11x — covenant breach. Your covenant floor is 1.25x. This triggers the notification provision in your loan agreement."
7. Winston drafts a lender notification letter: "Based on projected Q2 financials, we anticipate a covenant event under section 6.2 of the loan agreement…"

**The key difference to highlight:**
"Yardi tracks covenants in its system. Winston knows your actual loan agreement — it can tell you *when* you'll breach, *what it triggers*, and *what to say to your lender*. That's not automation. That's an AI that's read your documents."

**Build status:** Needs covenant rules engine (3-5 days) + lender notification template (1 day). Chat reasoning is ready now.

**Best persona for this demo:** CFO / Asset Manager

---

### Demo: Quarterly LP Report in 30 Seconds — Inspired by Juniper Square JunieAI

**The competitor claim:** "JunieAI compiles quarterly LP reports, dramatically reducing the time to produce investor-ready reporting."

**The Winston version:**
Winston assembles a complete Q1 2025 LP Report for a demo fund in under 30 seconds — pulling fund-level P&L, capital account balances, waterfall distributions, DSCR/LTV summaries, and UW vs Actual variance — then uses the AI chat to draft the GP's narrative commentary. The output is a formatted, reviewer-ready document the GP can send within minutes of approving.

**Demo flow (6 steps):**
1. Open Winston's LP Summary module for the demo fund (5 funds, 20+ LPs shown)
2. Click "Generate Q1 2025 LP Report" button
3. Winston assembles: capital account balances per LP, current period distributions, fund-level P&L, DSCR summary across assets, UW vs Actual variance for the quarter (all from live data)
4. The report appears in a formatted document view — cover page, fund summary, per-asset highlights, distribution table
5. Switch to Winston AI chat: "Draft the GP narrative for Q1 2025 — focus on the industrial assets outperforming and the office asset covenant watch"
6. Winston drafts a 3-paragraph GP letter in the firm's voice, referencing specific portfolio data

**The key difference to highlight:**
"Juniper Square's AI compiles data from Juniper Square. Winston compiles data from *your fund* — it knows your waterfall structure, your UW assumptions, which assets are tracking ahead and which are behind. The report it drafts knows your portfolio, not just your portal."

**Build status:** Needs report assembly trigger + PDF template (3-5 days). Data modules and AI draft are ready now.

**Best persona for this demo:** GP / CFO / Fund Manager

---

### Demo: DDQ Completion in 4 Hours, Not 40 — Inspired by Juniper Square JunieAI

**The competitor claim:** "JunieAI automates DDQ response drafting, helping IR teams respond faster to allocator inquiries."

**The Winston version:**
A GP uploads a standard ILPA DDQ (or custom LP questionnaire). Winston parses every question, searches across the firm's document corpus (PPM, audited financials, strategy deck, prior DDQs, LP agreements), drafts a response for each question with citations, and flags the 5-10 questions that require GP input because no source document covers them. The GP reviews and sends in 4 hours instead of 40.

**Demo flow (7 steps):**
1. Open Winston AI workspace and upload a blank 60-question DDQ PDF
2. Winston acknowledges: "I've identified 60 questions. I'll cross-reference your fund documents and draft responses."
3. Show Winston scanning the document corpus (PPM, strategy deck, audited financials, prior DDQ responses visible)
4. Winston surfaces a structured response document: question, drafted answer, source document cited, confidence level
5. Questions 1-52 have draft answers. Questions 53-60 are flagged: "No source document found — requires GP input."
6. GP reviews answer #3 (fund strategy question) — sees the draft pulled from the PPM section on investment thesis
7. Export the pre-filled DDQ to Word for final review and transmission

**The key difference to highlight:**
"Juniper Square's AI knows what's in Juniper Square. Winston knows what's in your documents — your PPM, your audited financials, your LP side letters. When an allocator asks about your co-investment policy, Winston finds the actual clause in your limited partnership agreement."

**Build status:** DDQ ingestion + structured output is a 1-3 day wrap on existing RAG capability. Ready to demo within a week.

**Best persona for this demo:** IR / Fund Manager / GP (fundraising mode)

---

### Demo: "Ask Winston About This Deal" — Inspired by Yardi Acquisition Manager

**The competitor claim:** "Acquisition Manager provides centralized deal pipeline management with customizable workflows and stage tracking."

**The Winston version:**
Winston shows Deal Radar with a live pipeline. User clicks on an acquisition in Due Diligence stage. The deal record shows the radar chart scoring, all attached documents (OM, financial model, site photos, LOI), and a structured DD checklist auto-generated by Winston based on asset type. User asks Winston: "What are the biggest risks on this deal given current market conditions?" — Winston reads the deal documents and answers with specific risks, sourced from the OM and market data.

**Demo flow (6 steps):**
1. Open Deal Radar — show pipeline with 4 deals in various stages (Screening, LOI, DD, Closing)
2. Click into a multifamily acquisition in Due Diligence
3. Deal record shows: radar chart scoring (location, cash flow, debt coverage, exit strategy), attached documents, DD checklist
4. Show DD checklist: Winston auto-generated it based on "multifamily acquisition" deal type — 22 items across physical, financial, legal, and market categories
5. Ask Winston in chat: "Based on the OM and current rate environment, what are the top 3 risks for this acquisition?"
6. Winston reads the attached OM, references current market context: "1. Cap rate compression risk — the deal is underwritten at a 5.2% exit cap, which assumes 50bps compression from current market. 2. Debt service sensitivity — at current SOFR, the floating rate loan has a DSC of 1.18x in year 2. 3. Rent growth assumption — the OM projects 4% annual rent growth vs. current comps showing 2.1%."

**The key difference to highlight:**
"Yardi manages deal workflow. Winston reads the deal — the actual OM, the model assumptions, the market context — and tells you what's worth worrying about. That's the difference between a pipeline tool and an acquisition analyst."

**Build status:** Deal Radar stage workflow upgrade is Moderate (1 week). AI deal analysis from attached documents is ready now via chat workspace.

**Best persona for this demo:** GP / Acquisitions Associate / Principal
