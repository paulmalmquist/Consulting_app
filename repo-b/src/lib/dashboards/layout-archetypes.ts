/**
 * Layout Archetypes — pre-composed dashboard layouts that feel professional.
 *
 * Each archetype defines a widget skeleton that the AI fills with
 * context-appropriate metrics. The result is a composed, institutional layout
 * rather than chaotic random card placement.
 */

import type { DashboardWidget, WidgetType, LayoutArchetype } from "./types";

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
export const LAYOUT_ARCHETYPES: Record<LayoutArchetype, ArchetypeDefinition> = {
  executive_summary: EXECUTIVE_SUMMARY,
  operating_review: OPERATING_REVIEW,
  watchlist: WATCHLIST,
  market_comparison: MARKET_COMPARISON,
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
