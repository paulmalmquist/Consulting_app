# Winston Platform — Complete Fix & Polish Prompt

**Scope:** Full-stack fixes across data, UI, AI, and reporting layers.
**Environment reference:** Meridian Capital Management → Institutional Growth Fund VII → Cascade Multifamily (Aurora, CO)

Apply every item below in one pass. Each section is self-contained and can be tackled in parallel by different engineers.

---

## Status: Confirmed Fixed in Prior Deploys

The following items from the original review have been verified fixed in production:

| Item | Fix | Verified |
|------|-----|----------|
| A4 | Year Built "2,016" comma format → "2016" | ✅ |
| A6 | % of NAV totaling 146.6% → now 100% (60.5% + 39.5%) | ✅ |
| A10 | Valuation Method raw enum "cap_rate" → "Direct Cap" | ✅ |
| G2 | Duplicate model name guard — inline warning + disabled button | ✅ |

Everything else in this document is **still outstanding** and requires a fix.

---

## Section A: Data Bugs — Fix All of These

### A1. Cap Rate Annualization (CRITICAL)

The displayed cap rate is 31.30% everywhere it appears. The correct range for multifamily in the Denver MSA is 4.5–6.5%. The formula is dividing a non-annualized NOI figure by the gross value. Fix the calculation so that cap rate = (annualized NOI) / gross value. Annualized NOI = the most recently stored quarterly NOI × 4, or the sum of the last 4 quarters of NOI. Apply this fix everywhere cap rate is computed or displayed: the asset cockpit KPI cards, the Valuation & Returns snapshot, the Cap Rate Sensitivity tornado chart, and the fund-level "WTD Avg Cap Rate" portfolio metric (currently showing 23.95% — equally wrong). The delta and basis-point change labels should recalculate automatically once the underlying figure is correct.

### A2. Asset Location — Aurora, CO Not Atlanta, GA

Cascade Multifamily shows "Atlanta, GA" as its market/location in the asset cockpit header and in Model Inputs → Property Details → Market field. The correct values are:
- City/State: Aurora, CO
- Market / MSA: Denver-Aurora, CO MSA

Update the seed data record for this asset and ensure both the display label and the stored Market field reflect Aurora, CO. This bug also propagates into the fund overview investments expansion rows, which show "280 sf · Atlanta, GA" — fix the location there as well.

### A3. Unit Count and Unit Type Label — 240 Units, Not 280 sf

Two separate errors:
1. **Count:** Model Inputs → Property Details → Units shows 280. The correct unit count for Cascade Multifamily is 240. Update the seed record.
2. **Type label:** The fund overview investments expansion rows display "280 sf" — labeling the unit count in square feet instead of "units." This should read "240 units." Fix the label formatter to use the property type's appropriate unit descriptor (multifamily → "units", office/industrial → "SF").

### A4. Year Built Formatting ✅ FIXED
*(Confirmed fixed — "2016" displays correctly with no comma.)*

### A5. Fund NAV Column — Populate for All Investments

The Fund detail → Overview tab → Investments table shows "—" in the Fund NAV column for all 12 investments. This is the most important single metric in a fund context — each investment's contribution to the fund's net asset value. Compute or retrieve this value from the same source used by the LP Summary page (which correctly shows fund-level NAV = $425.0M). Wire the Fund NAV per investment into the investments table.

### A6. % of NAV Rollup ✅ FIXED
*(Confirmed fixed — now shows 60.5% + 39.5% = 100.0%.)*

### A7. P&L Tooltip — Revenue and OpEx Must Be Populated

The Quarterly P&L chart tooltip for 2024Q4 shows Revenue $0, OpEx $0, NOI $1.2M. This is mathematically impossible — NOI = Revenue − OpEx. Wherever NOI exists for a quarter, Revenue and OpEx breakdowns must also exist. Backfill the quarterly line-item data in the seed so that every quarter with a non-zero NOI has corresponding Revenue and OpEx values that net to that NOI figure. As a sanity check: if NOI = $1.2M and expenses are roughly 40% of revenue, seed Revenue ≈ $2.0M and OpEx ≈ $0.8M.

### A8. Scenario Compare Chart — Render All 5 Lines

Valuation & Returns → Scenario Compare chart: the legend correctly lists all 5 scenarios (Base Case, Upside, Downside, Sale Scenario 4, Sale Scenario 5) but only one line (Sale Scenario 4, blue) actually renders. The other four series have data — they are shown in the asset-level Scenario dropdown. Fix the chart component to iterate over all series in the data array and render a line per scenario. Each scenario should get its own color from the accent palette. Do not filter or short-circuit the series loop.

