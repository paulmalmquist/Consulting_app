# Dashboard Composition Engine — Make the generator understand intent, not just keywords

## The problem

The dashboard generator currently works like this:
1. Regex extracts keywords from the prompt → picks one of 4 hardcoded archetypes
2. Each archetype is a fixed widget skeleton with fixed grid positions
3. `composeDashboard()` fills each slot with metrics but never changes the layout structure
4. Result: every "watchlist" prompt produces the same 4-widget layout regardless of what the user actually asked for

A user typing "Build a monthly operating report with NOI trend, actual vs budget, underperforming asset watchlist, and debt maturity schedule" gets the same generic layout as "show me a watchlist." The system hears "watchlist" and stops thinking.

## What the generator needs to become

A **composition engine** that:
1. Parses the prompt into structured analytical intent (not just keywords)
2. Selects or composes a section-based layout (not a rigid archetype)
3. Dynamically sizes the canvas based on content density
4. Validates that every explicit user request maps to a widget in the output

## Your codebase — what exists today

Read these files before changing anything:

### Generation pipeline
- `repo-b/src/app/api/re/v2/dashboards/generate/route.ts` — the 8-step pipeline
  - `detectArchetype()` line ~103 — 4 regex patterns, returns one of 4 keys
  - `detectScope()` line ~110 — entity type detection
  - `detectMetrics()` line ~123 — keyword→metric mapping
  - `composeDashboard()` line ~219 — fills archetype slots with metrics

### Archetype definitions
- `repo-b/src/lib/dashboards/layout-archetypes.ts` — 4 hardcoded layouts:
  - `executive_summary`: KPI strip + 2 charts + waterfall + statement table (5 widgets, fixed grid)
  - `operating_review`: KPI strip + 2 statement tables + 3 trend lines (6 widgets, fixed grid)
  - `watchlist`: KPI strip + comparison table + 2 bar charts (4 widgets, fixed grid)
  - `market_comparison`: KPI strip + 2 trend lines + bar chart + text block (5 widgets, fixed grid)

### Type system
- `repo-b/src/lib/dashboards/types.ts` — DashboardSpec, DashboardWidget, WidgetConfig, WidgetLayout
  - 12-column grid, y-position based, `h` in 80px row units
  - 10 widget types defined, 7 rendered, 3 stubbed (comparison_table, sparkline_grid, sensitivity_heat)
  - WidgetConfig already supports: `comparison`, `scenario`, `period_type`, `filters`, `reference_lines`

### Canvas renderer
- `repo-b/src/components/repe/dashboards/DashboardCanvas.tsx` — CSS grid with `gridTemplateColumns: repeat(12, 1fr)`
  - Each widget gets `gridColumn: span ${widget.layout.w}` and `minHeight: ${widget.layout.h * 80}px`
  - Drag-and-drop reordering via dnd-kit
  - **The canvas itself is flexible** — it renders whatever widgets are in the array. The rigidity is in the archetype definitions, not the canvas.

### Widget renderer
- `repo-b/src/components/repe/dashboards/WidgetRenderer.tsx` — dispatches by widget.type
  - metrics_strip, trend_line, bar_chart, waterfall, statement_table all render
  - comparison_table, sparkline_grid, sensitivity_heat show placeholder text

### Metric catalog
- `repo-b/src/lib/dashboards/metric-catalog.ts` — 48 approved metrics across IS, CF, KPI, Fund groups

### Spec validator
- `repo-b/src/lib/dashboards/spec-validator.ts` — validates widget types, metric keys, grid bounds

## What to change — follow this order

### STEP 1: Replace `detectArchetype()` with intent parsing

The current function is 5 lines of regex. Replace it with a function that extracts structured intent from the prompt.

Create a new type and function in `generate/route.ts`:

```typescript
interface DashboardIntent {
  archetype: string;           // e.g., "monthly_operating_report", "executive_summary", "watchlist"
  audience: string;            // e.g., "asset_management", "executive", "investor"
  requested_sections: string[];  // explicit things the user asked for
  measures: string[];          // metric keys detected
  comparisons: string[];       // "budget", "prior_year", "uw"
  time_view: string;           // "single_quarter", "trailing_4q", "ytd", "ttm"
  export_features: string[];   // "downloadable_table", "pdf", etc.
  entity_filter: string | null;  // "multifamily", "phoenix", etc.
}
```

