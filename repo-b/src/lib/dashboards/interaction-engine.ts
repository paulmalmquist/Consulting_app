/**
 * interaction-engine.ts
 *
 * Structured interaction model for Winston dashboard builder.
 *
 * Defines two levels of interactions:
 *   Level 1 — simple filter propagation (global filters, click-to-filter)
 *   Level 2 — advanced patterns (hierarchical drilldown, cross-highlight,
 *              bidirectional filtering, interaction chains, priority rules)
 *
 * Every dashboard spec can carry an `interactions` array. The frontend
 * reads this array to wire up event handlers between widgets. This file
 * is the authoritative schema and inference engine — it does NOT render
 * interactions itself.
 *
 * Architecture position:
 *   generate/route.ts  →  dashboard-intelligence.ts  →  interaction-engine.ts
 *   The intelligence model calls inferInteractions() and attaches the result
 *   to the DashboardSpec before returning it.
 */

/* --------------------------------------------------------------------------
 * Trigger types — what the user does
 * -------------------------------------------------------------------------- */
export type TriggerType =
  | "click"          // user clicks a bar, point, row, or region
  | "hover"          // user hovers over a data point
  | "select"         // user selects from a dropdown / filter control
  | "range_select"   // user brushes a date or value range
  | "row_click"      // user clicks a table row
  | "map_click"      // user clicks a map region or marker
  | "kpi_click"      // user clicks a KPI card
  | "reset";         // user clicks a reset / clear button

/* --------------------------------------------------------------------------
 * Action types — what happens to the target
 * -------------------------------------------------------------------------- */
export type ActionType =
  | "filter"         // apply a filter to target (reduce data shown)
  | "highlight"      // highlight matching data in target without hiding others
  | "cross_filter"   // bidirectional: filtering source also filters target and vice-versa
  | "drilldown"      // replace target content with detail view for selected item
  | "expand"         // expand a hidden/collapsed section (e.g. reveal detail table)
  | "navigate"       // navigate to a different page/context (asset detail, fund page)
  | "sync_selection" // synchronise cursor/selection across multiple charts
  | "update_kpi"     // recompute KPI cards using the selected scope
  | "reset_all";     // clear all interaction state and return to default view

/* --------------------------------------------------------------------------
 * Scope — how widely the interaction spreads
 * -------------------------------------------------------------------------- */
export type InteractionScope =
  | "local"       // only affects explicitly listed target_ids
  | "section"     // affects all widgets in the same row/section
  | "global";     // affects all widgets on the dashboard

/* --------------------------------------------------------------------------
 * Role of a target widget relative to the source
 * -------------------------------------------------------------------------- */
export type TargetRole =
  | "responsive"    // target shows detail that depends on what was clicked
  | "explanatory"   // target explains why the source value is what it is
  | "independent";  // target exists alongside source, not causally linked

/* --------------------------------------------------------------------------
 * Persistence — does the interaction state survive a page refresh?
 * -------------------------------------------------------------------------- */
export type PersistenceMode =
  | "session"     // cleared when user closes/refreshes the page
  | "url"         // encoded into URL query params (shareable)
  | "none";       // ephemeral, hover-level only

/* --------------------------------------------------------------------------
 * Core interaction definition
 * -------------------------------------------------------------------------- */
export interface Interaction {
  /** Unique ID within this dashboard */
  id: string;
  /** Widget that initiates the interaction */
  source_id: string;
  /** Widgets that receive the interaction. Empty = use scope rule. */
  target_ids: string[];
  /** What the user does */
  trigger: TriggerType;
  /** What happens to the targets */
  action: ActionType;
  /** How widely the action spreads */
  scope: InteractionScope;
  /** How each target relates to the source */
  target_role: TargetRole;
  /**
   * Which dimension/field is used to filter or link.
   * E.g. "asset_id", "fund_id", "market", "quarter", "deal_status"
   */
  link_dimension: string;
  /** Persistence mode */
  persistence: PersistenceMode;
  /**
   * What happens when the user clicks the same item again or presses Escape.
   * "deselect" = toggle off. "reset_all" = clear entire dashboard state.
   */
  reset_behavior: "deselect" | "reset_all" | "none";
  /**
   * Priority — higher number wins when two interactions try to update the
   * same target simultaneously. Defaults to 0.
   */
  priority: number;
  /**
   * Human-readable description, surfaced in builder UI and agent prompts.
   */
  description: string;
}

