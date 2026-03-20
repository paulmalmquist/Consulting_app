---
id: meta-prompt-chat-workspace
kind: prompt
status: active
source_of_truth: false
topic: chat-workspace-delivery
owners:
  - repo-b
  - backend
intent_tags:
  - build
  - chat
  - analytics
triggers: []
entrypoint: false
handoff_to:
  - winston-chat-workspace
when_to_use: "Reference document loaded by skills/winston-chat-workspace/SKILL.md. Contains production state observations (2026-03-14), 6 confirmed bugs (Bug 0 = execution narration regression added 2026-03-19), 5 build priorities, and full file summary for chat workspace delivery."
when_not_to_use: "Do not use as a primary entrypoint — route through skills/winston-chat-workspace/SKILL.md instead."
surface_paths:
  - repo-b/src/app/
  - repo-b/src/components/commandbar/
  - backend/app/services/
notes:
  - Demoted to reference on 2026-03-19 — execution owned by skills/winston-chat-workspace/SKILL.md
---

# Meta Prompt — Winston Chat Workspace + Live Bug Fixes
## For a coding agent. Read this in full before touching any file.

> **Context:** Live walkthrough of paulmalmquist.com/lab/env/.../re completed on 2026-03-14.
> The app is substantially built. This meta prompt targets real gaps observed in production, not theoretical ones.
> The dashboard generator is deprecated. The primary AI surface is a full-screen chat workspace.
> Most of the plumbing already exists — the work is: fix real bugs, promote chat to primary surface, wire response blocks.

---

## Repository Rules

| Rule | Detail |
|---|---|
| 3 runtimes | `repo-b/` (Next.js 14 App Router), `backend/` (FastAPI + psycopg), `repo-c/` (Demo Lab) |
| Pattern A | `bosFetch()` → `/bos/[...path]` proxy → FastAPI `backend/` |
| Pattern B | Direct fetch `/api/re/v2/*` → Next route handler → Postgres (NO FastAPI) |
| Pattern C | `apiFetch()` → `/v1/[...path]` proxy → FastAPI `repo-c/` |
| Chat gateway | POST `/bos/api/ai/gateway/ask` → `backend/app/routes/ai_gateway.py` |
| Tests after every change | `make test-frontend` and `make test-backend` |
| Never `git add -A` | Stage specific files only |
| `%%` not `%` in psycopg3 | All raw SQL strings |
| All Pydantic models | `extra = "ignore"`, never `extra = "forbid"` |

---

## What Was Observed Live (Production State, 2026-03-14)

### Working Well
- Fund portfolio page: 5 funds, $2.0B commitments, $1.4B NAV, 33 active assets — all rendering
- IGF-VII fund header: Committed $500M, Called $316M, NAV $802M, Gross IRR 88.7%, TVPI 2.59x
- Performance tab: gross→net bridge waterfall (12.4% → 9.9%) renders cleanly
- Asset Variance tab: actual vs budget by line item with over/under callout cards
- LP Summary tab: 4 partners with committed/contributed/distributed/NAV share/IRR
- Cascade Multifamily asset: Cockpit, Financials (quarterly P&L + GL trial balance), Debt (DSCR 8.87x, LTV 27.6%, amortization trend), Valuation (Direct Cap, value & NAV trend) all functional
- Deal Radar: loads fast, radar chart with 8 deals $474M, sector-segmented
- Assets page: 33 assets, filters by fund/sector/state/MSA, NOI + occupancy columns populated

### Confirmed Bugs (Fix These First — They Are Visible to Every User)

#### Bug 0: Raw Tool Call Spam Exposed in AI Chat UI ⚠️ REGRESSION — Fix Before Any Other Work
**Observed:** 2026-03-19 (live snafu — confirmed in production)
**Location:** Winston chat workspace / any AI response surface
**Symptom:** Raw MCP tool call names, retry attempts, validation errors, and internal identifiers are rendered directly in the UI. Users see noise like:
```
repe.get_asset
repe.get_asset
repe.get_asset failed
validation error for GetAssetInput asset_id invalid UUID
```
**Required behavior:** Users should see a clean narrated step progression:
```
→ Fetching assets
→ Resolving asset details
→ Done
```
**Design principle:** The UI must reflect INTENT, not IMPLEMENTATION. Users see what the system is doing — not how.

