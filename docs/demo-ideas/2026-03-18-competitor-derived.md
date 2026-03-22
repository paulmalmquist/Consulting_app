# Competitor-Derived Demo Ideas — 2026-03-18

---

### Demo: The 60-Second Stress Test — Inspired by ARGUS Intelligence Scenario Analysis

**The competitor claim:** "ARGUS Intelligence says: 'Run simulations at the property, asset & portfolio level — explore what-ifs, reveal possibilities.'"

**The Winston version:**
Winston lets a GP type a plain-English stress test request in the chat workspace and instantly see fund-level impact across all assets — no model rebuilding, no spreadsheet hand-off, no analyst wait time. The result is an interactive portfolio view showing which assets are most exposed, with the IRR waterfall and DSCR table updated live.

**Demo flow (6 steps):**
1. Open Winston's full-screen chat workspace with the fund portfolio view visible
2. Type: "Stress test the entire fund at cap rate +100 basis points and show me IRR impact by asset"
3. Winston processes the query, identifies all 5 fund assets, recalculates exit valuations using the +100bps cap rate assumption
4. Output: A ranked table (most exposed to least exposed), fund-level IRR dropping from X% to Y%, and a waterfall chart showing contribution by asset
5. Follow-up: Type "Which assets have DSCR below 1.20x in this scenario?" — Winston filters to the at-risk assets
6. Export: "Draft a risk memo for the LP committee summarizing these findings" — Winston generates the narrative

**The key difference to highlight:**
"ARGUS Intelligence gives you the scenario after your ARGUS modeler rebuilds it. Winston runs the scenario in the conversation — no model hand-off, no 48-hour wait."

**Build status:** Needs parameterized scenario recalculation UI (3–5 day build on existing stress-test infrastructure)

**Best persona for this demo:** GP / CFO

---

### Demo: Upload a T-12, Get Your Asset Record Populated — Inspired by Cambio Agentic Data Ingestion

**The competitor claim:** "Cambio says: 'Extract building data from PDFs and spreadsheets — AI-powered data extraction and parsing, with automated mistake detection.'"

**The Winston version:**
A REPE asset manager uploads the monthly T-12 PDF they just received from their property manager. Winston parses it, maps every line item to the asset's financial data model, flags two anomalies vs. prior month, and shows the updated UW vs. Actual comparison — all without the analyst manually keying a single number.

**Demo flow (7 steps):**
1. Open Winston's asset manager view for a specific property
2. Click "Upload Operating Statement" — upload a sample T-12 PDF
3. Winston ingests and parses: "Extracting 34 line items from Riverside Industrial T-12, October 2025..."
4. Winston populates the asset record: Revenue, Expenses, NOI, Occupancy — all updated
5. Winston flags anomalies: "Utilities expense is 22% above trailing 6-month average — flagged for review"
6. Winston auto-runs UW vs. Actual: Shows NOI is $12K below underwriting this month, driven by the utilities anomaly
7. Ask Winston: "Draft a note to the property manager asking about the utilities variance" — Winston writes the email

**The key difference to highlight:**
"Cambio automates data collection for ESG compliance. Winston automates data collection for fund performance — and then immediately tells you what it means for your underwriting."

**Build status:** Needs structured extraction layer on document pipeline (3–5 day build)

**Best persona for this demo:** Asset Manager / CFO

---

### Demo: The Variance Waterfall — Inspired by Altus Benchmark Manager Attribution Analysis

**The competitor claim:** "Altus Group says: 'Benchmark Manager transforms data into portfolio-to-market benchmarking — uncover what's driving portfolio results.'"

**The Winston version:**
Winston takes the fund's UW vs. Actual data and decomposes the NOI variance for a specific asset into a waterfall chart showing exactly which line item drove the shortfall — then drafts the LP quarterly commentary explaining the variance and the management response.

**Demo flow (5 steps):**
1. Open Winston's UW vs. Actual view for a fund asset
2. Ask: "Break down the Q3 NOI variance for Riverside Industrial by driver"
3. Winston outputs a waterfall chart: Total variance -$47K, broken down as: Occupancy -$28K, Parking Revenue -$12K, Operating Expenses +$9K (positive), Utility Overage -$16K
4. GP asks: "What's the single biggest fixable driver?"
5. Winston responds: "Parking Revenue is the largest recoverable gap — current occupancy suggests 18 unclaimed reserved spots. Draft an outreach to tenants?" — then drafts the email

**The key difference to highlight:**
"Altus benchmarks your portfolio against external peers — valuable if you have their data. Winston benchmarks your current performance against your own underwriting and tells you what to do about it — immediately, in the conversation."

**Build status:** Needs attribution decomposition layer on UW vs. Actual (1–2 week build)

**Best persona for this demo:** GP / CFO / Asset Manager
