# Winston Platform Review
### RE Expert Assessment — Meridian Capital Management Demo Environment
*Reviewed: March 2026 · Cascade Multifamily / Institutional Growth Fund VII*

---

## TL;DR

The platform architecture is strong and the right features are in the right places. A PE asset manager or fund controller will recognize the vocabulary immediately — DPI/TVPI/Gross IRR, waterfall, asset variance, cap rate sensitivity. The information hierarchy (Fund → Investment → Asset) is correct. But there are five data bugs that will torpedo a live demo, two dead features that are your biggest prospect magnets, and several UX patterns that don't match institutional RE convention. These are all fixable. Below is the full breakdown.

---

## AI Eval Test Results

**Status: Blocked — 0 documents uploaded to Cascade Multifamily**

The document upload zone is in the Ops & Audit tab → Attachments section. It shows "0 files" with a clean drag-and-drop zone. The Generate Report button is present on every asset page but **fires zero API calls on click** — confirmed via network monitoring. Until the 20 demo documents are loaded and the RAG pipeline is activated, none of the 7 eval tests can be run.

**Recommended action:** Upload all 20 Cascade Ridge demo documents to the Attachments zone, then re-run the test suite starting with the Litmus Test: *"Are we about to breach our loan covenant?"*

---

## Data & Calculation Bugs

### 🔴 Bug 1 — Cap Rate is 4× Too High (31.30% vs ~7.9%)

**Where:** Asset page → Valuation & Returns → Current Snapshot

**What's happening:** The Current Snapshot explicitly labels the income figure as **"NOI (Qtr) $4.7M"** — but the cap rate formula is applying this quarterly figure directly as if it were annual: $4.7M / $59.8M = 7.9% × 4 = 31.3%. The system is not annualizing before dividing.

**Fix:** Multiply NOI (Qtr) × 4 before the cap rate calculation, or swap in the TTM NOI field. The correct cap rate for Cascade Ridge is ~7.9% — which is a plausible, market-rate number for value-add multifamily in the Denver MSA.

**Why it matters in a demo:** This is the first number a prospect sees on the Valuation tab. 31.30% will either cause them to laugh or assume your data engine is broken. The Cap Rate Sensitivity tornado chart compounds the problem — it's beautifully designed but anchored to a nonsensical current value.

---

### 🔴 Bug 2 — NAV = $0 Historically / No Asset-Level NAV Rollup

**Where:** Asset page → Value & NAV Trend chart; Fund page → Investment table (Fund NAV column)

**Two separate manifestations:**
- The Asset Value & NAV Trend chart shows Asset Value climbing from ~$52M to $59M over 2024Q4–2026Q1, but the NAV line stays flat at **$0** for every historical period, then spikes vertically at a future date.
- The Fund overview lists 12 investments, all with **"—"** in the Fund NAV column — despite the fund header showing $425M total NAV.

**Fix:** The NAV rollup from asset to investment to fund level is not wiring through. The asset-level NAV ($39M is shown correctly in the snapshot header) needs to flow into the trend chart historically and roll into the investment table.

---

### 🔴 Bug 3 — Scenario Compare Renders Only 1 of 5 Lines

**Where:** Asset page → Valuation & Returns → Scenario Compare

**What's happening:** The legend correctly shows all 5 scenarios — Base Case (green), Downside CapRate +75bps (orange), Upside NOI Growth +10% (red), Sale Scenario 1 (purple), Sale Scenario 4 (blue). Only Sale Scenario 4 renders as a visible line. The other four are present in the legend but invisible in the chart.

**Fix:** Likely a Z-order, opacity, or data-binding issue on the first four series. All five should render with distinct lines. For institutional RE audiences, scenario overlays are one of the most-used views — this needs to work.

---

### 🔴 Bug 4 — Asset Variance Sign Convention Error (–400% Variances)

**Where:** Fund page → Asset Variance tab → Line Item table

**What's happening:** Expense line items (Administrative, Insurance, Property Mgmt Fee) show **Actual as negative** (e.g., Admin: $–220K) while **Plan is positive** ($72K). This produces nonsensical variance percentages of –405%, –400%, –406%. The three values being almost identical (~–400%) also suggests placeholder data that isn't differentiated by property.

**Fix:** Normalize sign convention — expenses should be consistently negative (or consistently positive) in both Actual and Plan columns. The variance calculation should reflect "did we spend more or less than planned," not a mixed-sign artifact.

---

### 🟡 Bug 5 — "Fund" Nav Button Goes to Admin, Not Fund Dashboard

**Where:** Top navigation bar → "Fund" button (visible from asset pages)

**What's happening:** Clicking the "Fund" button in the top-right nav sends users to `/admin` (Control Tower) instead of the current fund's detail page. This is likely a missing context parameter — the nav link should resolve to the current fund in scope.

