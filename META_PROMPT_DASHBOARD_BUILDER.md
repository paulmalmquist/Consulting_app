# Meta Prompt — Dashboard Builder Extensions & Critical Bug Fixes
## Winston / Business Machine Monorepo

> For a coding agent. The dashboard pipeline is built. These are targeted fixes and extensions.
> Do NOT redesign anything from scratch. Read the cited files and line numbers before changing them.

---

## Repository Rules

| Rule | Detail |
|---|---|
| 3 runtimes | `repo-b/` (Next.js 14), `backend/` (FastAPI), `repo-c/` (Demo Lab) |
| Dashboard generate route = **Pattern B** | `repo-b/src/app/api/re/v2/dashboards/generate/route.ts` — Next.js route handler → Postgres. NOT FastAPI. |
| Dashboard composition = **backend** | `backend/app/services/dashboard_composer.py` — FastAPI service |
| Widget rendering = **repo-b only** | `repo-b/src/components/repe/dashboards/` |
| DB migrations | `repo-b/db/schema/` — numeric prefix (next: 331) |
| Tests after every change | `make test-frontend` (repo-b), `make test-backend` (backend) |
| Never `git add -A` | Stage specific files only |
| `%%` not `%` in psycopg3 | |
| Pydantic models | Always `extra = "ignore"`, never `extra = "forbid"` |

---

## What Already Works (Do Not Rebuild)

| Component | File | Status |
|---|---|---|
| Markdown spec parser | `repo-b/src/lib/dashboards/spec-from-markdown.ts` | Complete |
| Dashboard composer | `backend/app/services/dashboard_composer.py` (7 archetypes, section detection) | Complete |
| Intent classifier | `backend/app/services/repe_intent.py` (`INTENT_GENERATE_DASHBOARD`, line 36) | Complete |
| Fast-path SSE handler | `backend/app/services/ai_gateway.py` lines 715-732 | Complete |
| Widget types | `repo-b/src/lib/dashboards/types.ts` (10 types) | Complete |
| Section registry | `repo-b/src/lib/dashboards/layout-archetypes.ts` (11 sections, 7 archetypes) | Complete |
| Metric catalog | `repo-b/src/lib/dashboards/metric-catalog.ts` (44 metrics) | Complete |
| Widget renderer | `repo-b/src/components/repe/dashboards/WidgetRenderer.tsx` (renders metrics_strip, trend_line, bar_chart, waterfall, statement_table) | Complete |
| DB schema | `repo-b/db/schema/330_re_dashboards.sql` (4 tables) | Complete |
| Compact layout | `dashboard_composer.py` lines 311-324 (auto at ≥6 sections) | Complete |
| Existing geo components | `repo-b/src/components/repe/pipeline/geo/DealGeoIntelligencePanel.tsx`, `DealGeoMap.tsx` | Standalone — not wired to widget system |
| Existing pipeline components | `repo-b/src/components/repe/pipeline/radar/DealRadarCanvas.tsx` | Standalone — not wired to widget system |
| PostGIS geography tables | `repo-b/db/schema/303_pipeline_geography.sql` | Complete |

---

## BUG FIX 1 — Semantic Grouping Dimension (Critical)

### The Problem

Prompt: **"NOI over time by investment"**

Expected: Multi-line time-series chart. One line per investment. X=time, Y=NOI.

Got: A single aggregated dot. The phrase "by investment" is discarded at every layer.

### Root Cause (Confirmed by Audit)

The pipeline has **zero concept of grouping dimensions**. Traced through 6 layers:

| Layer | File | Line(s) | Issue |
|---|---|---|---|
| Prompt parsing (backend) | `backend/app/services/dashboard_composer.py` | 236-251 (`_detect_metrics`) | Extracts metric keywords only. "by investment" ignored. |
| Prompt parsing (frontend) | `repo-b/src/app/api/re/v2/dashboards/generate/route.ts` | 286-327 | No dimension extraction. |
| Widget spec type | `repo-b/src/lib/dashboards/types.ts` | 60-85 (`WidgetConfig`) | No `group_by` or `series_by` field. |
| Data fetching | `repo-b/src/components/repe/dashboards/WidgetRenderer.tsx` | 59 | `const entityId = entityIds[0]` — only fetches FIRST entity, discards rest. |
| Statements API | `repo-b/src/app/api/re/v2/investments/[investmentId]/statements/route.ts` | 48-89 | Aggregates all assets into one total. No per-entity breakdown. |
| Chart component | `repo-b/src/components/charts/TrendLineChart.tsx` | 134-147 | Expects metric-key-based series. Cannot render entity-based series. |