### A9. NAV Plunge in 2026Q1 — Investigate and Fix

The Value & NAV Trend chart on the Valuation & Returns tab shows a sharp drop in NAV in the most recent quarter (2026Q1) — from roughly $53M to $38.5M — while Asset Value continues rising to ~$60M. This divergence is unexplained by the model inputs. Investigate whether this is a data ingestion error, a missing snapshot record, or a calculation artifact from the quarter-close run. If the drop is not supported by actual underwriting assumptions, correct the seed data so the NAV trend is smooth and directionally consistent with the model inputs (cap rate 5.00%, rent growth 3.00%).

### A10. Valuation Method — Human-Readable Label ✅ FIXED
*(Confirmed fixed — "Direct Cap" displays correctly.)*

### A11. Scenario Assumptions — Differentiate by Asset Type and Seed Exit Values

The Fund → Scenarios tab shows every investment with identical assumptions: Cap Rate 5.50%, Rent Growth 3.0%, Hold 5 yrs, Exit Value $0. A real scenario would differentiate:

Seed the "Downside CapRate +75bps" scenario with realistic per-asset assumptions:
- Multifamily assets: Cap Rate 5.75%, Rent Growth 1.5%, Hold 7 yrs, Exit Value = NOI / 0.0575
- Office assets: Cap Rate 7.00%, Rent Growth 0.5%, Hold 5 yrs, Exit Value = NOI / 0.07
- Retail assets: Cap Rate 7.50%, Rent Growth 0.0%, Hold 5 yrs, Exit Value = NOI / 0.075
- Hotel / mixed-use: Cap Rate 8.00%, Rent Growth 1.0%, Hold 5 yrs, Exit Value = NOI / 0.08
- Student housing: Cap Rate 6.00%, Rent Growth 2.0%, Hold 6 yrs, Exit Value = NOI / 0.06

Exit Value must never be $0. Compute it from NOI ÷ exit cap rate if no override is stored.

### A12. Occupancy Rate Inconsistency Across Pages (NEW)

Two different occupancy figures appear for the same portfolio:
- Assets page header KPI strip: **AVG OCCUPANCY = 58.3%**
- Investments page detail panel for Cascade Multifamily: **91.8%**

The 58.3% figure at the portfolio level is almost certainly wrong — a 58% average occupancy across a 33-asset portfolio of active, stabilized assets is implausible. Investigate the denominator used for the portfolio-level average: it may be including assets with no occupancy data (counting them as 0%) rather than excluding them from the average. Fix so that portfolio-level avg occupancy only averages assets with a non-null occupancy value.

### A13. Dual NAV Figures on Investment Detail Page (NEW)

The Investment detail page shows two different NAV values for Cascade Multifamily:
- **KPI strip (top of page):** NAV = $44.0M
- **Capital & Returns panel:** Fund NAV Contrib = $64.5M

A single investment cannot have two different NAVs. Identify which source is correct and reconcile the two values to show the same figure. If they represent different concepts (e.g., gross asset NAV vs. fund-level NAV contribution after leverage), label them clearly and distinctly so the difference is self-evident.

### A14. Debt Summary — All Dashes (NEW)

The Asset cockpit / Investment detail Debt Summary section shows all dashes: Debt Balance —, Debt Service —, LTV —, DSCR —. No debt data is seeded for Cascade Multifamily. For a value-add multifamily asset with $59.8M gross value, seed a realistic debt structure:
- Debt Balance: ~$37M (approximately 62% LTV — typical for value-add)
- Interest Rate: 5.75% (fixed, consistent with 2022 vintage)
- Loan Maturity: 2027-06-01
- Debt Service (annual): ~$2.6M (estimated at ~7% of balance)
- DSCR: NOI ($4.7M annualized) / Debt Service ($2.6M) ≈ 1.81x
- LTV: $37M / $59.8M ≈ 61.9%
- Covenant: LTV ≤ 70%, DSCR ≥ 1.20x

This also resolves the WTD Avg LTV showing 10.5% at the portfolio level (a weighted average driven by zero-debt assets dominating the calculation).

### A15. NOI Delta +263.6% — Suspicious (NEW)