**Step model to implement:**
```typescript
interface ExecutionStep {
  id: string;
  label: string;                             // human-readable
  status: "pending" | "running" | "completed" | "failed";
  progress?: number;
  message?: string;
  duration_ms?: number;
}
```

**Tool → step mapping layer** (add to `repo-b/src/lib/winston/types.ts` or a new `stepMap.ts`):
```typescript
const TOOL_STEP_MAP: Record<string, string> = {
  "repe.get_asset":            "Fetching assets",
  "repe.get_assets_batch":     "Fetching assets",
  "repe.list_assets":          "Fetching assets",
  "repe.get_fund":             "Loading fund data",
  "repe.list_funds":           "Loading fund data",
  "repe.list_deals":           "Fetching pipeline",
  "finance.fund_metrics":      "Computing fund metrics",
  "finance.lp_summary":        "Preparing LP summary",
  "finance.run_waterfall":     "Running waterfall",
  "finance.stress_cap_rate":   "Running stress test",
  "rag.search":                "Searching documents",
  "documents.list":            "Fetching documents",
  "metrics.query":             "Querying metrics",
  "reports.list":              "Loading reports",
};
```

**Deduplication rules:**
- Repeated calls to the same tool → ONE step (do not create new step on repeat)
- Retry attempts → invisible to user
- If retry succeeds → no error shown
- If all retries fail → ONE clean error: `"Some data could not be retrieved"` (never expose raw validation message)

**Backend: `RunNarrator` class in `backend/app/services/run_narrator.py`** (CREATE):
```python
class RunNarrator:
    def __init__(self, emit_fn):
        self._active_steps: dict[str, ExecutionStep] = {}
        self._emit = emit_fn

    def on_tool_call(self, tool_name: str):
        step_label = TOOL_STEP_MAP.get(tool_name, "Processing")
        step_id = _label_to_id(step_label)
        if step_id not in self._active_steps:
            step = ExecutionStep(id=step_id, label=step_label, status="running")
            self._active_steps[step_id] = step
            self._emit("tool_activity", step.dict())

    def on_tool_success(self, tool_name: str):
        step_id = _label_to_id(TOOL_STEP_MAP.get(tool_name, "Processing"))
        if step_id in self._active_steps:
            self._active_steps[step_id].status = "completed"
            self._emit("tool_activity", self._active_steps[step_id].dict())

    def on_tool_error(self, tool_name: str, retry_count: int, max_retries: int):
        if retry_count < max_retries:
            return  # silent — retry in progress
        step_id = _label_to_id(TOOL_STEP_MAP.get(tool_name, "Processing"))
        if step_id in self._active_steps:
            self._active_steps[step_id].status = "failed"
            self._active_steps[step_id].message = "Some data could not be retrieved"
            self._emit("tool_activity", self._active_steps[step_id].dict())
```

**Wire into:** `backend/app/services/ai_gateway.py` — replace raw tool_call event emission with `RunNarrator.on_tool_call()` calls.

**Frontend: `StepRenderer` component in `repo-b/src/components/winston/blocks/ToolActivityBlock.tsx`** (CREATE or REWRITE):
- Show only ONE active step at a time
- Replace step text as system progresses (no vertical list of logs)
- Completed steps shown subtly stacked above (opacity 50%, smaller text)
- Animate transition between steps (fade or slide)
- Debug mode toggle: hidden `<details>` element or dev-tools-only panel showing raw tool names, timings, and errors

**Existing asset to reuse:** `repo-b/src/components/commandbar/ExecutionTimeline.tsx` — understand its current rendering before creating a new component; extend rather than duplicate.

**UX sketch:**
```
[completed, subtle]  ✓ Loading fund data
[completed, subtle]  ✓ Fetching assets
[active, prominent]  ↻ Computing fund metrics...
```