### Fix 1A — Dimension Extraction (Backend)

**File: `backend/app/services/dashboard_composer.py`**

Add a `_detect_dimensions()` function alongside `_detect_metrics()`:

```python
_DIMENSION_PATTERNS = [
    (re.compile(r"\bby\s+investment\b", re.I),   "investment"),
    (re.compile(r"\bby\s+asset\b", re.I),        "asset"),
    (re.compile(r"\bby\s+property\b", re.I),     "asset"),
    (re.compile(r"\bby\s+fund\b", re.I),         "fund"),
    (re.compile(r"\bby\s+market\b", re.I),       "market"),
    (re.compile(r"\bby\s+region\b", re.I),       "region"),
    (re.compile(r"\bby\s+quarter\b", re.I),      "quarter"),
    (re.compile(r"\bper\s+investment\b", re.I),   "investment"),
    (re.compile(r"\bper\s+asset\b", re.I),        "asset"),
    (re.compile(r"\bper\s+fund\b", re.I),         "fund"),
    (re.compile(r"\bacross\s+investments?\b", re.I), "investment"),
    (re.compile(r"\bacross\s+assets?\b", re.I),   "asset"),
    (re.compile(r"\bacross\s+funds?\b", re.I),    "fund"),
    (re.compile(r"\beach\s+investment\b", re.I),  "investment"),
    (re.compile(r"\beach\s+asset\b", re.I),       "asset"),
    (re.compile(r"\bbroken?\s+down\s+by\b", re.I), None),  # followed by next word
    (re.compile(r"\bgrouped?\s+by\b", re.I),      None),
]

def _detect_dimensions(message: str) -> dict[str, str | None]:
    """Extract grouping/series dimensions from natural language.

    Returns dict with:
      group_by: "investment" | "asset" | "fund" | "market" | "region" | None
      time_grain: "monthly" | "quarterly" | "annual" | None (if time-series detected)
    """
    msg = message.lower()
    group_by = None
    time_grain = None

    for pattern, dimension in _DIMENSION_PATTERNS:
        if pattern.search(msg):
            if dimension is not None:
                group_by = dimension
                break
            else:
                # "broken down by X" or "grouped by X" — extract the next word
                m = pattern.search(msg)
                if m:
                    rest = msg[m.end():].strip().split()[0] if m.end() < len(msg) else ""
                    dim_map = {
                        "investment": "investment", "investments": "investment",
                        "asset": "asset", "assets": "asset", "property": "asset", "properties": "asset",
                        "fund": "fund", "funds": "fund",
                        "market": "market", "markets": "market",
                        "region": "region", "regions": "region",
                    }
                    group_by = dim_map.get(rest)
                break

    # Detect time-series intent
    time_patterns = [
        (r"\bover\s+time\b", "quarterly"),
        (r"\btrend\b", "quarterly"),
        (r"\bmonthly\b", "monthly"),
        (r"\bquarterly\b", "quarterly"),
        (r"\bannual\b", "annual"),
        (r"\byear[\s-]over[\s-]year\b", "annual"),
        (r"\btime\s+series\b", "quarterly"),
    ]
    for pat, grain in time_patterns:
        if re.search(pat, msg, re.I):
            time_grain = grain
            break

    return {"group_by": group_by, "time_grain": time_grain}
```

Call `_detect_dimensions()` in `compose_dashboard_spec()` and propagate the result into every widget that needs it.

### Fix 1B — Add `group_by` to WidgetConfig

**File: `repo-b/src/lib/dashboards/types.ts`**

Add to the `WidgetConfig` interface (after line ~72):

