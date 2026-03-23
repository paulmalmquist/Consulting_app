/**
 * Query Manifest Builder
 *
 * For each widget in a dashboard spec, generates a human-readable description
 * of the API call that will fetch its data. Used for the per-widget info panel
 * visible in edit mode.
 */

import type { WidgetQueryManifest } from "./types";
import { METRIC_MAP } from "./metric-catalog";

interface WidgetSpec {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export function buildQueryManifest(
  widgets: WidgetSpec[],
  entityType: string,
  entityIds: string[],
  quarter: string | undefined,
): WidgetQueryManifest[] {
  const entityPath = entityType === "fund" ? "funds"
    : entityType === "investment" ? "investments"
    : "assets";

  const idPlaceholder = entityIds?.[0] || "{id}";
  const q = quarter || "{quarter}";

  return widgets.map((w): WidgetQueryManifest => {
    const metrics = (w.config.metrics as Array<{ key: string }> | undefined) || [];
    const metricLabels = metrics
      .map((m) => METRIC_MAP.get(m.key)?.label || m.key)
      .join(", ");

    switch (w.type) {
      case "metrics_strip":
      case "metric_card":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/statements`,
          params: {
            statement: "IS",
            period_type: "quarterly",
            period: q,
            scenario: "actual",
          },
          description: `KPI values: ${metricLabels || "default metrics"} for ${q}`,
        };

      case "trend_line":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/statements`,
          params: {
            statement: "IS",
            period_type: (w.config.period_type as string) || "quarterly",
            period: q,
            scenario: "actual",
          },
          description: `${metricLabels || "metric"} trend over time (quarterly statements)`,
        };

      case "bar_chart":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/statements`,
          params: {
            statement: "IS",
            period_type: "quarterly",
            period: q,
            scenario: "actual",
            comparison: (w.config.comparison as string) || "none",
          },
          description: `Bar chart: ${metricLabels || "financial metrics"} for ${q}${w.config.comparison === "budget" ? " vs budget" : ""}`,
        };

      case "waterfall":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/statements`,
          params: { statement: "IS", period_type: "quarterly", period: q },
          description: `NOI bridge: EGI → Operating Expenses → NOI for ${q}`,
        };

      case "statement_table": {
        const stmt = (w.config.statement as string) || "IS";
        const stmtLabel = stmt === "IS" ? "Income Statement"
          : stmt === "CF" ? "Cash Flow Statement"
          : stmt === "BS" ? "Balance Sheet"
          : "Financial Statement";
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/statements`,
          params: {
            statement: stmt,
            period_type: (w.config.period_type as string) || "quarterly",
            period: q,
            scenario: "actual",
            comparison: (w.config.comparison as string) || "none",
          },
          description: `Full ${stmtLabel} for ${q}`,
        };
      }

      case "comparison_table":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/variance/noi`,
          params: { quarter: q, entity_type: entityType },
          description: `Budget vs actual variance across entities for ${q}`,
        };

      case "text_block":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: "none",
          params: {},
          description: "Static text block — no data fetch required",
        };

      default:
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/statements`,
          params: { statement: "IS", period_type: "quarterly", period: q },
          description: `${w.type} widget — statement data for ${q}`,
        };
    }
  });
}

export function deriveDataAvailability(
  widgets: WidgetSpec[],
  entityIds: string[] | undefined,
  quarter: string | undefined,
): import("./types").DataAvailability[] {
  const noEntities = !entityIds?.length;
  const noQuarter = !quarter;

  return widgets.map((w) => {
    if (noEntities) {
      return {
        widget_id: w.id,
        has_data: false,
        has_budget: false,
        missing_reason: "No entities selected — check asset mapping or entity scope",
      };
    }
    if (noQuarter) {
      return {
        widget_id: w.id,
        has_data: false,
        has_budget: false,
        missing_reason: "No quarter specified",
      };
    }

    const needsBudget = (w.config.comparison as string) === "budget"
      || (w.config.title as string | undefined)?.toLowerCase().includes("budget")
      || (w.config.title as string | undefined)?.toLowerCase().includes("variance");

    return {
      widget_id: w.id,
      has_data: true,
      has_budget: !needsBudget, // optimistic unless budget is specifically needed
      missing_reason: needsBudget
        ? "Budget comparison — upload a budget version if variance shows dashes"
        : undefined,
    };
  });
}
