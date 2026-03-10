/**
 * Layout Archetypes — pre-composed dashboard layouts that feel professional.
 *
 * Each archetype defines a widget skeleton that the AI fills with
 * context-appropriate metrics. The result is a composed, institutional layout
 * rather than chaotic random card placement.
 */

import type { DashboardWidget, WidgetType, WidgetConfig, LayoutArchetype } from "./types";

interface ArchetypeSlot {
  id_prefix: string;
  type: WidgetType;
  layout: { x: number; y: number; w: number; h: number };
  default_config: {
    title?: string;
    metric_count?: number;   // how many metrics to fill
    statement?: string;
    format?: string;
  };
}

export interface ArchetypeDefinition {
  key: LayoutArchetype;
  name: string;
  description: string;
  slots: ArchetypeSlot[];
}

/* --------------------------------------------------------------------------
 * Executive Summary — KPI strip + 2 charts + statement table
 * -------------------------------------------------------------------------- */
const EXECUTIVE_SUMMARY: ArchetypeDefinition = {
  key: "executive_summary",
  name: "Executive Summary",
  description: "High-level KPIs with trend visualization and financial detail. Best for IC memos and quarterly updates.",
  slots: [
    { id_prefix: "kpi", type: "metrics_strip", layout: { x: 0, y: 0, w: 12, h: 2 }, default_config: { metric_count: 4 } },
    { id_prefix: "trend", type: "trend_line", layout: { x: 0, y: 2, w: 6, h: 4 }, default_config: { title: "Operating Trend", format: "dollar" } },
    { id_prefix: "bar", type: "bar_chart", layout: { x: 6, y: 2, w: 6, h: 4 }, default_config: { title: "Revenue vs Expenses", format: "dollar" } },
    { id_prefix: "bridge", type: "waterfall", layout: { x: 0, y: 6, w: 6, h: 4 }, default_config: { title: "NOI Bridge" } },
    { id_prefix: "stmt", type: "statement_table", layout: { x: 6, y: 6, w: 6, h: 4 }, default_config: { title: "Income Statement", statement: "IS" } },
  ],
};

/* --------------------------------------------------------------------------
 * Operating Review — detailed operating metrics with comparisons
 * -------------------------------------------------------------------------- */
const OPERATING_REVIEW: ArchetypeDefinition = {
  key: "operating_review",
  name: "Operating Review",
  description: "Deep operating detail with budget variance and trend analysis. Best for asset managers.",
  slots: [
    { id_prefix: "kpi", type: "metrics_strip", layout: { x: 0, y: 0, w: 12, h: 2 }, default_config: { metric_count: 6 } },
    { id_prefix: "is", type: "statement_table", layout: { x: 0, y: 2, w: 6, h: 5 }, default_config: { title: "Income Statement", statement: "IS" } },
    { id_prefix: "cf", type: "statement_table", layout: { x: 6, y: 2, w: 6, h: 5 }, default_config: { title: "Cash Flow", statement: "CF" } },
    { id_prefix: "noi_trend", type: "trend_line", layout: { x: 0, y: 7, w: 4, h: 4 }, default_config: { title: "NOI Trend", format: "dollar" } },
    { id_prefix: "occ_trend", type: "trend_line", layout: { x: 4, y: 7, w: 4, h: 4 }, default_config: { title: "Occupancy", format: "percent" } },
    { id_prefix: "dscr_trend", type: "trend_line", layout: { x: 8, y: 7, w: 4, h: 4 }, default_config: { title: "DSCR", format: "ratio" } },
  ],
};

/* --------------------------------------------------------------------------
 * Watchlist — underperformance detection and monitoring
 * -------------------------------------------------------------------------- */