```typescript
export interface WidgetConfig {
  // ... existing fields ...

  /** Grouping dimension — produces separate series per entity. */
  group_by?: "investment" | "asset" | "fund" | "market" | "region" | null;
  /** Override time grain for time-series widgets. */
  time_grain?: "monthly" | "quarterly" | "annual";
}
```

### Fix 1C — Multi-Entity Data Fetching

**File: `repo-b/src/components/repe/dashboards/WidgetRenderer.tsx`**

The critical bug is at line 59: `const entityId = entityIds[0]`. When `group_by` is set, the hook must fetch data for ALL entities and produce per-entity series.

Replace `useWidgetData()` with logic that:
1. If `widget.config.group_by` is null/undefined → existing behavior (single fetch, single line)
2. If `widget.config.group_by` is set → fetch each entity in `entity_ids` separately, label each series by entity name, produce chart data with one column per entity

```typescript
// Pseudocode for the group_by branch:
if (widget.config.group_by && entityIds.length > 1) {
  // Fetch all entities in parallel
  const fetches = entityIds.map(async (eid) => {
    const path = entityType === "investment"
      ? `/api/re/v2/investments/${eid}/statements`
      : `/api/re/v2/assets/${eid}/statements`;
    const res = await fetch(`${path}?${params}`);
    const json = await res.json();
    return { entityId: eid, entityName: json.entity_name ?? eid, lines: json.lines ?? [] };
  });
  const results = await Promise.all(fetches);

  // Build multi-series chart data:
  // Each metric × each entity becomes a unique series key
  // e.g. { period: "2025Q1", "NOI_Cascade": 4000000, "NOI_Summit": 3200000 }
  const seriesData = buildMultiEntityChartData(results, metrics);
  setData(seriesData.data);
  setSeriesLines(seriesData.lines);  // [{key: "NOI_Cascade", label: "Cascade - NOI", color: ...}]
}
```

### Fix 1D — Multi-Period Time-Series Fetch

**Second data bug:** Even for single-entity trends, `useWidgetData()` fetches a SINGLE period. A trend chart needs MULTIPLE periods.

Add a multi-period fetch mode. When `widget.type === "trend_line"`:
- Determine the time range (e.g., last 8 quarters from `effectiveQuarter`)
- Fetch each period's statement data
- Assemble into `[{quarter: "2024Q1", NOI: 3800000}, {quarter: "2024Q2", NOI: 3900000}, ...]`

```typescript
// For trend_line widgets, fetch multiple periods
if (widget.type === "trend_line") {
  const periods = generatePriorPeriods(effectiveQuarter, 8, widget.config.time_grain ?? "quarterly");
  const periodFetches = periods.map(async (period) => {
    const p = new URLSearchParams({ ...baseParams, period });
    const res = await fetch(`${basePath}?${p}`);
    const json = await res.json();
    const row: Record<string, unknown> = { period };
    for (const line of json.lines ?? []) {
      row[line.line_code] = line.amount;
    }
    return row;
  });
  const chartData = await Promise.all(periodFetches);
  setData(chartData);  // Now has 8 data points, not 1
}
```

**Helper: `generatePriorPeriods(currentQuarter, count, grain)`** — generates ["2024Q1", "2024Q2", ...] going backwards from current.

### Fix 1E — TrendLineChart Multi-Entity Support

**File: `repo-b/src/components/charts/TrendLineChart.tsx`**

The component already supports multiple `LineDef` entries (line 134-147). No structural change needed — just ensure `WidgetRenderer` passes the correct `lines` array with one entry per entity-metric combination when `group_by` is set.

### Fix 1F — Suppress Auto-KPI for Simple Analyses

**File: `repo-b/src/app/api/re/v2/dashboards/generate/route.ts`**

At line 351-352, `kpi_summary` is always prepended:
```typescript
sections = ["kpi_summary", ...sections.filter((s) => s !== "kpi_summary")];
```

Add a guard:
```typescript
// If the prompt is a simple single-analysis request (one chart, one metric),
// do NOT auto-inject KPI summary
const isSimpleAnalysis = detectedSections.length === 1
  && ["noi_trend", "occupancy_trend", "dscr_monitoring"].includes(detectedSections[0]);

if (!isSimpleAnalysis) {
  sections = ["kpi_summary", ...sections.filter((s) => s !== "kpi_summary")];
}
```