/* --------------------------------------------------------------------------
 * Interaction chain — a sequence of interactions triggered in order
 * -------------------------------------------------------------------------- */
export interface InteractionChain {
  id: string;
  description: string;
  /** Ordered steps — each step fires when the previous completes */
  steps: Array<{
    interaction_id: string;
    delay_ms?: number; // optional stagger
  }>;
}

/* --------------------------------------------------------------------------
 * Dashboard interaction model — attached to a DashboardSpec
 * -------------------------------------------------------------------------- */
export interface DashboardInteractionModel {
  interactions: Interaction[];
  chains: InteractionChain[];
  /**
   * Global filter dimensions — controls that affect all widgets on the page.
   * E.g. ["fund_id", "quarter", "scenario", "property_type"]
   */
  global_filters: string[];
  /**
   * Default selection — pre-selected values loaded on mount.
   * E.g. { fund_id: "a1b2c3d4-..." }
   */
  default_selection: Record<string, string>;
}

/* --------------------------------------------------------------------------
 * Inference rules
 *
 * These deterministic rules map (source widget type, target widget type,
 * context) → Interaction without requiring an LLM call.
 * -------------------------------------------------------------------------- */

interface InferenceInput {
  widgetPairs: Array<{ sourceId: string; sourceType: string; targetId: string; targetType: string }>;
  archetype: string;
  hasMaps: boolean;
  hasTable: boolean;
  hasDrillable: boolean;
}

/**
 * Level 1 rules — always apply. Simple filter propagation.
 */
const LEVEL1_RULES: Array<{
  sourceType: string;
  targetType: string;
  trigger: TriggerType;
  action: ActionType;
  role: TargetRole;
  link: string;
  description: string;
}> = [
  {
    sourceType: "bar_chart",
    targetType: "comparison_table",
    trigger: "click",
    action: "filter",
    role: "responsive",
    link: "asset_id",
    description: "Clicking a bar filters the detail table to that asset",
  },
  {
    sourceType: "bar_chart",
    targetType: "metrics_strip",
    trigger: "click",
    action: "update_kpi",
    role: "responsive",
    link: "asset_id",
    description: "Clicking a bar updates KPI cards for the selected item",
  },
  {
    sourceType: "metrics_strip",
    targetType: "trend_line",
    trigger: "kpi_click",
    action: "filter",
    role: "explanatory",
    link: "metric_key",
    description: "Clicking a KPI card highlights that metric in trend charts",
  },
  {
    sourceType: "metrics_strip",
    targetType: "statement_table",
    trigger: "kpi_click",
    action: "expand",
    role: "explanatory",
    link: "metric_key",
    description: "Clicking a KPI reveals the detail rows that compose it",
  },
  {
    sourceType: "trend_line",
    targetType: "bar_chart",
    trigger: "range_select",
    action: "filter",
    role: "responsive",
    link: "quarter",
    description: "Brushing a date range on the trend filters the bar chart to that period",
  },
  {
    sourceType: "comparison_table",
    targetType: "trend_line",
    trigger: "row_click",
    action: "filter",
    role: "responsive",
    link: "asset_id",
    description: "Clicking a table row scopes trend charts to that asset",
  },
  {
    sourceType: "comparison_table",
    targetType: "metrics_strip",
    trigger: "row_click",
    action: "update_kpi",
    role: "responsive",
    link: "asset_id",
    description: "Clicking a table row updates KPI cards to show that asset only",
  },
];

/**
 * Level 2 rules — applied when dashboard has sufficient complexity
 * (>= 4 widgets, or archetype implies rich interactivity).
 */