**Fix:** Pass the current fund ID as context to the Fund nav link. Expected destination: the Institutional Growth Fund VII dashboard.

---

### 🟡 Bug 6 — Wrong Location (Atlanta, GA vs Aurora, CO)

**Where:** Asset page header subtitle: "PROPERTY · multifamily · **Atlanta, GA**"

**What's happening:** Cascade Ridge Apartments is in **Aurora, CO** (Denver MSA). Every market comp, rent growth assumption, and economic overlay depends on MSA. Having the wrong city in the header is a credibility issue — any RE prospect will spot it immediately.

---

## UX & Aesthetic Observations

### What Works Well

**The Fund-level KPI layout is institutional-grade.** Committed / Called / Distributed / NAV on the left, DPI / TVPI / Gross IRR / Net IRR on the right — this is the exact layout a fund controller or LP would expect. The gross-to-net IRR spread (12.4% → 9.9%, 250bps) is realistic and shows fee drag is accounted for.

**The Asset Variance chart (Budget vs Actual by line item)** is the strongest view in the platform. The dual-bar (actual blue vs. plan grey) with green/red variance callouts and the Over/Under Budget summary boxes are clean, scannable, and match how institutional operators review monthly financials. This is the view that will resonate most with operators and asset managers.

**The document upload zone** in Ops & Audit is clean — the drag-and-drop UI with "PDF, DOCX, XLSX, PNG — any format" copy sets the right expectation. The "Generate Report" button placement (top right, blue CTA) is correct.

**The breadcrumb navigation** (Institutional Growth Fund VII / Cascade Multifamily / Cascade Multifamily) correctly communicates the hierarchy. Prospects need to feel oriented in the fund structure.

**Fund portfolio table** (Fund Name, Strategy, Vintage, AUM, NAV, DPI, TVPI, Status) covers all the right columns. A GP managing multiple funds will immediately understand the structure.

---

### What Needs to Change

**1. Generate Report must do *something* in the demo.**
This is almost certainly the first button a prospect clicks. Right now it fires nothing. Even a modal that says "Upload documents to your Ops & Audit tab to generate your first AI-powered asset report" would be better than silence. Better yet: pre-load the 20 Cascade Ridge docs and make the button generate a real report. This is your product's signature capability — it can't be dead in a demo.

**2. Model Inputs tab is mostly blank.**
Avg Rent/Unit, MSA, Square Feet, City/State, Debt Service — all showing "—". These are the underwriting fields every analyst fills in on day one. For the demo, seed these with Cascade Ridge's actual figures: 240 units, $2,100/unit/month avg rent, Aurora CO / Denver MSA, ~285K SF, $28.35M debt at SOFR+285bps.

**3. The NOI Bridge is not a bridge chart.**
It's showing three separate vertical bars (Revenue, OpEx, NOI) side by side. An NOI bridge is a **waterfall chart**: Revenue as the starting bar, then OpEx as a downward connector (negative, shown in red), landing at NOI as the end bar. Every Argus user, every REPE analyst, every asset manager knows this format. The current three-bar layout is technically readable but doesn't match industry convention — and a prospect might not immediately understand that OpEx is floating.

**4. Add TTM/LTM toggle everywhere NOI appears.**
The biggest point of confusion in this platform is quarterly vs. annual NOI. Standard institutional convention is to show TTM (trailing twelve months) by default, with the period explicitly labeled. Add a small toggle or period selector: "Q | TTM | LTM" on every NOI/NOI-derived metric. This also fixes the cap rate bug at the display layer.

**5. Fund Overview "No data" empty states need placeholder content.**
"No contribution data available yet" and "No capital activity data available" on the Fund Overview are dead zones. For a demo environment, pre-populate these with:
- Top Performers by IRR Contribution: show the top 3 investments with mock contribution bars
- Capital Activity Timeline: show a quarterly cadence of calls and distributions since vintage 2024

**6. Intelligence section needs a seeded MSA.**
The CRE Intelligence Graph (Miami Forecast Cockpit) shows a "Not Found" error and 0 properties. The copy says "Run the CRE backfill to seed the Miami slice" — that's an internal operations instruction, not something a prospect should see. Either seed the Miami slice before demos or replace the empty state with a placeholder that looks intentional.

**7. Property type labels could be more specific.**
The asset page says "multifamily" but for a 240-unit value-add deal the standard label is **"Value-Add Multifamily"** or just "Garden Multifamily." Small detail, but RE investors categorize by both property type and strategy.

**8. Scenario naming convention.**
"Sale Scenario 4" and "Downside CapRate +75bps" mix two different naming conventions. Institutional platforms use either descriptive names (Base / Bull / Bear + Exit Year) or structured names (S1/S2/S3). Pick one and apply it consistently. "Downside CapRate +75bps" is actually very good — it tells you exactly what's stressed. "Sale Scenario 4" tells you nothing without context.

---

