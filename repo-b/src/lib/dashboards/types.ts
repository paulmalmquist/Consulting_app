/**
 * Dashboard Spec Schema — the structured representation of an AI-generated dashboard.
 *
 * The AI generates this spec; the backend computes data; the frontend renders.
 * No raw frontend code is generated — only structured, validated specs.
 */

/* --------------------------------------------------------------------------
 * Widget types (map 1:1 to existing chart/metric components)
 * -------------------------------------------------------------------------- */
export type WidgetType =
  | "metric_card"        // MetricCard / KpiCard
  | "metrics_strip"      // MetricsStrip (horizontal KPI band)
  | "trend_line"         // TrendLineChart
  | "bar_chart"          // QuarterlyBarChart
  | "waterfall"          // WaterfallChart
  | "statement_table"    // StatementTable
  | "comparison_table"   // UwVsActualTable
  | "sparkline_grid"     // Grid of SparkLine + label cards
  | "sensitivity_heat"   // SensitivityHeatMap
  | "text_block"         // Markdown/text annotation
  | "pipeline_bar"       // Deal pipeline by stage (Recharts BarChart)
  | "geographic_map";    // Geographic map (DealGeoIntelligencePanel wrapper)

export type ChartFormat = "dollar" | "percent" | "number" | "ratio";

/* --------------------------------------------------------------------------
 * Widget configuration
 * -------------------------------------------------------------------------- */
export interface WidgetMetricRef {
  key: string;           // metric catalog key (e.g., "NOI", "OCCUPANCY", "DSCR_KPI")
  label?: string;        // display override
  color?: string;        // hex color override
  dashed?: boolean;      // for trend lines
}

export interface WidgetFilter {
  dimension: string;     // e.g., "property_type", "market", "quarter"
  operator: "eq" | "in" | "gte" | "lte" | "between";
  value: string | string[] | [string, string];
}

/** Per-widget data availability (derived from known context, not DB scan) */
export interface DataAvailability {
  widget_id: string;
  has_data: boolean;
  has_budget: boolean;
  missing_reason?: string;
}

/** Per-widget query transparency — what API call backs each widget */
export interface WidgetQueryManifest {
  widget_id: string;
  widget_type: string;
  api_route: string;
  params: Record<string, string>;
  description: string;
}

export interface WidgetConfig {
  title?: string;
  subtitle?: string;
  metrics: WidgetMetricRef[];
  entity_type?: "asset" | "investment" | "fund" | "portfolio";
  entity_ids?: string[];          // specific entities, or empty = all in scope
  statement?: "IS" | "CF" | "BS" | "KPI";
  period_type?: "monthly" | "quarterly" | "annual" | "ytd" | "ttm";
  scenario?: "actual" | "budget" | "proforma";
  comparison?: "none" | "budget" | "prior_year";
  quarter?: string;               // specific quarter override
  format?: ChartFormat;
  filters?: WidgetFilter[];
  show_legend?: boolean;
  stacked?: boolean;
  reference_lines?: Array<{ y: number; label: string; color?: string }>;
  // pipeline_bar fields
  pipeline_field?: string;        // grouping field (default: "status")
  pipeline_value_field?: string;  // aggregation field (default: "headline_price")
  pipeline_filter?: Record<string, string>; // e.g. {fund_id: "..."}
  linked_table_id?: string;       // id of sibling table widget to sync
  // geographic_map fields
  geo_entity_type?: "asset" | "investment" | "fund" | "portfolio";
  geo_filter?: Record<string, string>;
  geo_cluster?: boolean;
}

/* --------------------------------------------------------------------------
 * Widget layout position (grid-based)
 * -------------------------------------------------------------------------- */
export interface WidgetLayout {
  x: number;   // column (0-based, 12-col grid)
  y: number;   // row (auto-incremented)
  w: number;   // width in columns (1-12)
  h: number;   // height in rows (1 row ≈ 80px)
}

/* --------------------------------------------------------------------------
 * Widget definition
 * -------------------------------------------------------------------------- */
export interface DashboardWidget {
  id: string;                  // unique within dashboard
  type: WidgetType;
  config: WidgetConfig;
  layout: WidgetLayout;
}

/* --------------------------------------------------------------------------
 * Layout archetype
 * -------------------------------------------------------------------------- */
export type LayoutArchetype =
  | "executive_summary"
  | "operating_review"
  | "monthly_operating_report"
  | "watchlist"
  | "fund_quarterly_review"
  | "market_comparison"
  | "underwriting_dashboard"
  | "custom";

/* --------------------------------------------------------------------------
 * Entity scope
 * -------------------------------------------------------------------------- */
export interface EntityScope {
  entity_type: "asset" | "investment" | "fund" | "portfolio";
  entity_ids?: string[];
  filters?: WidgetFilter[];
}

/* --------------------------------------------------------------------------
 * Dashboard spec (the full document)
 * -------------------------------------------------------------------------- */
export interface DashboardSpec {
  widgets: DashboardWidget[];
  density?: "comfortable" | "compact";
  builder_messages?: Array<{ level: "info" | "warning" | "error"; text: string }>;
}

/* --------------------------------------------------------------------------
 * Saved dashboard (DB record shape)
 * -------------------------------------------------------------------------- */
export interface SavedDashboard {
  id: string;
  env_id: string;
  business_id: string;
  name: string;
  description: string | null;
  layout_archetype: LayoutArchetype;
  spec: DashboardSpec;
  prompt_text: string | null;
  entity_scope: EntityScope;
  quarter: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
 * Hint chip
 * -------------------------------------------------------------------------- */
export interface HintChip {
  label: string;
  action: "append" | "replace";  // append to prompt or replace it
  text: string;                   // the text to insert/replace
  category: "metric" | "layout" | "comparison" | "export" | "filter" | "scope";
}

/* --------------------------------------------------------------------------
 * Subscription
 * -------------------------------------------------------------------------- */
export interface DashboardSubscription {
  id: string;
  dashboard_id: string;
  subscriber: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  delivery_format: "pdf" | "csv" | "excel" | "link";
  filter_preset: Record<string, unknown>;
  active: boolean;
  next_delivery: string | null;
}