**Debug mode** (default OFF, toggled by `?debug=1` query param or dev localStorage key):
- Expands a collapsible panel showing raw tool names, retry counts, durations, raw errors
- Never shown to production users by default

**Test cases (must pass before marking complete):**
1. 10 sequential `repe.get_asset` calls → user sees ONE "Fetching assets" step
2. Tool retries then succeeds → no error shown to user
3. Tool fails after all retries → user sees `"Some data could not be retrieved"` — not raw validation message
4. Mixed tool types → correct step label transitions in order
5. Long execution → user always sees an active step (never blank)

**Files to touch:**
- `backend/app/services/run_narrator.py` — CREATE
- `backend/app/services/ai_gateway.py` — wire RunNarrator into tool execution loop
- `repo-b/src/components/winston/blocks/ToolActivityBlock.tsx` — CREATE/REWRITE as StepRenderer
- `repo-b/src/lib/winston/types.ts` — add `ExecutionStep` type + `TOOL_STEP_MAP`
- `repo-b/src/lib/commandbar/assistantApi.ts` — ensure `tool_activity` events update step state (not append raw logs)

---

#### Bug 1: Waterfall Breakdown Dollar Amounts Unformatted
**Location:** LP Summary tab → Waterfall Breakdown section, fund detail page
**Symptom:** Amounts display as `$8500000.0000000000000` instead of `$8.5M`
**Where to fix:** Find the component rendering the Waterfall Breakdown table. The values coming back from the API are raw floats. Apply `fmtCompact()` or equivalent formatter to all Amount cells in that table.
**Files to check:**
- `repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx` or wherever the LP Summary tab lives
- Search for "Waterfall Breakdown" or "tier_1_return_of_capital" to find the render site
- The formatter `fmtCompact()` likely exists in `repo-b/src/components/charts/chart-theme.ts`

#### Bug 2: Waterfall Pref Return and Carry Showing $0 for All Partners
**Location:** LP Summary tab → Waterfall Allocation table AND Waterfall Breakdown section
**Symptom:** Every partner shows Return of Capital = correct, Pref Return = $0, Carry = $0
**Root cause:** Either (a) waterfall tiers aren't configured beyond tier_1, or (b) the waterfall hasn't been run with sufficient distributed capital to reach pref/carry tiers
**Diagnosis steps:**
1. Check `re_waterfall_definition` and `re_waterfall_tier` tables for this fund — confirm tier 2+ exist
2. If tiers exist, check whether `run_waterfall()` has been called and whether the current quarter has enough distributions to reach pref threshold
3. If tiers don't exist, the seed data is missing — need to add tier 2 (preferred return ~8%) and tier 3 (carried interest ~20%) to the seed file at `repo-b/db/schema/`
**Files to check:** `backend/app/services/re_waterfall.py`, `re_waterfall_runtime.py`, the relevant seed SQL

#### Bug 3: Capital Account Snapshots Not Auto-Computing
**Location:** LP Summary tab → "Capital Account Snapshots — 2026Q1" section
**Symptom:** Shows "No snapshots yet. Click Recompute to generate." — manual action required every time
**Fix:** Either (a) auto-trigger `recompute` on page load if snapshots are missing for the current quarter, or (b) run it as part of the quarter-close process. A "Recompute" button that requires manual clicking defeats the purpose of the feature.
**Files to check:** The fund page component that renders LP Summary, the API endpoint that triggers snapshot computation

#### Bug 4: Reports Page Fund Picker Defaults to Wrong Fund
**Location:** Reports → UW vs Actual (and likely other reports)
**Symptom:** Fund dropdown defaults to "paul test fund" — an empty test fund — instead of the primary real fund in the environment. User has to manually change it every time.
**Fix:** Default the fund selector to the first non-empty fund (has AUM > 0, or has investments), or to the environment's primary fund. "paul test fund" entries with $0 AUM should be filtered out or listed last.
**Files to check:** `repo-b/src/app/lab/env/[envId]/re/reports/uw-vs-actual/page.tsx` or equivalent