The asset cockpit KPI strip shows NOI = $4.7M with a delta of +263.6%. A 263% year-over-year NOI increase is implausible for a stabilized multifamily asset and is likely a calculation artifact related to the cap rate bug (non-annualized vs. annualized figures). Once A1 (cap rate annualization) is fixed, verify that the NOI delta recalculates to a reasonable figure (≤ ±20% for a stable asset). If it does not self-correct, investigate the prior-period NOI comparison baseline.

---

## Section B: Broken Pages — Fix or Hide

### B1. Intelligence Page — Fix API or Add Feature Flag

`/re/intelligence` shows a pink "Not Found" banner as the main content. The shell renders (Property Graph, Superforecaster) but the data fetch fails. Either:
- Fix the API call so the overview content loads, OR
- Add a feature flag (e.g., `SHOW_INTELLIGENCE_MODULE`) defaulting to false that hides the sidebar nav item and redirects the route until the page is complete

Do not ship the "Not Found" banner to users.

### B2. UW vs Actual Report — Fix API Endpoint

`/re/reports/uw-vs-actual` renders filter controls (Fund, As-of Quarter, Baseline IO/CF toggle, Level dropdown) correctly, but the data fetch returns "Not Found". The UW vs Actual report is a core deliverable. Fix the API route `/api/re/v2/reports/uw-vs-actual` so it returns underwriting-vs-actual data for the selected fund and quarter. If the data isn't seeded yet, seed representative UW (underwritten projections) vs Actual values for at least the two Cascade assets across 4 quarters.

### B3. Sustainability Module — Fix API or Add Feature Flag

`/re/sustainability` shows a "Not Found" banner on the Overview sub-tab. The module has 7 sub-sections (Portfolio Footprint, Asset Sustainability, Utility Bills, Certifications, Regulatory Risk, Decarbonization Scenarios, Reporting & Exports). Either:
- Fix the overview API so the module loads, OR
- Hide the Sustainability sidebar nav item behind a feature flag until the module is complete

Do not show broken banners. If hiding, the sidebar link should not appear at all.

### B4. Generate Report — Show Download on Success

The Generate Report modal (6 report types: Asset Snapshot, Quarterly P&L Package, Trial Balance Export, Transaction Ledger, Occupancy & Rent Summary, Asset Audit Pack) fires a POST to `/api/re/v2/assets/{assetId}/reports` and receives a 200 response — but nothing visible happens to the user. The JSON response is being swallowed silently.

Fix the handler to:
1. On success: show a toast notification ("Report generated") with a download link
2. Trigger a browser download of the returned file (if the response is a buffer/blob) OR open a new tab (if it returns a URL)
3. If the current response is JSON metadata only, update the API to return the actual report content (PDF or XLSX preferred) or a signed download URL

---

## Section C: Visual Consistency — Propagate the KpiStrip Pattern

The borderless inline KPI strip is correctly applied on the fund detail page and the admin Control Tower. Apply the same component everywhere KPIs currently appear as bordered cards.

### C1. Fund Portfolio Overview
Replace the four bordered cards (FUNDS: 3, TOTAL COMMITMENTS: $2.0B, PORTFOLIO NAV: $1.7B, ACTIVE ASSETS: 33) with the borderless KpiStrip component already used on the fund detail page.

### C2. Investment Detail Page
Replace the bordered KPI cards (NAV, NOI, GROSS VALUE, DEBT, LTV, IRR, MOIC, ASSETS) with the KpiStrip component. Same layout: label above in small mono caps, value below in tabular-nums.

### C3. Asset Cockpit — KPI Row
Replace the bordered KPI cards (NOI, Revenue, Occupancy, Value, Cap Rate, NAV) with the KpiStrip component. Keep delta indicators (↑↓ with bps/%) as they are — just remove the card borders and backgrounds.

### C4. Models Page
Replace the three bordered stat cards (TOTAL MODELS, DRAFT, APPROVED) with the KpiStrip component.

### C5. Model Detail Page — Overview Tab
Replace the four bordered stat cards (STRATEGY, IN SCOPE, OVERRIDES, CREATED) with the KpiStrip component.

---

## Section D: Chart Upgrades

### D1. Replace Default Recharts Colors With Accent Palette

Define a shared chart color array and apply it globally to all Recharts components:

