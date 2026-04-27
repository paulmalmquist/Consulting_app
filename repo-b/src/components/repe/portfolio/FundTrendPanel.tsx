"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getEnvironmentFundTrend,
  type FundTrendResponse,
  type FundTrendSeries,
} from "@/lib/bos-api";
import TrendLineChart from "@/components/charts/TrendLineChart";

type Metric = "ending_nav" | "dpi" | "tvpi" | "gross_irr";

const METRIC_LABEL: Record<Metric, string> = {
  ending_nav: "NAV",
  dpi: "DPI",
  tvpi: "TVPI",
  gross_irr: "Gross IRR",
};

// Minimum non-null points required per fund before drawing a line.
// Below this threshold the series renders as "insufficient data" instead
// of a misleading 2-point trend.
const MIN_POINTS_FOR_LINE = 4;

const PALETTE = [
  "#1e40af",
  "#b45309",
  "#047857",
  "#7c3aed",
  "#be123c",
  "#0891b2",
];

function pickColor(fundIdx: number): string {
  return PALETTE[fundIdx % PALETTE.length];
}

function realPointCount(series: FundTrendSeries): number {
  return series.points.reduce((n, p) => (p.value === null || p.value === undefined ? n : n + 1), 0);
}

interface Props {
  envId: string;
  quarters?: number;
}

export default function FundTrendPanel({ envId, quarters = 12 }: Props) {
  const [metric, setMetric] = useState<Metric>("ending_nav");
  const [data, setData] = useState<FundTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getEnvironmentFundTrend(envId, { metric, quarters })
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e?.message ?? String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [envId, metric, quarters]);

  const {
    chartData,
    lines,
    sufficientFunds,
    insufficientFunds,
    realQuartersAvailable,
  } = useMemo(() => {
    if (!data) {
      return {
        chartData: [] as Record<string, unknown>[],
        lines: [] as { key: string; label: string; color: string }[],
        sufficientFunds: [] as FundTrendSeries[],
        insufficientFunds: [] as Array<FundTrendSeries & { realCount: number }>,
        realQuartersAvailable: 0,
      };
    }

    const sufficient: FundTrendSeries[] = [];
    const insufficient: Array<FundTrendSeries & { realCount: number }> = [];
    for (const f of data.funds) {
      const realCount = realPointCount(f);
      if (realCount >= MIN_POINTS_FOR_LINE) {
        sufficient.push(f);
      } else {
        insufficient.push({ ...f, realCount });
      }
    }

    const quartersWithAnyValue = new Set<string>();
    for (const f of data.funds) {
      for (const p of f.points) {
        if (p.value !== null && p.value !== undefined) quartersWithAnyValue.add(p.quarter);
      }
    }

    if (sufficient.length === 0) {
      return {
        chartData: [],
        lines: [],
        sufficientFunds: sufficient,
        insufficientFunds: insufficient,
        realQuartersAvailable: quartersWithAnyValue.size,
      };
    }

    const quartersSeen = new Set<string>();
    for (const f of sufficient) for (const p of f.points) quartersSeen.add(p.quarter);
    const sortedQs = Array.from(quartersSeen).sort();
    const rows: Record<string, unknown>[] = sortedQs.map((q) => ({ quarter: q }));
    const lineDefs = sufficient.map((f, idx) => ({
      key: f.fund_id,
      label: f.name,
      color: pickColor(idx),
    }));
    for (const f of sufficient) {
      const byQ = new Map(f.points.map((p) => [p.quarter, p.value]));
      for (const row of rows) {
        const q = row.quarter as string;
        const v = byQ.get(q);
        row[f.fund_id] = v ?? null;
      }
    }

    return {
      chartData: rows,
      lines: lineDefs,
      sufficientFunds: sufficient,
      insufficientFunds: insufficient,
      realQuartersAvailable: quartersWithAnyValue.size,
    };
  }, [data]);

  const totalFunds = data?.funds.length ?? 0;
  const subtitle = data
    ? `${METRIC_LABEL[metric]} · ${realQuartersAvailable} quarter${realQuartersAvailable === 1 ? "" : "s"} of released history${
        totalFunds > 0 ? ` · ${sufficientFunds.length}/${totalFunds} funds plotted` : ""
      }`
    : `${METRIC_LABEL[metric]} · loading`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]" data-testid="fund-trend-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Fund Trends</div>
          <div className="text-sm text-bm-text" data-testid="fund-trend-subtitle">{subtitle}</div>
        </div>
        <div className="flex items-center gap-1 text-xs">
          {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`rounded-full border px-2 py-0.5 ${
                metric === m
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-transparent text-bm-muted2 hover:text-bm-text"
              }`}
              onClick={() => setMetric(m)}
              data-testid={`metric-toggle-${m}`}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-56 flex items-center justify-center text-sm text-bm-muted2">
          Loading fund trends…
        </div>
      )}
      {err && (
        <div className="h-56 flex items-center justify-center text-sm text-rose-600">
          {err}
        </div>
      )}

      {!loading && !err && data && totalFunds === 0 && (
        <div
          className="h-56 flex items-center justify-center text-sm text-bm-muted2"
          data-testid="fund-trend-empty"
        >
          No fund-quarter data available for this environment yet.
        </div>
      )}

      {!loading && !err && data && totalFunds > 0 && sufficientFunds.length === 0 && (
        <div
          className="h-56 flex flex-col items-center justify-center gap-2 text-sm text-bm-muted2"
          data-testid="fund-trend-insufficient"
        >
          <div className="font-medium text-bm-text">
            Insufficient historical data — {realQuartersAvailable} quarter
            {realQuartersAvailable === 1 ? "" : "s"} of released snapshots available.
          </div>
          <div className="text-[12px]">
            A trend requires at least {MIN_POINTS_FOR_LINE} released quarters per fund. Run the
            authoritative snapshot builder across earlier periods to populate history.
          </div>
        </div>
      )}

      {!loading && !err && data && sufficientFunds.length > 0 && (
        <TrendLineChart
          data={chartData}
          lines={lines}
          height={240}
          format={metric === "gross_irr" ? "percent" : metric === "ending_nav" ? "dollar" : "number"}
        />
      )}

      {!loading && !err && data && totalFunds > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-bm-muted2">
          {sufficientFunds.map((f, idx) => (
            <span key={f.fund_id} className="inline-flex items-center gap-1.5" data-testid={`legend-${f.fund_id}`}>
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: pickColor(idx) }}
              />
              <span className="truncate max-w-[18ch]">{f.name}</span>
            </span>
          ))}
          {insufficientFunds.map((f) => (
            <span
              key={f.fund_id}
              className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400"
              title={`Only ${f.realCount} released quarter${f.realCount === 1 ? "" : "s"} — line not drawn (need ${MIN_POINTS_FOR_LINE}+).`}
              data-testid={`legend-insufficient-${f.fund_id}`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              <span className="truncate max-w-[18ch]">{f.name}</span>
              <span className="font-mono">({f.realCount}q)</span>
            </span>
          ))}
          <span className="ml-auto italic text-bm-muted2">
            Unavailable values skipped (never coerced to zero).
          </span>
        </div>
      )}
    </div>
  );
}
