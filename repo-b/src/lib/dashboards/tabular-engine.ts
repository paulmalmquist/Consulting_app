/**
 * tabular-engine.ts
 *
 * Automatic table inference for Winston dashboard builder.
 *
 * Determines WHEN a dashboard should include a table, WHAT TYPE of table,
 * WHICH COLUMNS to include, and HOW the table relates to upstream filters.
 *
 * This engine runs after layout composition. It can inject a table widget
 * into the spec if the rules say one is warranted — even if the user did
 * not explicitly request a table.
 *
 * Architecture position:
 *   generate/route.ts → dashboard-intelligence.ts → tabular-engine.ts
 *   inferTable() is called after initial widget composition.
 *   Its output is appended to the widget array if decision.include === true.
 */

import type { DashboardWidget, WidgetType } from "./types";

/* --------------------------------------------------------------------------
 * Table type taxonomy
 * -------------------------------------------------------------------------- */
export type TableType =
  | "detail_grid"        // all entities, all columns, sortable (analytical workbench)
  | "ranked_table"       // entities sorted by a primary metric (top/bottom N)
  | "exceptions_table"   // entities that failed a threshold (watchlist / monitor)
  | "grouped_summary"    // aggregated by a dimension (by market, by fund, by type)
  | "transaction_log"    // time-ordered events (deals closed, distributions, cap calls)
  | "comparison_scorecard"; // two columns: UW vs actual / plan vs actual

/* --------------------------------------------------------------------------
 * Visibility mode — when is the table shown?
 * -------------------------------------------------------------------------- */
export type TableVisibility =
  | "always"       // always visible, part of the main layout
  | "on_select"    // hidden until user clicks a chart row or map region
  | "on_drill"     // appears only when user drills into a KPI or chart
  | "expandable";  // collapsed by default, user clicks "Show detail" to expand

/* --------------------------------------------------------------------------
 * Column definition for inferred tables
 * -------------------------------------------------------------------------- */
export interface InferredColumn {
  field: string;         // DB field or metric key
  label: string;         // Display label
  format: "dollar" | "percent" | "ratio" | "number" | "text" | "date";
  sortable: boolean;
  highlight_negative?: boolean; // red if negative (e.g. NOI variance)
  highlight_threshold?: {       // amber/red if below threshold
    warn: number;
    danger: number;
    direction: "above_good" | "below_good";
  };
}

/* --------------------------------------------------------------------------
 * Table decision
 * -------------------------------------------------------------------------- */
export interface TableDecision {
  include: boolean;
  type: TableType;
  visibility: TableVisibility;
  columns: InferredColumn[];
  /** Metric used to sort or rank the table */
  primary_sort_metric: string;
  /** Sort direction */
  sort_direction: "asc" | "desc";
  /** Widget type to use (comparison_table vs statement_table) */
  widget_type: WidgetType;
  /** Grid layout for the inferred table widget */
  layout: { x: number; y: number; w: number; h: number };
  /** Filter links — which upstream filter dimensions this table listens to */
  filter_links: string[];
  /** Human-readable reason why this table was included */
  reason: string;
}

/* --------------------------------------------------------------------------
 * Input context for table inference
 * -------------------------------------------------------------------------- */
export interface TableInferenceInput {
  archetype: string;
  entityType: "asset" | "investment" | "fund" | "portfolio";
  requestedSections: string[];
  promptLower: string;
  existingWidgets: DashboardWidget[];
  hasMap: boolean;
  hasKpi: boolean;
  hasTrendCharts: boolean;
  hasBarCharts: boolean;
  depth: "executive" | "operational" | "analytical";
  /** Y position at which to append the table (end of existing layout) */
  appendAtY: number;
}

/* --------------------------------------------------------------------------
 * Column templates by archetype / context
 * -------------------------------------------------------------------------- */

const ASSET_COMPARISON_COLUMNS: InferredColumn[] = [
  { field: "asset_name", label: "Asset", format: "text", sortable: true },
  { field: "NOI", label: "NOI Actual", format: "dollar", sortable: true },
  { field: "NOI_budget", label: "NOI Budget", format: "dollar", sortable: false },
  {
    field: "NOI_variance_pct",
    label: "Variance %",
    format: "percent",
    sortable: true,
    highlight_negative: true,
    highlight_threshold: { warn: -0.05, danger: -0.10, direction: "above_good" },
  },
  {
    field: "OCCUPANCY",
    label: "Occupancy",
    format: "percent",
    sortable: true,
    highlight_threshold: { warn: 0.88, danger: 0.80, direction: "above_good" },
  },
  {
    field: "DSCR_KPI",
    label: "DSCR",
    format: "ratio",
    sortable: true,
    highlight_threshold: { warn: 1.15, danger: 1.0, direction: "above_good" },
  },
];

const ASSET_DETAIL_COLUMNS: InferredColumn[] = [
  { field: "asset_name", label: "Asset", format: "text", sortable: true },
  { field: "property_type", label: "Type", format: "text", sortable: true },
  { field: "market", label: "Market", format: "text", sortable: true },
  { field: "NOI", label: "NOI", format: "dollar", sortable: true },
  { field: "OCCUPANCY", label: "Occupancy", format: "percent", sortable: true },
  { field: "ASSET_VALUE", label: "Value", format: "dollar", sortable: true },
  { field: "LTV", label: "LTV", format: "percent", sortable: true, highlight_negative: false },
];

