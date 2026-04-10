"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getFundTimeseries, type FundTimeseriesResponse } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";
import { usePortfolioFilters } from "./PortfolioFilterContext";
import { getChartColors, getTooltipStyle, getAxisTickStyle, getGridStyle, fmtCompact, fmtPct as fmtPctChart } from "@/components/charts/chart-theme";

const METRIC_OPTIONS = [
  { key: "portfolio_nav", label: "NAV", format: "dollar" as const },
  { key: "gross_irr", label: "IRR", format: "percent" as const },
  { key: "tvpi", label: "TVPI", format: "multiple" as const },
  { key: "dpi", label: "DPI", format: "multiple" as const },
] as const;

type MetricKey = (typeof METRIC_OPTIONS)[number]["key"];
type FormatType = "dollar" | "percent" | "multiple";

function formatValue(format: FormatType, val: number): string {
  if (format === "percent") return fmtPctChart(val, 1);
  if (format === "multiple") return `${val.toFixed(2)}x`;
  return fmtCompact(val);
}

function formatQuarterShort(q: string): string {
  // "2025Q3" → "Q3 '25"
  const year = q.slice(2, 4);
  const qNum = q.slice(-2);
  return `${qNum} '${year}`;
}

// Assign distinct colors to each fund line
const LINE_COLORS = [
  "#38bdf8", // cyan
  "#34d399", // emerald
  "#f87171", // red
  "#a78bfa", // purple
  "#fbbf24", // amber
  "#f472b6", // pink
  "#60a5fa", // blue
  "#4ade80", // green
];

export function FundComparisonChart() {
  const { environmentId } = useRepeContext();
  const { filters } = usePortfolioFilters();
  const [metric, setMetric] = useState<MetricKey>("portfolio_nav");
  const [response, setResponse] = useState<FundTimeseriesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const currentFormat = METRIC_OPTIONS.find((o) => o.key === metric)?.format ?? "dollar";

  useEffect(() => {
    if (!environmentId) return;
    setLoading(true);
    getFundTimeseries(environmentId, metric)
      .then(setResponse)
      .catch(() => setResponse(null))
      .finally(() => setLoading(false));
  }, [environmentId, metric]);

  const { chartData, fundNames } = useMemo(() => {
    if (!response?.data) return { chartData: [], fundNames: [] };
    return {
      chartData: response.data.map((d) => ({
        ...d,
        quarter: formatQuarterShort(d.quarter as string),
        _rawQuarter: d.quarter,
      })),
      fundNames: response.funds ?? [],
    };
  }, [response]);

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
        <div className="h-[200px] animate-pulse rounded bg-bm-surface/20" />
      ) : chartData.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-xs text-bm-muted2">
          No fund data for this metric
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} {...getGridStyle()} />
            <XAxis
              dataKey="quarter"
              tick={getAxisTickStyle()}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={getAxisTickStyle()}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatValue(currentFormat, v)}
              width={54}
              domain={[
                (dataMin: number) => {
                  if (currentFormat === "dollar") return 0;
                  return Math.min(0, dataMin);
                },
                "auto",
              ]}
            />
            <Tooltip
              contentStyle={getTooltipStyle()}
              formatter={(value: number, name: string) => [formatValue(currentFormat, value), name]}
              labelFormatter={(_label: string, payload: Array<{ payload?: { _rawQuarter?: string } }>) =>
                payload?.[0]?.payload?._rawQuarter || _label
              }
            />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              iconType="line"
              iconSize={10}
            />
            {fundNames.map((name, i) => (
              <Line
                key={name}
                dataKey={name}
                name={name.length > 20 ? name.slice(0, 18) + "…" : name}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
