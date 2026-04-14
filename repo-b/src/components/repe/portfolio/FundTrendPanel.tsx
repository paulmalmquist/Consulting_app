"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getEnvironmentFundTrend,
  type FundTrendResponse,
} from "@/lib/bos-api";
import TrendLineChart from "@/components/charts/TrendLineChart";

type Metric = "ending_nav" | "dpi" | "tvpi" | "gross_irr";

const METRIC_LABEL: Record<Metric, string> = {
  ending_nav: "NAV",
  dpi: "DPI",
  tvpi: "TVPI",
  gross_irr: "Gross IRR",
};

// Stable fund → color mapping. New funds cycle through the palette.
const PALETTE = [
  "#1e40af", // blue
  "#b45309", // amber
  "#047857", // emerald
  "#7c3aed", // violet
  "#be123c", // rose
  "#0891b2", // cyan
];

function pickColor(fundIdx: number): string {
  return PALETTE[fundIdx % PALETTE.length];
}

function fmtValue(v: number | null, metric: Metric): string {
  if (v === null) return "—";
  if (metric === "gross_irr") return `${(v * 100).toFixed(1)}%`;
  if (metric === "dpi" || metric === "tvpi") return `${v.toFixed(2)}x`;
  // NAV
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
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

  const { chartData, lines } = useMemo(() => {
    if (!data) return { chartData: [] as Record<string, unknown>[], lines: [] };
    // Pivot to per-quarter rows: { quarter: "2024Q1", <fund1>: 12, <fund2>: 8, ... }
    const quartersSeen = new Set<string>();
    for (const f of data.funds) for (const p of f.points) quartersSeen.add(p.quarter);
    const sortedQs = Array.from(quartersSeen).sort();
    const rows: Record<string, unknown>[] = sortedQs.map((q) => ({ quarter: q }));
    const lineDefs = data.funds.map((f, idx) => ({
      key: f.fund_id,
      label: f.name,
      color: pickColor(idx),
    }));
    for (const f of data.funds) {
      const byQ = new Map(f.points.map((p) => [p.quarter, p.value]));
      for (const row of rows) {
        const q = row.quarter as string;
        const v = byQ.get(q);
        // Skip null values (don't coerce to zero).
        row[f.fund_id] = v ?? null;
      }
    }
    return { chartData: rows, lines: lineDefs };
  }, [data]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-bm-muted2">
            Fund Trends
          </div>
          <div className="text-sm text-bm-text">
            {METRIC_LABEL[metric]} over {quarters} quarters · one series per fund
          </div>
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
      {!loading && !err && data && chartData.length > 0 && (
        <TrendLineChart data={chartData} lines={lines} height={240} />
      )}
      {!loading && !err && data && chartData.length === 0 && (
        <div className="h-56 flex items-center justify-center text-sm text-bm-muted2">
          No fund-quarter data available for this environment yet.
        </div>
      )}
      {!loading && !err && data && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-bm-muted2">
          {data.funds.map((f, idx) => (
            <span key={f.fund_id} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: pickColor(idx) }}
              />
              <span className="truncate max-w-[18ch]">{f.name}</span>
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
