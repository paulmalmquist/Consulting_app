"use client";

import { useState, useMemo } from "react";
import QuarterlyBarChart, { type BarDef } from "@/components/charts/QuarterlyBarChart";
import { CHART_COLORS, fmtCompact } from "@/components/charts/chart-theme";
import { StateCard } from "@/components/ui/StateCard";
import type { CapitalActivityResponse } from "@/lib/bos-api";

type Horizon = "12m" | "24m" | "all";

const HORIZONS: { label: string; value: Horizon }[] = [
  { label: "12M", value: "12m" },
  { label: "24M", value: "24m" },
  { label: "Since Inception", value: "all" },
];

const BARS: BarDef[] = [
  { key: "contributions", label: "Contributions", color: CHART_COLORS.noi, stackId: "capital" },
  { key: "distributions", label: "Distributions", color: CHART_COLORS.warning, stackId: "capital" },
];

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tabular-nums text-bm-text">{value}</p>
    </div>
  );
}

export function CapitalActivityCard({
  data,
  loading,
  onHorizonChange,
}: {
  data: CapitalActivityResponse | null;
  loading: boolean;
  onHorizonChange?: (h: Horizon) => void;
}) {
  const [horizon, setHorizon] = useState<Horizon>("24m");

  const handleHorizon = (h: Horizon) => {
    setHorizon(h);
    onHorizonChange?.(h);
  };

  const chartData = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((s) => ({
      quarter: s.period,
      contributions: s.contributions,
      distributions: s.distributions,
    }));
  }, [data?.series]);

  const summary = data?.summary;

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/[0.03] p-6 space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-[1.05rem] font-semibold tracking-tight text-bm-text">
          Capital Activity Over Time
        </h3>
        <p className="mt-0.5 text-xs text-bm-muted2">
          Contributions and distributions across all funds.
        </p>
      </div>

      {loading ? (
        <StateCard state="loading" />
      ) : !data || chartData.length === 0 ? (
        <StateCard
          state="empty"
          title="No capital activity available yet"
          description="Activity will appear as contributions and distributions are recorded."
        />
      ) : (
        <>
          {/* Summary callouts */}
          <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-bm-border/20 pb-3">
            <SummaryMetric label="Total Contributed" value={fmtCompact(Number(summary?.total_contributed || 0))} />
            <SummaryMetric label="Total Distributed" value={fmtCompact(Number(summary?.total_distributed || 0))} />
            <SummaryMetric
              label="Net Capital Movement"
              value={fmtCompact(Number(summary?.net_capital_movement || 0))}
            />
          </div>

          {/* Horizon toggle */}
          <div className="flex gap-1.5">
            {HORIZONS.map((h) => (
              <button
                key={h.value}
                type="button"
                onClick={() => handleHorizon(h.value)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors ${
                  horizon === h.value
                    ? "bg-bm-accent/20 text-bm-accent"
                    : "text-bm-muted2 hover:bg-bm-surface/25 hover:text-bm-text"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          {/* Chart */}
          <QuarterlyBarChart
            data={chartData}
            bars={BARS}
            height={240}
            showLegend
          />
        </>
      )}
    </div>
  );
}