### Fix 1G — Adaptive Chart Sizing

When only one widget exists and it has `group_by` set, use medium width (8 cols) instead of full (12 cols) to avoid an oversized empty chart. When multiple series exist (>3 entities), restore to full width.

**File: `repo-b/src/app/api/re/v2/dashboards/generate/route.ts`** — in the layout calculation section, adjust widget width based on:
```typescript
const w = widgets.length === 1 && !widget.config.group_by ? 8 : 12;
```

### Test BUG FIX 1

```
Prompt: "NOI over time by investment"
Expected:
  - Widget spec: { type: "trend_line", group_by: "investment", metrics: [{key: "NOI"}] }
  - Chart: 8 quarters × N investment lines
  - No auto-KPI card above the chart

Prompt: "occupancy trend by asset"
Expected:
  - Widget spec: { type: "trend_line", group_by: "asset", metrics: [{key: "OCCUPANCY"}] }
  - Chart: multi-line, one per asset

Prompt: "executive summary dashboard"
Expected:
  - Still gets kpi_summary (auto-injection is NOT suppressed for archetype requests)
  - Unchanged behavior
```

---

## BUG FIX 2 — Multi-Period Statement API

The statements API at `repo-b/src/app/api/re/v2/investments/[investmentId]/statements/route.ts` (lines 48-89) returns a single period's aggregated data. For trend charts, we need multi-period data.

**Option A (Preferred):** The frontend fetches multiple periods in parallel (Fix 1D above). No API change needed.

**Option B (Future optimization):** Add a `periods` array parameter to the statements API that returns data for all requested periods in one call. This reduces N+1 fetches but is a larger change — defer to Phase C.

---

## TASK 1 — `pipeline_bar` Widget

### Problem
When a user asks about "pipeline", "deal flow", or "deal stages", the system either falls back to a financial bar_chart (wrong visualization) or produces nothing meaningful. The `DealRadarCanvas` component exists but isn't wired to the dashboard widget system.

### 1A. Add Widget Type

**File: `repo-b/src/lib/dashboards/types.ts`** — extend the `WidgetType` union:

```typescript
export type WidgetType =
  | "metric_card"
  | "metrics_strip"
  | "trend_line"
  | "bar_chart"
  | "waterfall"
  | "statement_table"
  | "comparison_table"
  | "sparkline_grid"
  | "sensitivity_heat"
  | "text_block"
  | "pipeline_bar"       // NEW
  | "geographic_map";    // NEW (Task 2)
```

Add to `WidgetConfig`:
```typescript
// For pipeline_bar
pipeline_field?: "deal_status" | "deal_stage" | "deal_type";
pipeline_value_field?: "count" | "deal_value" | "equity_required";
linked_table_id?: string;  // companion table widget to filter on click
```

### 1B. Data Route

**File: `repo-b/src/app/api/re/v2/dashboards/pipeline-stages/route.ts`** (CREATE — Pattern B)

**Read the `repe_deal` table schema first** (check `repo-b/db/schema/` for the deal table definition) to confirm column names for `deal_status`, `equity_required`, `deal_value`, `env_id`, `business_id`, `fund_id`, `market`.

Query: `SELECT deal_status, COUNT(*), SUM(equity_required), SUM(deal_value) FROM repe_deal WHERE env_id=$1 AND business_id=$2 GROUP BY deal_status ORDER BY canonical_stage_order`.

Return: `{ stages: [{ label: string, count: number, equity_total: number, value_total: number }] }`

### 1C. Frontend Widget

**File: `repo-b/src/components/repe/dashboards/widgets/PipelineBarWidget.tsx`** (CREATE)

**Check first:** Is `recharts` in `repo-b/package.json`? If not, `cd repo-b && npm install recharts`.

Use Recharts `BarChart`. Clicking a bar calls `onStageClick(stage)` to filter a linked table widget. Color palette: canonical stage colors (sourcing=indigo, loi=violet, due_diligence=purple, ic_approved=green, closing=amber, closed=emerald, rejected=red).