## What a PE Prospect Will Think (Honest Assessment)

| Question a Prospect Will Ask | Current State |
|---|---|
| "Is this data right?" | No — cap rate is 4× too high, location is wrong |
| "Can it generate a report on my deal?" | Not yet — button is dead |
| "Does it understand my covenant structure?" | Can't test — no docs loaded |
| "Does it roll up from asset to fund correctly?" | Partially — NAV doesn't roll up |
| "Can I run scenarios?" | Partially — 1 of 5 scenarios renders |
| "Is it audit-ready?" | Budget variance is strong, but sign conventions are broken |
| "Would I show this to an LP?" | Not yet — cap rate and NAV bugs are disqualifying |

---

## Priority Fix List

| Priority | Fix | Effort |
|---|---|---|
| P0 | Fix cap rate formula (annualize quarterly NOI) | Low |
| P0 | Fix asset/location — Aurora CO, Denver MSA | Low |
| P0 | Upload 20 Cascade Ridge docs → activate Generate Report | Medium |
| P1 | Fix NAV rollup (asset → investment → fund) | Medium |
| P1 | Fix Scenario Compare (render all 5 lines) | Medium |
| P1 | Fix variance sign convention | Low |
| P2 | Fix "Fund" nav button context | Low |
| P2 | Populate Model Inputs with Cascade Ridge UW data | Low |
| P2 | Rebuild NOI Bridge as a proper waterfall chart | Medium |
| P3 | Add TTM toggle on NOI metrics | Medium |
| P3 | Seed Intelligence with Miami MSA data | High |
| P3 | Replace Fund Overview empty states with demo data | Medium |

---

## AI Build Plan — Making the Intelligence Layer Real

*What needs to exist for the Generate Report button, document chat, and RAG pipeline to actually work.*

---

### Current State (Confirmed via Network Inspection)

- Document upload zone: **exists** (Ops & Audit → Attachments, drag-and-drop, 0 files)
- Generate Report button: **exists but dead** — zero API calls on click
- Chat interface: **does not exist** — no chat component anywhere in the DOM
- RAG pipeline: **not wired** — no `/api/report`, `/api/chat`, or `/api/embed` calls observed

The three components that need to be built, in order of dependency:

```
[1] Document Ingestion & Embedding  →  [2] Report Generation  →  [3] Chat Interface
```

---

### Component 1 — Document Ingestion & Embedding Pipeline

This is the foundation. Nothing else works without it.

**What it does:** When a user uploads a file to the Attachments zone, the backend should automatically parse, chunk, embed, and store it so it can be retrieved by the AI at query time.

**Upload trigger (frontend)**

The existing drag-and-drop zone needs a `POST /api/assets/{assetId}/documents` call on file drop. Currently it accepts the file but fires nothing.

```
POST /api/assets/{assetId}/documents
Content-Type: multipart/form-data

→ Returns: { documentId, filename, status: "processing" | "ready" }
```

**Backend processing pipeline**

Each uploaded document should go through:

1. **Parse** — extract raw text by file type
   - `.pdf` → `pdfplumber` or `pymupdf` (handles scanned PDFs via OCR fallback)
   - `.docx` → `python-docx`
   - `.xlsx` → `openpyxl` → convert sheets to structured text/markdown tables
   - `.png` → vision model OCR pass

2. **Chunk** — split into overlapping chunks for retrieval
   - Recommended: 512 token chunks, 64 token overlap
   - Respect document structure: don't split mid-table or mid-clause
   - Metadata to attach to every chunk: `{ assetId, documentId, filename, page, chunkIndex, docType }`

3. **Embed** — run chunks through an embedding model
   - OpenAI `text-embedding-3-large` or equivalent
   - Store vectors in a vector DB scoped to the asset

