# Meta Prompt — AI-Driven Dynamic Dashboard Generation

> For a coding agent. This prompt contains everything needed to implement a system where users describe a business question in natural language and the AI generates a purpose-built analytical dashboard.

---

## Vision

A user types: *"show me a multifamily operating report for Cascade Multifamily"*

The system:
1. Classifies the intent as a **dashboard generation request**
2. Infers the **entity type** (asset), **entity id** (from name resolution), **report archetype** (multifamily operating)
3. Selects the **metrics, visuals, and layout sections** appropriate for that archetype
4. Emits a **DashboardConfig** JSON via SSE
5. The frontend renders a **multi-section analytical workspace** using a component registry

Other examples:
- *"build me a market dashboard for the Southeast"* → geo data + cap rate trends + population heatmap
- *"acquisitions pipeline for all sourcing-stage deals"* → pipeline table + radar scores + stage funnel
- *"quarterly investor report for Fund I"* → KPI strip + waterfall summary + LP table + NAV bridge

The system is NOT a generic BI tool. It is a **domain-specific layout engine** that knows REPE analytical patterns and composes existing components into coherent workspaces.

---

## Architecture Patterns to Follow

These patterns are already established in the codebase. Every new piece must conform.

### Pattern 1 — MCP Tool Registration
```
Schema:    backend/app/mcp/schemas/<domain>_tools.py   → Pydantic model with extra="ignore"
Handler:   backend/app/mcp/tools/<domain>_tools.py     → def _handler(ctx: McpContext, inp: Model) -> dict
Register:  register_<domain>_tools() called by server.py _register_all_tools()
Registry:  registry.register(ToolDef(name="<namespace>.<verb>", ...))
```

### Pattern 2 — Intent Classification + Fast-Path
```
Classifier:  backend/app/services/repe_intent.py       → compiled regex patterns → RepeIntent(family, confidence, extracted_params)
Fast-path:   backend/app/services/ai_gateway.py         → _run_repe_fast_path() dispatches by intent.family
SSE flow:    yield _sse("status", ...) → yield _sse("structured_result", {"result_type": "...", "card": card}) → yield _sse("done", ...)
```

### Pattern 3 — Card Builder Pipeline
```
Each fast-path intent maps to a _build_*_card() function in ai_gateway.py.
Card shape:  { title, subtitle, metrics[], parameters{}, actions[], table?, heatmap?, sections?, tiers?, partners?, assets?, scenarios[] }
Formatter helpers: _fmt_pct(), _fmt_mult(), _fmt_dollar(), _delta_str()
```

### Pattern 4 — StructuredResultCard (Frontend)
```
File:  repo-b/src/components/commandbar/StructuredResultCard.tsx
Types: repo-b/src/lib/commandbar/store.ts
Renders: metrics (with delta badges), generic tables, heatmaps, text sections, partner/asset/scenario specialized tables, action buttons
Currently does NOT support: charts, grids of cards, tabbed sections, collapsible groups
```

### Pattern 5 — Context Envelope
```
Frontend: repo-b/src/lib/commandbar/contextEnvelope.ts  → reads route, cookie, app context
Backend:  backend/app/schemas/ai_gateway.py              → AssistantContextEnvelope Pydantic model
Includes: env_id, business_id, route, surface, active_module, page_entity_type, page_entity_id, selected_entities[], command_context{}
```

### Pattern 6 — ReportRenderer (Template-Driven Reports)
```
File: repo-b/src/components/repe/reports/ReportRenderer.tsx
Fetches a report template from /api/re/v2/reports/catalog → renders blocks by type
Block types: kpi_strip, statement_table, waterfall_chart (placeholder), trend_chart (placeholder)
Limitation: Fixed template structure, no AI-driven composition
```

### Pattern 7 — WinstonShell (Layout Container)
```
File: repo-b/src/components/repe/workspace/WinstonShell.tsx
Three-column responsive layout: [220px sidebar | 1fr main | 280px rail]
Completely content-agnostic — just render slots
```

### Pattern 8 — Session State
```
File: backend/app/services/repe_session.py
Per-conversation state: analysis_mode, last_result, last_fund_id, last_asset_id, last_quarter, waterfall_runs[]
Used by INTENT_SESSION_WATERFALL_QUERY to answer "what did the waterfall show?" from memory
```

---

## Existing Building Blocks (DO NOT Rebuild)

