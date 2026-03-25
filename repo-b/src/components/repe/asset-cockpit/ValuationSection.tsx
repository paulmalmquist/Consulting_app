"use client";

import type {
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
} from "@/lib/bos-api";
import { TrendLineChart } from "@/components/charts";
import { CHART_COLORS } from "@/components/charts/chart-theme";
import { fmtMoney, fmtPct } from "./format-utils";
import SectionHeader from "./shared/SectionHeader";
import { BRIEFING_CARD } from "./shared/briefing-colors";

const VALUATION_METHOD_LABELS: Record<string, string> = {
  cap_rate: "Direct Cap",
  dcf: "Discounted Cash Flow",
  sales_comp: "Sales Comparable",
  cost: "Cost Approach",
};

function fmtMethod(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  return VALUATION_METHOD_LABELS[s] ?? s;
}

interface Props {
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
}

export default function ValuationSection({ financialState, periods }: Props) {
  // Cap rate derived from current quarter
  const capRate =
    financialState?.asset_value && financialState?.noi
      ? (Number(financialState.noi) * 4) / Number(financialState.asset_value)
      : null;

  // Value + NAV trend
  const valueTrendData = periods.map((p) => ({
    quarter: p.quarter,
    value: Number(p.asset_value ?? 0),
    nav: Number(p.nav ?? 0),
  }));

  return (
    <div className="space-y-5" data-testid="asset-valuation-section">
      <SectionHeader eyebrow="VALUATION" title="Asset Value & Appraisal" />

      {/* Current Valuation Snapshot */}
      <div className={BRIEFING_CARD}>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
          Current Valuation
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-bm-muted2">Asset Value</dt>
            <dd className="text-lg font-semibold text-bm-text">{fmtMoney(financialState?.asset_value)}</dd>
          </div>
          <div>
            <dt className="text-xs text-bm-muted2">NAV Contribution</dt>
            <dd className="text-lg font-semibold text-bm-text">{fmtMoney(financialState?.nav)}</dd>
          </div>
          <div>
            <dt className="text-xs text-bm-muted2">Cap Rate</dt>
            <dd className="text-lg font-semibold text-bm-text">
              {capRate != null ? `${(capRate * 100).toFixed(2)}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-bm-muted2">Method</dt>
            <dd className="text-lg font-semibold text-bm-text">{fmtMethod(financialState?.valuation_method)}</dd>
          </div>
        </dl>
      </div>

      {/* Value & NAV Trend */}
      {valueTrendData.length > 0 && (
        <div className={BRIEFING_CARD}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2 mb-3">
            Value &amp; NAV Trend
          </p>
          <TrendLineChart
            data={valueTrendData}
            lines={[
              { key: "value", label: "Asset Value", color: CHART_COLORS.revenue },
              { key: "nav", label: "NAV", color: CHART_COLORS.noi },
            ]}
            format="dollar"
            height={260}
          />
        </div>
      )}

      {/* Valuation History Table */}
      {periods.length > 0 && (
        <div className={BRIEFING_CARD}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2 mb-3">
            Valuation History
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.14em] text-bm-muted2 dark:border-white/10">
                  <th className="px-3 py-2 text-left font-medium">Quarter</th>
                  <th className="px-3 py-2 text-right font-medium">Asset Value</th>
                  <th className="px-3 py-2 text-right font-medium">Cap Rate</th>
                  <th className="px-3 py-2 text-right font-medium">NAV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {periods.map((p) => {
                  const pCapRate =
                    p.asset_value && p.noi
                      ? (Number(p.noi) * 4) / Number(p.asset_value)
                      : null;
                  return (
                    <tr key={p.quarter} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="px-3 py-2 font-medium text-bm-text">{p.quarter}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-bm-text">{fmtMoney(p.asset_value)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-bm-text">
                        {pCapRate != null ? fmtPct(pCapRate) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-bm-text">{fmtMoney(p.nav)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
