"use client";

import React, { useEffect, useState } from "react";
import type { DashboardWidget, WidgetMetricRef, DataAvailability, WidgetQueryManifest } from "@/lib/dashboards/types";
import PipelineBarWidget from "./widgets/PipelineBarWidget";
import GeographicMapWidget from "./widgets/GeographicMapWidget";
import { METRIC_MAP } from "@/lib/dashboards/metric-catalog";
import { WaterfallChart, SparkLine } from "@/components/charts";
import { SensitivityHeatMap } from "@/components/charts/SensitivityHeatMap";
import TrendLineChart from "@/components/charts/TrendLineChart";
import type { LineDef } from "@/components/charts/TrendLineChart";
import QuarterlyBarChart from "@/components/charts/QuarterlyBarChart";
import StatementTable from "@/components/repe/statements/StatementTable";
import { generatePriorPeriods } from "@/lib/dashboards/period-utils";
import { useDashboardFilters } from "./DashboardFilterContext";

/* --------------------------------------------------------------------------
 * Multi-series color palette for entity-based lines
 * -------------------------------------------------------------------------- */
const ENTITY_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
];

/* --------------------------------------------------------------------------
 * Props
 * -------------------------------------------------------------------------- */
interface Props {
  widget: DashboardWidget;
  envId: string;
  businessId: string;
  quarter?: string;
  entityNames?: Record<string, string>;
  onConfigure?: () => void;
  isEditing?: boolean;
  queryManifest?: WidgetQueryManifest;
  dataAvailability?: DataAvailability;
}

/* --------------------------------------------------------------------------
 * Fetch a single entity + period from the statements API
 * -------------------------------------------------------------------------- */
async function fetchStatementData(
  entityType: string,
  entityId: string,
  period: string,
  statement: string,
  periodType: string,
  scenario: string,
  comparison: string,
  envId: string,
  businessId: string,
): Promise<Record<string, number>> {
  const basePath = entityType === "investment"
    ? `/api/re/v2/investments/${entityId}/statements`
    : `/api/re/v2/assets/${entityId}/statements`;

  const params = new URLSearchParams({
    statement,
    period_type: periodType,
    period,
    scenario,
    comparison,
    env_id: envId,
    business_id: businessId,
  });

  const res = await fetch(`${basePath}?${params}`);
  const json = await res.json();
  const map: Record<string, number> = {};
  for (const line of json.lines ?? []) {
    map[line.line_code] = line.amount;
  }
  return map;
}

/* --------------------------------------------------------------------------
 * Data fetching hook for metric widgets — supports multi-period + multi-entity
 * -------------------------------------------------------------------------- */