| Component | Location | Reuse As |
|---|---|---|
| StructuredResultCard | `repo-b/src/components/commandbar/StructuredResultCard.tsx` | Metric panels, tables, heatmaps within dashboard sections |
| MetricsStrip | `repo-b/src/components/repe/MetricsStrip.tsx` | KPI header rows |
| StatementTable | `repo-b/src/components/repe/statements/StatementTable.tsx` | Financial statement blocks |
| WaterfallScenarioPanel | `repo-b/src/components/repe/WaterfallScenarioPanel.tsx` | Embeddable waterfall section |
| SaleScenarioPanel | `repo-b/src/components/repe/SaleScenarioPanel.tsx` | Embeddable sale scenario section |
| MonteCarloTab | `repo-b/src/components/repe/model/MonteCarloTab.tsx` | Embeddable simulation section |
| DealGeoIntelligencePanel | `repo-b/src/components/repe/geo/DealGeoIntelligencePanel.tsx` | Geo data section |
| DealRadarCanvas | `repo-b/src/components/repe/pipeline/DealRadarCanvas.tsx` | Pipeline visualization section |
| ReportRenderer | `repo-b/src/components/repe/reports/ReportRenderer.tsx` | Template-based report blocks |
| ExcelExportButton | `repo-b/src/components/repe/ExcelExportButton.tsx` | Export action |
| WinstonShell | `repo-b/src/components/repe/workspace/WinstonShell.tsx` | Outer layout frame |
| _build_*_card() functions | `backend/app/services/ai_gateway.py` lines 873-1050 | Card data generation |
| _exec_fast_tool() | `backend/app/services/ai_gateway.py` line 774 | Tool execution from fast-path |
| repe_intent.classify_repe_intent() | `backend/app/services/repe_intent.py` | Intent detection base |

---

## What Must Be Built

### Layer 1 — Dashboard Config Schema (Backend)

**File: `backend/app/schemas/dashboard_config.py`**

Define a Pydantic model that the AI (or fast-path) emits to describe a complete dashboard layout:

```python
from pydantic import BaseModel
from typing import Optional

class DashboardMetricSpec(BaseModel):
    metric_key: str            # e.g. "gross_irr", "noi", "occupancy_rate"
    label: str                 # Display label
    format: str                # "pct", "mult", "dollar", "number", "date"
    source: str                # "fund_metrics" | "asset_statements" | "waterfall" | "computed"
    statement: Optional[str]   # For statement-sourced: "IS", "BS", "KPI", "CF"
    line_code: Optional[str]   # For statement-sourced: the line_code in re_financial_statements

class DashboardSectionSpec(BaseModel):
    section_id: str            # Unique within the dashboard
    section_type: str          # "kpi_strip" | "table" | "heatmap" | "chart" | "waterfall_embed"
                               # | "scenario_panel" | "monte_carlo" | "geo_intel" | "pipeline_radar"
                               # | "statement_table" | "text_narrative" | "comparison_grid"
    title: str
    subtitle: Optional[str]
    width: str                 # "full" | "half" | "third"
    config: dict               # Section-type-specific config (see Section Type Configs below)

class DashboardConfig(BaseModel):
    dashboard_id: str          # Unique identifier
    title: str                 # e.g. "Multifamily Operating Report — Cascade"
    subtitle: Optional[str]    # e.g. "Q4 2025"
    archetype: str             # "asset_operating" | "fund_performance" | "market_analysis"
                               # | "pipeline_review" | "investor_report" | "waterfall_deep_dive"
                               # | "custom"
    entity_type: str           # "asset" | "fund" | "environment" | "deal" | "portfolio"
    entity_id: str
    env_id: str
    business_id: str
    quarter: str
    kpi_header: list[DashboardMetricSpec]       # Top-level KPI strip (always present)
    sections: list[DashboardSectionSpec]         # Ordered list of dashboard sections
    export_enabled: bool                         # Show export button
    refresh_interval_seconds: Optional[int]      # For live dashboards (future)
```

**Section Type Configs** — each `section_type` has its own config shape:

```python
# kpi_strip config:
{ "metrics": [DashboardMetricSpec, ...] }

# table config:
{ "data_source": "tool_name", "tool_args": {...}, "columns": ["col1", "col2"], "sort_by": "col1", "limit": 20 }

# heatmap config:
{ "data_source": "tool_name", "tool_args": {...}, "row_axis": "field", "col_axis": "field", "value_field": "field", "value_suffix": "%" }

# chart config (NEW — see Layer 3):
{ "chart_type": "line" | "bar" | "area" | "waterfall_bar" | "donut", "data_source": "tool_name", "tool_args": {...}, "x_field": "...", "y_fields": ["..."], "colors": [...] }

# waterfall_embed config:
{ "fund_id": "...", "quarter": "...", "show_overrides": true, "show_history": false }

# scenario_panel config:
{ "fund_id": "...", "panel_type": "sale" | "waterfall" }

# monte_carlo config:
{ "fund_id": "...", "simulations": 1000, "seed": 42 }

# geo_intel config:
{ "asset_id": "...", "deal_id": "..." }

# pipeline_radar config:
{ "stage_filter": "sourcing" | null }

# statement_table config:
{ "entity_type": "asset" | "investment" | "fund", "entity_id": "...", "statement": "IS" | "BS" | "CF" | "KPI", "period_type": "quarterly" | "annual", "comparison": "none" | "prior_period" | "budget" }

# text_narrative config:
{ "content": "..." }   # AI-generated narrative text

# comparison_grid config:
{ "items": [{ "label": "Base", "data_source": "...", "tool_args": {...} }, { "label": "Downside", ... }], "compare_fields": ["net_irr", "tvpi", "nav"] }
```

### Layer 2 — Dashboard Archetypes (Backend)

**File: `backend/app/services/dashboard_archetypes.py`**

A registry of known dashboard shapes. The AI classifies the user's request into an archetype, then the archetype provides the default section layout. The AI can modify, add, or remove sections based on the specific request.

