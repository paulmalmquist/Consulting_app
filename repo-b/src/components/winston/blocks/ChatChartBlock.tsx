"use client";

import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import {
  CHART_COLORS,
  TOOLTIP_STYLE,
  AXIS_TICK_STYLE,
  GRID_STYLE,
  fmtCompact,
  fmtPct,
} from "@/components/charts/chart-theme";

type ChartBlock = Extract<AssistantResponseBlock, { type: "chart" }>;

function tickFmt(format: string | undefined) {
  switch (format) {
    case "percent":
      return (v: number) => fmtPct(v, 0);
    case "number":
    case "ratio":
      return (v: number) => v.toLocaleString();
    default:
      return (v: number) => fmtCompact(v);
  }
}

function tooltipFmt(format: string | undefined) {
  switch (format) {
    case "percent":
      return (v: number, name: string) => [fmtPct(v), name];
    case "number":
    case "ratio":
      return (v: number, name: string) => [v.toLocaleString(), name];
    default:
      return (v: number, name: string) => [fmtCompact(v), name];
  }
}

function resolveSeriesKeys(block: ChartBlock): string[] {
  if (block.series_key && block.data.length > 0) {
    const unique = [...new Set(block.data.map((d) => String(d[block.series_key!] ?? "")))];
    return unique.filter(Boolean);
  }
  return block.y_keys;
}

function pivotDataBySeries(block: ChartBlock): Record<string, unknown>[] {
  if (!block.series_key) return block.data;
  const grouped = new Map<string, Record<string, unknown>>();
  for (const row of block.data) {
    const xVal = String(row[block.x_key] ?? "");
    const seriesVal = String(row[block.series_key!] ?? "");
    if (!grouped.has(xVal)) {
      grouped.set(xVal, { [block.x_key]: xVal });
    }
    const entry = grouped.get(xVal)!;
    for (const yk of block.y_keys) {
      entry[`${seriesVal}_${yk}`] = row[yk];
    }
  }
  return Array.from(grouped.values());
}

export default function ChatChartBlock({ block }: { block: ChartBlock }) {
  const chartType = block.chart_type || "bar";
  const hasSeries = !!block.series_key;
  const data = hasSeries ? pivotDataBySeries(block) : block.data;
  const seriesNames = hasSeries ? resolveSeriesKeys(block) : [];
  const yDomain: [string, string] = block.format === "percent" ? ["0", "auto"] : ["auto", "auto"];

  const dataKeys: { key: string; label: string }[] = hasSeries
    ? seriesNames.flatMap((s) => block.y_keys.map((yk) => ({ key: `${s}_${yk}`, label: s })))
    : block.y_keys.map((k) => ({ key: k, label: k }));

  const commonProps = {
    data,
    margin: { top: 8, right: 12, left: 4, bottom: 0 },
  };

  const axes = (
    <>
      <CartesianGrid vertical={false} {...GRID_STYLE} />
      <XAxis dataKey={block.x_key} tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
      <YAxis
        tick={AXIS_TICK_STYLE}
        axisLine={false}
        tickLine={false}
        tickFormatter={tickFmt(block.format ?? undefined)}
        width={64}
        domain={yDomain}
      />
      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFmt(block.format ?? undefined)} labelStyle={{ color: "hsl(210, 24%, 94%)", fontWeight: 600 }} />
      {dataKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: "hsl(215, 12%, 72%)" }} />}
    </>
  );

  let chart: React.ReactNode;

  if (chartType === "line") {
    chart = (
      <LineChart {...commonProps}>
        {axes}
        {dataKeys.map((dk, i) => (
          <Line
            key={dk.key}
            type="monotone"
            dataKey={dk.key}
            name={dk.label}
            stroke={CHART_COLORS.scenario[i % CHART_COLORS.scenario.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    );
  } else if (chartType === "area") {
    chart = (
      <AreaChart {...commonProps}>
        {axes}
        {dataKeys.map((dk, i) => (
          <Area
            key={dk.key}
            type="monotone"
            dataKey={dk.key}
            name={dk.label}
            stroke={CHART_COLORS.scenario[i % CHART_COLORS.scenario.length]}
            fill={CHART_COLORS.scenario[i % CHART_COLORS.scenario.length]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    );
  } else {
    // bar, grouped_bar, stacked_bar, waterfall
    const isStacked = chartType === "stacked_bar" || block.stacked;
    chart = (
      <BarChart {...commonProps}>
        {axes}
        {dataKeys.map((dk, i) => (
          <Bar
            key={dk.key}
            dataKey={dk.key}
            name={dk.label}
            fill={CHART_COLORS.scenario[i % CHART_COLORS.scenario.length]}
            radius={[3, 3, 0, 0]}
            maxBarSize={40}
            stackId={isStacked ? "stack" : undefined}
          />
        ))}
      </BarChart>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-bm-border/30 bg-bm-surface/20 p-4">
      {block.title && (
        <div className="mb-3">
          <p className="text-sm font-semibold text-bm-text">{block.title}</p>
          {block.description && <p className="text-xs text-bm-muted mt-0.5">{block.description}</p>}
        </div>
      )}
      <ResponsiveContainer width="100%" height={260}>
        {chart as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}