const LEVEL2_RULES: Array<{
  archetypes: string[];
  sourceType: string;
  targetType: string;
  trigger: TriggerType;
  action: ActionType;
  role: TargetRole;
  link: string;
  scope: InteractionScope;
  persistence: PersistenceMode;
  priority: number;
  description: string;
}> = [
  {
    archetypes: ["watchlist", "operating_review", "monthly_operating_report"],
    sourceType: "comparison_table",
    targetType: "trend_line",
    trigger: "row_click",
    action: "drilldown",
    role: "responsive",
    link: "asset_id",
    scope: "local",
    persistence: "session",
    priority: 10,
    description: "Selecting an underperformer replaces the trend chart with that asset's full trend",
  },
  {
    archetypes: ["fund_quarterly_review", "executive_summary"],
    sourceType: "metrics_strip",
    targetType: "statement_table",
    trigger: "kpi_click",
    action: "drilldown",
    role: "explanatory",
    link: "metric_group",
    scope: "local",
    persistence: "session",
    priority: 10,
    description: "Clicking a fund KPI reveals the income statement rows behind that metric",
  },
  {
    archetypes: ["market_comparison"],
    sourceType: "bar_chart",
    targetType: "comparison_table",
    trigger: "click",
    action: "cross_filter",
    role: "responsive",
    link: "market",
    scope: "global",
    persistence: "url",
    priority: 8,
    description: "Clicking a market bar cross-filters both the table and any other charts",
  },
  {
    archetypes: ["watchlist", "monthly_operating_report"],
    sourceType: "bar_chart",
    targetType: "bar_chart",
    trigger: "click",
    action: "sync_selection",
    role: "independent",
    link: "asset_id",
    scope: "section",
    persistence: "none",
    priority: 5,
    description: "Hovering over one bar highlights the same asset in adjacent bar charts",
  },
  {
    archetypes: ["fund_quarterly_review", "market_comparison", "operating_review"],
    sourceType: "comparison_table",
    targetType: "waterfall",
    trigger: "row_click",
    action: "drilldown",
    role: "explanatory",
    link: "asset_id",
    scope: "local",
    persistence: "session",
    priority: 9,
    description: "Clicking an asset in the table shows that asset's NOI bridge waterfall",
  },
];

/**
 * inferInteractions — deterministic interaction wiring from widget pairs.
 *
 * Returns a DashboardInteractionModel ready to attach to a DashboardSpec.
 */