```python
ARCHETYPES = {
    "asset_operating": {
        "description": "Property-level operating performance report",
        "entity_type": "asset",
        "default_kpi_header": [
            {"metric_key": "noi", "label": "NOI", "format": "dollar", "source": "asset_statements", "statement": "IS", "line_code": "NOI"},
            {"metric_key": "occupancy_rate", "label": "Occupancy", "format": "pct", "source": "asset_statements", "statement": "KPI", "line_code": "OCCUPANCY"},
            {"metric_key": "effective_rent", "label": "Eff. Rent/Unit", "format": "dollar", "source": "asset_statements", "statement": "KPI", "line_code": "EFF_RENT_UNIT"},
            {"metric_key": "capex_ytd", "label": "CapEx YTD", "format": "dollar", "source": "asset_statements", "statement": "CF", "line_code": "TOTAL_CAPEX"},
        ],
        "default_sections": [
            {"section_type": "statement_table", "title": "Income Statement", "width": "full",
             "config": {"statement": "IS", "comparison": "prior_period"}},
            {"section_type": "chart", "title": "NOI Trend", "width": "half",
             "config": {"chart_type": "line", "x_field": "period", "y_fields": ["noi", "budget_noi"]}},
            {"section_type": "chart", "title": "Occupancy Trend", "width": "half",
             "config": {"chart_type": "area", "x_field": "period", "y_fields": ["occupancy_rate"]}},
            {"section_type": "table", "title": "Unit Mix", "width": "full",
             "config": {"data_source": "unit_mix_summary"}},
        ],
        "applicable_when": ["multifamily", "operating", "property", "asset performance", "rent roll"],
    },
    "fund_performance": {
        "description": "Fund-level performance and waterfall summary",
        "entity_type": "fund",
        "default_kpi_header": [
            {"metric_key": "net_irr", "label": "Net IRR", "format": "pct", "source": "fund_metrics"},
            {"metric_key": "gross_tvpi", "label": "Gross TVPI", "format": "mult", "source": "fund_metrics"},
            {"metric_key": "dpi", "label": "DPI", "format": "mult", "source": "fund_metrics"},
            {"metric_key": "portfolio_nav", "label": "NAV", "format": "dollar", "source": "fund_metrics"},
        ],
        "default_sections": [
            {"section_type": "waterfall_embed", "title": "Waterfall Distribution", "width": "full"},
            {"section_type": "table", "title": "Asset Performance", "width": "full",
             "config": {"data_source": "finance.fund_metrics", "columns": ["asset_name", "noi", "valuation", "irr"]}},
            {"section_type": "statement_table", "title": "Fund Financials", "width": "full",
             "config": {"statement": "IS", "comparison": "budget"}},
        ],
        "applicable_when": ["fund performance", "fund report", "quarterly report", "fund overview"],
    },
    "investor_report": {
        "description": "LP-facing quarterly investor report",
        "entity_type": "fund",
        "default_kpi_header": [
            {"metric_key": "net_irr", "label": "Net IRR", "format": "pct", "source": "fund_metrics"},
            {"metric_key": "net_tvpi", "label": "Net TVPI", "format": "mult", "source": "fund_metrics"},
            {"metric_key": "dpi", "label": "DPI", "format": "mult", "source": "fund_metrics"},
            {"metric_key": "total_distributed", "label": "Total Distributed", "format": "dollar", "source": "fund_metrics"},
        ],
        "default_sections": [
            {"section_type": "text_narrative", "title": "Executive Summary", "width": "full"},
            {"section_type": "kpi_strip", "title": "Portfolio Snapshot", "width": "full"},
            {"section_type": "waterfall_embed", "title": "Waterfall Summary", "width": "full"},
            {"section_type": "table", "title": "LP Capital Accounts", "width": "full",
             "config": {"data_source": "finance.lp_summary"}},
            {"section_type": "statement_table", "title": "Fund Income Statement", "width": "full",
             "config": {"statement": "IS", "comparison": "budget"}},
        ],
        "applicable_when": ["investor report", "LP report", "quarterly investor", "capital account"],
    },
    "market_analysis": {
        "description": "Geographic market analysis dashboard",
        "entity_type": "environment",
        "default_kpi_header": [
            {"metric_key": "avg_cap_rate", "label": "Avg Cap Rate", "format": "pct", "source": "computed"},
            {"metric_key": "population_growth", "label": "Pop Growth", "format": "pct", "source": "computed"},
            {"metric_key": "job_growth", "label": "Job Growth", "format": "pct", "source": "computed"},
            {"metric_key": "median_rent", "label": "Median Rent", "format": "dollar", "source": "computed"},
        ],
        "default_sections": [
            {"section_type": "heatmap", "title": "Cap Rate by Market", "width": "full"},
            {"section_type": "geo_intel", "title": "Market Intelligence", "width": "full"},
            {"section_type": "chart", "title": "Cap Rate Trend", "width": "half",
             "config": {"chart_type": "line"}},
            {"section_type": "chart", "title": "Rent Growth Trend", "width": "half",
             "config": {"chart_type": "bar"}},
        ],
        "applicable_when": ["market dashboard", "market analysis", "geographic", "southeast", "cap rate trends", "demographics"],
    },
    "pipeline_review": {
        "description": "Deal pipeline review and scoring dashboard",
        "entity_type": "environment",
        "default_kpi_header": [
            {"metric_key": "active_deals", "label": "Active Deals", "format": "number", "source": "computed"},
            {"metric_key": "total_equity", "label": "Total Equity", "format": "dollar", "source": "computed"},
            {"metric_key": "avg_irr", "label": "Avg Target IRR", "format": "pct", "source": "computed"},
            {"metric_key": "deals_in_ic", "label": "In IC", "format": "number", "source": "computed"},
        ],
        "default_sections": [
            {"section_type": "pipeline_radar", "title": "Deal Radar", "width": "full"},
            {"section_type": "table", "title": "Pipeline Deals", "width": "full",
             "config": {"data_source": "pipeline_deals", "columns": ["deal_name", "stage", "equity", "irr", "score"]}},
            {"section_type": "chart", "title": "Stage Funnel", "width": "half",
             "config": {"chart_type": "bar"}},
            {"section_type": "chart", "title": "Deal Size Distribution", "width": "half",
             "config": {"chart_type": "donut"}},
        ],
        "applicable_when": ["pipeline", "deal pipeline", "sourcing", "acquisitions", "deal flow"],
    },
    "waterfall_deep_dive": {
        "description": "Deep waterfall analysis with scenarios and stress testing",
        "entity_type": "fund",
        "default_kpi_header": [
            {"metric_key": "net_irr", "label": "Net IRR", "format": "pct", "source": "fund_metrics"},
            {"metric_key": "gp_carry", "label": "GP Carry", "format": "dollar", "source": "waterfall"},
            {"metric_key": "lp_total", "label": "LP Total", "format": "dollar", "source": "waterfall"},
            {"metric_key": "total_distributed", "label": "Total Dist.", "format": "dollar", "source": "waterfall"},
        ],
        "default_sections": [
            {"section_type": "waterfall_embed", "title": "Base Case Waterfall", "width": "full",
             "config": {"show_overrides": true, "show_history": true}},
            {"section_type": "heatmap", "title": "Sensitivity Matrix", "width": "full",
             "config": {"data_source": "finance.sensitivity_matrix"}},
            {"section_type": "scenario_panel", "title": "Scenario Builder", "width": "half",
             "config": {"panel_type": "waterfall"}},
            {"section_type": "monte_carlo", "title": "Monte Carlo Distribution", "width": "half"},
            {"section_type": "comparison_grid", "title": "Scenario Comparison", "width": "full"},
        ],
        "applicable_when": ["waterfall analysis", "waterfall deep dive", "stress test", "scenario analysis", "carry analysis"],
    },
}
```