function useWidgetData(
  widget: DashboardWidget,
  envId: string,
  businessId: string,
  quarter?: string,
  entityNames?: Record<string, string>,
) {
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [seriesLines, setSeriesLines] = useState<LineDef[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const entityType = widget.config.entity_type || "asset";
    const entityIds = widget.config.entity_ids;
    const effectiveQuarter = widget.config.quarter || quarter;
    const groupBy = widget.config.group_by;
    const timeGrain = widget.config.time_grain;

    if (!entityIds?.length || !effectiveQuarter) {
      setData(null);
      setSeriesLines(null);
      return;
    }

    // Only fetch for chart widgets that need statement data
    const chartTypes = ["trend_line", "bar_chart", "waterfall", "metrics_strip", "metric_card", "sparkline_grid"];
    if (!chartTypes.includes(widget.type)) {
      return;
    }

    const statement = widget.config.statement || "IS";
    const periodType = widget.config.period_type || "quarterly";
    const scenario = widget.config.scenario || "actual";
    const comparison = widget.config.comparison || "none";
    const metrics = widget.config.metrics || [];

    // Determine periods to fetch
    const needsMultiPeriod = widget.type === "trend_line" || widget.type === "bar_chart";
    const periods = needsMultiPeriod
      ? generatePriorPeriods(effectiveQuarter, 8, timeGrain || "quarterly")
      : [effectiveQuarter];

    // Determine entities to fetch
    const needsMultiEntity = !!groupBy && entityIds.length > 1;
    const entitiesToFetch = needsMultiEntity ? entityIds.slice(0, 5) : [entityIds[0]]; // cap at 5 entities

    setLoading(true);
    const controller = new AbortController();

    (async () => {
      try {
        if (needsMultiEntity && needsMultiPeriod) {
          // Multi-entity + multi-period: N entities x M periods
          const chartData: Record<string, unknown>[] = [];
          const lines: LineDef[] = [];

          // Build line defs for each entity x metric combo
          entitiesToFetch.forEach((eid, entityIdx) => {
            const eName = entityNames?.[eid] ?? eid.slice(0, 8);
            metrics.forEach((m: WidgetMetricRef) => {
              const def = METRIC_MAP.get(m.key);
              const key = `${eName}_${m.key}`;
              lines.push({
                key,
                label: `${eName} - ${m.label || def?.label || m.key}`,
                color: ENTITY_COLORS[entityIdx % ENTITY_COLORS.length],
                dashed: entityIdx > 0 ? false : m.dashed,
              });
            });
          });

          // Fetch all entity x period combos in parallel
          const fetches = periods.map(async (period) => {
            const row: Record<string, unknown> = { quarter: period };
            const entityFetches = entitiesToFetch.map(async (eid) => {
              const values = await fetchStatementData(
                entityType, eid, period, statement, periodType, scenario, comparison, envId, businessId,
              );
              const eName = entityNames?.[eid] ?? eid.slice(0, 8);
              metrics.forEach((m: WidgetMetricRef) => {
                row[`${eName}_${m.key}`] = values[m.key] ?? 0;
              });
            });
            await Promise.all(entityFetches);
            return row;
          });

          const results = await Promise.all(fetches);
          chartData.push(...results);
          setData(chartData);
          setSeriesLines(lines);
        } else if (needsMultiPeriod) {
          // Single-entity multi-period (standard trend line)
          const periodFetches = periods.map(async (period) => {
            const values = await fetchStatementData(
              entityType, entitiesToFetch[0], period, statement, periodType, scenario, comparison, envId, businessId,
            );
            const row: Record<string, unknown> = { quarter: period };
            for (const [k, v] of Object.entries(values)) {
              row[k] = v;
            }
            return row;
          });
          const chartData = await Promise.all(periodFetches);
          setData(chartData);
          setSeriesLines(null); // use default metric-based lines
        } else {
          // Single entity, single period (original behavior)
          const values = await fetchStatementData(
            entityType, entitiesToFetch[0], periods[0], statement, periodType, scenario, comparison, envId, businessId,
          );
          setData([values]);
          setSeriesLines(null);
        }
      } catch {
        setData(null);
        setSeriesLines(null);
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [widget, envId, businessId, quarter, entityNames]);

  return { data, seriesLines, loading };
}

/* --------------------------------------------------------------------------
 * Format helpers
 * -------------------------------------------------------------------------- */
function fmtMetricValue(value: number | undefined, format?: string): string {
  if (value === undefined || value === null) return "\u2014";
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

function TrendWidget({ widget, data, seriesLines }: {
  widget: DashboardWidget;
  data: Record<string, unknown>[] | null;
  seriesLines: LineDef[] | null;
}) {
  const metrics = widget.config.metrics || [];

  // If we have pre-built series lines (multi-entity), use them directly
  if (seriesLines && data && data.length > 1) {
    return (
      <div>
        <TrendLineChart
          data={data}
          lines={seriesLines}
          height={240}
          format={(widget.config.format as "dollar" | "percent" | "number") || "dollar"}
          showLegend={widget.config.show_legend !== false}
        />
      </div>
    );
  }

  // Multi-period single-entity: data has multiple rows with metric keys
  if (data && data.length > 1) {
    const lines: LineDef[] = metrics.map((m: WidgetMetricRef) => {
      const def = METRIC_MAP.get(m.key);
      return { key: m.key, label: m.label || def?.label || m.key, color: m.color || def?.default_color, dashed: m.dashed };
    });
    return (
      <div>
        <TrendLineChart
          data={data}
          lines={lines}
          height={240}
          format={(widget.config.format as "dollar" | "percent" | "number") || "dollar"}
          showLegend={widget.config.show_legend !== false}
        />
      </div>
    );
  }

  // Fallback: single data point (legacy)
  const values = data?.[0] as Record<string, number> | undefined;
  const lines: LineDef[] = metrics.map((m: WidgetMetricRef) => {
    const def = METRIC_MAP.get(m.key);
    return { key: m.key, label: m.label || def?.label || m.key, color: m.color || def?.default_color, dashed: m.dashed };
  });
  const chartData = values
    ? [Object.fromEntries([["quarter", widget.config.quarter || "Current"], ...metrics.map((m: WidgetMetricRef) => [m.key, values[m.key] ?? 0])])]
    : [];

  return (
    <div>
      <TrendLineChart
        data={chartData}
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

function BarWidget({ widget, data }: { widget: DashboardWidget; data: Record<string, unknown>[] | null }) {
  const metrics = widget.config.metrics || [];
  const bars = metrics.map((m: WidgetMetricRef) => {
    const def = METRIC_MAP.get(m.key);
    return { key: m.key, label: m.label || def?.label || m.key, color: m.color || def?.default_color };
  });

  // Multi-period data: pass through directly
  if (data && data.length > 1) {
    return (
      <QuarterlyBarChart
        data={data}
        bars={bars}
        height={240}
        showLegend={widget.config.show_legend !== false}
      />
    );
  }

  // Single period fallback
  const values = data?.[0] as Record<string, number> | undefined;
  const chartData = values
    ? [Object.fromEntries([["quarter", widget.config.quarter || "Current"], ...metrics.map((m: WidgetMetricRef) => [m.key, values[m.key] ?? 0])])]
    : [];

  return (
    <QuarterlyBarChart
      data={chartData}
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

function ComparisonTableWidget({ widget, data }: { widget: DashboardWidget; data: Record<string, unknown>[] | null }) {
  const metrics = widget.config.metrics || [];
  const values = data?.[0] as Record<string, number> | undefined;
  const comparison = widget.config.comparison || "budget";
  // Budget/prior year data comes from the second row if available (fetched via comparison scenario)
  const comparisonValues = (data && data.length > 1 ? data[1] : null) as Record<string, number> | null;
  const { activeFilters, clearFilters } = useDashboardFilters();
  const hasFilters = Object.keys(activeFilters).length > 0;

  return (
    <div className="overflow-x-auto">
      {hasFilters && (
        <div className="flex items-center gap-2 px-3 py-1.5 mb-1 bg-indigo-500/10 rounded-md text-[10px]">
          <span className="text-indigo-400">Filtered by:</span>
          {Object.entries(activeFilters).map(([k, v]) => (
            <span key={k} className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-300">
              {k}: {Array.isArray(v) ? v.join(", ") : v}
            </span>
          ))}
          <button type="button" onClick={clearFilters} className="ml-auto text-indigo-400 hover:text-indigo-200">clear</button>
        </div>
      )}
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-bm-muted2 border-b border-bm-border/40 font-medium">Metric</th>
            <th className="px-3 py-2 text-right text-bm-muted2 border-b border-bm-border/40 font-medium">Actual</th>
            <th className="px-3 py-2 text-right text-bm-muted2 border-b border-bm-border/40 font-medium">
              {comparison === "prior_year" ? "Prior Year" : "Budget"}
            </th>
            <th className="px-3 py-2 text-right text-bm-muted2 border-b border-bm-border/40 font-medium">Variance</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m: WidgetMetricRef) => {
            const def = METRIC_MAP.get(m.key);
            const actual = values?.[m.key] ?? 0;
            // Budget comparison: use actual budget data when available, else show N/A
            const comp = comparisonValues?.[m.key] ?? null;
            const hasComparison = comp !== null && comp !== undefined;
            const variance = hasComparison ? actual - comp : 0;
            const pctVariance = hasComparison && comp !== 0 ? (variance / Math.abs(comp)) * 100 : 0;
            return (
              <tr key={m.key} className="border-b border-bm-border/20">
                <td className="px-3 py-2 text-bm-text font-medium">
                  {m.label || def?.label || m.key.replace(/_/g, " ")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMetricValue(actual, def?.format)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-bm-muted2">
                  {hasComparison ? fmtMetricValue(comp, def?.format) : <span className="text-bm-muted2/50">—</span>}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${!hasComparison ? "text-bm-muted2/50" : variance >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {hasComparison ? `${variance >= 0 ? "+" : ""}${pctVariance.toFixed(1)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {metrics.length === 0 && (
        <p className="text-sm text-bm-muted2 py-4 text-center">Configure metrics to view comparison</p>
      )}
    </div>
  );
}

function SparklineGridWidget({ widget, data }: { widget: DashboardWidget; data: Record<string, unknown>[] | null }) {
  const metrics = widget.config.metrics || [];
  const values = data?.[0] as Record<string, number> | undefined;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {metrics.map((m: WidgetMetricRef) => {
        const def = METRIC_MAP.get(m.key);
        const currentVal = values?.[m.key] ?? 0;
        // Use historical data from multi-period fetch if available, else show flat line
        const sparkValues = data && data.length > 1
          ? data.map((row) => (row as Record<string, number>)?.[m.key] ?? 0)
          : [currentVal, currentVal, currentVal, currentVal, currentVal, currentVal];
        return (
          <div key={m.key} className="rounded-xl border border-bm-border/50 bg-bm-surface/20 p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-bm-muted2 uppercase tracking-wider truncate">
                {m.label || def?.label || m.key.replace(/_/g, " ")}
              </p>
              <p className="text-sm font-semibold tabular-nums ml-2">
                {fmtMetricValue(currentVal, def?.format)}
              </p>
            </div>
            <SparkLine
              values={sparkValues}
              color={m.color || def?.default_color || "#6366f1"}
              width={120}
              height={24}
            />
          </div>
        );
      })}
      {metrics.length === 0 && (
        <p className="col-span-full text-sm text-bm-muted2 py-4 text-center">Configure metrics to view sparklines</p>
      )}
    </div>
  );
}

function SensitivityHeatWidget({ widget }: { widget: DashboardWidget }) {
  const config = widget.config;
  const metrics = config.metrics || [];
  const rowMetric = metrics[0];
  const colMetric = metrics[1];

  if (!rowMetric || !colMetric) {
    return <p className="text-sm text-bm-muted2 py-4 text-center">Configure two metrics (row and column axes) for sensitivity analysis</p>;
  }

  const rowDef = METRIC_MAP.get(rowMetric.key);
  const colDef = METRIC_MAP.get(colMetric.key);

  // Sensitivity analysis requires a model run — show placeholder until real data is fetched
  // via the valuation sensitivity endpoint (/api/re/v2/assets/{id}/valuation/sensitivity-matrix)
  const rowValues = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => 0.065 + d);
  const colValues = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => 0.95 + d);

  const cells = rowValues.flatMap((rv) =>
    colValues.map((cv) => ({
      row_value: rv,
      col_value: cv,
      // Deterministic placeholder: linear interpolation (no randomness)
      value: 0.12 + (rv - 0.065) * 2 + (cv - 0.95) * 0.5,
    })),
  );

  return (
    <div>
      <p className="text-[10px] text-bm-muted2 text-center mb-1 italic">Placeholder — run a sensitivity model for actual values</p>
      <SensitivityHeatMap
        cells={cells}
        rowValues={rowValues}
        colValues={colValues}
        rowLabel={rowMetric.label || rowDef?.label || rowMetric.key}
        colLabel={colMetric.label || colDef?.label || colMetric.key}
        valueLabel="IRR"
        baseRowValue={0.065}
        baseColValue={0.95}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Main renderer
 * -------------------------------------------------------------------------- */
export default function WidgetRenderer({ widget, envId, businessId, quarter, entityNames, onConfigure, isEditing, queryManifest, dataAvailability }: Props) {
  const { data, seriesLines, loading } = useWidgetData(widget, envId, businessId, quarter, entityNames);
  const [showInfo, setShowInfo] = useState(false);

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
        {isEditing && (
          <div className="flex items-center gap-1">
            {(queryManifest || dataAvailability) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowInfo((v) => !v); }}
                className={`rounded-md p-1 transition-colors ${showInfo ? "text-bm-accent" : "text-bm-muted2 hover:text-bm-text"} hover:bg-bm-surface/30`}
                title="Query info"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>
            )}
            {onConfigure && (
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
        )}
      </div>

      {/* Query info panel */}
      {isEditing && showInfo && (queryManifest || dataAvailability) && (
        <div className="border-t border-slate-100 dark:border-white/10 px-4 py-2 text-xs text-bm-muted2 space-y-1 bg-bm-surface/10">
          {queryManifest && queryManifest.api_route !== "none" && (
            <>
              <div className="font-mono text-[10px] text-bm-muted2 truncate">{queryManifest.api_route}</div>
              <div>{queryManifest.description}</div>
            </>
          )}
          {queryManifest && queryManifest.api_route === "none" && (
            <div className="text-bm-muted2">{queryManifest.description}</div>
          )}
          {dataAvailability && !dataAvailability.has_data && (
            <div className="text-amber-500 flex items-center gap-1">
              <span>&#9888;</span>
              <span>{dataAvailability.missing_reason}</span>
            </div>
          )}
          {dataAvailability?.has_data && (
            <div className="text-green-500">&#10003; Entities + quarter configured</div>
          )}
          {dataAvailability?.has_data && dataAvailability.missing_reason && (
            <div className="text-amber-500">{dataAvailability.missing_reason}</div>
          )}
        </div>
      )}

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
            {widget.type === "trend_line" && <TrendWidget widget={widget} data={data} seriesLines={seriesLines} />}
            {widget.type === "bar_chart" && <BarWidget widget={widget} data={data} />}
            {widget.type === "waterfall" && <WaterfallWidget widget={widget} data={data} />}
            {widget.type === "statement_table" && <StatementWidget widget={widget} envId={envId} businessId={businessId} quarter={quarter} />}
            {widget.type === "comparison_table" && <ComparisonTableWidget widget={widget} data={data} />}
            {widget.type === "text_block" && <TextBlockWidget widget={widget} />}
            {widget.type === "sparkline_grid" && <SparklineGridWidget widget={widget} data={data} />}
            {widget.type === "sensitivity_heat" && <SensitivityHeatWidget widget={widget} />}
            {widget.type === "pipeline_bar" && (
              <PipelineBarWidget envId={envId} businessId={businessId} config={widget.config} />
            )}
            {widget.type === "geographic_map" && (
              <GeographicMapWidget envId={envId} config={widget.config} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