const FUND_SUMMARY_COLUMNS: InferredColumn[] = [
  { field: "fund_name", label: "Fund", format: "text", sortable: false },
  { field: "PORTFOLIO_NAV", label: "NAV", format: "dollar", sortable: true },
  { field: "GROSS_IRR", label: "Gross IRR", format: "percent", sortable: true },
  { field: "NET_TVPI", label: "Net TVPI", format: "ratio", sortable: true },
  { field: "DPI", label: "DPI", format: "ratio", sortable: true },
  { field: "WEIGHTED_LTV", label: "Wtd LTV", format: "percent", sortable: true },
  { field: "WEIGHTED_DSCR", label: "Wtd DSCR", format: "ratio", sortable: true },
];

const WATCHLIST_COLUMNS: InferredColumn[] = [
  { field: "asset_name", label: "Asset", format: "text", sortable: true },
  { field: "risk_flag", label: "Flag", format: "text", sortable: false },
  {
    field: "NOI_variance_pct",
    label: "NOI vs Budget",
    format: "percent",
    sortable: true,
    highlight_negative: true,
    highlight_threshold: { warn: -0.05, danger: -0.10, direction: "above_good" },
  },
  {
    field: "OCCUPANCY",
    label: "Occupancy",
    format: "percent",
    sortable: true,
    highlight_threshold: { warn: 0.88, danger: 0.80, direction: "above_good" },
  },
  {
    field: "DSCR_KPI",
    label: "DSCR",
    format: "ratio",
    sortable: true,
    highlight_threshold: { warn: 1.15, danger: 1.0, direction: "above_good" },
  },
  { field: "last_reviewed", label: "Reviewed", format: "date", sortable: true },
];

const DEAL_PIPELINE_COLUMNS: InferredColumn[] = [
  { field: "deal_name", label: "Deal", format: "text", sortable: false },
  { field: "deal_status", label: "Stage", format: "text", sortable: true },
  { field: "property_type", label: "Type", format: "text", sortable: true },
  { field: "market", label: "Market", format: "text", sortable: true },
  { field: "target_price", label: "Target Price", format: "dollar", sortable: true },
  { field: "projected_irr", label: "Proj. IRR", format: "percent", sortable: true },
  { field: "days_in_stage", label: "Days in Stage", format: "number", sortable: true, highlight_negative: false },
];

const MARKET_BREAKDOWN_COLUMNS: InferredColumn[] = [
  { field: "market", label: "Market / MSA", format: "text", sortable: false },
  { field: "asset_count", label: "Assets", format: "number", sortable: true },
  { field: "NOI", label: "Total NOI", format: "dollar", sortable: true },
  { field: "OCCUPANCY", label: "Avg Occupancy", format: "percent", sortable: true },
  { field: "NOI_variance_pct", label: "NOI vs Budget", format: "percent", sortable: true, highlight_negative: true },
  { field: "WEIGHTED_LTV", label: "Avg LTV", format: "percent", sortable: true },
];

/* --------------------------------------------------------------------------
 * Decision rules
 * -------------------------------------------------------------------------- */

interface TableRule {
  condition: (input: TableInferenceInput) => boolean;
  type: TableType;
  visibility: TableVisibility;
  columns: (input: TableInferenceInput) => InferredColumn[];
  widget_type: WidgetType;
  primary_sort: string;
  sort_direction: "asc" | "desc";
  filter_links: string[];
  h: number; // row height
  reason: string;
}