const WATCHLIST: ArchetypeDefinition = {
  key: "watchlist",
  name: "Watchlist",
  description: "Surveillance dashboard highlighting underperforming assets. Best for portfolio monitoring.",
  slots: [
    { id_prefix: "kpi", type: "metrics_strip", layout: { x: 0, y: 0, w: 12, h: 2 }, default_config: { metric_count: 4 } },
    { id_prefix: "comp", type: "comparison_table", layout: { x: 0, y: 2, w: 12, h: 5 }, default_config: { title: "UW vs Actual Scorecard" } },
    { id_prefix: "noi_bar", type: "bar_chart", layout: { x: 0, y: 7, w: 6, h: 4 }, default_config: { title: "NOI by Asset", format: "dollar" } },
    { id_prefix: "occ_bar", type: "bar_chart", layout: { x: 6, y: 7, w: 6, h: 4 }, default_config: { title: "Occupancy by Asset", format: "percent" } },
  ],
};

/* --------------------------------------------------------------------------
 * Market Comparison — side-by-side geographic/sector analysis
 * -------------------------------------------------------------------------- */
const MARKET_COMPARISON: ArchetypeDefinition = {
  key: "market_comparison",
  name: "Market Comparison",
  description: "Side-by-side performance by market, sector, or vintage. Best for allocation decisions.",
  slots: [
    { id_prefix: "kpi", type: "metrics_strip", layout: { x: 0, y: 0, w: 12, h: 2 }, default_config: { metric_count: 4 } },
    { id_prefix: "trend_a", type: "trend_line", layout: { x: 0, y: 2, w: 6, h: 4 }, default_config: { title: "Market A — Operating Trend", format: "dollar" } },
    { id_prefix: "trend_b", type: "trend_line", layout: { x: 6, y: 2, w: 6, h: 4 }, default_config: { title: "Market B — Operating Trend", format: "dollar" } },
    { id_prefix: "bar_comp", type: "bar_chart", layout: { x: 0, y: 6, w: 12, h: 4 }, default_config: { title: "Metric Comparison", format: "dollar" } },
    { id_prefix: "note", type: "text_block", layout: { x: 0, y: 10, w: 12, h: 2 }, default_config: { title: "Analysis Notes" } },
  ],
};

/* --------------------------------------------------------------------------
 * Registry
 * -------------------------------------------------------------------------- */
const EMPTY_ARCHETYPE = (key: LayoutArchetype, name: string): ArchetypeDefinition => ({
  key,
  name,
  description: "Section-based composition — layout built dynamically from intent.",
  slots: [],
});

export const LAYOUT_ARCHETYPES: Record<LayoutArchetype, ArchetypeDefinition> = {
  executive_summary: EXECUTIVE_SUMMARY,
  operating_review: OPERATING_REVIEW,
  monthly_operating_report: EMPTY_ARCHETYPE("monthly_operating_report", "Monthly Operating Report"),
  watchlist: WATCHLIST,
  fund_quarterly_review: EMPTY_ARCHETYPE("fund_quarterly_review", "Fund Quarterly Review"),
  market_comparison: MARKET_COMPARISON,
  underwriting_dashboard: EMPTY_ARCHETYPE("underwriting_dashboard", "Underwriting Dashboard"),
  custom: {
    key: "custom",
    name: "Custom",
    description: "Start from scratch with a blank canvas.",
    slots: [],
  },
};

export function getArchetype(key: LayoutArchetype): ArchetypeDefinition {
  return LAYOUT_ARCHETYPES[key] ?? LAYOUT_ARCHETYPES.custom;
}

export function listArchetypes(): ArchetypeDefinition[] {
  return Object.values(LAYOUT_ARCHETYPES).filter((a) => a.key !== "custom");
}

/* --------------------------------------------------------------------------
 * Section Registry — maps section keys to widget definitions
 * -------------------------------------------------------------------------- */

export interface SectionWidgetDef {
  type: WidgetType;
  w: number;
  h: number;
  config_overrides: Partial<WidgetConfig>;
}

export interface SectionDefinition {
  key: string;
  widgets: SectionWidgetDef[];
}

export const SECTION_REGISTRY: Record<string, SectionDefinition> = {
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

/* --------------------------------------------------------------------------
 * Default section lists per archetype (used when prompt is vague)
 * -------------------------------------------------------------------------- */
export const ARCHETYPE_DEFAULT_SECTIONS: Record<string, string[]> = {
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
};
