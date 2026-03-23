"use client";

import React from "react";
import { WaterfallChart } from "@/components/charts";
import TrendLineChart from "@/components/charts/TrendLineChart";
import QuarterlyBarChart from "@/components/charts/QuarterlyBarChart";

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */
interface QueryResult {
  route: string;
  intent: string;
  entity_type: string;
  visualization: string;
  columns: string[];
  data: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  sql?: string;
  computation?: Record<string, unknown>;
  duration_ms: number;
  error?: string;
}

interface Props {
  result: QueryResult;
  showSql?: boolean;
}

/* --------------------------------------------------------------------------
 * Format helpers
 * -------------------------------------------------------------------------- */
function fmtValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "number") {
    if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    if (val > 0 && val < 1) return `${(val * 100).toFixed(1)}%`;
    return val.toLocaleString();
  }
  return String(val);
}

/* --------------------------------------------------------------------------
 * Sub-renderers
 * -------------------------------------------------------------------------- */

function KpiCard({ result }: { result: QueryResult }) {
  const row = result.data[0];
  if (!row) return <EmptyState />;
  const key = result.columns[0];
  const value = row[key];

  return (
    <div className="flex items-center justify-center py-8">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.15em] text-bm-muted2 mb-1">{key.replace(/_/g, " ")}</p>
        <p className="text-4xl font-semibold tabular-nums">{fmtValue(value)}</p>
        {result.intent && (
          <p className="mt-2 text-xs text-bm-muted2">{result.intent}</p>
        )}
      </div>
    </div>
  );
}

function KpiGroup({ result }: { result: QueryResult }) {
  const row = result.data[0];
  if (!row) return <EmptyState />;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 py-4">
      {result.columns.map((col) => (
        <div key={col} className="rounded-xl border border-bm-border/50 bg-bm-surface/20 p-4 text-center">
          <p className="text-xs text-bm-muted2 uppercase tracking-wider mb-1">{col.replace(/_/g, " ")}</p>
          <p className="text-xl font-semibold tabular-nums">{fmtValue(row[col])}</p>
        </div>
      ))}
    </div>
  );
}

function BarChartResult({ result }: { result: QueryResult }) {
  if (result.data.length === 0) return <EmptyState />;

  const labelCol = result.columns[0];
  const valueCols = result.columns.slice(1);
  const bars = valueCols.map((col, i) => ({
    key: col,
    label: col.replace(/_/g, " "),
    color: ["#6366f1", "#10b981", "#f59e0b", "#ef4444"][i % 4],
  }));

  const chartData = result.data.map((row) => ({
    period: String(row[labelCol] ?? ""),
    ...Object.fromEntries(valueCols.map((c) => [c, Number(row[c]) || 0])),
  }));

  return <QuarterlyBarChart data={chartData} bars={bars} height={300} showLegend />;
}

function TrendResult({ result }: { result: QueryResult }) {
  if (result.data.length === 0) return <EmptyState />;

  const timeCol = result.columns[0];
  const valueCols = result.columns.slice(1);
  const lines = valueCols.map((col, i) => ({
    key: col,
    label: col.replace(/_/g, " "),
    color: ["#6366f1", "#10b981", "#f59e0b"][i % 3],
  }));

  const chartData = result.data.map((row) => ({
    period: String(row[timeCol] ?? ""),
    ...Object.fromEntries(valueCols.map((c) => [c, Number(row[c]) || 0])),
  }));

  return <TrendLineChart data={chartData} lines={lines} height={300} format="dollar" showLegend />;
}

function WaterfallResult({ result }: { result: QueryResult }) {
  if (result.data.length === 0) return <EmptyState />;

  const items = result.data.map((row) => ({
    name: String(row[result.columns[0]] ?? ""),
    value: Number(row[result.columns[1]]) || 0,
    isTotal: false,
  }));
  // Mark last item as total
  if (items.length > 0) items[items.length - 1].isTotal = true;

  return <WaterfallChart items={items} height={300} />;
}

function TableResult({ result }: { result: QueryResult }) {
  if (result.data.length === 0) return <EmptyState />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bm-border/30">
            {result.columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-bm-muted2">
                {col.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.data.map((row, i) => (
            <tr key={i} className="border-b border-bm-border/10 hover:bg-bm-surface/20">
              {result.columns.map((col) => (
                <td key={col} className="px-3 py-2 tabular-nums">{fmtValue(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.truncated && (
        <p className="text-center text-xs text-bm-muted2 py-2">
          Showing {result.data.length} of {result.row_count} rows
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center py-8">
      <p className="text-sm text-bm-muted2">No data returned</p>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20">
      <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Main renderer
 * -------------------------------------------------------------------------- */
export default function QueryResultRenderer({ result, showSql }: Props) {
  if (result.error) {
    return (
      <div className="space-y-4">
        <ErrorState error={result.error} />
        {showSql && result.sql && <SqlBlock sql={result.sql} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-bm-muted2">
            {result.intent}
            {result.duration_ms > 0 && <span className="ml-2">({result.duration_ms}ms)</span>}
          </p>
        </div>
        <span className="rounded-full bg-bm-surface/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-bm-muted2">
          {result.route} → {result.visualization}
        </span>
      </div>

      {/* Visualization */}
      {result.visualization === "kpi" && <KpiCard result={result} />}
      {result.visualization === "kpi_group" && <KpiGroup result={result} />}
      {result.visualization === "bar_chart" && <BarChartResult result={result} />}
      {result.visualization === "comparison_bar" && <BarChartResult result={result} />}
      {result.visualization === "trend_line" && <TrendResult result={result} />}
      {result.visualization === "waterfall_chart" && <WaterfallResult result={result} />}
      {result.visualization === "histogram" && <BarChartResult result={result} />}
      {result.visualization === "table" && <TableResult result={result} />}
      {result.visualization === "dashboard_spec" && <TableResult result={result} />}

      {/* SQL debug */}
      {showSql && result.sql && <SqlBlock sql={result.sql} />}
    </div>
  );
}

function SqlBlock({ sql }: { sql: string }) {
  return (
    <details className="group">
      <summary className="cursor-pointer text-xs text-bm-muted2 hover:text-bm-text">
        Show generated SQL
      </summary>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-300">
        {sql}
      </pre>
    </details>
  );
}