```
CHART_COLORS = [
  "#38BDF8",  // sky-400 — primary line/bar
  "#34D399",  // emerald-400 — positive/upside
  "#F87171",  // red-400 — downside/negative
  "#FBBF24",  // amber-400 — base case / neutral
  "#A78BFA",  // violet-400 — scenario 5
]
```

Replace the default Recharts blue palette on: the NOI Over Time chart, the Value & NAV Trend, the Scenario Compare chart, the Cap Rate Sensitivity tornado, and the Asset Variance bar chart.

### D2. NOI Bridge — Proper Waterfall

The Ops & Audit → NOI Bridge currently renders three separate bars (Revenue, OpEx, NOI) side by side. Replace this with a proper waterfall chart:
- Bar 1: Revenue (full height, sky blue)
- Bar 2: OpEx as a downward step from Revenue (red, negative)
- Bar 3: NOI as the resulting level (green if positive)
- Connector lines between bars
- Labels at the top of each bar showing the dollar value

### D3. Synced Crosshair Across Cockpit Charts

When a user hovers over any chart in the asset cockpit (NOI Over Time, Value & NAV Trend, Scenario Compare), the crosshair position should sync across all charts at the same x-axis quarter. Use a shared `activeQuarter` state hoisted above the chart container, passed as `syncId` or as a controlled `tooltipIndex` prop to each Recharts component. This is the single highest-impact UX improvement for power users.

### D4. Dimmer Grid Lines, No Dots on Line Charts

On all line charts: set `dot={false}` on `<Line>` components. Reduce grid line opacity to ~15% (`stroke="rgba(0,0,0,0.12)"` in light mode). This makes the lines read as the primary element rather than the grid.

---

## Section E: AI Features

This section is the most strategic part of the build. The target architecture mirrors what a Lead AI & Data Engineering role at a serious institutional RE firm would own: RAG pipelines, entity intelligence, investment Q&A grounded in documents, semantic search, anomaly detection, and a full LLM audit layer. Every sub-section below maps to that capability set.

**Current AI status (verified in live testing, March 5 2026):**
- Winston Command Center Plan → Confirm → Execute pipeline: ✅ Live and functional for structural operations
- Route context injection (asset UUID in workspace route): ✅ Working — route updates when Winston opened from asset page
- Quick Action adaptation by page context: ✅ Partially working — asset-page Quick Actions correctly change to RE-specific prompts ("Summarize key risks", "Compare to underwriting", "Draft LP update", "Identify covenant risk", "Cap rate impact on NAV")
- Business entity name in workspace context ("Business: none"): ❌ Not passing asset name/entity
- Analytical Q&A (portfolio data questions): ❌ "No implemented operation matches this request" for all analytical queries
- Document-grounded Q&A (RAG): ❌ Not built — "Recent Documents" also returns no implemented operation
- Generate Report API: ❌ 200 response but no visible output

---

### E1. RAG Pipeline — Document Ingestion, Chunking, Embedding, and Retrieval

Build the core Retrieval-Augmented Generation pipeline that powers all document-grounded AI features in the platform.

**Ingestion:**
When a document is uploaded to any asset's Attachments panel, trigger an ingestion pipeline that:
1. Extracts full text from the document (PDF, DOCX, XLSX)
2. Chunks the text into overlapping segments of ~400 tokens with 50-token overlap
3. Attaches metadata to each chunk: `{ assetId, investmentId, fundId, docName, docType, quarter, pageNumber, chunkIndex }`
4. Generates an embedding for each chunk using the configured embedding model (OpenAI `text-embedding-3-small` or equivalent)
5. Stores chunks + embeddings in the vector store (Pinecone or Cosmos DB vector workload), keyed by the metadata above

**Retrieval:**
When a user submits a query in the Winston Command Center or asset Q&A panel:
1. Embed the query using the same model
2. Run a vector similarity search against the store, filtered to the current `assetId` and/or `fundId` scope
3. Apply a reranking pass (cross-encoder or LLM-based relevance scoring) on the top-20 retrieved chunks
4. Pass the top-5 reranked chunks as grounding context to the LLM, alongside the user's query and the current asset KPIs

**Chunking strategy by document type:**
- Rent rolls: chunk by unit block (10-15 rows per chunk), preserve column headers in every chunk
- Financial statements: chunk by section (Income Statement, Balance Sheet, NOI Bridge) — do not split across sections
- Appraisal reports: chunk by section (Executive Summary, Market Analysis, Valuation Approaches, Concluded Value)
- OM / IC memos: chunk by paragraph, preserve section headings as prefix metadata

