# Competitor-Derived Product Opportunities — 2026-03-18

*Derived from: Altus Group (ARGUS Intelligence) + Cambio + Glean scan — Wednesday rotation*

---

### Opportunity: Portfolio Scenario Analysis UI

**Derived from:** Altus Group — Portfolio Manager / Scenario Analysis (ARGUS Intelligence)
**Classification:** Partial → Easy build

**Winston feature description:**
A structured scenario runner accessible from the fund or portfolio view. User selects one or more assumption levers (cap rate, vacancy, rent growth, exit yield, interest rate), sets the delta (e.g., +75bps, -10%), and the system recalculates IRR, equity multiple, DSCR, and LTV across all assets simultaneously — presenting a before/after comparison at fund and individual asset level. Winston already has the underlying financial models; the build is the parameterized UI layer and the portfolio-level aggregation pass.

**Enterprise value:**
A REPE GP or CFO uses this before every LP meeting and board presentation — "what does our fund look like if rates stay elevated for 18 more months?" Currently this is done by sending Excel models to analysts and waiting. Winston makes it a 30-second self-serve interaction.

**Implementation complexity:** Low
Winston already holds all DCF and valuation assumptions per asset. The scenario engine is a parameterized recalculation pass over existing models; the UI is a slider/input form feeding into existing charting infrastructure.

**Demo potential:** High
A live demo where a GP types "stress test all assets at cap rate +100bps" and Winston instantly shows fund-level IRR dropping from 14% to 11.2% with a table of which assets are most exposed — this is a 60-second demo moment that wins rooms.

**Priority score:** 9

---

### Opportunity: Structured Extraction from Operating Documents

**Derived from:** Cambio — Agentic building data ingestion from PDFs/spreadsheets
**Classification:** Partial → Easy-Moderate build

**Winston feature description:**
Extend Winston's existing document ingestion pipeline to perform structured field extraction — not just indexing for search, but pulling specific financial data fields (line-item revenues, expenses, tenant info, unit mixes, dates) out of uploaded T-12s, rent rolls, operating statements, and utility bills, and writing them into the asset's financial data model. User uploads a PDF operating statement; Winston parses it, maps it to the GL schema, flags any anomalies vs. prior period, and populates the asset record.

**Enterprise value:**
Every REPE GP collects T-12s, rent rolls, and operating statements from property managers every month. Currently an analyst manually keys this data. Winston eliminating that data entry step — and catching errors automatically — is a 5–10 analyst-hour save per asset per month at a 15-asset portfolio.

**Implementation complexity:** Medium
Winston's document pipeline handles ingestion and vector indexing. The new layer is structured extraction (LLM extraction prompt + field mapping rules + validation logic). The complexity is the mapping layer — each property type (office, multifamily, industrial) has different line-item structures.

**Demo potential:** High
Upload a T-12 PDF. Winston parses it and populates the asset's NOI, expense ratio, and occupancy fields automatically. Then ask "how does this compare to underwriting?" and Winston responds with the UW vs. Actual variance. Demonstrates two Winston capabilities in one flow.

**Priority score:** 9

---

### Opportunity: Data Quality Anomaly Flagging

**Derived from:** Cambio — Automated mistake detection in building data ("4x data quality improvement")
**Classification:** Easy build

**Winston feature description:**
A background validation job that runs on every GL data refresh and flags anomalies: NOI drops >15% QoQ without a linked note, DSCR falling below covenant threshold without a flagged event, expense line items that fall outside historical standard deviation ranges. Surfaced in a "Data Health" panel per asset, with severity levels (warning / critical). Winston already aggregates GL data — this is a rule engine over existing data.

**Enterprise value:**
REPE GPs catch accounting errors and data quality problems months later when building LP reports. Early detection prevents embarrassing LP communications, protects audit integrity, and gives the CFO confidence in the numbers before they go out the door.

**Implementation complexity:** Low
Rule-based validation over existing GL aggregation. Define threshold rules per metric type, compute deviation from trailing average, generate alert record. No new data model required — extends existing financial data structures.

**Demo potential:** Medium
Not a flashy demo, but a credible trust-builder with CFOs. "Winston automatically checks your numbers every night and flags anything that looks off before you send the LP report."

**Priority score:** 7

---

### Opportunity: Attribution Analysis for UW vs. Actual Variance

**Derived from:** Altus Group — Benchmark Manager / Attribution Analysis
**Classification:** Moderate build

**Winston feature description:**
Extend Winston's existing UW vs. Actual reporting to decompose variances by driver — rather than showing "NOI is $50K below underwriting," show that $30K of the gap came from lower occupancy, $15K from higher operating expenses, and $5K from lower parking revenue. Present as a waterfall chart per asset and aggregated at fund level. The analysis connects to LP narrative templates: "Here's what drove the variance this quarter and why."

**Enterprise value:**
LP communications are the most time-consuming GP deliverable. Turning UW vs. Actual data into a variance waterfall that a PM can send directly to LPs — without an analyst building a custom slide — saves 2–4 hours per asset per quarter and reduces the risk of a GP being unable to explain their variance on a call.

**Implementation complexity:** Medium
Winston has UW vs. Actual data. The build is the attribution decomposition logic (break total variance into contributing factors by line item) and the waterfall visualization component. Requires defining variance attribution taxonomy per asset class.

**Demo potential:** High
Open an asset with a negative variance, ask Winston "what drove the NOI shortfall this quarter?" and get a waterfall chart showing the breakdown by revenue and expense driver — then ask it to draft the LP narrative. Two-minute demo that directly addresses LP communication pain.

**Priority score:** 8

---

### Opportunity: Capital Decision Approval Workflow

**Derived from:** Cambio — Decision approval workflows and stakeholder coordination
**Classification:** Moderate build

**Winston feature description:**
A lightweight workflow module embedded in Winston's asset manager view. Asset manager proposes a capital improvement (e.g., "HVAC replacement, $180K, expected 8% NOI lift, 18-month payback"), attaches supporting analysis from Winston's financial models, routes it to the GP for approval, and tracks status (pending / approved / declined / deferred). Approved items feed into the asset's capex schedule and underwriting update.

**Enterprise value:**
At most GPs, capital approval happens via email chains and spreadsheets. Winston gives the GP a single place to see all pending capital decisions across the portfolio, with the financial analysis already attached, and a clear audit trail of what was approved and why — critical for LP reporting and fund audit.

**Implementation complexity:** Medium
Requires a new workflow state machine (proposal → review → decision → status), a notification system (email or in-app), and a connection to the asset's capex data model. Does not require a new data model from scratch — extends existing asset-level data.

**Demo potential:** Medium
Better suited to a second meeting than an initial demo. High value for GPs who've seen the financial capabilities and are asking "how does this work in practice?"

**Priority score:** 6
