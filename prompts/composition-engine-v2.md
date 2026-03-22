# Dashboard Composition Engine v2 — Expand archetypes, add sections, improve layout flexibility

## Current state

The generate route (`repo-b/src/app/api/re/v2/dashboards/generate/route.ts`) already has:
- `parseIntent()` with `ARCHETYPE_PHRASES` (6 entries) and `SECTION_PHRASES` (10 entries)
- `composeFromIntent()` reading from `SECTION_REGISTRY` and `ARCHETYPE_DEFAULT_SECTIONS`
- Fallback to `composeDashboard()` (old archetype slot iteration) when sections produce ≤1 widget
- `validateIntentCoverage()` checking that sections map to widgets
- Entity auto-populate with proper fund hierarchy joins and seed fallbacks

The archetype library (`repo-b/src/lib/dashboards/layout-archetypes.ts`) already has:
- `SECTION_REGISTRY` with 11 sections
- `ARCHETYPE_DEFAULT_SECTIONS` for 7 archetypes
- Original 4 archetype slot definitions kept for backward compat

The type system (`repo-b/src/lib/dashboards/types.ts`) already has:
- `LayoutArchetype` with 8 values including `monthly_operating_report`, `fund_quarterly_review`, `underwriting_dashboard`

## What needs to change — THREE files, specific locations

### FILE 1: `repo-b/src/app/api/re/v2/dashboards/generate/route.ts`

#### 1A. Expand `ARCHETYPE_PHRASES` (line ~132)

Replace the current 6-entry record with 13 archetypes:

```typescript
const ARCHETYPE_PHRASES: Record<string, string[]> = {
  monthly_operating_report: ["monthly operating", "operating report", "monthly report", "asset management report", "mor"],
  executive_summary: ["executive summary", "board summary", "ic memo", "quarterly update", "overview", "high level"],
  watchlist: ["watchlist", "underperform", "surveillance", "at risk", "flag", "monitor"],
  fund_quarterly_review: ["quarterly review", "fund review", "qbr", "fund performance", "lp report"],
  market_comparison: ["compar", "vs ", "versus", "benchmark", "side by side", "market analysis"],
  underwriting_dashboard: ["underwriting", "uw dashboard", "deal screen", "deal evaluation"],
  operating_review: ["operating review", "deep dive", "asset detail", "property detail"],
  investment_deal_evaluation: ["deal evaluation", "investment memo", "deal screen", "acquisition"],
  pipeline_dashboard: ["pipeline", "deal flow", "origination", "funnel"],
  debt_capital_stack: ["debt maturity", "capital stack", "loan schedule", "refinancing", "leverage"],
  reporting_export: ["report export", "export center", "downloadable", "board pack"],
  construction_operating: ["construction", "development", "pre-stabilization", "lease-up", "pds"],
  portfolio_overview: ["portfolio", "all assets", "full book", "aggregate"],
};
```

#### 1B. Expand `SECTION_PHRASES` (line ~141)

Add phrases for new sections that will be added to the SECTION_REGISTRY:

```typescript
const SECTION_PHRASES: Record<string, string[]> = {
  // EXISTING (keep all 10)
  noi_trend: ["noi trend", "trend over time", "operating trend", "noi over"],
  actual_vs_budget: ["actual vs budget", "budget variance", "budget comparison", "avb", "vs budget"],
  underperformer_watchlist: ["underperforming", "underperformer", "watchlist", "at risk", "flag", "highlight"],
  debt_maturity: ["debt maturity", "loan maturity", "maturity schedule", "maturity timeline"],
  downloadable_table: ["downloadable", "download", "export", "summary table"],
  income_statement: ["income statement", "p&l", "profit and loss"],
  cash_flow: ["cash flow", "cf statement"],
  occupancy_trend: ["occupancy trend", "occupancy over time", "occupancy rate"],
  dscr_monitoring: ["dscr", "debt service coverage", "coverage ratio"],
  noi_bridge: ["noi bridge", "waterfall", "bridge analysis"],

  // NEW
  revenue_breakdown: ["revenue breakdown", "revenue composition", "revenue mix", "rent breakdown"],
  opex_breakdown: ["opex breakdown", "expense breakdown", "expense composition", "cost breakdown"],
  capital_activity: ["capital activity", "capex trend", "capital spend", "improvement spend"],
  leverage_summary: ["leverage", "ltv", "loan to value", "capital stack", "debt summary"],
  returns_summary: ["returns", "irr", "tvpi", "dpi", "multiple", "fund returns"],
  rent_analysis: ["rent analysis", "rent roll", "avg rent", "rent per unit", "unit economics"],
  valuation_trend: ["valuation", "asset value", "nav trend", "mark to market"],
  net_cash_flow: ["net cash flow", "cash on cash", "distributions", "cash yield"],
};
```