Store the full pipeline as an auditable record: for each query, log which documents were retrieved, which chunks were used, the relevance scores, and the final LLM response.

---

### E2. Investment Q&A — Document-Grounded Chat

Add a persistent Q&A chat panel to the asset cockpit (alongside or within the Winston Command Center) that answers questions grounded in the asset's uploaded documents and live KPI data.

**Behavior:**
- User asks: "What is the current occupancy trend and how does it compare to the appraiser's assumption?"
- System retrieves relevant chunks from the appraisal report and the most recent rent roll
- System injects the current KPIs (Occupancy: 92.0%, Revenue: $6.3M) alongside the retrieved context
- LLM generates a response that cites the specific document and section: *"Per the Q3 2024 appraisal (p. 14), the appraiser assumed 94% stabilized occupancy. Current trailing occupancy is 92.0% based on the most recent rent roll, suggesting a 200bps underperformance vs. assumption."*

**Citation rendering:**
Every LLM response that references a document must include an inline citation chip showing the document name, page number, and a link to the source document in the Attachments panel. Do not generate responses that assert document-sourced facts without a citation. If no relevant document context is found, the response must say so explicitly rather than hallucinating.

**Scope control:**
The chat scope should be selectable: Asset (documents for this asset only), Investment (all assets in the investment), Fund (all assets across the fund). Show the active scope in the panel header.

**Suggested queries to surface as pills:**
- "Summarize this asset's rent roll as of last quarter"
- "What are the key risks identified in the most recent appraisal?"
- "How does actual NOI compare to the underwriting model?"
- "Are there any lease expirations in the next 12 months?"
- "Draft an LP update paragraph for this asset"
- "What would a 50bps cap rate expansion do to NAV at current NOI?"
- "Flag any covenant conditions referenced in the loan documents"

---

### E3. Semantic Search — Across Assets, Documents, and Entities

Add a platform-level semantic search bar (accessible from the global header or via a keyboard shortcut such as Cmd+K) that searches across:

1. **Assets** — by name, location, sector, fund, or any KPI range ("show me assets with occupancy below 90%")
2. **Documents** — full-text and semantic search across all uploaded attachments across all assets the user has access to ("find all documents mentioning covenant")
3. **Funds** — by strategy, vintage, or metric ("funds with DPI below 0.1x")
4. **Investments** — by name, stage, or geographic market

Results should be grouped by type (Assets, Documents, Funds) and ranked by semantic relevance. Document results should show the matching chunk and its source document with a link.

The search index is the same vector store used by the RAG pipeline — no separate indexing required.

---

### E4. Entity Intelligence Layer — Graph-Style Relationships

Build an entity intelligence model that captures relationships across the platform's core objects (Fund → Investment → Asset → Document → Quarter → Scenario) and exposes them to the AI layer for relationship-aware reasoning.

**Relationships to model:**
- Fund owns Investment, Investment owns Asset(s)
- Asset has Documents (by type: appraisal, rent roll, loan agreement, IC memo, operating statement)
- Asset has QuarterlySnapshots (NOI, Revenue, Occupancy, NAV by quarter)
- Asset has Scenarios (Base, Upside, Downside — each with its own assumption set and projected outputs)
- Investment has Covenants (LTV threshold, DSCR threshold, occupancy floor)

**Expose to AI:**
When a user asks "Which assets in this fund are at risk of breaching their LTV covenant?", the system should:
1. Retrieve each asset's current LTV and its covenant threshold from the entity graph
2. Compute headroom for each
3. Rank assets by covenant proximity
4. Return a structured list with asset name, current LTV, covenant threshold, and headroom in bps

This does not require a literal graph database — a well-structured relational schema with the above relationships, exposed as typed context to the LLM, achieves the same reasoning capability.

---

### E5. Anomaly Detection — Flag Unusual Metric Movements

Run a lightweight anomaly detection pass on asset and fund metrics each time a quarter-close run completes. Flag anomalies in the UI with a warning indicator.

**Metrics to monitor:**
- NOI quarter-over-quarter change > ±20%
- Occupancy drop > 5 percentage points in a single quarter
- Cap rate movement > ±75bps quarter-over-quarter
- Revenue growth diverging > 500bps from the modeled rent growth assumption
- Fund NAV change > ±10% in a quarter with no corresponding capital event

