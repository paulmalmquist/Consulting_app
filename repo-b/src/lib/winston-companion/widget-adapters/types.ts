/**
 * Widget context adapters — concise structured metadata about visible UI widgets.
 *
 * Adapters publish compact summaries only:
 *   - metric keys visible in the widget
 *   - entity type and IDs (max 20)
 *   - active filter state (primitive values only)
 *   - time range window
 *   - selected row IDs
 *
 * NEVER dump full datasets, row arrays, or raw component state — only the
 * metadata Winston needs to understand what the user is currently looking at.
 */

export type WidgetType =
  | "kpi_strip"
  | "chart"
  | "table"
  | "timeline"
  | "map"
  | "filter";

export interface WidgetContext {
  /** Widget classification. */
  widget_type: WidgetType;
  /** Human-readable label for this widget (e.g. "Fund Performance KPIs"). */
  label: string;
  /** Canonical metric keys visible in the widget (e.g. ["gross_irr", "tvpi"]). */
  metrics?: string[];
  /** Entity type of the data shown (e.g. "fund", "asset", "project"). */
  entity_type?: string;
  /**
   * UUIDs of visible or selected entities.
   * Capped at 20 — do not pass full page datasets.
   */
  entity_ids?: string[];
  /** Active time window. ISO 8601 date strings. */
  time_range?: { from: string; to: string };
  /**
   * Active filter state. Primitive values only (string | number | boolean).
   * Do not include full filter config objects.
   */
  filter_state?: Record<string, string | number | boolean>;
  /** IDs of rows currently selected by the user (for table adapters). */
  selected_row_ids?: string[];
}

/** An adapter that reads a widget's current rendered state and returns context. */
export interface WidgetContextAdapter {
  capture(): WidgetContext | null;
}
