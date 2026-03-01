"use client";

import type {
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
} from "@/lib/bos-api";
import { TrendLineChart, SensitivityBarChart } from "@/components/charts";
import type { SensitivityRow } from "@/components/charts/SensitivityBarChart";
import { CHART_COLORS } from "@/components/charts/chart-theme";
import ScenarioComparePanel from "./ScenarioComparePanel";

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n) || !n) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

interface Props {
  assetId: string;
  quarter: string;
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
  fundId: string;
}

export default function ValuationReturnsSection({
  assetId,
  quarter,
  financialState,
  periods,
  fundId,
}: Props) {
  // Value trend data
  const valueTrendData = periods.map((p) => ({
    quarter: p.quarter,
    value: Number(p.asset_value ?? 0),
    nav: Number(p.nav ?? 0),
  }));

  // Build sensitivity data from current cap rate
  const currentNoi = financialState?.noi ? Number(financialState.noi) * 4 : 0; // annualized
  const currentCapRate =
    financialState?.asset_value && financialState?.noi
      ? (Number(financialState.noi) * 4) / Number(financialState.asset_value)
      : 0.05;

  const sensitivityData: SensitivityRow[] = [];
  if (currentNoi > 0) {
    const bpsSteps = [-100, -50, -25, 0, 25, 50, 100];
    for (const bps of bpsSteps) {
      const rate = currentCapRate + bps / 10000;
      if (rate <= 0) continue;
      const val = currentNoi / rate;
      sensitivityData.push({
        label: bps === 0 ? `${(rate * 100).toFixed(2)}% (current)` : `${bps > 0 ? "+" : ""}${bps} bps`,
        value: val,
        isBaseline: bps === 0,
      });
    }
  }

  return (
    <div className="space-y-4" data-testid="asset-valuation-section">
      {/* Current Snapshot */}
      {financialState && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            Current Snapshot · {financialState.quarter}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <dt className="text-xs text-bm-muted2">Gross Value</dt>
              <dd className="font-medium">{fmtMoney(financialState.asset_value)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">NAV</dt>
              <dd className="font-medium">{fmtMoney(financialState.nav)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">Method</dt>
              <dd className="font-medium">{fmtText(financialState.valuation_method)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">NOI (Qtr)</dt>
              <dd className="font-medium">{fmtMoney(financialState.noi)}</dd>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Value + NAV Trend */}
        {valueTrendData.length > 0 && (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Value & NAV Trend
            </h3>
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

        {/* Cap Rate Sensitivity */}
        {sensitivityData.length > 0 && (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Cap Rate Sensitivity
            </h3>
            <SensitivityBarChart data={sensitivityData} height={260} />
          </div>
        )}
      </div>

      {/* Scenario Compare */}
      <ScenarioComparePanel
        assetId={assetId}
        quarter={quarter}
        fundId={fundId}
      />
    </div>
  );
}