#### 1C. Fix `composeFromIntent()` layout logic (line ~195)

The current composition is "boxy" because every section gets its full default width/height with no responsive adjustment. Replace the current section stacking with smarter layout:

```typescript
function composeFromIntent(
  intent: DashboardIntent,
  metrics: string[],
  scope: { entity_type: string; entity_ids?: string[] },
  quarter?: string,
): { widgets: WidgetSpec[] } {
  let sections = intent.requested_sections.length > 0
    ? intent.requested_sections
    : (ARCHETYPE_DEFAULT_SECTIONS[intent.archetype] ?? ARCHETYPE_DEFAULT_SECTIONS.executive_summary);

  // kpi_summary always first, no duplicates
  sections = ["kpi_summary", ...sections.filter((s) => s !== "kpi_summary")];

  const widgets: WidgetSpec[] = [];
  let currentY = 0;
  const totalSections = sections.length;
  const compact = totalSections >= 6;

  // --- Layout intelligence ---
  // Track what's been placed so we can pair half-width sections side by side
  const halfWidthSections: string[] = [];
  const fullWidthSections: string[] = [];

  // Classify sections by their natural width
  for (const sectionKey of sections) {
    const section = SECTION_REGISTRY[sectionKey];
    if (!section) continue;
    const totalW = section.widgets.reduce((sum, w) => sum + w.w, 0);
    if (totalW <= 6) {
      halfWidthSections.push(sectionKey);
    } else {
      fullWidthSections.push(sectionKey);
    }
  }

  // Build layout order: KPI first, then full-width, then pair up half-widths
  const layoutOrder: Array<string | [string, string]> = [];

  // KPI is always first and full-width
  layoutOrder.push("kpi_summary");
  const remainingFull = fullWidthSections.filter((s) => s !== "kpi_summary");
  const remainingHalf = halfWidthSections.filter((s) => s !== "kpi_summary");

  // Interleave: 1-2 full-width, then a paired half-width row, repeat
  let fi = 0, hi = 0;
  while (fi < remainingFull.length || hi < remainingHalf.length) {
    // Add a full-width section
    if (fi < remainingFull.length) {
      layoutOrder.push(remainingFull[fi++]);
    }
    // Pair two half-widths on one row
    if (hi + 1 < remainingHalf.length) {
      layoutOrder.push([remainingHalf[hi], remainingHalf[hi + 1]]);
      hi += 2;
    } else if (hi < remainingHalf.length) {
      // Odd half-width gets promoted to full
      layoutOrder.push(remainingHalf[hi++]);
    }
    // Another full-width if available
    if (fi < remainingFull.length) {
      layoutOrder.push(remainingFull[fi++]);
    }
  }

  // Now build widgets from the layout order
  for (const entry of layoutOrder) {
    if (Array.isArray(entry)) {
      // Paired half-width sections on one row
      const [leftKey, rightKey] = entry;
      const leftSection = SECTION_REGISTRY[leftKey];
      const rightSection = SECTION_REGISTRY[rightKey];
      let rowH = 0;

      if (leftSection) {
        for (const def of leftSection.widgets) {
          const h = compact && def.h > 2 ? Math.max(3, def.h - 1) : def.h;
          rowH = Math.max(rowH, h);
          widgets.push({
            id: `${leftKey}_${widgets.length}`,
            type: def.type,
            config: {
              ...def.config_overrides,
              entity_type: scope.entity_type,
              entity_ids: scope.entity_ids,
              quarter,
              scenario: "actual",
              metrics: selectMetricsForWidget(def.type, metrics, scope.entity_type),
            },
            layout: { x: 0, y: currentY, w: 6, h },
          });
        }
      }

      if (rightSection) {
        for (const def of rightSection.widgets) {
          const h = compact && def.h > 2 ? Math.max(3, def.h - 1) : def.h;
          rowH = Math.max(rowH, h);
          widgets.push({
            id: `${rightKey}_${widgets.length}`,
            type: def.type,
            config: {
              ...def.config_overrides,
              entity_type: scope.entity_type,
              entity_ids: scope.entity_ids,
              quarter,
              scenario: "actual",
              metrics: selectMetricsForWidget(def.type, metrics, scope.entity_type),
            },
            layout: { x: 6, y: currentY, w: 6, h },
          });
        }
      }

      currentY += rowH;
    } else {
      // Single section (full-width or naturally multi-widget)
      const sectionKey = entry;
      const section = SECTION_REGISTRY[sectionKey];
      if (!section) continue;

      let currentX = 0;
      let sectionH = 0;

      for (const def of section.widgets) {
        const h = compact && def.h > 2 ? Math.max(3, def.h - 1) : def.h;

        if (currentX + def.w > 12) {
          currentY += sectionH;
          currentX = 0;
          sectionH = 0;
        }
        sectionH = Math.max(sectionH, h);

        widgets.push({
          id: `${sectionKey}_${widgets.length}`,
          type: def.type,
          config: {
            ...def.config_overrides,
            entity_type: scope.entity_type,
            entity_ids: scope.entity_ids,
            quarter,
            scenario: "actual",
            metrics: selectMetricsForWidget(def.type, metrics, scope.entity_type),
          },
          layout: { x: currentX, y: currentY, w: def.w, h },
        });
        currentX += def.w;
      }
      currentY += sectionH;
    }
  }

  if (widgets.length <= 1) {
    return composeDashboard(intent.archetype, metrics, scope, quarter);
  }

  return { widgets };
}
```