Build a keyword/phrase mapping that's richer than the current one:

```typescript
const ARCHETYPE_PHRASES: Record<string, string[]> = {
  monthly_operating_report: ["monthly operating", "operating report", "monthly report", "asset management report"],
  executive_summary: ["executive summary", "board summary", "ic memo", "quarterly update", "overview"],
  watchlist: ["watchlist", "underperform", "surveillance", "flag", "monitor", "at risk"],
  fund_quarterly_review: ["quarterly review", "fund review", "qbr", "fund performance"],
  market_comparison: ["compare", "vs", "versus", "benchmark", "side by side", "market"],
  underwriting_dashboard: ["underwriting", "uw dashboard", "deal screen"],
};

const SECTION_PHRASES: Record<string, string[]> = {
  noi_trend: ["noi trend", "trend over time", "operating trend"],
  actual_vs_budget: ["actual vs budget", "budget variance", "budget comparison", "avb"],
  underperformer_watchlist: ["underperforming", "underperformer", "watchlist", "flag", "highlight"],
  debt_maturity: ["debt maturity", "loan maturity", "maturity schedule", "maturity timeline"],
  downloadable_table: ["downloadable", "download", "export", "summary table"],
  income_statement: ["income statement", "p&l", "profit and loss"],
  cash_flow: ["cash flow", "cf statement"],
  variance_analysis: ["variance", "deviation", "delta"],
  occupancy_trend: ["occupancy trend", "occupancy over time"],
  dscr_monitoring: ["dscr", "debt service coverage", "coverage ratio"],
  rent_analysis: ["rent", "avg rent", "rent per unit", "unit economics"],
};
```

The function should scan the prompt for ALL matching sections, not just pick one archetype.

### STEP 2: Replace `composeDashboard()` with section-based composition

The current function iterates over `archetype.slots` — a fixed array of widget definitions. Replace with a function that:

1. Takes the `DashboardIntent` as input
2. Builds a section list based on `requested_sections`
3. Each section maps to 1-3 widgets with appropriate sizing
4. Sections stack vertically; within each section, widgets are laid out left-to-right

Define a section-to-widget mapping:

```typescript
interface SectionDefinition {
  key: string;
  widgets: Array<{
    type: WidgetType;
    w: number;  // grid width (out of 12)
    h: number;  // grid height in rows
    config_overrides: Partial<WidgetConfig>;
  }>;
}

const SECTION_REGISTRY: Record<string, SectionDefinition> = {
  kpi_summary: {
    key: "kpi_summary",
    widgets: [{ type: "metrics_strip", w: 12, h: 2, config_overrides: {} }],
  },
  noi_trend: {
    key: "noi_trend",
    widgets: [{ type: "trend_line", w: 12, h: 4, config_overrides: { title: "NOI Trend", format: "dollar", period_type: "quarterly" } }],
  },
  actual_vs_budget: {
    key: "actual_vs_budget",
    widgets: [
      { type: "bar_chart", w: 7, h: 4, config_overrides: { title: "Actual vs Budget", comparison: "budget", format: "dollar" } },
      { type: "metrics_strip", w: 5, h: 4, config_overrides: { title: "Budget Variance" } },
    ],
  },
  underperformer_watchlist: {
    key: "underperformer_watchlist",
    widgets: [{ type: "comparison_table", w: 12, h: 5, config_overrides: { title: "Underperforming Assets", comparison: "budget" } }],
  },
  debt_maturity: {
    key: "debt_maturity",
    widgets: [{ type: "bar_chart", w: 12, h: 4, config_overrides: { title: "Debt Maturity Schedule", format: "dollar" } }],
  },
  income_statement: {
    key: "income_statement",
    widgets: [{ type: "statement_table", w: 6, h: 5, config_overrides: { title: "Income Statement", statement: "IS" } }],
  },
  cash_flow: {
    key: "cash_flow",
    widgets: [{ type: "statement_table", w: 6, h: 5, config_overrides: { title: "Cash Flow Statement", statement: "CF" } }],
  },
  noi_bridge: {
    key: "noi_bridge",
    widgets: [{ type: "waterfall", w: 6, h: 4, config_overrides: { title: "NOI Bridge" } }],
  },
  occupancy_trend: {
    key: "occupancy_trend",
    widgets: [{ type: "trend_line", w: 6, h: 4, config_overrides: { title: "Occupancy Trend", format: "percent" } }],
  },
  dscr_monitoring: {
    key: "dscr_monitoring",
    widgets: [{ type: "trend_line", w: 6, h: 4, config_overrides: { title: "DSCR Trend", format: "ratio" } }],
  },
  downloadable_table: {
    key: "downloadable_table",
    widgets: [{ type: "statement_table", w: 12, h: 5, config_overrides: { title: "Summary Report", period_type: "quarterly" } }],
  },
};
```

