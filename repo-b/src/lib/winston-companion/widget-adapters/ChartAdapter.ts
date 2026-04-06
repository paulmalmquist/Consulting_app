/**
 * ChartAdapter — captures chart type, axes, and time range.
 *
 * Publishes what the chart shows, not the data values themselves.
 */
import type { WidgetContext, WidgetContextAdapter } from "./types";

export interface ChartData {
  label?: string;
  chartType: "line" | "bar" | "scatter" | "area" | "heatmap" | "waterfall" | string;
  /** Canonical metric key on the Y axis (e.g. "noi", "occupancy"). */
  yMetric?: string;
  /** Canonical metric key on the X axis if applicable. */
  xMetric?: string;
  entityType?: string;
  entityIds?: string[];
  timeRange?: { from: string; to: string };
}

export function createChartAdapter(data: ChartData): WidgetContextAdapter {
  return {
    capture(): WidgetContext | null {
      const metrics: string[] = [];
      if (data.yMetric) metrics.push(data.yMetric);
      if (data.xMetric && data.xMetric !== data.yMetric) metrics.push(data.xMetric);

      const ctx: WidgetContext = {
        widget_type: "chart",
        label: data.label ?? `${data.chartType} chart`,
        metrics: metrics.length ? metrics : undefined,
      };
      if (data.entityType) ctx.entity_type = data.entityType;
      if (data.entityIds?.length) ctx.entity_ids = data.entityIds.slice(0, 20);
      if (data.timeRange) ctx.time_range = data.timeRange;
      return ctx;
    },
  };
}