### 1D. Register in WidgetRenderer

**File: `repo-b/src/components/repe/dashboards/WidgetRenderer.tsx`** — add `pipeline_bar` case.

### 1E. Intent → Widget Mapping

**File: `backend/app/services/dashboard_composer.py`** — add to `SECTION_PHRASES`:
```python
"pipeline_analysis": re.compile(
    r"\b(pipeline|deal\s+flow|stage|deal_status|deal\s+stage|opportunities|sourcing|loi|"
    r"due\s+diligence|ic\s+review|closing)\b",
    re.IGNORECASE,
),
```

Map `pipeline_analysis` → widget type `pipeline_bar`. Do NOT fall through to `bar_chart`.

### 1F. Auto-Add Companion Deal Table

When `pipeline_bar` is in the dashboard, auto-add a `statement_table` widget below it with:
- Data source: `repe_deal` (direct query, not statements API)
- Columns: deal_name, market, equity_required, target_irr, deal_status
- Linked to pipeline_bar via `linked_table_id`
- Filters by `deal_status` when user clicks a pipeline bar

Implement the cross-widget filter via React context or a zustand slice that the WidgetRenderer tree shares.

### Test Task 1
```
Prompt: "show me the deal pipeline"
Expected: pipeline_bar widget + deal table (NOT bar_chart with financial metrics)
Click "sourcing" bar → deal table filters to sourcing-stage deals only
```

---

## TASK 2 — `geographic_map` Widget

### Problem
Geo components (`DealGeoIntelligencePanel`, `DealGeoMap`) exist standalone but aren't dashboard widgets. Requesting a "market dashboard" or "geographic distribution" produces nothing useful.

### 2A. Add to types.ts (done in Task 1A)

Add to `WidgetConfig`:
```typescript
geo_entity_type?: "deal" | "asset";
geo_cluster?: boolean;
```

### 2B. Wrapper Widget

**File: `repo-b/src/components/repe/dashboards/widgets/GeographicMapWidget.tsx`** (CREATE)

**Read `DealGeoIntelligencePanel.tsx` first** to understand its prop interface. Then write a thin wrapper that adapts `WidgetConfig` → panel props. Include an `onPointClick` callback that filters a linked table.

### 2C. Intent Mapping

**File: `backend/app/services/dashboard_composer.py`** — add to `SECTION_PHRASES`:
```python
"geographic_analysis": re.compile(
    r"\b(map|geography|geographic|geo\s+intel|market\s+distribution|"
    r"locations?|assets?\s+by\s+region|regional|spatial|where\s+are)\b",
    re.IGNORECASE,
),
```

Map `geographic_analysis` → `geographic_map`. Reference `cre_intelligence_graph.md` for the data model.

### 2D. Auto-Add Asset/Deal Table

When `geographic_map` is in the dashboard, auto-add a deal/asset table below it. Filter by market/region on map click.

### Test Task 2
```
Prompt: "build me a market dashboard for the Southeast"
Expected: geographic_map widget + deal/asset table
```

---

## TASK 3 — Spec File Round-Trip

### 3A. DB Migration

**File: `repo-b/db/schema/331_re_dashboard_spec_file.sql`** (CREATE)

```sql
ALTER TABLE re_dashboard
  ADD COLUMN IF NOT EXISTS spec_file text;

COMMENT ON COLUMN re_dashboard.spec_file IS
  'Relative path to originating markdown spec. NULL if generated from natural language.';
```

### 3B. Persist spec_file in Generate Route

**File: `repo-b/src/app/api/re/v2/dashboards/generate/route.ts`**

The route already reads `spec_file` as a query parameter. Find the `INSERT INTO re_dashboard` and add `spec_file` to the insert.

### 3C. "Edit source spec" Link

In the dashboard header/toolbar UI, if `dashboard.spec_file` is present, render:
```tsx
{dashboard.spec_file && (
  <a href={`/api/re/v2/dashboards/spec/${encodeURIComponent(dashboard.spec_file)}`}
     className="text-xs text-bm-muted hover:text-bm-text underline"
     target="_blank">
    Edit source spec →
  </a>
)}
```