The composition function:

```typescript
function composeFromIntent(
  intent: DashboardIntent,
  scope: { entity_type: string; entity_ids?: string[] },
  quarter?: string,
): { widgets: WidgetSpec[] } {
  const widgets: WidgetSpec[] = [];
  let currentY = 0;

  // Always start with KPI summary
  const kpiSection = SECTION_REGISTRY.kpi_summary;
  // ... add KPI widgets at y=0

  // Add each requested section
  for (const sectionKey of intent.requested_sections) {
    const section = SECTION_REGISTRY[sectionKey];
    if (!section) continue;

    let currentX = 0;
    for (const widgetDef of section.widgets) {
      // If this widget would overflow the row, wrap to next row
      if (currentX + widgetDef.w > 12) {
        currentY += section.widgets[0]?.h || 4;
        currentX = 0;
      }

      widgets.push({
        id: `${sectionKey}_${widgets.length}`,
        type: widgetDef.type,
        config: {
          ...widgetDef.config_overrides,
          entity_type: scope.entity_type,
          entity_ids: scope.entity_ids,
          quarter,
          scenario: "actual",
          metrics: selectMetricsForWidget(widgetDef.type, intent.measures, scope.entity_type),
        },
        layout: { x: currentX, y: currentY, w: widgetDef.w, h: widgetDef.h },
      });

      currentX += widgetDef.w;
    }
    currentY += section.widgets[0]?.h || 4;
  }

  // If no explicit sections detected, fall back to archetype-based defaults
  if (widgets.length <= 1) {
    return fallbackToArchetype(intent.archetype, intent.measures, scope, quarter);
  }

  return { widgets };
}
```

### STEP 3: Add default section lists per archetype

When the user's prompt is vague (e.g., "show me a monthly operating report"), the system should know what sections that implies:

```typescript
const ARCHETYPE_DEFAULT_SECTIONS: Record<string, string[]> = {
  monthly_operating_report: [
    "kpi_summary", "noi_trend", "actual_vs_budget",
    "underperformer_watchlist", "debt_maturity", "downloadable_table"
  ],
  executive_summary: [
    "kpi_summary", "noi_trend", "noi_bridge", "income_statement"
  ],
  watchlist: [
    "kpi_summary", "underperformer_watchlist", "dscr_monitoring", "occupancy_trend"
  ],
  fund_quarterly_review: [
    "kpi_summary", "noi_trend", "actual_vs_budget", "income_statement", "cash_flow"
  ],
  market_comparison: [
    "kpi_summary", "noi_trend", "occupancy_trend", "noi_bridge"
  ],
  underwriting_dashboard: [
    "kpi_summary", "income_statement", "cash_flow", "noi_bridge", "debt_maturity"
  ],
};
```

### STEP 4: Adapt the canvas — widget sizing should vary

The current approach uses hardcoded `h` values (2 for KPI, 4 for charts, 5 for tables). Add smarter sizing:

- A **full-width trend chart** should be `w: 12, h: 5` (not 6 wide squeezed next to another chart)
- A **side-by-side comparison** should be `w: 6, h: 4` each
- A **detail table** section should be `w: 12, h: 6` (tall enough to show data)
- If there are **6+ sections**, reduce chart heights to `h: 3` to avoid infinite scroll