#### 1D. Expand `generateName()` (line ~480)

Add labels for the new archetypes:

```typescript
const archetypeLabels: Record<string, string> = {
  executive_summary: "Executive Summary",
  operating_review: "Operating Review",
  monthly_operating_report: "Monthly Operating Report",
  watchlist: "Watchlist",
  fund_quarterly_review: "Fund Quarterly Review",
  market_comparison: "Market Comparison",
  underwriting_dashboard: "Underwriting Dashboard",
  investment_deal_evaluation: "Investment Evaluation",
  pipeline_dashboard: "Pipeline Dashboard",
  debt_capital_stack: "Debt & Capital Stack",
  reporting_export: "Report Export Center",
  construction_operating: "Construction & Lease-Up",
  portfolio_overview: "Portfolio Overview",
  custom: "Dashboard",
};
```

### FILE 2: `repo-b/src/lib/dashboards/layout-archetypes.ts`

#### 2A. Add new sections to `SECTION_REGISTRY` (after the existing 11 sections)

```typescript
// --- NEW SECTIONS ---

revenue_breakdown: {
  key: "revenue_breakdown",
  widgets: [
    { type: "bar_chart", w: 7, h: 4, config_overrides: { title: "Revenue Composition", format: "dollar" } },
    { type: "metrics_strip", w: 5, h: 4, config_overrides: { title: "Revenue KPIs" } },
  ],
},
opex_breakdown: {
  key: "opex_breakdown",
  widgets: [
    { type: "bar_chart", w: 7, h: 4, config_overrides: { title: "Expense Breakdown", format: "dollar" } },
    { type: "metrics_strip", w: 5, h: 4, config_overrides: { title: "OpEx KPIs" } },
  ],
},
capital_activity: {
  key: "capital_activity",
  widgets: [{ type: "bar_chart", w: 12, h: 4, config_overrides: { title: "Capital Expenditures", format: "dollar" } }],
},
leverage_summary: {
  key: "leverage_summary",
  widgets: [
    { type: "metrics_strip", w: 12, h: 2, config_overrides: { title: "Leverage Metrics" } },
    { type: "bar_chart", w: 12, h: 4, config_overrides: { title: "Capital Stack", format: "dollar" } },
  ],
},
returns_summary: {
  key: "returns_summary",
  widgets: [
    { type: "metrics_strip", w: 12, h: 2, config_overrides: { title: "Fund Returns" } },
    { type: "trend_line", w: 12, h: 4, config_overrides: { title: "Returns Over Time", format: "percent", period_type: "quarterly" } },
  ],
},
rent_analysis: {
  key: "rent_analysis",
  widgets: [
    { type: "trend_line", w: 6, h: 4, config_overrides: { title: "Avg Rent / Unit", format: "dollar", period_type: "quarterly" } },
    { type: "bar_chart", w: 6, h: 4, config_overrides: { title: "Rent vs Market", format: "dollar" } },
  ],
},
valuation_trend: {
  key: "valuation_trend",
  widgets: [{ type: "trend_line", w: 12, h: 4, config_overrides: { title: "Asset Valuation", format: "dollar", period_type: "quarterly" } }],
},
net_cash_flow: {
  key: "net_cash_flow",
  widgets: [
    { type: "trend_line", w: 6, h: 4, config_overrides: { title: "Net Cash Flow", format: "dollar", period_type: "quarterly" } },
    { type: "waterfall", w: 6, h: 4, config_overrides: { title: "Cash Flow Waterfall" } },
  ],
},
```