### 3D. Spec Viewer Route

**File: `repo-b/src/app/api/re/v2/dashboards/spec/[...path]/route.ts`** (CREATE)

Returns raw markdown. **Path traversal protection**: only allow paths starting with `docs/dashboard_requests/` and reject `..`.

### 3E. Regeneration

"Regenerate" button calls `POST /api/re/v2/dashboards/generate?spec_file=...` with the stored path. Existing route handles this.

---

## TASK 4 — Density Toggle

### Problem
Compact layout exists server-side (triggers at ≥6 sections, `dashboard_composer.py` lines 311-324) but users can't control it.

### 4A. Add `density` to DashboardSpec

**File: `repo-b/src/lib/dashboards/types.ts`**
```typescript
export interface DashboardSpec {
  widgets: DashboardWidget[];
  density?: "comfortable" | "compact";
  // ... (builder_messages from Task 5)
}
```

### 4B. Backend Param

**File: `backend/app/services/dashboard_composer.py`** — add `density: str = "auto"` param to `compose_dashboard_spec()`.

When `"compact"`: force compact. When `"comfortable"`: never compact. When `"auto"`: existing ≥6 threshold.

### 4C. Frontend Toggle

Render a segmented control (`Compact | Comfortable`) in the dashboard header. On toggle, either:
- Re-fetch with new `density` param, or
- Client-side: subtract/restore 1 row from each widget's `h` (min 2). Store original heights.

### 4D. DB Column

**File: `repo-b/db/schema/331_re_dashboard_spec_file.sql`** — add to same migration:
```sql
ALTER TABLE re_dashboard
  ADD COLUMN IF NOT EXISTS density text DEFAULT 'comfortable'
    CHECK (density IN ('comfortable', 'compact', 'auto'));
```

---

## TASK 5 — Widget Fallback Transparency

### Problem
When a requested widget type can't be rendered, the system silently substitutes. Users see wrong charts with no explanation.

### 5A. Fallback Logger

**File: `backend/app/services/dashboard_composer.py`**

Create `_resolve_widget_type(requested, available_set)` that returns `(resolved_type, fallback_message_or_None)`:

```python
AVAILABLE_WIDGET_TYPES: set[str] = {
    "metric_card", "metrics_strip", "trend_line", "bar_chart",
    "waterfall", "statement_table", "comparison_table", "text_block",
    "pipeline_bar", "geographic_map",
}

FALLBACK_MAP: dict[str, str] = {
    "pipeline_bar":     "bar_chart",
    "geographic_map":   "text_block",
    "sparkline_grid":   "metrics_strip",
    "sensitivity_heat": "text_block",
}

def _resolve_widget_type(requested: str) -> tuple[str, str | None]:
    if requested in AVAILABLE_WIDGET_TYPES:
        return requested, None
    fallback = FALLBACK_MAP.get(requested, "text_block")
    msg = f'Requested widget "{requested}" not available. Using fallback "{fallback}".'
    emit_log(level="warning", service="backend", action="dashboard.widget.fallback",
             message=msg, context={"requested": requested, "fallback": fallback})
    return fallback, msg
```

### 5B. Expose in Spec

Add `builder_messages` to the output dict:
```python
dashboard_spec["builder_messages"] = [m for m in fallback_messages if m]
```

### 5C. UI Notice

**File: wherever DashboardRenderer is** — render amber collapsible notice if `spec.builder_messages` is non-empty:
```tsx
{spec.builder_messages?.length > 0 && (
  <details className="mb-3 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
    <summary className="cursor-pointer text-amber-400 font-medium">
      Builder messages ({spec.builder_messages.length})
    </summary>
    <ul className="mt-2 space-y-1 text-bm-muted">
      {spec.builder_messages.map((msg, i) => <li key={i}>{msg}</li>)}
    </ul>
  </details>
)}
```

### 5D. Add to types.ts
```typescript
export interface DashboardSpec {
  widgets: DashboardWidget[];
  density?: "comfortable" | "compact";
  builder_messages?: string[];
}
```

---

## TASK 6 — Intent → Widget Mapping (Formalize)