### Layer 3 — Dashboard Intent Classification (Backend)

**File: `backend/app/services/repe_intent.py`** — Add to existing classifier

Add a new intent family: `INTENT_GENERATE_DASHBOARD`

The classifier must:
1. Detect dashboard generation requests (keywords: "show me a", "build me a", "create a dashboard", "report for", "generate a")
2. Extract: archetype hint, entity name, entity type, quarter, any specific metric requests
3. Return `RepeIntent(family=INTENT_GENERATE_DASHBOARD, confidence=..., extracted_params={archetype_hint, entity_name, entity_type, metrics_requested[], quarter})`

**Critical**: This intent must NOT collide with existing intents. If the user says "run the waterfall", that's still `INTENT_RUN_WATERFALL`. The dashboard intent fires when the user asks for a **composed view** — multiple sections, a report, a dashboard. The distinguishing signal is composition language ("show me a report", "build a dashboard", "operating report for") vs. action language ("run", "stress", "compare").

### Layer 4 — Dashboard Composition Engine (Backend)

**File: `backend/app/services/dashboard_composer.py`**

This is the core engine. Given a classified intent, it:

1. **Resolves the archetype** from `dashboard_archetypes.py` using `archetype_hint` + fuzzy match on `applicable_when`
2. **Resolves the entity** using `resolve_assistant_scope()` (already exists in `assistant_scope.py`)
3. **Builds the DashboardConfig** by:
   - Starting from the archetype's default sections
   - Adjusting based on entity type and data availability
   - Adding/removing sections based on extracted_params (e.g. if user mentioned "with waterfall", ensure waterfall_embed is present)
   - Resolving metric sources to actual line_codes
4. **Hydrates the data** for each section by calling the appropriate MCP tools via `_exec_fast_tool()`
5. **Returns** a hydrated `DashboardConfig` with data attached to each section

```python
async def compose_dashboard(
    intent: RepeIntent,
    resolved_scope: dict,
    context_envelope: AssistantContextEnvelope,
    ctx: McpContext,
) -> dict:
    """Compose a complete dashboard from an intent.

    Returns a dict with:
    - config: DashboardConfig (layout spec)
    - section_data: dict[section_id, data]  (hydrated data per section)
    - narrative: str (AI-generated executive summary if investor_report archetype)
    """
```

**Data hydration strategy**: For each section, call the corresponding data source tool:
- `kpi_strip` → fetch from `/api/re/v2/.../statements?statement=KPI` or `finance.fund_metrics`
- `statement_table` → fetch from `/api/re/v2/.../statements`
- `waterfall_embed` → call `finance.run_waterfall`
- `table` with tool source → call via `_exec_fast_tool()`
- `chart` → fetch time-series data from statement API with multiple periods
- `geo_intel` → call `re_geography` service
- `pipeline_radar` → call `finance.pipeline_radar`
- `heatmap` with tool source → call via `_exec_fast_tool()`
- `monte_carlo` → no backend data needed (client-side compute)
- `text_narrative` → call OpenAI with a focused prompt to generate narrative from the hydrated metrics

### Layer 5 — Fast-Path Integration (Backend)

**File: `backend/app/services/ai_gateway.py`** — Add to `_run_repe_fast_path()`

Add `INTENT_GENERATE_DASHBOARD` handler:

```python
elif family == INTENT_GENERATE_DASHBOARD:
    yield _sse("status", {"message": "Composing dashboard layout...", "stage": "compose", "progress": 0.2})
    dashboard = await compose_dashboard(intent, resolved_scope, context_envelope, ctx)
    yield _sse("status", {"message": "Hydrating sections...", "stage": "hydrate", "progress": 0.5})
    # Section data hydration happens inside compose_dashboard
    yield _sse("status", {"message": "Finalizing dashboard...", "stage": "finalize", "progress": 0.9})
    yield _sse("structured_result", {
        "result_type": "dynamic_dashboard",
        "dashboard_config": dashboard["config"],
        "section_data": dashboard["section_data"],
        "narrative": dashboard.get("narrative"),
    })
```

The SSE `result_type` of `"dynamic_dashboard"` is the signal to the frontend to render the full dashboard instead of a single card.

### Layer 6 — Component Registry (Frontend)

**File: `repo-b/src/components/dashboard/DashboardComponentRegistry.tsx`**

A mapping from `section_type` to React component. This is the bridge between the DashboardConfig and actual rendering.