**Display:**
- Show a small warning badge (⚠) on the affected KPI in the cockpit
- On hover, show: "NOI dropped 28% QoQ — outside the normal ±20% range. Last occurrence: Q2 2023."
- In the Ops & Audit tab, add an "Anomaly Log" sub-section listing all flagged events with timestamps and severity

---

### E6. Asset-Context Injection Into Winston Command Center

**Current state:** Route context IS passing — when Winston is opened from an asset page, the workspace panel correctly shows the asset UUID in the Route field. However, `Business: none` persists — the asset name, KPIs, covenants, and attachment count are not being injected into the workspace payload.

**Required fix:** When the Winston Command Center is opened from an asset detail page, inject the current asset's context into the workspace payload and surface it in the panel:

```json
{
  "assetId": "<current asset id>",
  "assetName": "Cascade Multifamily",
  "currentKpis": {
    "noi": 4700000,
    "nav": 39000000,
    "grossValue": 59800000,
    "capRate": 0.0786,
    "irr": 0.125,
    "occupancy": 0.92,
    "ltv": 0.619
  },
  "attachmentCount": 20,
  "fund": "Institutional Growth Fund VII",
  "activeScenario": "Base Case",
  "covenants": {
    "ltvThreshold": 0.70,
    "dscrFloor": 1.25,
    "occupancyFloor": 0.85
  }
}
```

Replace "Business: none" in the workspace panel with "Asset: Cascade Multifamily · Fund: Institutional Growth Fund VII". Include covenant status (In Compliance / At Risk / Breached) as a visible inline indicator.

---

### E7. LLM Audit Trail and Retrieval Governance

Every AI-generated response in the platform must be logged and auditable. This is a non-negotiable requirement for institutional use.

**Log per query:**
- Timestamp and user ID
- Query text
- Scope (assetId, fundId, envId)
- Retrieved document chunks (chunk IDs, relevance scores, source document names)
- Final prompt sent to the LLM (truncated for PII but complete enough to audit)
- LLM response
- Response latency
- Model used and token counts (prompt + completion)

**Display in UI:**
- Add an "AI Activity" sub-tab inside the Ops & Audit tab for each asset
- Show a chronological log of all AI queries and responses for this asset, with the retrieved citations visible inline
- Add a "View Reasoning" expand control on each response that shows which chunks were retrieved and their scores

**Retrieval quality:**
- Track retrieval hit rate: what % of queries returned at least one chunk with relevance score > 0.75
- Track citation coverage: what % of LLM responses included at least one inline citation
- Expose these as admin-level metrics in the Control Tower environment detail view

---

### E8. Upload Demo Documents to Attachments

The Ops & Audit → Attachments panel shows "0 files — no attachments yet." The 20 demo documents built for Cascade Ridge Apartments should be uploaded and associated with this asset. Ensure:
- The attachment system accepts PDF and DOCX
- Each uploaded document triggers the RAG ingestion pipeline (E1)
- The file count, names, document type tags, and upload dates appear in the Attachments section
- Documents are categorized by type: Appraisal, Rent Roll, Operating Statement, Loan Agreement, IC Memo, Market Report

---

### E9. Contextual Quick-Action Prompts — Wire to Backend

**Current state:** The Quick Actions ARE context-aware at the UI level. When Winston is opened from an asset page, the quick actions correctly change from generic admin actions to asset-specific RE prompts:
- "Summarize key risks" → fires query: "Summarize this asset's key risks based on current KPIs, debt metrics, and market position."
- "Compare to underwriting" → fires query about UW comparison
- "Draft LP update" → fires LP update query
- "Identify covenant risk" → fires covenant analysis query
- "Cap rate impact on NAV" → fires sensitivity query

**The UI layer is complete. The backend execution layer needs to be built.** All of the above queries currently return "No implemented operation matches this request." Build the operation handlers that fulfill these analytical queries by:
1. Fetching the current asset KPIs from the database for the active assetId
2. (Once E1 is built) Retrieving relevant document chunks from the vector store
3. Composing a structured LLM prompt combining KPI data + document context
4. Returning a well-formed analytical response with citations

Do not change the Quick Action labels or query text — these are well-written. Build the backend to fulfill them.

---

## Section F: Seed Data Completeness

### F1. Populate Fund Overview Empty States