### Problem
Widget type resolution is scattered. Need an explicit, testable map.

### 6A. Create `INTENT_WIDGET_MAP`

**File: `backend/app/services/dashboard_composer.py`** — add at module level:

```python
INTENT_WIDGET_MAP: dict[str, str] = {
    "pipeline_analysis":         "pipeline_bar",
    "geographic_analysis":       "geographic_map",
    "noi_trend":                 "trend_line",
    "occupancy_trend":           "trend_line",
    "dscr_monitoring":           "trend_line",
    "actual_vs_budget":          "bar_chart",
    "debt_maturity":             "bar_chart",
    "income_statement":          "statement_table",
    "cash_flow":                 "statement_table",
    "noi_bridge":                "waterfall",
    "underperformer_watchlist":  "comparison_table",
    "kpi_summary":               "metrics_strip",
    "downloadable_table":        "statement_table",
}
```

Replace inline widget-type resolution with `INTENT_WIDGET_MAP.get(section_key)` → `_resolve_widget_type()`.

### 6B. Table Inference Rules

**File: `backend/app/services/dashboard_composer.py`**

```python
TABLE_INFERENCE_RULES: dict[str, dict] = {
    "pipeline_bar": {
        "type": "statement_table",
        "title": "Pipeline Deals",
        "w": 12, "h": 4,
    },
    "geographic_map": {
        "type": "statement_table",
        "title": "Deal / Asset Detail",
        "w": 12, "h": 4,
    },
    "waterfall": {
        "type": "comparison_table",
        "title": "Tier Allocations",
        "w": 12, "h": 3,
    },
}
```

After assembling widgets, iterate and auto-add companion tables for any widget type in `TABLE_INFERENCE_RULES`.

---

## Example Dashboard Spec File

**File: `docs/dashboard_requests/pipeline_and_market_dashboard.md`** (CREATE)

```markdown
# Pipeline and Market Dashboard

## Purpose
Visualize the current deal pipeline by stage alongside geographic market distribution.

## Key Metrics
- Active deal count by stage
- Total equity required in pipeline
- Geographic distribution of deals
- Average target IRR by stage

## Layout
- Pipeline stage bar chart (full width)
- Geographic market map (full width)
- Supporting deal table with stage and market filters

## Entity Scope
- entity_type: portfolio
- quarter: 2026Q1

## Interactions
- Clicking a pipeline stage filters the deal table to that stage
- Clicking a map point filters the deal table to that market

## Visualizations
- pipeline_bar: group by deal_status, value by equity_required
- geographic_map: entity_type deal

## Table Behavior
- include deal table: yes
- table linked to: pipeline_bar, geographic_map
- table columns: deal_name, market, deal_status, equity_required, target_irr
```

---

## Execution Order

| Phase | Tasks | Gate |
|---|---|---|
| **Phase 0 — Critical Bug** | BUG FIX 1 (all sub-parts A-G) | "NOI over time by investment" renders multi-line chart |
| **Phase 1 — New Widgets** | Tasks 1 + 2 (parallel) | `pipeline_bar` and `geographic_map` render in dashboards |
| **Phase 2 — Dev Ergonomics** | Tasks 3 + 4 + 5 (parallel) | Spec round-trip, density toggle, fallback messages work |
| **Phase 3 — Intelligence** | Task 6 | INTENT_WIDGET_MAP and TABLE_INFERENCE_RULES pass tests |
| **Phase 4 — Reference** | Example spec + tips.md updates | |

Run `make test-frontend` and `make test-backend` after each phase. Include actual terminal output.

---

## Modified Files Summary

| File | Change |
|---|---|
| `backend/app/services/dashboard_composer.py` | Add `_detect_dimensions()`, `INTENT_WIDGET_MAP`, `TABLE_INFERENCE_RULES`, `AVAILABLE_WIDGET_TYPES`, `FALLBACK_MAP`, `_resolve_widget_type()`, density param |
| `repo-b/src/lib/dashboards/types.ts` | Add `group_by`, `time_grain`, `pipeline_*`, `geo_*` to WidgetConfig; add `density`, `builder_messages` to DashboardSpec; add `pipeline_bar`, `geographic_map` to WidgetType |
| `repo-b/src/components/repe/dashboards/WidgetRenderer.tsx` | Multi-entity fetch loop when `group_by` set; multi-period fetch for `trend_line`; add `pipeline_bar` and `geographic_map` cases |
| `repo-b/src/app/api/re/v2/dashboards/generate/route.ts` | Suppress auto-KPI for simple analyses; pass density; persist spec_file; adaptive chart sizing |