```tsx
import React, { lazy } from "react";

// Lazy-load heavy components
const WaterfallScenarioPanel = lazy(() => import("@/components/repe/WaterfallScenarioPanel"));
const SaleScenarioPanel = lazy(() => import("@/components/repe/SaleScenarioPanel"));
const MonteCarloTab = lazy(() => import("@/components/repe/model/MonteCarloTab"));
const DealGeoIntelligencePanel = lazy(() => import("@/components/repe/geo/DealGeoIntelligencePanel"));
const DealRadarCanvas = lazy(() => import("@/components/repe/pipeline/DealRadarCanvas"));
const StatementTable = lazy(() => import("@/components/repe/statements/StatementTable"));

export type SectionRenderer = React.FC<{
  config: Record<string, unknown>;
  data: unknown;
  entityId: string;
  entityType: string;
  envId: string;
  businessId: string;
  quarter: string;
}>;

export const SECTION_REGISTRY: Record<string, SectionRenderer> = {
  kpi_strip:         KpiStripSection,
  table:             GenericTableSection,
  heatmap:           HeatmapSection,
  chart:             ChartSection,         // NEW — see Layer 7
  waterfall_embed:   WaterfallEmbedSection,
  scenario_panel:    ScenarioPanelSection,
  monte_carlo:       MonteCarloSection,
  geo_intel:         GeoIntelSection,
  pipeline_radar:    PipelineRadarSection,
  statement_table:   StatementTableSection,
  text_narrative:    TextNarrativeSection,
  comparison_grid:   ComparisonGridSection,
};
```

Each section renderer receives its config and pre-hydrated data. It should be a thin wrapper around the existing component, adapting props.

### Layer 7 — Chart Component (Frontend)

**File: `repo-b/src/components/dashboard/DashboardChart.tsx`**

This is the primary missing primitive. StructuredResultCard has tables and heatmaps but no charts. Use **Recharts** (already available as a dependency in the repo).

Support these chart types:
- `line` — Time-series trends (NOI, occupancy, cap rates over quarters)
- `bar` — Categorical comparisons (stage funnel, scenario IRR comparison)
- `area` — Stacked time-series (revenue breakdown, capital calls vs distributions)
- `waterfall_bar` — Waterfall-style bar chart (tier allocations, NAV bridge)
- `donut` — Proportional breakdowns (allocation by strategy, LP composition)

```tsx
import { LineChart, BarChart, AreaChart, PieChart, Line, Bar, Area, Pie, Cell,
         XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type ChartProps = {
  chartType: "line" | "bar" | "area" | "waterfall_bar" | "donut";
  data: Array<Record<string, unknown>>;
  xField: string;
  yFields: string[];
  colors?: string[];
  valueFormat?: "pct" | "dollar" | "mult" | "number";
};
```

Color palette should use the existing `bm-*` design tokens from Tailwind config.

### Layer 8 — DashboardRenderer (Frontend)

**File: `repo-b/src/components/dashboard/DashboardRenderer.tsx`**

The main renderer that takes a DashboardConfig + section_data and composes the full page.

```tsx
type DashboardRendererProps = {
  config: DashboardConfig;
  sectionData: Record<string, unknown>;
  narrative?: string;
};

export function DashboardRenderer({ config, sectionData, narrative }: DashboardRendererProps) {
  return (
    <div className="space-y-6">
      {/* Dashboard header with title and export */}
      <DashboardHeader title={config.title} subtitle={config.subtitle} exportEnabled={config.export_enabled} />

      {/* KPI header strip */}
      <MetricsStrip metrics={config.kpi_header.map(spec => hydrate(spec, sectionData))} />

      {/* Section grid */}
      <div className="grid grid-cols-6 gap-4">
        {config.sections.map(section => {
          const Component = SECTION_REGISTRY[section.section_type];
          const colSpan = section.width === "full" ? 6 : section.width === "half" ? 3 : 2;
          return (
            <div key={section.section_id} className={`col-span-${colSpan}`}>
              <SectionCard title={section.title} subtitle={section.subtitle}>
                <Component
                  config={section.config}
                  data={sectionData[section.section_id]}
                  entityId={config.entity_id}
                  entityType={config.entity_type}
                  envId={config.env_id}
                  businessId={config.business_id}
                  quarter={config.quarter}
                />
              </SectionCard>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Layout rules**:
- `full` width sections span all 6 columns
- `half` width sections span 3 columns (two side-by-side)
- `third` width sections span 2 columns (three across)
- Each section is wrapped in a `SectionCard` with title, subtitle, and a subtle border

### Layer 9 — SSE Handler Integration (Frontend)

**File: `repo-b/src/lib/commandbar/store.ts`** or wherever the SSE reader handles `structured_result` events

When `result_type === "dynamic_dashboard"`:
- Store the full dashboard config and section data
- Trigger a render mode switch from "card" to "dashboard"
- The command bar panel should expand to full-width or open a new page

**Important decision**: The dashboard can render in two places:
1. **In the command bar rail** (collapsed view — just the KPI strip + summary)
2. **As a full page** (expanded view — all sections rendered)

Recommended approach: Emit a "view dashboard" action button in the command bar card. Clicking it navigates to a dynamic route like `/app/repe/dashboards/[dashboardId]` where the DashboardRenderer renders the full layout. The dashboard config and data should be stored in a zustand store or passed via URL state.

### Layer 10 — Dashboard Page (Frontend)

**File: `repo-b/src/app/app/repe/dashboards/[dashboardId]/page.tsx`**

A dynamic route that renders DashboardRenderer. The dashboard config can be:
- Loaded from the command bar store (if just generated)
- Fetched from a saved dashboard API (future — for bookmarked dashboards)

```tsx
"use client";
import React from "react";
import { DashboardRenderer } from "@/components/dashboard/DashboardRenderer";
import { useDashboardStore } from "@/lib/dashboard/store";

