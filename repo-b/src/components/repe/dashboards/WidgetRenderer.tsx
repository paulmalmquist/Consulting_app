"use client";

import { useEffect, useState } from "react";
import type { DashboardWidget, WidgetMetricRef } from "@/lib/dashboards/types";
import { METRIC_MAP } from "@/lib/dashboards/metric-catalog";
import { WaterfallChart } from "@/components/charts";
import TrendLineChart from "@/components/charts/TrendLineChart";
import QuarterlyBarChart from "@/components/charts/QuarterlyBarChart";
import StatementTable from "@/components/repe/statements/StatementTable";

/* --------------------------------------------------------------------------
 * Props
 * -------------------------------------------------------------------------- */
interface Props {
  widget: DashboardWidget;
  envId: string;
  businessId: string;
  quarter?: string;
  onConfigure?: () => void;
  isEditing?: boolean;
}

/* --------------------------------------------------------------------------
 * Data fetching hook for metric widgets
 * -------------------------------------------------------------------------- */
function useWidgetData(
  widget: DashboardWidget,
  envId: string,
  businessId: string,
  quarter?: string,
) {
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const entityType = widget.config.entity_type || "asset";
    const entityIds = widget.config.entity_ids;
    const effectiveQuarter = widget.config.quarter || quarter;

    if (!entityIds?.length || !effectiveQuarter) {
      setData(null);
      return;
    }

    // Only fetch for chart widgets that need time-series data
    if (!["trend_line", "bar_chart", "waterfall", "metrics_strip", "metric_card", "sparkline_grid"].includes(widget.type)) {
      return;
    }

    setLoading(true);

    const entityId = entityIds[0];
    const basePath = entityType === "investment"
      ? `/api/re/v2/investments/${entityId}/statements`
      : `/api/re/v2/assets/${entityId}/statements`;

    const statement = widget.config.statement || "IS";
    const params = new URLSearchParams({
      statement,
      period_type: widget.config.period_type || "quarterly",
      period: effectiveQuarter,
      scenario: widget.config.scenario || "actual",
      comparison: widget.config.comparison || "none",
      env_id: envId,
      business_id: businessId,
    });

    fetch(`${basePath}?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.lines) {
          const map: Record<string, number> = {};
          for (const line of json.lines) {
            map[line.line_code] = line.amount;
          }
          setData([map]);
        }
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [widget, envId, businessId, quarter]);

  return { data, loading };
}

/* --------------------------------------------------------------------------
 * Format helpers
 * -------------------------------------------------------------------------- */
function fmtMetricValue(value: number | undefined, format?: string): string {
  if (value === undefined || value === null) return "—";
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  if (format === "ratio") return `${value.toFixed(2)}x`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

/* --------------------------------------------------------------------------
 * Sub-renderers
 * -------------------------------------------------------------------------- */

function MetricsStripWidget({ widget, data }: { widget: DashboardWidget; data: Record<string, unknown>[] | null }) {
  const metrics = widget.config.metrics || [];
  const values = data?.[0] as Record<string, number> | undefined;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {metrics.map((m: WidgetMetricRef) => {
        const def = METRIC_MAP.get(m.key);
        return (
          <div key={m.key} className="rounded-xl border border-bm-border/50 bg-bm-surface/20 p-4 text-center">
            <p className="text-xs text-bm-muted2 uppercase tracking-wider mb-1">
              {m.label || def?.label || m.key.replace(/_/g, " ")}
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {fmtMetricValue(values?.[m.key], def?.format)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function TrendWidget({ widget }: { widget: DashboardWidget }) {
  const metrics = widget.config.metrics || [];
  // Placeholder data for rendering — real data comes from periods API
  const lines = metrics.map((m: WidgetMetricRef) => {
    const def = METRIC_MAP.get(m.key);
    return { key: m.key, label: m.label || def?.label || m.key, color: m.color || def?.default_color, dashed: m.dashed };
  });

  return (
    <div>
      <TrendLineChart
        data={[]}
        lines={lines}
        height={240}
        format={(widget.config.format as "dollar" | "percent" | "number") || "dollar"}
        showLegend={widget.config.show_legend !== false}
      />
      {lines.length === 0 && (
        <p className="text-center text-sm text-bm-muted2 py-8">Configure metrics to display trend</p>
      )}
    </div>
  );
}

function BarWidget({ widget }: { widget: DashboardWidget }) {
  const metrics = widget.config.metrics || [];
  const bars = metrics.map((m: WidgetMetricRef) => {
    const def = METRIC_MAP.get(m.key);
    return { key: m.key, label: m.label || def?.label || m.key, color: m.color || def?.default_color };
  });

  return (
    <QuarterlyBarChart
      data={[]}
      bars={bars}
      height={240}
      showLegend={widget.config.show_legend !== false}
    />
  );
}

function WaterfallWidget({ widget, data }: { widget: DashboardWidget; data: Record<string, unknown>[] | null }) {
  const values = data?.[0] as Record<string, number> | undefined;
  const items = (widget.config.metrics || []).map((m: WidgetMetricRef) => {
    const def = METRIC_MAP.get(m.key);
    return {
      name: m.label || def?.label || m.key,
      value: values?.[m.key] ?? 0,
      isTotal: m.key === "NOI" || m.key === "NET_CASH_FLOW",
    };
  });

  return <WaterfallChart items={items} height={240} />;
}

function StatementWidget({ widget, envId, businessId, quarter }: {
  widget: DashboardWidget; envId: string; businessId: string; quarter?: string;
}) {
  const entityIds = widget.config.entity_ids;
  if (!entityIds?.length) {
    return <p className="text-sm text-bm-muted2 py-4">Select an entity to view statement</p>;
  }

  return (
    <StatementTable
      entityType={(widget.config.entity_type as "asset" | "investment") || "asset"}
      entityId={entityIds[0]}
      envId={envId}
      businessId={businessId}
      initialQuarter={widget.config.quarter || quarter || "2026Q1"}
    />
  );
}

function TextBlockWidget({ widget }: { widget: DashboardWidget }) {
  return (
    <div className="p-4">
      <p className="text-sm text-bm-muted2">
        {widget.config.subtitle || "Add analysis notes, commentary, or context for this dashboard."}
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Main renderer
 * -------------------------------------------------------------------------- */
export default function WidgetRenderer({ widget, envId, businessId, quarter, onConfigure, isEditing }: Props) {
  const { data, loading } = useWidgetData(widget, envId, businessId, quarter);

  return (
    <div
      className={`rounded-xl border bg-white dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))] shadow-sm overflow-hidden h-full flex flex-col ${
        isEditing
          ? "border-bm-accent/50 cursor-move"
          : "border-slate-200 dark:border-white/10"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div>
          {widget.config.title && (
            <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-medium">
              {widget.config.title}
            </h3>
          )}
          {widget.config.subtitle && (
            <p className="text-[10px] text-bm-muted2 mt-0.5">{widget.config.subtitle}</p>
          )}
        </div>
        {isEditing && onConfigure && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onConfigure(); }}
            className="rounded-md p-1 text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text transition-colors"
            title="Configure widget"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pb-4 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-bm-muted2">Loading...</p>
          </div>
        ) : (
          <>
            {widget.type === "metrics_strip" && <MetricsStripWidget widget={widget} data={data} />}
            {widget.type === "metric_card" && <MetricsStripWidget widget={widget} data={data} />}
            {widget.type === "trend_line" && <TrendWidget widget={widget} />}
            {widget.type === "bar_chart" && <BarWidget widget={widget} />}
            {widget.type === "waterfall" && <WaterfallWidget widget={widget} data={data} />}
            {widget.type === "statement_table" && <StatementWidget widget={widget} envId={envId} businessId={businessId} quarter={quarter} />}
            {widget.type === "comparison_table" && (
              <p className="text-sm text-bm-muted2 py-4 text-center">UW vs Actual comparison table</p>
            )}
            {widget.type === "text_block" && <TextBlockWidget widget={widget} />}
            {widget.type === "sparkline_grid" && (
              <p className="text-sm text-bm-muted2 py-4 text-center">Sparkline grid</p>
            )}
            {widget.type === "sensitivity_heat" && (
              <p className="text-sm text-bm-muted2 py-4 text-center">Sensitivity heatmap</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