const TABLE_RULES: TableRule[] = [
  // Rule 1: Watchlist archetype → exceptions table always visible
  {
    condition: (i) => i.archetype === "watchlist" || i.promptLower.includes("watchlist") || i.promptLower.includes("underperform"),
    type: "exceptions_table",
    visibility: "always",
    widget_type: "comparison_table",
    columns: () => WATCHLIST_COLUMNS,
    primary_sort: "NOI_variance_pct",
    sort_direction: "asc",
    filter_links: ["fund_id", "quarter", "scenario"],
    h: 5,
    reason: "Watchlist dashboards always need an exceptions table sorted by worst performers",
  },
  // Rule 2: Map present → detail table appears on map select
  {
    condition: (i) => i.hasMap && !i.requestedSections.includes("underperformer_watchlist"),
    type: "detail_grid",
    visibility: "on_select",
    widget_type: "comparison_table",
    columns: (i) => (i.entityType === "fund" ? FUND_SUMMARY_COLUMNS : ASSET_DETAIL_COLUMNS),
    primary_sort: "NOI",
    sort_direction: "desc",
    filter_links: ["geography_id", "fund_id", "quarter"],
    h: 5,
    reason: "Maps almost always need a linked detail table that responds to geography selection",
  },
  // Rule 3: Comparison / market archetype → ranked/grouped table
  {
    condition: (i) =>
      i.archetype === "market_comparison" ||
      i.promptLower.includes("by market") ||
      i.promptLower.includes("by sector") ||
      i.promptLower.includes("by property type") ||
      i.promptLower.includes("compare"),
    type: "grouped_summary",
    visibility: "always",
    widget_type: "comparison_table",
    columns: () => MARKET_BREAKDOWN_COLUMNS,
    primary_sort: "NOI",
    sort_direction: "desc",
    filter_links: ["market", "property_type", "quarter"],
    h: 4,
    reason: "Comparison dashboards benefit from a ranked/grouped table to back the visual",
  },
  // Rule 4: Deal pipeline keywords → pipeline grid
  {
    condition: (i) => i.promptLower.includes("pipeline") || i.promptLower.includes("deal") || i.promptLower.includes("acquisition"),
    type: "detail_grid",
    visibility: "always",
    widget_type: "comparison_table",
    columns: () => DEAL_PIPELINE_COLUMNS,
    primary_sort: "days_in_stage",
    sort_direction: "desc",
    filter_links: ["deal_status", "fund_id", "market"],
    h: 5,
    reason: "Pipeline dashboards need an opportunities grid sorted by time in stage",
  },
  // Rule 5: Analytical depth + KPI + trends → ranked table as supporting detail
  {
    condition: (i) =>
      i.depth === "analytical" &&
      i.hasKpi &&
      i.hasTrendCharts &&
      !i.requestedSections.includes("underperformer_watchlist") &&
      !i.hasMap,
    type: "ranked_table",
    visibility: "expandable",
    widget_type: "comparison_table",
    columns: (i) => (i.entityType === "fund" ? FUND_SUMMARY_COLUMNS : ASSET_COMPARISON_COLUMNS),
    primary_sort: "NOI",
    sort_direction: "desc",
    filter_links: ["fund_id", "quarter", "scenario"],
    h: 5,
    reason: "Analytical dashboards with KPIs and trends benefit from a ranked detail table",
  },
  // Rule 6: Fund quarterly review → fund summary table
  {
    condition: (i) => i.archetype === "fund_quarterly_review" && i.entityType === "fund",
    type: "comparison_scorecard",
    visibility: "always",
    widget_type: "comparison_table",
    columns: () => FUND_SUMMARY_COLUMNS,
    primary_sort: "GROSS_IRR",
    sort_direction: "desc",
    filter_links: ["fund_id", "quarter"],
    h: 4,
    reason: "Fund quarterly reviews always include a fund-level performance scorecard",
  },
  // Rule 7: Executive summary for IC → ranked asset table collapsed
  {
    condition: (i) =>
      i.archetype === "executive_summary" &&
      i.entityType !== "fund" &&
      !i.requestedSections.some((s) => s.includes("table")),
    type: "ranked_table",
    visibility: "expandable",
    widget_type: "comparison_table",
    columns: () => ASSET_COMPARISON_COLUMNS,
    primary_sort: "ASSET_VALUE",
    sort_direction: "desc",
    filter_links: ["fund_id", "quarter"],
    h: 4,
    reason: "IC memos benefit from a collapsed asset summary table available on demand",
  },
];

/* --------------------------------------------------------------------------
 * Main function
 * -------------------------------------------------------------------------- */
export function inferTable(input: TableInferenceInput): TableDecision | null {
  // Don't add a second table if one already exists in the layout
  const hasExistingTable = input.existingWidgets.some(
    (w) => w.type === "comparison_table" || w.type === "statement_table",
  );
  if (hasExistingTable) return null;

  // Try rules in order — first match wins
  for (const rule of TABLE_RULES) {
    if (rule.condition(input)) {
      return {
        include: true,
        type: rule.type,
        visibility: rule.visibility,
        columns: rule.columns(input),
        primary_sort_metric: rule.primary_sort,
        sort_direction: rule.sort_direction,
        widget_type: rule.widget_type,
        layout: { x: 0, y: input.appendAtY, w: 12, h: rule.h },
        filter_links: rule.filter_links,
        reason: rule.reason,
      };
    }
  }

  return null;
}

/**
 * buildTableWidget — converts a TableDecision into a DashboardWidget
 * that can be appended to the spec's widget array.
 */
export function buildTableWidget(
  decision: TableDecision,
  idSuffix: number,
  entityType: string,
  quarter?: string,
): DashboardWidget {
  return {
    id: `inferred_table_${idSuffix}`,
    type: decision.widget_type,
    config: {
      title: tableTypeLabel(decision.type),
      entity_type: entityType as DashboardWidget["config"]["entity_type"],
      metrics: [],
      quarter,
      scenario: "actual",
      comparison: "budget",
    },
    layout: decision.layout,
  };
}

function tableTypeLabel(type: TableType): string {
  const labels: Record<TableType, string> = {
    detail_grid: "Asset Detail",
    ranked_table: "Ranked Performance",
    exceptions_table: "Underperforming Assets",
    grouped_summary: "Summary by Segment",
    transaction_log: "Transaction Log",
    comparison_scorecard: "Performance Scorecard",
  };
  return labels[type] ?? "Detail Table";
}