export function inferInteractions(input: InferenceInput): DashboardInteractionModel {
  const { widgetPairs, archetype, hasMaps, hasDrillable } = input;
  const interactions: Interaction[] = [];
  let idCounter = 0;
  const makeId = () => `ix_${++idCounter}`;

  // Apply Level 1 rules
  for (const pair of widgetPairs) {
    for (const rule of LEVEL1_RULES) {
      if (pair.sourceType === rule.sourceType && pair.targetType === rule.targetType) {
        interactions.push({
          id: makeId(),
          source_id: pair.sourceId,
          target_ids: [pair.targetId],
          trigger: rule.trigger,
          action: rule.action,
          scope: "local",
          target_role: rule.role,
          link_dimension: rule.link,
          persistence: "session",
          reset_behavior: "deselect",
          priority: 0,
          description: rule.description,
        });
      }
    }
  }

  // Apply Level 2 rules — only for matching archetypes
  for (const pair of widgetPairs) {
    for (const rule of LEVEL2_RULES) {
      if (
        rule.archetypes.includes(archetype) &&
        pair.sourceType === rule.sourceType &&
        pair.targetType === rule.targetType
      ) {
        // Check for duplicate (don't double-wire same pair + link)
        const alreadyWired = interactions.some(
          (ix) =>
            ix.source_id === pair.sourceId &&
            ix.target_ids.includes(pair.targetId) &&
            ix.link_dimension === rule.link,
        );
        if (!alreadyWired) {
          interactions.push({
            id: makeId(),
            source_id: pair.sourceId,
            target_ids: [pair.targetId],
            trigger: rule.trigger,
            action: rule.action,
            scope: rule.scope,
            target_role: rule.role,
            link_dimension: rule.link,
            persistence: rule.persistence,
            reset_behavior: "deselect",
            priority: rule.priority,
            description: rule.description,
          });
        }
      }
    }
  }

  // Map interactions — if dashboard has a map, add map→table and map→kpi wiring
  if (hasMaps) {
    const tableWidget = widgetPairs.find((p) => p.targetType === "comparison_table" || p.targetType === "statement_table");
    const kpiWidget = widgetPairs.find((p) => p.targetType === "metrics_strip");
    if (tableWidget) {
      interactions.push({
        id: makeId(),
        source_id: "map_widget",
        target_ids: [tableWidget.targetId],
        trigger: "map_click",
        action: "filter",
        scope: "global",
        target_role: "responsive",
        link_dimension: "geography_id",
        persistence: "url",
        reset_behavior: "deselect",
        priority: 7,
        description: "Clicking a map region filters the detail table to that geography",
      });
    }
    if (kpiWidget) {
      interactions.push({
        id: makeId(),
        source_id: "map_widget",
        target_ids: [kpiWidget.targetId],
        trigger: "map_click",
        action: "update_kpi",
        scope: "global",
        target_role: "responsive",
        link_dimension: "geography_id",
        persistence: "url",
        reset_behavior: "reset_all",
        priority: 7,
        description: "Clicking a map region updates KPI cards to show that region only",
      });
    }
  }

  // Reset chain — when user has drilldown interactions, add a global reset
  const hasDrilldown = interactions.some((ix) => ix.action === "drilldown");
  if (hasDrilldown || hasDrillable) {
    interactions.push({
      id: makeId(),
      source_id: "dashboard_header",
      target_ids: [],
      trigger: "reset",
      action: "reset_all",
      scope: "global",
      target_role: "independent",
      link_dimension: "*",
      persistence: "none",
      reset_behavior: "reset_all",
      priority: 100,
      description: "Reset all interaction state and return every widget to its default view",
    });
  }

  // Interaction chains — e.g. click watchlist row → filter trend → update KPI
  const chains: InteractionChain[] = [];
  const rowClickIxs = interactions.filter((ix) => ix.trigger === "row_click");
  if (rowClickIxs.length >= 2) {
    chains.push({
      id: "chain_row_click_cascade",
      description: "Row click cascades: first filters charts, then updates KPI strip",
      steps: rowClickIxs.map((ix) => ({ interaction_id: ix.id })),
    });
  }

  // Global filters — dimensions that should be offered as page-level controls
  const globalFilters = deriveGlobalFilters(archetype);

  return {
    interactions,
    chains,
    global_filters: globalFilters,
    default_selection: {},
  };
}

function deriveGlobalFilters(archetype: string): string[] {
  const base = ["quarter", "scenario"];
  const archetypeFilters: Record<string, string[]> = {
    fund_quarterly_review: ["fund_id", "quarter", "scenario"],
    market_comparison: ["market", "property_type", "quarter"],
    watchlist: ["fund_id", "quarter", "threshold_pct"],
    monthly_operating_report: ["fund_id", "quarter", "scenario"],
    operating_review: ["asset_id", "quarter", "scenario"],
    executive_summary: ["fund_id", "quarter"],
    underwriting_dashboard: ["asset_id", "scenario"],
  };
  return archetypeFilters[archetype] ?? base;
}

/* --------------------------------------------------------------------------
 * Markdown parsing helpers
 *
 * Parses the ## Interactions section of a dashboard request markdown file
 * into a partial DashboardInteractionModel (IDs and target resolution
 * happen later in dashboard-intelligence.ts).
 * -------------------------------------------------------------------------- */