Fund detail → Overview tab has two empty-state cards:
- **Top Performers by IRR Contribution:** Should show the top 3–5 investments ranked by IRR contribution to the fund. Compute IRR contribution as: (investment IRR × investment NAV weight). Seed or calculate this and render as a ranked list with investment name, IRR, and contribution in basis points.
- **Capital Activity Timeline:** Should show a timeline of capital events (calls and distributions) by quarter. Seed at least 4–6 capital call events and 2 distribution events for 2024–2025 and render as a timeline or bar chart.

### F2. Avg Rent/Unit — Populate in Property Details

Model Inputs → Property Details → Avg Rent/Unit shows "—". For Cascade Multifamily with 240 units and annual revenue of approximately $6.3M, the average rent per unit ≈ $2,187/month ($6,300,000 / 240 / 12). Seed this value.

### F3. Rename Duplicate Model in Seed

The Models list shows "Morgan QA Downside" appearing twice (the client-side duplicate guard now prevents new duplicates, but the two existing ones remain). Rename one in the seed script to "Morgan QA Downside v2". Add a uniqueness constraint at the database level to prevent future collisions.

---

## Section G: UX Polish

### G1. Asset Header — Add Location and Type Chips

The asset cockpit header currently shows the property name and a "● active" status badge. Add:
- Property type chip: "Value-Add Multifamily"
- Location chip: "Aurora, CO"
- MSA chip: "Denver MSA"
- Fund association: "Institutional Growth Fund VII"

Render these as small inline chips below the asset name, before the tab row.

### G2. Sidebar Duplicate-Name Guard for Models ✅ FIXED
*(Client-side validation confirmed working — inline warning shown and Create button disabled for duplicate names.)*

### G3. Stray "0" Label on Investment Detail Page (NEW)

A floating "0" label appears between the NOI Over Time chart and the Sector Exposure section on the Investment detail page. This appears to be an unrendered data value being leaked into the DOM — likely a chart label, a defaulted numeric field, or a conditional render with a falsy check returning `0` instead of `null`. Find the source and suppress it. The fix is likely changing `value && <Label>` to `value != null && value !== 0 && <Label>` or similar.

---

## Acceptance Criteria

After these fixes are applied, the following should be true:

1. Cap rate on Cascade Multifamily is between 4.5% and 8.5% — not 31.30%
2. Asset location displays "Aurora, CO" everywhere — not Atlanta
3. Unit count is 240 everywhere — not 280; unit type label shows "units" not "sf"
4. Year Built displays "2016" — no comma ✅ DONE
5. Fund NAV column is populated for all 12 investments in the fund overview
6. % of NAV sums to approximately 100% in the investment detail assets table ✅ DONE
7. P&L tooltips show non-zero Revenue and OpEx for all quarters with non-zero NOI
8. Scenario Compare chart renders all 5 scenario lines simultaneously
9. Intelligence, UW vs Actual, and Sustainability pages either load correctly or are hidden — no pink "Not Found" banners visible
10. Generate Report produces a visible download or toast on success — not silence
11. KpiStrip (borderless, inline) is applied on Fund Portfolio, Investment detail, Asset cockpit, Models, and Model detail pages
12. All cockpit chart lines use the accent palette — not default Recharts blue
13. NOI Bridge is a waterfall — not three side-by-side bars
14. Scenario assumptions differ by asset type and no asset has Exit Value = $0
15. Uploading a document to Attachments triggers the RAG ingestion pipeline — chunks, embeds, and indexes it
16. The Winston Q&A panel answers document-grounded questions with inline citations (document name + page number) — no uncited assertions
17. The Cmd+K semantic search returns results across assets, documents, and funds
18. Winston Command Center shows current asset name and KPIs (not "Business: none") when opened from an asset page
19. Every AI response is logged in the Ops & Audit → AI Activity tab with retrieved chunks and relevance scores visible
20. Anomaly detection flags a ⚠ badge on any KPI that moved outside threshold between quarters
21. Cascade Multifamily has 20 demo documents in its Attachments panel, each tagged by type (Appraisal, Rent Roll, etc.)
22. Fund overview Top Performers and Capital Activity Timeline are populated — not empty states
23. No duplicate model names in any fund's model list
24. Portfolio-level AVG OCCUPANCY reflects only assets with non-null occupancy data — not dragged down by zero-data assets
25. Investment detail shows one consistent NAV figure — KPI strip and Fund NAV Contrib are reconciled
26. Cascade Multifamily has a seeded debt record with realistic LTV (~62%), DSCR (~1.8x), debt balance (~$37M)
27. No stray "0" labels floating between page sections