#### Bug 5: UW vs Actual Report Returns All Dashes
**Location:** Reports → UW vs Actual → select IGF-VII → all rows show `--`
**Symptom:** Table renders with correct column headers (UW IRR, Actual IRR, Delta IRR, UW MOIC, Actual MOIC, Delta MOIC, Delta NAV) but every cell is `--`
**Root cause:** No underwriting baseline has been entered for any investment. The report compares actual performance against underwriting assumptions, but no underwriting assumptions exist in the database.
**Fix:** This is a data seeding problem, not a code bug. Add underwriting baseline data (entry IRR assumptions, projected MOIC, projected NAV) per investment in the seed SQL. Check `re_budget` or similar table for the UW baseline schema.
**Files to check:** `backend/app/services/re_uw_vs_actual.py`, the relevant seed SQL file

---

## What Needs to Be Built (Ordered by Priority)

### Priority 1 — Full-Screen Chat Workspace

The chat infrastructure is fully built on the backend (SSE streaming, 83 MCP tools, intent classification, session state, card builders). The frontend has all rendering primitives. The gap: chat lives in a sidebar command bar and a Lab-era page at `/lab/chat`, not a first-class route in the main app.

#### Task 1.1 — Chat Page Route

**File: `repo-b/src/app/app/winston/page.tsx`** (CREATE)

```tsx
"use client";
import React from "react";
import { WinstonChatWorkspace } from "@/components/winston/WinstonChatWorkspace";

export default function WinstonPage() {
  return <WinstonChatWorkspace />;
}
```

#### Task 1.2 — WinstonChatWorkspace Component

**File: `repo-b/src/components/winston/WinstonChatWorkspace.tsx`** (CREATE)

Full-screen layout. Three areas:
- **Left:** existing app nav (unchanged)
- **Center:** `ChatConversationArea` — scrollable message history, streaming renders inline
- **Bottom:** `ChatPromptComposer` — multiline textarea, send on Enter, Shift+Enter for newline
- **Right rail:** `ChatContextPanel` — shows resolved scope (fund/asset/env), recent tools, recent citations

**Reuse existing infrastructure — do not fork:**
- `assistantApi.streamAi()` from `repo-b/src/lib/commandbar/assistantApi.ts` — handles all 12 SSE event types
- `store.ts` types — `CommandMessage`, `StructuredResult`
- `StructuredResultCard` — renders `structured_result` events
- `ExecutionTimeline` — tool activity display
- Starter prompts from `ConversationPane` lines 254-261

**Rendering model per message:**

```
User message     → plain text bubble
Assistant message → sequence of blocks in order:
  - tool_call events    → ToolActivityBlock (collapsed by default)
  - response_block events → ResponseBlockRenderer (chart / table / kpi_group / markdown)
  - structured_result    → StructuredResultCard (waterfall, metrics, LP, etc.)
  - citation events      → CitationChips
  - streaming token text → appended to markdown text block
```

#### Task 1.3 — ChatContextPanel (Right Rail)

