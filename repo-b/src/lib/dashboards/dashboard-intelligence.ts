/**
 * dashboard-intelligence.ts
 *
 * Richer decision model for Winston dashboard builder.
 *
 * Answers the following questions:
 *   1. What is the "hero" visual for this dashboard?
 *   2. What supporting visuals should exist alongside it?
 *   3. When is a KPI row appropriate?
 *   4. When should a table be auto-injected?
 *   5. When should interaction drive the lower half of the page?
 *   6. What behaviour mode should the dashboard operate in?
 *
 * Behaviour modes:
 *   executive_summary  — few KPIs, one hero chart, a table on demand
 *   operational_monitor — dense, exception-driven, refreshes frequently
 *   analytical_workbench — full data, drillable tables, many dimensions
 *   pipeline_manager — stage-based charts + deal grid
 *   geographic_explorer — map as hero, tables respond to region clicks
 *
 * Architecture position:
 *   generate/route.ts calls assembleDashboardIntelligence() AFTER initial
 *   widget composition but BEFORE the spec is returned.
 *   The result enriches the response payload with:
 *     - interaction_model (from interaction-engine.ts)
 *     - measure_suggestions (from measure-suggestion-engine.ts)
 *     - table_decision (from tabular-engine.ts)
 *     - behavior_mode
 *     - hero_widget_id
 */

import { inferInteractions, type DashboardInteractionModel } from "./interaction-engine";
import { suggestMeasures, type MeasureSuggestionResult } from "./measure-suggestion-engine";
import { inferTable, buildTableWidget, type TableDecision } from "./tabular-engine";
import type { DashboardWidget, LayoutArchetype } from "./types";

/* --------------------------------------------------------------------------
 * Behaviour mode
 * -------------------------------------------------------------------------- */
export type DashboardBehaviorMode =
  | "executive_summary"
  | "operational_monitor"
  | "analytical_workbench"
  | "pipeline_manager"
  | "geographic_explorer";

/* --------------------------------------------------------------------------
 * Hero visual selection
 * -------------------------------------------------------------------------- */
export type HeroRole =
  | "primary"   // the main visual — largest, top of page or left column
  | "supporting" // explains or contextualises the hero
  | "detail"    // reveals detail when user interacts with hero/supporting

/* --------------------------------------------------------------------------
 * Intelligence result
 * -------------------------------------------------------------------------- */
export interface DashboardIntelligenceResult {
  behavior_mode: DashboardBehaviorMode;
  hero_widget_id: string | null;
  widget_roles: Record<string, HeroRole>;
  include_kpi_strip: boolean;
  kpi_strip_metric_keys: string[];
  table_decision: TableDecision | null;
  interaction_model: DashboardInteractionModel;
  measure_suggestions: MeasureSuggestionResult;
  /** Updated widget array — may include an auto-injected table */
  widgets: DashboardWidget[];
  /** Analytical depth */
  depth: "executive" | "operational" | "analytical";
}

/* --------------------------------------------------------------------------
 * Behaviour mode detection
 * -------------------------------------------------------------------------- */
function detectBehaviorMode(
  archetype: string,
  promptLower: string,
  depth: "executive" | "operational" | "analytical",
): DashboardBehaviorMode {
  if (promptLower.includes("map") || promptLower.includes("geographic") || promptLower.includes("geography")) {
    return "geographic_explorer";
  }
  if (promptLower.includes("pipeline") || promptLower.includes("deal") || promptLower.includes("acquisition")) {
    return "pipeline_manager";
  }
  if (
    archetype === "watchlist" ||
    promptLower.includes("monitor") ||
    promptLower.includes("alert") ||
    promptLower.includes("exception") ||
    promptLower.includes("watchlist")
  ) {
    return "operational_monitor";
  }
  if (depth === "executive" || archetype === "executive_summary" || archetype === "fund_quarterly_review") {
    return "executive_summary";
  }
  return "analytical_workbench";
}

/* --------------------------------------------------------------------------
 * Hero widget selection
 *
 * Priority order by widget type for each behaviour mode.
 * -------------------------------------------------------------------------- */
const HERO_PRIORITY: Record<DashboardBehaviorMode, string[]> = {
  executive_summary: ["trend_line", "bar_chart", "waterfall", "metrics_strip"],
  operational_monitor: ["comparison_table", "bar_chart", "trend_line"],
  analytical_workbench: ["trend_line", "bar_chart", "comparison_table", "statement_table"],
  pipeline_manager: ["bar_chart", "comparison_table", "trend_line"],
  geographic_explorer: ["bar_chart", "trend_line", "comparison_table"],
};

function selectHeroWidget(
  widgets: DashboardWidget[],
  mode: DashboardBehaviorMode,
): string | null {
  const priority = HERO_PRIORITY[mode] ?? [];
  for (const type of priority) {
    const match = widgets.find((w) => w.type === type);
    if (match) return match.id;
  }
  return widgets[0]?.id ?? null;
}

/* --------------------------------------------------------------------------
 * Widget role assignment
 * -------------------------------------------------------------------------- */
