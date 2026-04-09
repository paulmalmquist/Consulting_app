"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { getFundComparison, type FundComparisonItem } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";
import { usePortfolioFilters } from "./PortfolioFilterContext";
import { getChartColors, fmtCompact, fmtPct as fmtPctChart } from "@/components/charts/chart-theme";

const METRIC_OPTIONS = [
  { key: "gross_irr", label: "IRR" },
  { key: "tvpi", label: "TVPI" },
  { key: "portfolio_nav", label: "NAV" },
  { key: "dpi", label: "DPI" },
] as const;

type MetricKey = (typeof METRIC_OPTIONS)[number]["key"];

function formatValue(metric: MetricKey, val: number): string {
  if (metric === "gross_irr") return `${(val * 100).toFixed(1)}%`;
  if (metric === "tvpi" || metric === "dpi") return `${val.toFixed(2)}x`;
  return fmtCompact(val);
}

export function FundComparisonChart() {
  const { environmentId } = useRepeContext();
  const { filters, setChartSelection, ui } = usePortfolioFilters();
  const [metric, setMetric] = useState<MetricKey>("gross_irr");
  const [data, setData] = useState<FundComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!environmentId) return;
    setLoading(true);
    getFundComparison(environmentId, filters.quarter, metric, filters.activeModelId || undefined)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [environmentId, filters.quarter, metric, filters.activeModelId]);

  const chartData = useMemo(() => {
    return data.map((d) => ({
      name: d.fund_name.length > 16 ? d.fund_name.slice(0, 14) + "…" : d.fund_name,
      fullName: d.fund_name,
      value: d.value ? parseFloat(d.value) : 0,
      fund_id: d.fund_id,
    }));
  }, [data]);

  const colors = getChartColors();
  const selectedFundId = ui.chartSelection?.dimension === "fund" ? ui.chartSelection.value : null;

  return (
    <div className="rounded-md border border-bm-border/20 bg-bm-surface/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-bm-muted2 font-medium">
          Fund Comparison
        </span>
        <div className="flex gap-0.5 rounded-md border border-bm-border/20 p-0.5">
          {METRIC_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMetric(opt.key)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                metric === opt.key
                  ? "bg-bm-accent/20 text-bm-accent"
                  : "text-bm-muted2 hover:text-bm-text"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-[180px] animate-pulse rounded bg-bm-surface/20" />
      ) : chartData.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-bm-muted2">
          No fund data for this metric
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bm-chart-grid, #1e293b)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "var(--bm-muted, #64748b)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--bm-muted, #64748b)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatValue(metric, v)}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--bm-surface, #0f172a)",
                border: "1px solid var(--bm-border, #1e293b)",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={(value: number) => [formatValue(metric, value), METRIC_OPTIONS.find((o) => o.key === metric)?.label]}
              labelFormatter={(label: string, payload: Array<{ payload?: { fullName?: string } }>) =>
                payload?.[0]?.payload?.fullName || label
              }
            />
            <Bar
              dataKey="value"
              radius={[2, 2, 0, 0]}
              cursor="pointer"
              onClick={(entry: { fund_id?: string }) => {
                if (entry.fund_id) {
                  if (selectedFundId === entry.fund_id) {
                    setChartSelection(null);
                  } else {
                    setChartSelection({ dimension: "fund", value: entry.fund_id });
                  }
                }
              }}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.fund_id}
                  fill={
                    selectedFundId === entry.fund_id
                      ? colors.primary
                      : selectedFundId
                      ? `${colors.primary}40`
                      : colors.primary
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
