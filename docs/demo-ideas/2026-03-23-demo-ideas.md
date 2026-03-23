# Winston Demo Ideas — 2026-03-23 (Monday)

*Generated from: Daily Intel 2026-03-22 + Competitor Research 2026-03-21 + Capability Inventory + Latest Agent Ecosystem Signals*

**Context driving today's demos:**
- Dealpath Connect now has all three major global brokerages (JLL, CBRE, C&W) — positioning Winston as the AI intelligence layer downstream of proprietary deal flow
- Yardi acquiring 60% of WeWork signals distraction from pure REPE software innovation — Winston counters as pure-play REPE AI
- Juniper Square's AI CRM using NLP on investor communications — Winston counters with forward-looking AI that tells you what to do next, not just what happened
- NVIDIA Agent Toolkit + Eragon's agentic OS raising validate prompt-first enterprise interfaces — Winston's copilot architecture is the killer app for REPE decision-making
- ARGUS extending portfolio-level modeling — Winston's Monte Carlo + stress testing is more advanced; need to showcase depth

**Demos excluded (covered in last 3 days):** AI Deal Scoring Pipeline (Mar 22), Capital Projects Draw Audit (Mar 22), CRM Intelligence (Mar 22), LP Waterfall Letter (Mar 20), Portfolio Digest (Mar 19)

---

### Demo 1: Scenario Stress Testing — "What If" Analysis Across the Entire Portfolio

**Tagline:** A recession hits tomorrow. Winston shows you the impact on every asset, which ones fail your covenant thresholds, and which ones you can save with a rate swap.

**Target persona:** Chief Investment Officer / Portfolio Manager

**Problem it solves:** ARGUS just announced portfolio-level modeling (March 2026), catching up to Winston on breadth. But stress testing at scale — running 50+ assets through 10+ scenarios simultaneously and tracking covenant impacts across the full portfolio — is where Winston's Monte Carlo engine shines. A CIO managing $5B+ in assets can't manually stress-test each asset in ARGUS. They need a single question: "If cap rates rise 200 bps and market rent growth drops 50%, how many of my assets underperform their IRR target by >200 bps?" Winston answers it in 30 seconds across the entire portfolio with probability distributions.

**Demo flow (8 steps):**
1. Open the Portfolio Analytics dashboard — show rollup view with 47 assets across 8 markets, current portfolio stats (blended IRR: 11.2%, avg LTV: 65%, covenant cushion by asset)
2. Point out the risk scoring module — assets are rated by stress sensitivity (high, medium, low) based on leverage, lease profiles, and market exposure
3. Click on the Scenario Engine — show v2 with pre-built macro scenarios: "Recession," "Rate Shock," "Inflationary Momentum," "Soft Landing," plus custom scenario builder
4. Select "Recession" scenario (recession probability 30%, cap rates +200 bps, rent growth -2% annually for 3 years, refinance rates +150 bps)
5. Run scenario across portfolio — Winston calculates impact on each asset: IRR change, covenant breach probability, cash flow impact, exit cap rate requirements
6. Open the results matrix: show which assets remain in target IRR range (30 assets), which fall below (12 assets), which breach covenants (3 assets)
7. Click into one at-risk asset — show the detail: original vs. stressed financials, covenant margin, options to delever or restructure
8. Open AI chat: *"If we can execute a rate swap on my top 5 highest-leverage assets to lock in 3.5% fixed-rate debt, how many assets get above the 9% IRR floor?"* — Winston re-calculates impact of partial hedging and returns probability-adjusted outcome

**Winston capabilities shown:**
- Portfolio Analytics with covenant tracking (deployed)
- Scenario Engine v2 with macro scenarios (deployed)
- Monte Carlo simulation across portfolio (deployed)
- Risk scoring by asset and portfolio level (deployed)
- AI-driven "what-if" analysis triggered from chat
- Stress testing with multiple dimensions (rates, growth, leverage)

**The "wow moment":** The CIO asks "What if rates rise 200 bps?" and Winston instantly shows that 3 out of 47 assets breach debt covenants — and which ones can be saved by restructuring. This is institutional-grade portfolio management that ARGUS describes but Winston executes in real-time with AI-driven contextual analysis.