function assignWidgetRoles(
  widgets: DashboardWidget[],
  heroId: string | null,
): Record<string, HeroRole> {
  const roles: Record<string, HeroRole> = {};
  for (const w of widgets) {
    if (w.id === heroId) {
      roles[w.id] = "primary";
    } else if (w.type === "comparison_table" || w.type === "statement_table") {
      roles[w.id] = "detail";
    } else {
      roles[w.id] = "supporting";
    }
  }
  return roles;
}

/* --------------------------------------------------------------------------
 * KPI strip metric selection
 *
 * Given the measure suggestions, pick the best 4 metrics for the KPI strip.
 * Required measures go first; suggested fill remaining slots.
 * -------------------------------------------------------------------------- */
function selectKpiMetrics(
  suggestions: MeasureSuggestionResult,
  entityType: "asset" | "investment" | "fund" | "portfolio",
  maxMetrics = 4,
): string[] {
  const candidates = [
    ...suggestions.required.map((m) => m.metric_key),
    ...suggestions.suggested.map((m) => m.metric_key),
  ];

  // Filter to KPI-strip appropriate metrics (ratio, base, derived — not decomposition)
  const stripTypes = new Set(["base", "ratio", "derived"]);
  const filtered = candidates.filter((k) => {
    const suggestion = [...suggestions.required, ...suggestions.suggested].find((m) => m.metric_key === k);
    return suggestion && stripTypes.has(suggestion.category);
  });

  return [...new Set(filtered)].slice(0, maxMetrics);
}

/* --------------------------------------------------------------------------
 * Build widget pairs for interaction inference
 * -------------------------------------------------------------------------- */
function buildWidgetPairs(
  widgets: DashboardWidget[],
): Array<{ sourceId: string; sourceType: string; targetId: string; targetType: string }> {
  const pairs: Array<{ sourceId: string; sourceType: string; targetId: string; targetType: string }> = [];
  for (let i = 0; i < widgets.length; i++) {
    for (let j = 0; j < widgets.length; j++) {
      if (i !== j) {
        pairs.push({
          sourceId: widgets[i].id,
          sourceType: widgets[i].type,
          targetId: widgets[j].id,
          targetType: widgets[j].type,
        });
      }
    }
  }
  return pairs;
}

/* --------------------------------------------------------------------------
 * Main function
 * -------------------------------------------------------------------------- */
export function assembleDashboardIntelligence(params: {
  widgets: DashboardWidget[];
  archetype: LayoutArchetype | string;
  entityType: "asset" | "investment" | "fund" | "portfolio";
  promptText: string;
  requestedSections: string[];
  quarter?: string;
  userType?: string;
}): DashboardIntelligenceResult {
  const { widgets, archetype, entityType, promptText, requestedSections, quarter, userType } = params;
  const promptLower = promptText.toLowerCase();

  // 1. Measure suggestions
  const measureSuggestions = suggestMeasures(promptLower, entityType, userType);
  const depth = measureSuggestions.depth;

  // 2. Behaviour mode
  const behaviorMode = detectBehaviorMode(archetype, promptLower, depth);

  // 3. Table inference — may add a widget
  const hasMap = promptLower.includes("map") || promptLower.includes("geographic");
  const hasKpi = widgets.some((w) => w.type === "metrics_strip");
  const hasTrend = widgets.some((w) => w.type === "trend_line");
  const hasBar = widgets.some((w) => w.type === "bar_chart");
  const appendAtY = widgets.reduce((maxY, w) => Math.max(maxY, w.layout.y + w.layout.h), 0);

  const tableDecision = inferTable({
    archetype,
    entityType,
    requestedSections,
    promptLower,
    existingWidgets: widgets,
    hasMap,
    hasKpi,
    hasTrendCharts: hasTrend,
    hasBarCharts: hasBar,
    depth,
    appendAtY,
  });

  // 4. Build final widget array (with optional auto-injected table)
  let finalWidgets = [...widgets];
  if (tableDecision?.include) {
    const tableWidget = buildTableWidget(tableDecision, finalWidgets.length, entityType, quarter);
    finalWidgets = [...finalWidgets, tableWidget];
  }

  // 5. Hero + role assignment
  const heroId = selectHeroWidget(finalWidgets, behaviorMode);
  const widgetRoles = assignWidgetRoles(finalWidgets, heroId);

  // 6. Interaction model
  const widgetPairs = buildWidgetPairs(finalWidgets);
  const interactionModel = inferInteractions({
    widgetPairs,
    archetype,
    hasMaps: hasMap,
    hasTable: finalWidgets.some((w) => w.type === "comparison_table" || w.type === "statement_table"),
    hasDrillable: behaviorMode === "operational_monitor" || behaviorMode === "analytical_workbench",
  });

  // 7. KPI strip metrics
  const kpiMetrics = selectKpiMetrics(measureSuggestions, entityType);
  const includeKpiStrip = measureSuggestions.include_kpi_strip && !hasKpi;

  return {
    behavior_mode: behaviorMode,
    hero_widget_id: heroId,
    widget_roles: widgetRoles,
    include_kpi_strip: includeKpiStrip,
    kpi_strip_metric_keys: kpiMetrics,
    table_decision: tableDecision,
    interaction_model: interactionModel,
    measure_suggestions: measureSuggestions,
    widgets: finalWidgets,
    depth,
  };
}