export default function DashboardPage({ params }: { params: { dashboardId: string } }) {
  const { config, sectionData, narrative } = useDashboardStore(params.dashboardId);
  if (!config) return <div>Loading...</div>;
  return <DashboardRenderer config={config} sectionData={sectionData} narrative={narrative} />;
}
```

---

## Prerequisites to Verify Before Building

1. **Recharts is available**: Check `repo-b/package.json` for `recharts`. If missing, add it.
2. **MetricsStrip accepts DashboardMetricSpec shape**: May need adapter function.
3. **Statement API supports multi-period fetch**: For chart time-series data, the `/api/re/v2/.../statements` endpoint must be called with multiple periods. Verify it supports a `periods` array or requires sequential calls.
4. **MCP tools are registered for all data sources**: Verify `finance.fund_metrics`, `finance.lp_summary`, `finance.pipeline_radar`, `finance.sensitivity_matrix` all exist and return the expected shapes.
5. **WaterfallScenarioPanel can be embedded**: Verify it accepts `fundId`, `quarter`, `envId`, `businessId` as props without requiring route context.
6. **MonteCarloTab can be embedded**: Same — verify it works outside its current parent component.
7. **`extra = "ignore"` fix applied**: All Pydantic models in `repe_finance_tools.py` must use `extra = "ignore"` (see WATERFALL_AI_TASKS.md SC-5).
8. **Intent classifier regex ordering**: The new `INTENT_GENERATE_DASHBOARD` patterns must be checked BEFORE generic patterns to avoid false matches on "show me the waterfall" → dashboard instead of waterfall.

---

## Execution Order

### Phase A — Foundation (no frontend changes)
1. `dashboard_config.py` — Schema definitions (Layer 1)
2. `dashboard_archetypes.py` — Archetype registry (Layer 2)
3. Add `INTENT_GENERATE_DASHBOARD` to `repe_intent.py` (Layer 3)
4. `dashboard_composer.py` — Composition engine (Layer 4)
5. Add fast-path handler to `ai_gateway.py` (Layer 5)

**Smoke test**: Send "show me a fund performance report" through the AI gateway. Verify SSE emits `result_type: "dynamic_dashboard"` with a valid config and hydrated section data.

### Phase B — Frontend Rendering
6. `DashboardChart.tsx` — Chart component (Layer 7)
7. `DashboardComponentRegistry.tsx` — Section registry (Layer 6)
8. `DashboardRenderer.tsx` — Main renderer (Layer 8)
9. SSE handler update for `dynamic_dashboard` result type (Layer 9)
10. Dashboard page route (Layer 10)

**Smoke test**: Type "show me a fund performance report for Fund I" → see a full multi-section dashboard render with KPIs, waterfall, asset table.

### Phase C — Refinement
11. Add narrative generation for `investor_report` archetype (call OpenAI with hydrated metrics as context)
12. Add "Save Dashboard" action that persists the config to DB for later recall
13. Add "Modify Dashboard" intent that takes an existing dashboard and adjusts sections (e.g. "add a waterfall section", "remove the geo panel")
14. Excel export of dashboard data across all sections

### Phase D — Intelligence
15. **Archetype auto-detection**: If the user's request doesn't match any archetype, fall through to the LLM (Lane C/D) with the archetype catalog as context. The LLM picks the best archetype and customizations, returning a DashboardConfig JSON.
16. **Section recommendation**: Based on the entity's data availability, suppress sections that would render empty (e.g. don't show geo_intel if the asset has no geographic data).
17. **Cross-dashboard linking**: Action buttons in one dashboard section can trigger a new dashboard (e.g. clicking an asset row in the fund dashboard opens the asset operating dashboard).

---

## Testing Requirements

### Backend Tests
- `test_dashboard_config.py` — Validate DashboardConfig serialization, all section types, edge cases (empty sections, missing entity)
- `test_dashboard_archetypes.py` — Verify archetype matching from natural language hints, all 6 archetypes resolve correctly
- `test_dashboard_composer.py` — Mock tool execution, verify section data hydration, verify narrative generation is called for investor_report
- `test_intent_dashboard.py` — Test INTENT_GENERATE_DASHBOARD classification, verify no collision with existing intents ("run waterfall" ≠ dashboard, "show me a report" = dashboard)

### Frontend Tests
- `DashboardRenderer.test.tsx` — Render with full config, verify all section types mount, verify grid layout (half = 3 cols, full = 6 cols)
- `DashboardChart.test.tsx` — Render each chart type with sample data, verify Recharts components mount
- `DashboardComponentRegistry.test.tsx` — Verify all section_types map to a component, no undefined renderers

---

## What NOT to Do

1. **Do NOT build a generic BI query engine.** This is not Looker. The system knows REPE and has 6 fixed archetypes (extendable later). It composes existing components, not arbitrary SQL.

2. **Do NOT call the OpenAI API for every dashboard.** Dashboard composition is deterministic: archetype + entity → sections. Only the `text_narrative` section type calls the LLM. All data hydration goes through MCP tools / fast-path.

3. **Do NOT create new database tables for dashboard storage in Phase A/B.** The DashboardConfig is ephemeral — generated per request, rendered, done. Persistence (Phase C) comes later.

4. **Do NOT duplicate data-fetching logic.** The chart and table sections must call the same APIs and tools that already exist. If `finance.fund_metrics` returns asset-level data, use it. Don't build a parallel data pipeline.

5. **Do NOT break the existing StructuredResultCard flow.** All existing intents (INTENT_RUN_WATERFALL, INTENT_STRESS_CAP_RATE, etc.) continue to work exactly as they do today. The dashboard system is additive — it adds `INTENT_GENERATE_DASHBOARD` alongside existing intents.

6. **Do NOT put chart rendering in StructuredResultCard.** Charts are a dashboard concern, not a card concern. The card system stays focused on metrics/tables/heatmaps. Charts live in `DashboardChart.tsx` and are only used by `DashboardRenderer`.

7. **Do NOT use `extra = "forbid"` on any new Pydantic models.** Always use `extra = "ignore"` to prevent LLM-generated extra keys from causing ValidationErrors.

8. **Do NOT put the DashboardRenderer inside the command bar.** The command bar shows a summary card with a "View Dashboard" button. The full dashboard renders on its own page route.

---

## File Summary

| File | Layer | Action |
|---|---|---|
| `backend/app/schemas/dashboard_config.py` | 1 | CREATE |
| `backend/app/services/dashboard_archetypes.py` | 2 | CREATE |
| `backend/app/services/repe_intent.py` | 3 | MODIFY — add INTENT_GENERATE_DASHBOARD |
| `backend/app/services/dashboard_composer.py` | 4 | CREATE |
| `backend/app/services/ai_gateway.py` | 5 | MODIFY — add fast-path branch |
| `repo-b/src/components/dashboard/DashboardComponentRegistry.tsx` | 6 | CREATE |
| `repo-b/src/components/dashboard/DashboardChart.tsx` | 7 | CREATE |
| `repo-b/src/components/dashboard/DashboardRenderer.tsx` | 8 | CREATE |
| `repo-b/src/lib/commandbar/store.ts` | 9 | MODIFY — add dynamic_dashboard handling |
| `repo-b/src/app/app/repe/dashboards/[dashboardId]/page.tsx` | 10 | CREATE |
| `repo-b/src/lib/dashboard/store.ts` | 10 | CREATE — zustand store for dashboard state |
| `backend/tests/test_dashboard_*.py` | Tests | CREATE |
| `repo-b/src/components/dashboard/__tests__/*.test.tsx` | Tests | CREATE |