**Data needed:** Portfolio with 40+ seeded assets across multiple markets (exists — REPE data seeded). Scenario engine with recession parameters (deployed). Covenant tracking by asset (deployed).

**Build status:** READY — Portfolio Analytics, Scenario Engine v1+v2, Monte Carlo, risk scoring, and covenant tracking all deployed per Capability Inventory. AI chat integration for dynamic "what-if" questions is live. No code changes needed.

**Sales angle:** Direct counter to ARGUS's March announcement. Differentiation: "ARGUS extended modeling to portfolios. Winston made portfolio stress testing the primary interface." Message: "ARGUS is catching up. Winston is thinking ahead." Position as the speed and AI depth advantage — CIOs don't want to wait 10 minutes for ARGUS to calculate impact; they want 30-second answers in a chat.

---

### Demo 2: Document Pipeline — From Email to Asset Intelligence in Minutes

**Tagline:** Your inbox gets 300 property marketing flyers per month. Winston reads them, extracts the key data (rent, occupancy, cap rate), and flags deals that fit your strategy.

**Target persona:** Head of Acquisitions / Asset Manager (desk review function)

**Problem it solves:** Juniper Square's new AI CRM uses NLP to extract data from investor communications and emails. Winston's document pipeline goes deeper: it doesn't just extract structured data from documents — it integrates that data into the decision context, flags strategic fit, and initiates workflows. Most deal flow still arrives as PDFs, Word docs, and emails from brokers. A mid-market acquisitions team gets 200–300 property marketing flyers per quarter — mostly noise, a few signal. Today, junior analysts hand-review each one for 10–15 minutes, pulling cap rates, occupancy, rent growth into a spreadsheet. Winston's extraction engine reads the entire batch in minutes, pulls the key metrics, scores each property against fund strategy, and surfaces the top 5 for analyst review. Savings: 40+ analyst hours per quarter.

**Demo flow (7 steps):**
1. Open the Document Management module — show the document inbox with 47 recent marketing flyers, press releases, and OM PDFs
2. Filter by "marketing flyers" — show the list with metadata: property, market, asset type, upload date, extraction status (Pending, Complete, Flagged)
3. Click on a property marketing flyer PDF — show the document viewer with text extraction highlighted in-context (rent, occupancy, rent growth, tenant mix)
4. Open Winston AI chat: *"I received 50 property marketing flyers last month. Summarize the key data from each and rank them by fit to our strategy: B+/A class industrial, Sun Belt markets, cap rates 5.5%-6.5%, occupancy >90%."*
5. Winston processes all 50 documents via the extraction pipeline: identifies key metrics for each property, filters against the fund strategy parameters, returns a ranked list of top 8 properties with rationale
6. Ask: *"For the top 3, pull the occupancy trend, major tenant info, and capex reserve status into a summary I can forward to my investment committee."*
7. Winston generates a structured investment brief for each of the 3 properties — pulling extracted data, highlighting strategic fit, and flagging any red flags detected in the document

**Winston capabilities shown:**
- Document Management CRUD and content storage (deployed)
- Extraction engine with OCR and text parsing (deployed)
- Custom extraction profiles for real estate documents (deployed)
- AI integration to extract, filter, and rank documents by strategic fit
- Document completion tracking (deployed)
- Structured output generation for investment teams

**The "wow moment":** Winston processes 50 marketing flyers in seconds and returns the top 8 ranked by fund strategy fit with key metrics pre-extracted. The acquisitions head avoids 42 documents that don't fit and gets a clean briefing ready for investment committee. Juniper Square extracts data from emails; Winston gives you a decision package.

**Data needed:** Document Management with seeded marketing flyer PDFs (can seed with synthetic OM/flyer templates). Extraction profiles for real estate documents (can be configured). AI chat context for fund strategy parameters (configurable).

**Build status:** READY — Document Management (CRUD, content storage), Extraction engine (OCR, text parsing), custom extraction profiles, and Doc Completion are all deployed per Capability Inventory. AI-driven filtering and briefing generation is live. No code changes needed.

**Sales angle:** Direct counter to Juniper Square's AI CRM + Preqin integration. Message: "Juniper Square extracts data from past communications. Winston extracts data from current deal flow and tells you which ones to pursue." Especially sharp positioning given that 70% of deal flow still arrives as unstructured documents and emails — Juniper Square's NLP on emails is backward-looking; Winston's extraction pipeline is forward-looking and actionable.