#### 2B. Expand `ARCHETYPE_DEFAULT_SECTIONS` with new archetypes

```typescript
export const ARCHETYPE_DEFAULT_SECTIONS: Record<string, string[]> = {
  // EXISTING (keep all 7)
  monthly_operating_report: [
    "kpi_summary", "noi_trend", "actual_vs_budget",
    "underperformer_watchlist", "debt_maturity", "downloadable_table",
  ],
  executive_summary: ["kpi_summary", "noi_trend", "noi_bridge", "income_statement"],
  watchlist: ["kpi_summary", "underperformer_watchlist", "dscr_monitoring", "occupancy_trend"],
  fund_quarterly_review: [
    "kpi_summary", "noi_trend", "actual_vs_budget", "income_statement", "cash_flow",
  ],
  market_comparison: ["kpi_summary", "noi_trend", "occupancy_trend", "noi_bridge"],
  underwriting_dashboard: [
    "kpi_summary", "income_statement", "cash_flow", "noi_bridge", "debt_maturity",
  ],
  operating_review: [
    "kpi_summary", "income_statement", "cash_flow", "noi_trend", "occupancy_trend", "dscr_monitoring",
  ],

  // NEW
  investment_deal_evaluation: [
    "kpi_summary", "income_statement", "cash_flow", "noi_bridge",
    "returns_summary", "leverage_summary",
  ],
  pipeline_dashboard: [
    "kpi_summary", "underperformer_watchlist", "noi_trend", "leverage_summary",
  ],
  debt_capital_stack: [
    "kpi_summary", "leverage_summary", "debt_maturity", "dscr_monitoring",
  ],
  reporting_export: [
    "kpi_summary", "income_statement", "cash_flow", "downloadable_table",
  ],
  construction_operating: [
    "kpi_summary", "capital_activity", "noi_trend", "occupancy_trend", "actual_vs_budget",
  ],
  portfolio_overview: [
    "kpi_summary", "noi_trend", "occupancy_trend", "actual_vs_budget",
    "underperformer_watchlist", "returns_summary",
  ],
};
```

### FILE 3: `repo-b/src/lib/dashboards/types.ts`

#### 3A. Expand `LayoutArchetype` union type (line ~82)

```typescript
export type LayoutArchetype =
  | "executive_summary"
  | "operating_review"
  | "monthly_operating_report"
  | "watchlist"
  | "fund_quarterly_review"
  | "market_comparison"
  | "underwriting_dashboard"
  | "investment_deal_evaluation"
  | "pipeline_dashboard"
  | "debt_capital_stack"
  | "reporting_export"
  | "construction_operating"
  | "portfolio_overview"
  | "custom";
```