export interface ParsedInteractionRule {
  raw: string;
  source_hint: string;
  target_hint: string;
  trigger: TriggerType;
  action: ActionType;
  link_hint: string;
  scope: InteractionScope;
  persistence: PersistenceMode;
}

/**
 * Parse free-text interaction descriptions from markdown into structured rules.
 *
 * Recognises patterns like:
 *   "clicking X filters Y"
 *   "selecting X updates Y"
 *   "X click → drilldown Y"
 *   "map click filters table"
 */
export function parseInteractionMarkdown(text: string): ParsedInteractionRule[] {
  const lines = text
    .split("\n")
    .filter((l) => /^[-*]/.test(l.trim()))
    .map((l) => l.replace(/^[-*]\s*/, "").trim());

  return lines
    .map((line): ParsedInteractionRule | null => {
      const lower = line.toLowerCase();

      // Determine trigger
      let trigger: TriggerType = "click";
      if (lower.includes("hover")) trigger = "hover";
      else if (lower.includes("select")) trigger = "select";
      else if (lower.includes("range") || lower.includes("brush")) trigger = "range_select";
      else if (lower.includes("row click") || lower.includes("table row")) trigger = "row_click";
      else if (lower.includes("map click") || lower.includes("map select")) trigger = "map_click";
      else if (lower.includes("kpi click") || lower.includes("kpi card")) trigger = "kpi_click";
      else if (lower.includes("reset") || lower.includes("clear")) trigger = "reset";

      // Determine action
      let action: ActionType = "filter";
      if (lower.includes("drilldown") || lower.includes("drill down") || lower.includes("drill into")) action = "drilldown";
      else if (lower.includes("highlight")) action = "highlight";
      else if (lower.includes("cross-filter") || lower.includes("cross filter") || lower.includes("bidirectional")) action = "cross_filter";
      else if (lower.includes("expand") || lower.includes("reveal") || lower.includes("show detail")) action = "expand";
      else if (lower.includes("navigate") || lower.includes("open page") || lower.includes("go to")) action = "navigate";
      else if (lower.includes("sync") || lower.includes("synchroni")) action = "sync_selection";
      else if (lower.includes("update kpi") || lower.includes("updates kpi") || lower.includes("kpi update")) action = "update_kpi";
      else if (lower.includes("reset")) action = "reset_all";

      // Determine scope
      let scope: InteractionScope = "local";
      if (lower.includes("all chart") || lower.includes("entire dashboard") || lower.includes("all visual")) scope = "global";
      else if (lower.includes("section") || lower.includes("row")) scope = "section";

      // Determine persistence
      let persistence: PersistenceMode = "session";
      if (lower.includes("url") || lower.includes("shareable") || lower.includes("bookmark")) persistence = "url";
      else if (lower.includes("hover") || lower.includes("ephemeral")) persistence = "none";

      // Extract source and target hints from text
      const arrowMatch = line.match(/(.+?)\s*(?:→|->|filters?|updates?|drives?|opens?)\s*(.+)/i);
      const source_hint = arrowMatch ? arrowMatch[1].trim() : line;
      const target_hint = arrowMatch ? arrowMatch[2].trim() : "";

      // Extract link dimension hint
      let link_hint = "entity_id";
      if (lower.includes("asset")) link_hint = "asset_id";
      else if (lower.includes("fund")) link_hint = "fund_id";
      else if (lower.includes("market") || lower.includes("geography") || lower.includes("region") || lower.includes("msa")) link_hint = "market";
      else if (lower.includes("quarter") || lower.includes("period") || lower.includes("date")) link_hint = "quarter";
      else if (lower.includes("metric") || lower.includes("kpi")) link_hint = "metric_key";
      else if (lower.includes("stage") || lower.includes("pipeline") || lower.includes("status")) link_hint = "deal_status";
      else if (lower.includes("sector") || lower.includes("property type")) link_hint = "property_type";

      return { raw: line, source_hint, target_hint, trigger, action, link_hint, scope, persistence };
    })
    .filter((r): r is ParsedInteractionRule => r !== null);
}