4. **Index** — store in vector DB with asset-level namespace
   - Pinecone, Weaviate, pgvector (if you're already on Postgres), or Supabase's built-in pgvector
   - Namespace structure: `env:{envId}:asset:{assetId}` — lets you retrieve only docs for the current asset

5. **Status update** — webhook or polling back to frontend when `status: "ready"`
   - The Attachments section should show a processing indicator per file, then a green checkmark when embedded

**Document type hints**

The 20 Cascade Ridge documents cover distinct document types that the AI should understand differently. Tag each on upload:

| Document Type | Retrieval Behavior |
|---|---|
| Loan Agreement / Promissory Note | High-priority for covenant queries |
| Asset Management Report (Q3, Monthly) | Time-stamped; retrieve most recent first |
| Rent Roll | Tabular; parse as structured data, not prose |
| Budget / CapEx Log | Tabular; pair with variance data from platform |
| Valuation Memo / Market Study | Use for cap rate and market comp queries |
| Insurance Certificate | Retrieve for coverage/compliance queries |

---

### Component 2 — Generate Report

**What it should do:** When the user clicks Generate Report on an asset page, the AI retrieves relevant document chunks for that asset, synthesizes them with the platform's structured data (NOI, occupancy, DSCR, budget variance), and produces a formatted asset summary report.

**API endpoint**

```
POST /api/assets/{assetId}/report
Body: { reportType: "asset_summary" | "covenant_check" | "variance_commentary" }

→ Streams back: structured report sections as server-sent events (SSE)
→ Or: returns { reportId } and client polls GET /api/reports/{reportId}
```

**Report structure (suggested for asset_summary)**

The generated report should mirror the structure of Document 12 in the demo library (Q3 Asset Management Report):

```
1. Executive Summary          ← AI-synthesized from uploaded AM reports + platform KPIs
2. Financial Performance      ← Platform data (NOI, revenue, occupancy) + variance commentary from docs
3. Debt & Covenant Status     ← Pulled from Loan Agreement, promissory note, Cash Management Agreement
4. Capital Expenditures       ← From CapEx Log + Asset Management Plan
5. Market Context             ← From Market Study + Valuation Memo
6. Risks & Open Items         ← AI-extracted from AM report narrative sections
7. Recommended Actions        ← AI-generated based on variance + covenant proximity
```

**Retrieval strategy (RAG)**

For each section, query the vector DB with targeted prompts:

```python
# Example for Debt & Covenant Status section
chunks = vector_db.query(
    namespace=f"asset:{assetId}",
    query="loan covenant DSCR minimum LTV trigger cash sweep",
    top_k=8,
    filter={"docType": ["loan_agreement", "promissory_note", "cash_management"]}
)
```

Combine retrieved chunks with structured platform data (current DSCR, LTV, debt yield from the Cockpit) and pass to the LLM with a system prompt that instructs it to reason about covenant compliance before writing the section.

**Rendering**

The generated report should open in one of:
- A **slide-out panel** on the right side of the asset page (keeps context visible)
- A **dedicated report page** at `/assets/{assetId}/reports/{reportId}`
- A **modal with export to PDF** option (highest demo impact — prospect can take it home)

Streaming is strongly preferred over a loading spinner — watching the report write itself in real time is the most compelling AI demo moment.

---

### Component 3 — Chat Interface

**What it should do:** After a report is generated (or independently), the user can ask follow-up questions grounded in the uploaded documents and platform data.

**Where it lives**

Two options — pick one:

- **Persistent sidebar panel** on every asset page (appears once docs are uploaded). This is the highest-value placement — the user is looking at the Cockpit KPIs and can ask "why is NOI up 9.3% vs plan?" and get an answer grounded in the variance commentary document.
- **Embedded in the report view** — chat appears below or beside the generated report, so questions are contextually scoped to what was just generated.

**API endpoint**

```
POST /api/assets/{assetId}/chat
Body: {
  message: "Are we about to breach our loan covenant?",
  sessionId: "uuid",          // maintains conversation history
  reportId: "uuid" | null     // optional — scope to a specific report's context
}

→ Streams back: { role: "assistant", content: "..." } as SSE
```

**System prompt structure**

```
You are Winston, an AI assistant for institutional real estate asset management.
You have access to the following documents uploaded for {assetName}:
  - {list of uploaded document filenames and types}

You also have access to the following current platform data:
  - NOI (TTM): ${noiTTM}
  - DSCR: {dscr}
  - LTV: {ltv}
  - Occupancy: {occupancy}%
  - Cap Rate: {capRate}%
  - Loan Maturity: {loanMaturity}

Answer questions accurately using the documents. When citing a specific figure or clause,
reference the source document and page. If you cannot find information in the documents,
say so — do not hallucinate. Flag covenant proximity issues proactively.
```

**Conversation memory**

Maintain a session-scoped message history so follow-up questions have context:

```
User: "Are we about to breach our loan covenant?"
Winston: "Based on the Loan Agreement (Section 6.2), the minimum DSCR covenant is 1.15x.
         Current DSCR is 1.19x — you have 4bps of headroom. Given the Q3 variance
         commentary noting $726K utility over-run and $1.2M real estate tax over-run,
         if those trends continue into Q4 you could breach by Q1 2026."

User: "What triggers the cash sweep?"
Winston: [already knows this is about the same loan, retrieves Cash Management Agreement]
```

**Source citations**

Every response should show which documents were used, e.g.:

```
Sources: Loan Agreement (p.14, §6.2) · Q3 AM Report (p.3) · Cash Management Agreement (p.7)
```

This is the single feature that will make a compliance officer or fund controller lean forward in the demo.

---

### Component 4 — Document Status UI (Prerequisite for Everything)

The Attachments section needs a processing state so users know when docs are ready for AI queries.

**Current state:** Files can be dropped but there's no feedback (and no processing happening).

**Required states per document:**

```
[ uploading... ]  →  [ processing... ]  →  [ ✓ ready ]  or  [ ⚠ parse error ]
```

Show a small status badge next to each file. Once all files are `ready`, the Generate Report button should become active (currently it's always-on but dead). Consider disabling it with a tooltip ("Upload documents to generate a report") until at least one doc is processed.

---

### Component 5 — The Litmus Test Experience

The One-Question Litmus Test from the eval suite is: *"Are we about to breach our loan covenant?"*

This should be a **showcase moment** in the demo, not just a test. Here's how to stage it:

1. Docs are pre-loaded (all 20 Cascade Ridge files)
2. User opens the chat panel and types the litmus test question
3. Winston retrieves: Loan Agreement §6.2 (DSCR minimum 1.15x), Q3 AM Report variance, Cash Management Agreement sweep triggers
4. Winston responds: current DSCR 1.19x, 4bps headroom, flags the utility + RE tax over-run trajectory, surfaces the cash sweep threshold
5. Source citations appear: "Loan Agreement p.14 · Q3 AM Report p.3 · Cash Management Agreement p.7"
6. Follow-up: user asks "what happens if we breach?" → Winston pulls the cure period and remedy clauses from the loan docs

That six-turn demo sequence closes deals. It shows the AI reading legal docs, cross-referencing operational data, and surfacing risk proactively — which is exactly what a $500M fund manager would pay for.

---

### Recommended Stack

| Layer | Recommendation | Notes |
|---|---|---|
| Embedding model | `text-embedding-3-large` (OpenAI) | 3072 dims, best retrieval quality |
| Vector DB | pgvector (Supabase) | Already likely on Postgres; avoids new infra |
| LLM | Claude claude-sonnet-4-6 | Best at long-document reasoning; handles 200K context |
| Chunking | LlamaIndex or LangChain | Handles PDF/DOCX/XLSX parsing + chunking in one library |
| Streaming | Server-Sent Events (SSE) | Native to Next.js; works with Vercel Edge |
| Auth scoping | Asset-level namespace in vector DB | Critical — no cross-tenant data leakage |

---

### Build Order

```
Week 1   Upload → Parse → Chunk → Embed → Store (pgvector)
         Document status UI (uploading / processing / ready)

Week 2   Generate Report endpoint + SSE streaming
         Report render (slide-out panel or modal)

Week 3   Chat interface (sidebar panel, session memory)
         Source citations in responses

Week 4   System prompt tuning against the 7 eval tests
         Litmus test rehearsal + demo staging
         Run eval suite: Tests 1–6 + Litmus Test
```

---

## Asset Cockpit Redesign — From Admin Template to Analyst Console

*Repo-grounded implementation prompt for the visual upgrade.*

---

### The Problem

The current asset cockpit reads as a React admin template — card spam, rounded white containers, flat charts, too much padding, no density. Real institutional finance dashboards (Bloomberg, Datadog, Palantir Foundry) are darker, denser, information-first, fewer cards, more canvas.

The good news: **your design system already supports this.** The `bm-*` tokens in `tailwind.config.js` define a dark-mode palette that isn't being fully leveraged on the live site. The chart theme in `chart-theme.ts` has the right colors. The bones are there — this is a density and composition pass, not a rewrite.

---

### Repo Context (Actual File Paths)

```
Tailwind Config:        repo-b/tailwind.config.js
Asset Page:             repo-b/src/app/app/repe/assets/[assetId]/page.tsx
Cockpit Components:     repo-b/src/components/repe/asset-cockpit/
  CockpitSection.tsx    (240 lines — main orchestrator)
  KpiCard.tsx           (75 lines — individual metric cards)
  ModelInputsSection.tsx
  ValuationReturnsSection.tsx
  OpsAuditSection.tsx
Charts:                 repo-b/src/components/charts/
  QuarterlyBarChart.tsx
  TrendLineChart.tsx
  SparkLine.tsx
  chart-theme.ts        (color palette + tooltip styles)
UI Base:                repo-b/src/components/ui/Card.tsx
Sidebar:                repo-b/src/components/bos/Sidebar.tsx
Winston Command Bar:    repo-b/src/components/commandbar/
  AssistantShell.tsx     (174 lines — dialog shell)
  ConversationPane.tsx   (103 lines — chat transcript)
  GlobalCommandBar.tsx   (21KB — main orchestrator)
Winston Wrapper:        repo-b/src/components/winston/WinstonInstitutionalShell.tsx
```

**Current Design Tokens** (from `tailwind.config.js` + CSS variables):

```
--bm-bg:             216 31% 6%          (Deep dark blue)
--bm-bg-2:           216 30% 7.5%
--bm-surface:        217 29% 9%          (Elevated panels)
--bm-surface-2:      216 22% 11%         (Higher elevation)
--bm-border:         0 0% 100%           (White, very low alpha)
--bm-border-strong:  214 16% 34%
--bm-text:           210 24% 94%         (Off-white)
--bm-text-muted:     215 12% 72%
--bm-text-muted-2:   215 10% 58%
--bm-accent:         216 74% 55%         (#3878E0 — electric blue)
--bm-success:        142 64% 40%         (Green)
--bm-warning:        38 85% 50%          (Amber)
--bm-danger:         0 72% 48%           (Red)
```

**Current Chart Colors** (from `chart-theme.ts`):

```
revenue:  hsl(216, 74%, 55%)   → Blue
opex:     hsl(0, 72%, 48%)     → Red
noi:      hsl(142, 64%, 40%)   → Green
warning:  hsl(38, 85%, 50%)    → Amber
```

---

### Implementation Prompt

*This is the prompt to hand to a developer or Claude Code to execute the redesign.*

---

**TASK: Redesign the Winston asset cockpit from admin-template aesthetic to analyst-console aesthetic (Bloomberg/Datadog/Palantir density). Touch only the files listed below. Do not change data fetching, routing, or business logic.**

---

#### A. New Data Contract — `AssetCockpitModel`

**Create:** `repo-b/src/components/repe/asset-cockpit/_types.ts`

```typescript
export type KpiDef = {
  key: string;
  label: string;
  value: number | null;
  delta?: number | null;
  fmt: "money" | "pct" | "bps" | "number";
  polarity?: "up_good" | "down_good" | "neutral";
};

export type SeriesPoint = { t: string; v: number };

export type AssetCockpitModel = {
  asset: {
    id: string;
    name: string;
    city: string;
    state: string;
    type: string;
    fundName: string;
    status: "performing" | "watchlist" | "distressed";
  };
  kpis: KpiDef[];
  series: {
    revenue: SeriesPoint[];
    noi: SeriesPoint[];
    opex: SeriesPoint[];
    occupancy: SeriesPoint[];
    value: SeriesPoint[];
  };
  loan?: {
    balance?: number;
    ltv?: number;
    dscr?: number;
    debtYield?: number;
    rate?: number;
    maturity?: string;
  };
  flags?: Array<{
    level: "info" | "warn" | "bad";
    message: string;
    t?: string;
  }>;
};
```

**Create:** `repo-b/src/components/repe/asset-cockpit/_adapters.ts`
Map the existing DB fetch (from `page.tsx`'s `fetchAssetDetail()`) into this shape. All cockpit components consume `AssetCockpitModel` instead of raw DB rows.

---

#### B. Replace KPI Cards with `KpiStrip`

**Modify:** `repo-b/src/components/repe/asset-cockpit/CockpitSection.tsx`

Replace the `grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6` card grid with a single inline metrics strip. No boxes, no cards. Bloomberg terminal style.

**New component:** `repo-b/src/components/repe/asset-cockpit/KpiStrip.tsx`

```
Layout: flex row, items-baseline, gap-8, border-b border-bm-border/30, pb-3, mb-4
Each metric:
  Label:  text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-mono
  Value:  text-lg font-semibold text-bm-text font-display tabular-nums
  Delta:  text-xs ml-1.5 font-mono
          positive → text-bm-success
          negative → text-bm-danger
          neutral  → text-bm-muted
No background. No border. No card. Just data.
```

**Target rendering:**

```
NOI        REVENUE     OCCUPANCY    VALUE       CAP RATE    NAV
$4.7M      $6.3M       92.0%        $59.8M      6.3%        $39.0M
+263.6%    +12.1%      +0.0pp       +4.5%       -30bps
```

---

#### C. Create `Panel` Component (Replace Card Zoo)

**Create:** `repo-b/src/components/repe/asset-cockpit/Panel.tsx`

One reusable panel frame. All charts and data blocks use this instead of ad-hoc `<div className="rounded-xl border ...">` wrappers.

```
Props:
  title: string              (uppercase section label)
  controls?: ReactNode       (right-aligned — dropdowns, toggles)
  children: ReactNode        (chart or content)
  footer?: ReactNode         (optional bottom strip)
  className?: string         (size overrides)

Styling:
  bg-bm-surface/40
  border border-bm-border/20
  rounded-lg                 (not xl — subtler corners)
  p-0                        (content fills to edge)
  Title bar: px-4 pt-3 pb-2, flex justify-between items-center
    Title: text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-mono
    Controls: same text style
  Content: px-0 pb-0         (charts fill edge-to-edge within panel)
```

This avoids the "random card zoo" that screams template. Every panel looks like a monitoring console tile.

---

#### D. Main Analysis Grid Layout

**Modify:** `CockpitSection.tsx` composition.

Replace the current vertical stack of card groups with a 12-column grid:

```
<KpiStrip kpis={model.kpis} />

<div className="grid grid-cols-12 gap-3">
  {/* Row 1: Two large panels */}
  <Panel title="Revenue & NOI" className="col-span-7">
    <TrendLineChart ... />         {/* Revenue + NOI overlaid */}
  </Panel>
  <Panel title="Occupancy" className="col-span-5">
    <TrendLineChart ... />         {/* Occupancy trend */}
  </Panel>

  {/* Row 2: P&L and Value */}
  <Panel title="Quarterly P&L" className="col-span-7">
    <QuarterlyBarChart ... />
  </Panel>
  <Panel title="Asset Value" className="col-span-5">
    <TrendLineChart ... />
  </Panel>

  {/* Row 3: Loan health strip */}
  <Panel title="Debt Profile" className="col-span-12">
    <LoanHealthStrip loan={model.loan} />
  </Panel>
</div>
```

---

#### E. Chart Styling Upgrade

**Modify:** `repo-b/src/components/charts/chart-theme.ts`

Shift from flat Recharts defaults to Datadog-style glow lines:

```typescript
// Upgrade chart colors to luminous accent palette
CHART_COLORS = {
  revenue:  "#00E5FF",    // Electric cyan
  noi:      "#3BFF7C",    // Neon green
  opex:     "#FF4D6D",    // Hot coral
  value:    "#4EA1FF",    // Soft blue
  warning:  "#FFBE0B",    // Gold
  muted:    "hsl(215, 10%, 30%)",
  muted2:   "hsl(215, 10%, 22%)",

  // Scenario palette (5 distinct)
  scenario: ["#00E5FF", "#3BFF7C", "#FFBE0B", "#FF4D6D", "#A78BFA"],

  // Grid and axis
  grid:     "hsl(215, 10%, 16%)",    // Barely visible
  axis:     "hsl(215, 12%, 40%)",
};
```

**Modify:** `TrendLineChart.tsx` and `QuarterlyBarChart.tsx`:

```
CartesianGrid:   strokeOpacity={0.12}  strokeDasharray="3 3"
Line strokes:    strokeWidth={2}  dot={false}  (remove dots — they add noise)
                 activeDot={{ r: 3, fill: color, stroke: color, strokeWidth: 1 }}
Bar strokes:     radius={[2, 2, 0, 0]}  (keep current)
Background:      <rect> fill with panel background so charts don't float
```

**Add glow effect for active line** (optional CSS filter on hover):

```css
.chart-line-active {
  filter: drop-shadow(0 0 6px currentColor);
}
```

---

#### F. Crosshair + Synced Tooltips (The "Pro Software" Moment)

**This is the single change that makes it feel like real finance software.**

**Create:** `repo-b/src/components/repe/asset-cockpit/useCrosshairSync.ts`

A React context + hook that shares the currently-hovered X-axis value (quarter label) across all charts in the cockpit.

```typescript
const CrosshairContext = createContext<{
  activeT: string | null;
  setActiveT: (t: string | null) => void;
}>({ activeT: null, setActiveT: () => {} });
```

Each Recharts `<Tooltip>` and `<ReferenceLine>` reads from this context. When the user hovers over Q2 2025 on the Revenue chart, ALL charts show their Q2 2025 data simultaneously.

Implementation: wrap the cockpit grid in `<CrosshairProvider>`, then in each chart's `onMouseMove` handler, call `setActiveT(payload?.activeLabel)`. Each chart renders a vertical `<ReferenceLine x={activeT} stroke={accent} strokeDasharray="3 3" />` when `activeT` matches a point in its data.

---

#### G. Sidebar Density Pass

**Modify:** `repo-b/src/components/bos/Sidebar.tsx`

Current sidebar uses `w-56` (224px). That's fine for width, but the content styling needs density:

```
Nav items:
  Current:  py-2 text-sm
  Change:   py-1.5 text-[13px] font-medium
  Active:   border-l-2 border-l-bm-accent bg-bm-surface/20
  Hover:    bg-bm-surface/15
  Icon:     w-4 h-4 opacity-60 (smaller, more muted)

Section headers:
  Current:  text-xs uppercase
  Change:   text-[10px] uppercase tracking-[0.16em] text-bm-muted2 font-mono
            mb-1 mt-4 px-3

Remove any rounded-lg on nav items. Use sharp left-edge highlight only.
```

---

#### H. Asset Header Redesign

**Modify:** The header section in `page.tsx` (lines 125-180).

Replace the current breadcrumb + title + Generate Report layout with:

```
┌─────────────────────────────────────────────────────────────┐
│ ● Performing   Cascade Multifamily                          │
│ Value-Add Multifamily · Aurora, CO · Denver MSA             │
│ Institutional Growth Fund VII                               │
│                                                             │
│                     [Generate Report] [Open Model] [Chat]   │
└─────────────────────────────────────────────────────────────┘
```

Where:
- `● Performing` = asset health indicator (green dot + label)
  Use `bm-success` for Performing, `bm-warning` for Watchlist, `bm-danger` for Distressed
- Asset name in `font-display text-xl font-semibold`
- Property type / location / MSA in `text-sm text-bm-muted`
- Fund name in `text-xs text-bm-muted2`
- Right side: action buttons in `text-sm` with border variants
- `[Chat]` button opens the Winston command bar (already built in `commandbar/`)

**Quick Stats row** (below header, above tabs):

```
Units: 240  ·  Year Built: 2008  ·  Loan: $28.35M  ·  LTV: —  ·  DSCR: —
```

`text-xs text-bm-muted font-mono` — one line, pipe-separated, no cards.

---

#### I. Winston Drawer Wiring

**The chat component already exists** in `repo-b/src/components/commandbar/`. The `AssistantShell.tsx` renders a dialog with `ConversationPane.tsx`. The `GlobalCommandBar.tsx` orchestrates plan/confirm/execute stages.

**What needs to happen:**

1. The `[Chat]` button on the asset header calls the existing `GlobalCommandBar` open function
2. The command bar receives asset context on open:
   ```typescript
   {
     assetId: params.assetId,
     assetName: detail?.asset.name,
     currentKpis: model.kpis,
     hoveredTimestamp: crosshairContext.activeT,  // from synced crosshair
     uploadedDocCount: attachments.length,
   }
   ```
3. The `ConversationPane.tsx` empty state should show contextual example queries:
   ```
   "Why did NOI jump in 2026Q1?"
   "Are we about to breach our loan covenant?"
   "What happens if occupancy drops to 88%?"
   "Show me the 5 most dangerous clauses in the loan agreement."
   ```
4. If `uploadedDocCount === 0`, show a soft nudge: "Upload documents in Ops & Audit to unlock document-grounded answers."

---

#### J. `LoanHealthStrip` — New Component

**Create:** `repo-b/src/components/repe/asset-cockpit/LoanHealthStrip.tsx`

Replaces the current bottom-of-cockpit `DSCR: — | LTV: — | Debt Yield: —` badges.

```
Layout: flex row, 5 metrics inline, border-t border-bm-border/20
Each metric:
  Label: text-[10px] uppercase tracking-wide text-bm-muted2 font-mono
  Value: text-sm font-semibold text-bm-text tabular-nums
  Color: DSCR < 1.20 → text-bm-warning
         DSCR < 1.10 → text-bm-danger
         LTV > 75%   → text-bm-warning

Metrics: Loan Balance | Rate | LTV | DSCR | Debt Yield | Maturity
```

---

### File Change Summary

| File | Action | Description |
|---|---|---|
| `asset-cockpit/_types.ts` | **Create** | AssetCockpitModel type + KpiDef |
| `asset-cockpit/_adapters.ts` | **Create** | DB rows → model mapper |
| `asset-cockpit/KpiStrip.tsx` | **Create** | Inline metrics strip (replaces KPI cards) |
| `asset-cockpit/Panel.tsx` | **Create** | Reusable panel frame |
| `asset-cockpit/LoanHealthStrip.tsx` | **Create** | Debt metrics inline strip |
| `asset-cockpit/useCrosshairSync.ts` | **Create** | Shared hover context for chart sync |
| `asset-cockpit/CockpitSection.tsx` | **Modify** | New grid layout, use Panel, KpiStrip |
| `asset-cockpit/KpiCard.tsx` | **Deprecate** | Replaced by KpiStrip |
| `charts/chart-theme.ts` | **Modify** | Luminous accent colors, dimmer grid |
| `charts/TrendLineChart.tsx` | **Modify** | Remove dots, add glow, read crosshair |
| `charts/QuarterlyBarChart.tsx` | **Modify** | Dimmer grid, read crosshair |
| `bos/Sidebar.tsx` | **Modify** | Tighter spacing, mono labels, sharper active state |
| `repe/assets/[assetId]/page.tsx` | **Modify** | New header, Chat button, quick stats row |
| `commandbar/ConversationPane.tsx` | **Modify** | Asset-context example queries |

**Files NOT changed:** Data fetching, routing, API calls, DB schema, business logic, auth. This is a pure presentation-layer pass.

---

### Visual Direction Summary

```
Current:   White cards → rounded containers → flat charts → padding everywhere
Target:    No cards → inline metrics → luminous charts → edge-to-edge density

Current:   React admin template
Target:    Bloomberg Terminal + Datadog + Palantir Foundry

Current:   6 KPI cards in a 2×3 grid
Target:    1 KpiStrip — inline, borderless, tabular-nums

Current:   Charts in separate white boxes
Target:    Charts in flush Panel tiles, synced crosshair on hover

Current:   Winston command bar exists but disconnected from asset context
Target:    [Chat] button in header, pre-loaded with asset KPIs + doc count
```

---

*Winston platform review — Cascade Multifamily / Institutional Growth Fund VII / Meridian Capital Management · March 2026*
