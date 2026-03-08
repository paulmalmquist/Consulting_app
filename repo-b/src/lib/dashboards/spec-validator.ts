/**
 * Dashboard Spec Validator — ensures AI-generated specs only use
 * approved metrics, valid widget types, and sane layout positions.
 */

import type { DashboardSpec, DashboardWidget, WidgetType } from "./types";
import { METRIC_MAP } from "./metric-catalog";

const VALID_WIDGET_TYPES: Set<WidgetType> = new Set([
  "metric_card", "metrics_strip", "trend_line", "bar_chart",
  "waterfall", "statement_table", "comparison_table",
  "sparkline_grid", "sensitivity_heat", "text_block",
]);

const MAX_GRID_COLS = 12;
const MAX_WIDGETS = 20;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitized: DashboardSpec | null;
}

export function validateDashboardSpec(spec: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!spec || typeof spec !== "object") {
    return { valid: false, errors: ["Spec must be an object"], warnings: [], sanitized: null };
  }

  const s = spec as Record<string, unknown>;
  if (!Array.isArray(s.widgets)) {
    return { valid: false, errors: ["Spec must have a widgets array"], warnings: [], sanitized: null };
  }

  if (s.widgets.length > MAX_WIDGETS) {
    errors.push(`Too many widgets (${s.widgets.length}). Maximum is ${MAX_WIDGETS}.`);
  }

  const sanitizedWidgets: DashboardWidget[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < Math.min(s.widgets.length, MAX_WIDGETS); i++) {
    const w = s.widgets[i] as Record<string, unknown>;

    // ID
    let id = (w.id as string) || `widget_${i}`;
    if (usedIds.has(id)) {
      id = `${id}_${i}`;
      warnings.push(`Duplicate widget ID, renamed to ${id}`);
    }
    usedIds.add(id);

    // Type
    const type = w.type as WidgetType;
    if (!VALID_WIDGET_TYPES.has(type)) {
      errors.push(`Widget ${id}: invalid type "${type}"`);
      continue;
    }

    // Config
    const config = (w.config as Record<string, unknown>) || {};
    const metrics = Array.isArray(config.metrics) ? config.metrics : [];

    // Validate metric keys
    const invalidMetrics: string[] = [];
    for (const m of metrics) {
      const key = typeof m === "string" ? m : (m as Record<string, unknown>)?.key;
      if (key && !METRIC_MAP.has(key as string)) {
        invalidMetrics.push(key as string);
      }
    }
    if (invalidMetrics.length > 0) {
      warnings.push(`Widget ${id}: unapproved metrics [${invalidMetrics.join(", ")}] will be skipped`);
    }

    // Layout
    const layout = (w.layout as Record<string, number>) || {};
    const x = Math.max(0, Math.min(layout.x ?? 0, MAX_GRID_COLS - 1));
    const y = Math.max(0, layout.y ?? 0);
    const widgetW = Math.max(1, Math.min(layout.w ?? 6, MAX_GRID_COLS));
    const h = Math.max(1, Math.min(layout.h ?? 3, 12));

    if (x + widgetW > MAX_GRID_COLS) {
      warnings.push(`Widget ${id}: layout overflows grid, clamping width`);
    }

    sanitizedWidgets.push({
      id,
      type,
      config: {
        title: (config.title as string) || undefined,
        subtitle: (config.subtitle as string) || undefined,
        metrics: metrics
          .map((m: unknown) => {
            if (typeof m === "string") return { key: m };
            return m as { key: string; label?: string; color?: string; dashed?: boolean };
          })
          .filter((m: { key: string }) => METRIC_MAP.has(m.key)),
        entity_type: config.entity_type as "asset" | "investment" | "fund" | "portfolio" | undefined,
        entity_ids: Array.isArray(config.entity_ids) ? config.entity_ids as string[] : undefined,
        statement: config.statement as "IS" | "CF" | "BS" | "KPI" | undefined,
        period_type: config.period_type as "monthly" | "quarterly" | "annual" | "ytd" | "ttm" | undefined,
        scenario: (config.scenario as string as "actual" | "budget" | "proforma") || "actual",
        comparison: config.comparison as "none" | "budget" | "prior_year" | undefined,
        quarter: config.quarter as string | undefined,
        format: config.format as "dollar" | "percent" | "number" | "ratio" | undefined,
        filters: Array.isArray(config.filters) ? config.filters as DashboardWidget["config"]["filters"] : undefined,
        show_legend: config.show_legend as boolean | undefined,
        stacked: config.stacked as boolean | undefined,
        reference_lines: Array.isArray(config.reference_lines) ? config.reference_lines as DashboardWidget["config"]["reference_lines"] : undefined,
      },
      layout: { x, y, w: Math.min(widgetW, MAX_GRID_COLS - x), h },
    });
  }

  if (sanitizedWidgets.length === 0 && errors.length === 0) {
    errors.push("Dashboard has no valid widgets");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitized: errors.length === 0 ? { widgets: sanitizedWidgets } : null,
  };
}