The row height (currently hardcoded 80px) is fine — the `h` multiplier is what controls perceived density.

### STEP 5: Validate user requests are satisfied

After composing the dashboard, run a validation check:

```typescript
function validateIntentCoverage(intent: DashboardIntent, widgets: WidgetSpec[]): string[] {
  const warnings: string[] = [];
  const widgetTypes = new Set(widgets.map(w => w.type));
  const widgetTitles = widgets.map(w => w.config.title?.toLowerCase() || "");

  for (const section of intent.requested_sections) {
    const sectionDef = SECTION_REGISTRY[section];
    if (!sectionDef) continue;

    const expectedTypes = sectionDef.widgets.map(w => w.type);
    const found = expectedTypes.some(t => widgetTypes.has(t));
    if (!found) {
      warnings.push(`Requested "${section}" but no matching widget was generated`);
    }
  }

  // Check specific phrases
  if (intent.comparisons.includes("budget") && !widgetTitles.some(t => t.includes("budget") || t.includes("variance"))) {
    warnings.push("Prompt requested budget comparison but no variance widget was generated");
  }

  return warnings;
}
```

Add these warnings to the generate response so they surface in the UI.

### STEP 6: Update the LayoutArchetype type

In `types.ts`, expand the archetype enum:

```typescript
export type LayoutArchetype =
  | "executive_summary"
  | "operating_review"
  | "monthly_operating_report"
  | "watchlist"
  | "fund_quarterly_review"
  | "market_comparison"
  | "underwriting_dashboard"
  | "custom";
```

### STEP 7: Keep backward compatibility

The old `LAYOUT_ARCHETYPES` record in `layout-archetypes.ts` should remain as a fallback. The new section-based composition should be the primary path, with the old archetype slots used only when `composeFromIntent` produces ≤1 widget (meaning intent parsing found nothing specific).

### STEP 8: Run tests and deploy

```bash
make test-frontend 2>&1 | tail -30
```

Then commit and push:
```bash
git add repo-b/src/app/api/re/v2/dashboards/generate/route.ts \
       repo-b/src/lib/dashboards/layout-archetypes.ts \
       repo-b/src/lib/dashboards/types.ts
git commit -m "feat(dashboards): section-based composition engine — intent parsing replaces keyword matching"
git push
```

### STEP 9: Verify on paulmalmquist.com

Once deployed, test these prompts and screenshot each result:

1. **"Show me a monthly operating report for multifamily with NOI trend, actual vs budget, and underperforming assets"**
   - Expected: KPI strip → full-width NOI trend → side-by-side actual vs budget + variance → watchlist table

2. **"Executive summary"** (vague prompt)
   - Expected: KPI strip → trend → NOI bridge → income statement (4 sections, not 5 identical widgets)

3. **"Watchlist with DSCR monitoring and debt maturity"**
   - Expected: KPI strip → comparison table → DSCR trend + debt maturity bar chart

4. **"Show me everything about this asset"** (maximally vague)
   - Expected: Falls back to executive_summary archetype defaults

For each test, open browser console and confirm:
- `[WidgetRenderer] Fetching data —` appears (not "Skipping fetch")
- Widget count matches expected sections
- Grid spans vary (not all 6-wide)

## Architecture summary

```
BEFORE:
  prompt → regex picks 1 of 4 archetypes → fixed slot array → fill with metrics

AFTER:
  prompt → intent parser extracts archetype + sections + comparisons + time view
        → section registry maps each section to widget definitions
        → dynamic y-stacking with variable widths
        → validation confirms all user requests are covered
        → fallback to archetype slots if intent parsing finds nothing
```

## Success criteria

- A prompt asking for "monthly operating report" produces a DIFFERENT layout than "watchlist"
- A prompt mentioning "actual vs budget" always produces a variance widget
- A prompt mentioning "trend over time" always produces a full-width trend chart
- Widget grid spans vary: some full-width (12), some half (6), some 7+5
- At least 6 distinct dashboard shapes are possible from different prompts
- `make test-frontend` passes
- Existing saved dashboards still load correctly (backward compatible)
