"use client";

import { fmtPct, fmtMultiple, fmtMoney } from "@/lib/format-utils";
import type { FundBaseScenario } from "./types";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string | null;
  deltaPositive?: boolean;
}

function MetricCard({ label, value, delta, deltaPositive }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-bm-muted">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-bm-text">
        {value}
      </div>
      {delta != null && (
        <div
          className={`mt-0.5 text-xs font-medium ${
            deltaPositive ? "text-green-400" : "text-red-400"
          }`}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

export function FundMetricsBand({
  result,
  baseResult,
}: {
  result: FundBaseScenario;
  baseResult?: FundBaseScenario | null;
}) {
  const s = result.summary;
  const b = baseResult?.summary;
  const showDelta = b && baseResult?.scenario_id !== result.scenario_id;

  function pctDelta(
    current: number | null,
    base: number | null,
  ): { delta: string; positive: boolean } | null {
    if (!showDelta || current == null || base == null) return null;
    const diff = current - base;
    const bps = Math.round(diff * 10000);
    return {
      delta: `${bps >= 0 ? "+" : ""}${bps} bps`,
      positive: bps >= 0,
    };
  }

  function multDelta(
    current: number | null,
    base: number | null,
  ): { delta: string; positive: boolean } | null {
    if (!showDelta || current == null || base == null) return null;
    const diff = current - base;
    return {
      delta: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}x`,
      positive: diff >= 0,
    };
  }

  function moneyDelta(
    current: number,
    base: number,
  ): { delta: string; positive: boolean } | null {
    if (!showDelta) return null;
    const diff = current - base;
    return {
      delta: `${diff >= 0 ? "+" : ""}${fmtMoney(diff)}`,
      positive: diff >= 0,
    };
  }

  const grossIrrDelta = pctDelta(s.gross_irr, b?.gross_irr ?? null);
  const netIrrDelta = pctDelta(s.net_irr, b?.net_irr ?? null);
  const tvpiDelta = multDelta(s.tvpi, b?.tvpi ?? null);
  const dpiDelta = multDelta(s.dpi, b?.dpi ?? null);
  const rvpiDelta = multDelta(s.rvpi, b?.rvpi ?? null);
  const navDelta = moneyDelta(s.attributable_nav, b?.attributable_nav ?? 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <MetricCard
        label="Gross IRR"
        value={fmtPct(s.gross_irr)}
        delta={grossIrrDelta?.delta}
        deltaPositive={grossIrrDelta?.positive}
      />
      <MetricCard
        label="Net IRR"
        value={fmtPct(s.net_irr)}
        delta={netIrrDelta?.delta}
        deltaPositive={netIrrDelta?.positive}
      />
      <MetricCard
        label="TVPI"
        value={fmtMultiple(s.tvpi)}
        delta={tvpiDelta?.delta}
        deltaPositive={tvpiDelta?.positive}
      />
      <MetricCard
        label="DPI"
        value={fmtMultiple(s.dpi)}
        delta={dpiDelta?.delta}
        deltaPositive={dpiDelta?.positive}
      />
      <MetricCard
        label="RVPI"
        value={fmtMultiple(s.rvpi)}
        delta={rvpiDelta?.delta}
        deltaPositive={rvpiDelta?.positive}
      />
      <MetricCard
        label="NAV"
        value={fmtMoney(s.attributable_nav)}
        delta={navDelta?.delta}
        deltaPositive={navDelta?.positive}
      />
    </div>
  );
}