### FILE 4: `repo-b/src/lib/dashboards/layout-archetypes.ts` — LAYOUT_ARCHETYPES record

#### 4A. Add empty archetype entries to `LAYOUT_ARCHETYPES` (line ~104)

For each new archetype that has no fixed slot definition (which is all new ones), add an `EMPTY_ARCHETYPE` entry:

```typescript
export const LAYOUT_ARCHETYPES: Record<LayoutArchetype, ArchetypeDefinition> = {
  executive_summary: EXECUTIVE_SUMMARY,
  operating_review: OPERATING_REVIEW,
  monthly_operating_report: EMPTY_ARCHETYPE("monthly_operating_report", "Monthly Operating Report"),
  watchlist: WATCHLIST,
  fund_quarterly_review: EMPTY_ARCHETYPE("fund_quarterly_review", "Fund Quarterly Review"),
  market_comparison: MARKET_COMPARISON,
  underwriting_dashboard: EMPTY_ARCHETYPE("underwriting_dashboard", "Underwriting Dashboard"),
  investment_deal_evaluation: EMPTY_ARCHETYPE("investment_deal_evaluation", "Investment Evaluation"),
  pipeline_dashboard: EMPTY_ARCHETYPE("pipeline_dashboard", "Pipeline Dashboard"),
  debt_capital_stack: EMPTY_ARCHETYPE("debt_capital_stack", "Debt & Capital Stack"),
  reporting_export: EMPTY_ARCHETYPE("reporting_export", "Report Export Center"),
  construction_operating: EMPTY_ARCHETYPE("construction_operating", "Construction & Lease-Up"),
  portfolio_overview: EMPTY_ARCHETYPE("portfolio_overview", "Portfolio Overview"),
  custom: {
    key: "custom",
    name: "Custom",
    description: "Start from scratch with a blank canvas.",
    slots: [],
  },
};
```

## Test after all changes

```bash
cd repo-b && npx tsc --noEmit 2>&1 | tail -20
```

Fix any type errors. The main risk is the `LAYOUT_ARCHETYPES` Record key type — it must match `LayoutArchetype` exactly.

Then:
```bash
make test-frontend 2>&1 | tail -30
```

## Commit

```bash
git add repo-b/src/app/api/re/v2/dashboards/generate/route.ts \
       repo-b/src/lib/dashboards/layout-archetypes.ts \
       repo-b/src/lib/dashboards/types.ts
git commit -m "feat(dashboards): expand to 13 archetypes, 19 sections, smarter layout pairing"
git push
```

## Verify on paulmalmquist.com

Test these prompts after deploy:

1. **"Build a monthly operating report with NOI trend, actual vs budget, and debt maturity"**
   - Expected: KPI → full-width NOI trend → side-by-side budget bar + variance strip → full-width debt maturity bar
   - Widget count: 5-6

2. **"Executive summary"** (vague)
   - Expected: Falls back to `ARCHETYPE_DEFAULT_SECTIONS.executive_summary` → KPI strip + NOI trend + NOI bridge + income statement
   - Half-width sections paired: noi_bridge (w:6) + income_statement (w:6) on one row

3. **"Show me the capital stack and debt maturity for this asset"**
   - Expected: Detects `debt_capital_stack` archetype → KPI + leverage metrics strip + capital stack bar + debt maturity bar + DSCR trend

4. **"Fund quarterly review with returns and cash flow"**
   - Expected: KPI + NOI trend + actual vs budget + IS + CF + returns summary

5. **"Pipeline dashboard"**
   - Expected: KPI + watchlist table + NOI trend + leverage summary

For each: open console, confirm `[generate] auto-populate:` log shows entity IDs, widget count matches expected sections, and grid spans VARY (not all 6-wide).

## Success criteria

- 13 distinct archetypes produce 13 distinct layouts from different prompts
- Half-width sections (income_statement w:6, cash_flow w:6) pair side-by-side on one row instead of stacking vertically
- A prompt mentioning specific sections always produces those sections
- Vague prompts fall back to sensible archetype defaults
- `make test-frontend` passes
- TypeScript compiles without errors
- Existing saved dashboards still load (LAYOUT_ARCHETYPES backward compatible)