---

### Demo 3: IRR Scenario Library — Pre-Built Strategic Decision Trees for Every Deal Type

**Tagline:** You get a new multifamily deal on Monday. Winston instantly shows you the IRR outcomes for 12 different hold periods, cap rates, and exit scenarios — all against your fund's historical performance.

**Target persona:** VP of Investments / Deal Committee Chair

**Problem it solves:** Deal committee meetings often bog down on "what-if" questions about exit strategy, hold period, and leverage assumptions. A deal committee chair wants to ask: "If we hold for 5 years instead of 7, and we exit at 5.5% cap rate instead of 5%, what happens to IRR?" Today, this requires sending the model back to an analyst, waiting 15–30 minutes for a revised model. Winston's scenario library pre-calculates outcomes across dimensions — hold period (3/5/7/10 years), exit cap rate (4.5%–6.5% in 50 bp increments), leverage (50%/60%/70% LTV), rent growth (2%/3%/4%), and tenant-specific factors. For a new deal, Winston can surface a decision tree showing all probable outcomes in seconds — with historical context on which scenarios have performed best in your portfolio.

**Demo flow (7 steps):**
1. Open a new deal — show a multifamily acquisition in Austin (100-unit, $28M price, current 5.0% cap rate, 65% LTV, 5-year hold assumed)
2. Click "Scenario Library" — show a matrix: hold period (rows: 3/5/7/10 years), exit cap rate (columns: 4.5%/5.0%/5.5%/6.0%), each cell shows IRR outcome
3. Highlight the base case (5-year hold, 5.5% exit) showing 11.8% IRR — note this exceeds fund target of 11%
4. Explore the matrix: point out that 7-year hold with 5.5% exit drops to 10.2% (below target), but 3-year hold with 5.0% exit jumps to 15.1% (high risk if market turns)
5. Open Winston AI chat: *"Show me which hold/exit scenarios from this deal library align with our Fund VII historical returns distribution. Where does this deal rank vs. our typical exits?"*
6. Winston analyzes the scenario matrix against historical exit outcomes from previous fund assets, returns scenarios that have historically delivered 11%+ IRR in your portfolio, and highlights whether this deal is "conservative fit" or "aggressive fit"
7. Ask: *"What leverage level gets us to a 12% IRR target on the 5-year hold, and what's the refinance risk if rates stay elevated?"* — Winston adjusts the leverage assumption, recalculates, and shows the LTV impact on refinance availability

**Winston capabilities shown:**
- Scenario Engine v1+v2 with pre-built scenario libraries (deployed)
- Financial Modeling with IRR calculation across dimensions (deployed)
- Historical performance data integrated from portfolio (deployed)
- AI-driven scenario comparison against fund historical returns
- Decision tree visualization for deal outcomes
- Dynamic sensitivity analysis triggered from chat

**The "wow moment":** The VP clicks into a deal and instantly sees a matrix showing IRR outcomes across 16 different scenarios. The deal committee can discuss strategic fit without waiting for analyst modeling — and can reference that this deal's 5-year exit profile matches 92% of your historical successes.

**Data needed:** Portfolio historical exit data (exists — REPE fund data seeded). Scenario Engine with pre-built templates (deployed). Deal models with base assumptions (can seed). Financial modeling service (deployed).

**Build status:** READY — Scenario Engine v1+v2, Financial Modeling (IRR timeline, multi-scenario), and historical portfolio data are all deployed per Capability Inventory. AI-driven scenario comparison and decision tree rendering is live. Scenario library templates can be configured per fund. No code changes needed.

**Sales angle:** ARGUS released portfolio-level modeling in March; Winston is releasing decision trees for individual deals. Position as the "deal committee efficiency" play — every institutional REPE shop runs the same "what-if" drills in committee; Winston makes it 10x faster. Also counters Juniper Square's focus on LP communications: "While our competitors focus on talking to LPs, Winston helps you make the deals worth talking about."

---

## Impact Statement
Demos ready to run TODAY without any code changes: 3 (Scenario Stress Testing, Document Pipeline, IRR Scenario Library)
New demo ideas not previously suggested: 3