Shows the workspace context inferred from conversation:
- Current environment name + business
- Active fund / asset / deal (populated from `context` SSE event's `resolved_scope`)
- Recent tool calls with name + status + duration
- Recent citations (snippet + doc name)
- Conversation ID, message count

Populated from the `done` event's `trace` object + accumulated `tool_call` and `citation` events. This is a display-only panel — no interactions needed for v1.

#### Task 1.4 — Wire Nav Link

Add "Winston" or "Chat" to the left nav in the RE environment, pointing to `/app/winston` (or wherever the route lands). This is the only nav change needed.

**Test:** Navigate to `/app/winston` → type "What funds do we have?" → should see streaming text with fund list. Type "Show me IGF-VII metrics" → should see `StructuredResultCard` with IRR/TVPI/NAV. The entire SSE pipeline should work unchanged — only the shell is new.

---

### Priority 2 — Response Block Rendering (Inline Charts + Tables)

The `response_block` SSE event type exists end-to-end. The backend emits it. The frontend receives it in `assistantApi.ts`. But the backend mostly emits `structured_result` cards instead of composable blocks, and the frontend doesn't have a proper renderer for all block types.

#### Task 2.1 — Define AssistantResponseBlock Types

**File: `repo-b/src/lib/winston/types.ts`** (CREATE)

```typescript
export interface ChartResponseBlock {
  type: "chart";
  chart_type: "line" | "bar" | "grouped_bar" | "stacked_bar" | "area" | "scatter";
  title: string;
  subtitle?: string;
  x_field: string;
  y_fields: string[];
  series_field?: string;   // group_by dimension → separate lines per entity
  data: Array<Record<string, unknown>>;
  format?: "dollar" | "percent" | "number" | "ratio";
  colors?: string[];
}

export interface TableResponseBlock {
  type: "table";
  title: string;
  subtitle?: string;
  columns: Array<{ key: string; label: string; format?: string; align?: "left" | "right" }>;
  rows: Array<Record<string, unknown>>;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  highlight_field?: string;
}

export interface KpiGroupResponseBlock {
  type: "kpi_group";
  title?: string;
  metrics: Array<{
    label: string;
    value: string;
    format?: string;
    delta?: { value: string; direction: "positive" | "negative" };
  }>;
}

export type AssistantResponseBlock =
  | ChartResponseBlock
  | TableResponseBlock
  | KpiGroupResponseBlock
  | { type: "markdown_text"; content: string }
  | { type: "citations"; items: Array<{ doc_id: string; snippet: string; section_heading?: string; score?: number }> }
  | { type: "tool_activity"; tool_name: string; status: "running" | "completed" | "failed"; duration_ms?: number; result_summary?: string }
  | { type: "entity_link"; entity_type: "fund" | "asset" | "investment" | "deal"; entity_id: string; entity_name: string; action: "created" | "updated"; url?: string }
  | { type: "export_action"; label: string; format: "csv" | "xlsx" | "docx"; data_ref: string }
  | { type: "error"; message: string };
```

#### Task 2.2 — ResponseBlockRenderer

**File: `repo-b/src/components/winston/ResponseBlockRenderer.tsx`** (CREATE)

Dispatches to the right sub-component based on `block.type`. Import from the `blocks/` subdirectory.

#### Task 2.3 — ChatChartBlock

**File: `repo-b/src/components/winston/blocks/ChatChartBlock.tsx`** (CREATE)

Uses Recharts (already in `package.json` — used by `TrendLineChart.tsx`). Supports `line`, `bar`, `grouped_bar`, `stacked_bar`, `area`. Reads data directly from the block — no fetching. Use `fmtCompact()` and `CHART_COLORS` from `chart-theme.ts`.

Key feature: when `series_field` is set, group the `data` array by that field and render each group as a separate `<Line>` or `<Bar>`. This is the multi-entity rendering that was missing.

#### Task 2.4 — ChatTableBlock

**File: `repo-b/src/components/winston/blocks/ChatTableBlock.tsx`** (CREATE)

Generic sortable table for arbitrary query results. Not tied to any specific entity type. Supports formatted cells (dollar/percent/number). Optional "Export CSV" button. Shows max 25 rows by default with "Show all" toggle.

#### Task 2.5 — Backend: Emit response_block for Analytical Queries

**File: `backend/app/services/ai_gateway.py`** (MODIFY)

When the fast-path produces chart-ready or table-ready data (metrics over time, ranked lists, comparisons), emit a `response_block` event with typed block data:

```python
def _build_chart_block(result: dict, intent, resolved_scope) -> dict:
    return {
        "type": "chart",
        "chart_type": "line" if intent.is_time_series else "bar",
        "title": f"{intent.primary_metric.upper()} — {resolved_scope.entity_name or 'Portfolio'}",
        "x_field": "period" if intent.is_time_series else "entity_name",
        "y_fields": [intent.primary_metric],
        "series_field": intent.group_by,
        "data": result.get("rows", []),
        "format": "dollar" if intent.primary_metric in DOLLAR_METRICS else "percent",
    }
```

Emit after fast-path completes for intents in `CHART_ELIGIBLE_INTENTS`. Keep existing `structured_result` emission for tool-specific cards — both can appear in one response.

---

### Priority 3 — Group-By / Multi-Series Data Fix

Same root-cause bug identified earlier. "NOI over time by investment" returns a single aggregated dot. Every layer lacks dimension awareness.

#### Task 3.1 — Create query_intent.py

**File: `backend/app/services/query_intent.py`** (CREATE)

Extracts structured analytical intent from a natural language query:

```python
from dataclasses import dataclass, field
import re

@dataclass
class AnalyticalQueryIntent:
    metrics: list[str]
    group_by: str | None = None         # "investment" | "asset" | "fund" | "market" | "region"
    time_grain: str | None = None       # "monthly" | "quarterly" | "annual"
    is_time_series: bool = False
    chart_preference: str | None = None # "line" | "bar" | "table"
    sort_by: str | None = None
    sort_dir: str = "desc"
    limit: int | None = None            # "top 5" → 5
    comparison: str | None = None       # "budget" | "prior_period" | "scenario"

_DIMENSION_PATTERNS = [
    (re.compile(r"\bby\s+investment\b", re.I),      "investment"),
    (re.compile(r"\bby\s+asset\b", re.I),           "asset"),
    (re.compile(r"\bby\s+property\b", re.I),        "asset"),
    (re.compile(r"\bby\s+fund\b", re.I),            "fund"),
    (re.compile(r"\bby\s+market\b", re.I),          "market"),
    (re.compile(r"\bby\s+region\b", re.I),          "region"),
    (re.compile(r"\bper\s+investment\b", re.I),     "investment"),
    (re.compile(r"\bacross\s+investments?\b", re.I),"investment"),
    (re.compile(r"\beach\s+(investment|asset)\b", re.I), None),  # capture group
]

_TIME_PATTERNS = [
    (re.compile(r"\bover\s+time\b", re.I),          "quarterly"),
    (re.compile(r"\btrend\b", re.I),                "quarterly"),
    (re.compile(r"\bquarterly\b", re.I),            "quarterly"),
    (re.compile(r"\bmonthly\b", re.I),              "monthly"),
    (re.compile(r"\bannual(ly)?\b", re.I),          "annual"),
    (re.compile(r"\byear[\s-]over[\s-]year\b|\byoy\b", re.I), "annual"),
]

_TOP_N_PATTERN = re.compile(r"\btop\s+(\d+)\b", re.I)

def extract_query_intent(message: str) -> AnalyticalQueryIntent:
    """Parse natural language into structured analytical query intent."""
    # Implement: match each pattern set, build and return the dataclass
```

#### Task 3.2 — Multi-Entity Data Assembly in Fast-Path

**File: `backend/app/services/ai_gateway.py`** (MODIFY)

When `extract_query_intent()` returns a non-null `group_by`:

1. Resolve entity list for the dimension (e.g., all investments in the current fund)
2. For time series: fetch data for all entities across the requested period range
3. Assemble rows as `[{period: "2024Q1", entity_name: "Cascade Multifamily", noi: 1200000}, ...]`
4. Emit as `response_block` chart with `series_field: "entity_name"`

The statements API already returns per-entity data. The fix is iterating all entities rather than only `entityIds[0]`, then tagging each row with the entity name.

#### Task 3.3 — Conversational Transform Commands

**File: `backend/app/services/repe_session.py`** (MODIFY)

Add `last_query_intent: AnalyticalQueryIntent | None` and `last_result_rows: list[dict] | None` to session state.

When a transform pattern is detected in the next message, apply it to stored data and re-emit:

| User says | Transform |
|---|---|
| "Turn that into a bar chart" | Re-emit `last_result_rows` as `chart_type="bar"` |
| "Give me a table instead" | Re-emit `last_result_rows` as `TableResponseBlock` |
| "Top 5 only" | Filter `last_result_rows` to top 5 by sort field |
| "Break that down by market" | Re-query with `group_by="market"` |
| "Compare to budget" | Re-query with `comparison="budget"` |

Detect transforms in `repe_intent.py` as a new intent family: `INTENT_TRANSFORM_RESULT`.

---

### Priority 4 — Data Seeding for Key Reports

These aren't code fixes — they're seed data additions that unlock entire sections of the app.

#### Task 4.1 — Underwriting Baseline Data

The UW vs Actual report is completely dark because no investment has an underwriting baseline. Find the schema for UW assumptions (likely in `re_budget` or `re_uw_vs_actual` related tables) and add seed rows for each investment in IGF-VII. Values can be plausible approximations:

- Entry year projected IRR (8–15% range per investment type)
- Projected MOIC at hold period (1.5x–2.5x)
- Year 1 projected NOI per investment
- Hold period assumption (5–7 years)

Check `backend/app/services/re_uw_vs_actual.py` to understand what fields the report reads.

#### Task 4.2 — Waterfall Tier Configuration

Add preferred return and carried interest tiers to the IGF-VII waterfall seed:
- Tier 1: Return of Capital (already exists)
- Tier 2: Preferred Return at 8% (LP only, compounding)
- Tier 3: Catch-Up (GP receives until 20% of all distributions)
- Tier 4: Carried Interest 80/20 (LP/GP split on excess returns)

Check `re_waterfall_tier` schema in `repo-b/db/schema/270_re_institutional_model.sql`.

#### Task 4.3 — Loan Details for Key Assets

The Debt tab says "Lender, interest rate, maturity date, and amortization schedule will appear once loan documents are uploaded." This is driven by missing structured loan data, not missing documents. Check whether the loan terms (rate, maturity, amortization type) should be stored in a loans table directly, and if so add seed rows for at least Cascade Multifamily and 2–3 other assets.

Check `re_loan` or similar table in the schema files.

---

### Priority 5 — MCP External Access (Lower Priority)

83 tools exist internally. Curate ~20 for external Claude access. The plumbing in `backend/app/mcp/server.py` is already built. The work is:

1. Mark a curated subset of tools as externally accessible (read-only tools are safe by default)
2. Ensure Pydantic input models have clean field descriptions for schema generation
3. Add `chart_data` and `_links` to return payloads where useful
4. Document the MCP interface

**Curated read tools:** `repe.list_funds`, `repe.get_fund`, `repe.list_assets`, `repe.get_asset`, `repe.list_deals`, `finance.fund_metrics`, `finance.lp_summary`, `finance.stress_cap_rate`, `finance.sensitivity_matrix`, `finance.run_waterfall`, `finance.compare_scenarios`, `metrics.query`, `rag.search`, `documents.list`, `reports.list`

**Curated write tools (guarded):** `repe.create_fund`, `repe.create_asset`, `repe.create_deal`, `scenarios.create`, `scenarios.set_overrides`

---

## File Summary

### New Files

| File | Purpose |
|---|---|
| `repo-b/src/app/app/winston/page.tsx` | Full-screen chat route |
| `repo-b/src/components/winston/WinstonChatWorkspace.tsx` | Main workspace shell |
| `repo-b/src/components/winston/ChatConversationArea.tsx` | Scrollable message list |
| `repo-b/src/components/winston/ChatPromptComposer.tsx` | Multiline input + send |
| `repo-b/src/components/winston/ChatContextPanel.tsx` | Right rail: scope + tools + citations |
| `repo-b/src/components/winston/ChatHeader.tsx` | New chat / export controls |
| `repo-b/src/components/winston/ResponseBlockRenderer.tsx` | Block type dispatcher |
| `repo-b/src/components/winston/blocks/ChatChartBlock.tsx` | Inline multi-series chart |
| `repo-b/src/components/winston/blocks/ChatTableBlock.tsx` | Inline generic table |
| `repo-b/src/components/winston/blocks/KpiGroupBlock.tsx` | KPI summary strip |
| `repo-b/src/components/winston/blocks/CitationsBlock.tsx` | Citation chips |
| `repo-b/src/components/winston/blocks/ToolActivityBlock.tsx` | StepRenderer — narrated execution steps (Bug 0) |
| `repo-b/src/components/winston/blocks/EntityLinkBlock.tsx` | Entity created/updated link |
| `repo-b/src/components/winston/blocks/ExportActionBlock.tsx` | Export button |
| `repo-b/src/lib/winston/types.ts` | AssistantResponseBlock type definitions |
| `backend/app/services/query_intent.py` | NL → structured analytical intent |

### Modified Files

| File | Change |
|---|---|
| `backend/app/services/run_narrator.py` | CREATE — RunNarrator class, tool→step mapping, deduplication, clean error surface (Bug 0) |
| `backend/app/services/ai_gateway.py` | Wire RunNarrator into tool execution loop (Bug 0); emit `response_block` for analytical queries; add `_build_chart_block()` / `_build_table_block()` |
| `backend/app/services/repe_intent.py` | Add dimension extraction; add `INTENT_TRANSFORM_RESULT` family |
| `backend/app/services/repe_session.py` | Add `last_query_intent` + `last_result_rows` to session state |
| `repo-b/src/lib/commandbar/assistantApi.ts` | Verify `response_block` events populate `message.responseBlocks` |
| Waterfall Breakdown render component | Apply `fmtCompact()` to Amount column (Bug 1) |
| LP Summary / fund page component | Auto-trigger snapshot recompute on load if missing (Bug 3) |
| Reports page fund selector | Default to first fund with AUM > 0 (Bug 4) |
| Seed SQL (to be found) | Add UW baselines, waterfall tiers 2–4, loan terms (Tasks 4.1–4.3) |

### Unchanged Files (Reuse As-Is)

| File | Why |
|---|---|
| `backend/app/services/ai_gateway.py` SSE emit helpers | All 12 event types already wired |
| `repo-b/src/lib/commandbar/assistantApi.ts` `streamAi()` | Fully handles all SSE events |
| `repo-b/src/components/commandbar/StructuredResultCard.tsx` | Renders all 13 card types |
| `repo-b/src/components/commandbar/ExecutionTimeline.tsx` | Tool activity visualization |
| `repo-b/src/components/charts/chart-theme.ts` | `CHART_COLORS`, `fmtCompact()`, `fmtPct()` |
| `backend/app/mcp/server.py` | JSON-RPC dispatch, 83 tools registered |
| `backend/app/services/assistant_scope.py` | Scope resolution |

---

## Test Sequence

Run tests after every task. The relevant commands:

```bash
make test-frontend    # Vitest — after any repo-b change
make test-backend     # Mocked DB unit tests — after any backend change
make quality          # lint-strict + typecheck + test-frontend (CI-aligned, run before commit)
```

### Acceptance Criteria by Priority

**Bug 0 (Execution Narration — fix this first):**
- Send any multi-tool query → user sees `→ Fetching assets` style steps, NOT raw `repe.get_asset` tool names
- 10 sequential `repe.get_asset` calls → ONE "Fetching assets" step shown (no duplicates)
- Tool retries then succeeds → zero error shown to user
- Tool fails after all retries → user sees `"Some data could not be retrieved"` — never raw validation text
- Debug mode toggle (`?debug=1`) → raw tool names + timings visible in collapsible panel
- Test case fixture at `docs/ai-test-cases/execution-narration-spec.md` defines full rubric — nightly tester uses this

**Priority 1 (Chat Workspace):**
- Navigate to `/app/winston` → full-screen chat renders
- Type "What funds do we have?" → streaming text response with fund list
- Type "Show me IGF-VII metrics" → `StructuredResultCard` with IRR/TVPI/NAV
- Right rail shows resolved scope after response

**Priority 2 (Response Blocks):**
- Type "Plot NOI over time for each investment" → inline line chart with separate investment lines
- Type "Give me a table of assets ranked by NOI" → inline sorted table
- Type "Compare actual vs budget NOI" → grouped bar chart or comparison table

**Priority 3 (Group-By Fix):**
- "NOI over time by investment" → multi-series line chart (not a single dot)
- "Top 5 assets by NOI" → table with 5 rows sorted descending
- "Turn that into a bar chart" → prior result re-rendered as bar chart

**Bug Fixes:**
- Waterfall Breakdown amounts display as `$8.5M` not `$8500000.000000`
- LP Summary Capital Account Snapshots populate without manual click
- Reports page defaults to IGF-VII not "paul test fund"
- UW vs Actual shows real values after seed data is added
