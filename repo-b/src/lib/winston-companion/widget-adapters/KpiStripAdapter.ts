/**
 * KpiStripAdapter — captures visible KPI metrics and their current values.
 *
 * Call createKpiStripAdapter() with the KPI data currently rendered in the
 * strip. Returns concise metric metadata — not raw values.
 */
import type { WidgetContext, WidgetContextAdapter } from "./types";

export interface KpiStripData {
  label?: string;
  /** Canonical metric keys visible in the strip (e.g. ["gross_irr", "tvpi"]). */
  metricKeys: string[];
  entityType?: string;
  entityIds?: string[];
  /** Current quarter or time period shown (ISO or label). */
  timePeriod?: string;
}

export function createKpiStripAdapter(data: KpiStripData): WidgetContextAdapter {
  return {
    capture(): WidgetContext | null {
      if (!data.metricKeys.length) return null;
      const ctx: WidgetContext = {
        widget_type: "kpi_strip",
        label: data.label ?? "KPI Strip",
        metrics: data.metricKeys.slice(0, 20),
      };
      if (data.entityType) ctx.entity_type = data.entityType;
      if (data.entityIds?.length) ctx.entity_ids = data.entityIds.slice(0, 20);
      if (data.timePeriod) {
        ctx.time_range = { from: data.timePeriod, to: data.timePeriod };
      }
      return ctx;
    },
  };
}