## New Files Summary

| File | Purpose |
|---|---|
| `repo-b/src/components/repe/dashboards/widgets/PipelineBarWidget.tsx` | Pipeline stage bar chart |
| `repo-b/src/components/repe/dashboards/widgets/GeographicMapWidget.tsx` | Geo map wrapper |
| `repo-b/src/app/api/re/v2/dashboards/pipeline-stages/route.ts` | Pipeline stage aggregation API |
| `repo-b/src/app/api/re/v2/dashboards/spec/[...path]/route.ts` | Spec file viewer |
| `repo-b/db/schema/331_re_dashboard_spec_file.sql` | spec_file + density columns |
| `docs/dashboard_requests/pipeline_and_market_dashboard.md` | Example spec |

---

## tips.md Additions

Add under `## Dashboard Builder`:

```markdown
## Dashboard Builder

**Group-by dimension parsing:**
- "by investment", "per asset", "across funds" → group_by in WidgetConfig
- Extracted by `_detect_dimensions()` in dashboard_composer.py
- Without group_by, trend charts aggregate to a single line
- With group_by, WidgetRenderer fetches all entity_ids in parallel and creates per-entity series

**Multi-period trend data:**
- trend_line widgets fetch 8 prior periods by default
- Single-period fetch produces a dot, not a line — always use multi-period for trend charts

**Auto-KPI suppression:**
- Simple single-analysis prompts ("NOI over time by investment") skip the KPI strip
- Archetype-based prompts ("executive summary dashboard") still get KPI strip

**Intent → Widget mapping:**
- Canonical map: `INTENT_WIDGET_MAP` in dashboard_composer.py
- Pipeline keywords → pipeline_bar (NOT bar_chart)
- Geography keywords → geographic_map (NOT text_block)
- Fallback logged to observability + surfaced in builder_messages

**Widget types and render status:**
- Fully rendered: metric_card, metrics_strip, trend_line, bar_chart, waterfall, statement_table, comparison_table, text_block, pipeline_bar, geographic_map
- Stubbed (defined, no renderer): sparkline_grid, sensitivity_heat

**Spec round-trip:**
- Generate from: docs/dashboard_requests/*.md via POST /api/re/v2/dashboards/generate?spec_file=...
- Stored in: re_dashboard.spec_file column
- Edit link: /api/re/v2/dashboards/spec/[path] returns raw markdown
- Regenerate: re-POST generate with same spec_file

**Density:**
- Auto-compact at ≥6 sections (height -1 row, min 3)
- Override: density param ("compact" | "comfortable" | "auto")
- UI toggle in dashboard header

**Table inference:**
- pipeline_bar → auto-add deal table
- geographic_map → auto-add deal/asset table
- waterfall → auto-add tier allocations table
- Tables filter on chart/map interaction via linked_table_id
```

---

## Prerequisites Checklist

Before writing code, verify each of these by reading the actual files:

- [ ] `recharts` in `repo-b/package.json` (Task 1C)
- [ ] `repe_deal` table column names (Task 1B)
- [ ] `DealGeoIntelligencePanel.tsx` prop interface (Task 2B)
- [ ] `330_re_dashboards.sql` CHECK constraint for `layout_archetype` (Task 3A)
- [ ] Next migration number (count files in `repo-b/db/schema/`)
- [ ] Tailwind CSS grid dynamic class strategy — use inline `style` for `gridColumn`/`gridRow`
- [ ] `_detect_metrics()` exact signature and call site in `compose_dashboard_spec()` (BUG FIX 1A)
- [ ] `useWidgetData()` exact hook signature and return type (BUG FIX 1C)
- [ ] TrendLineChart `LineDef` type shape (BUG FIX 1E)
