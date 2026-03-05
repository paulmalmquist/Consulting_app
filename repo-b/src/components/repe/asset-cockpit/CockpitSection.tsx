"use client";

import type {
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
} from "@/lib/bos-api";
import KpiCard from "./KpiCard";
import { QuarterlyBarChart, TrendLineChart } from "@/components/charts";
import { CHART_COLORS } from "@/components/charts/chart-theme";

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n) || !n) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  if (n <= 1 && n >= 0) return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(1)}%`;
}

function fmtX(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

interface Props {
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
  occupancy?: number;
}

export default function CockpitSection({
  financialState,
  periods,
  occupancy,
}: Props) {
  // Extract sparkline arrays from periods
  const noiValues = periods.map((p) => Number(p.noi ?? 0));
  const revenueValues = periods.map((p) => Number(p.revenue ?? 0));
  const occValues = periods.map((p) => Number(p.occupancy ?? 0));
  const valueValues = periods.map((p) => Number(p.asset_value ?? 0));

  // Prior quarter (second-to-last in sorted periods)
  const prior = periods.length >= 2 ? periods[periods.length - 2] : null;

  // Cap rate from current quarter state
  const capRate =
    financialState?.asset_value && financialState?.noi
      ? (Number(financialState.noi) * 4) / Number(financialState.asset_value)
      : null;
  const priorCapRate =
    prior?.asset_value && prior?.noi
      ? (Number(prior.noi) * 4) / Number(prior.asset_value)
      : null;

  // Bar chart data for Revenue/OpEx/NOI
  const barData = periods.map((p) => ({
    quarter: p.quarter,
    revenue: Number(p.revenue ?? 0),
    opex: Number(p.opex ?? 0),
    noi: Number(p.noi ?? 0),
  }));

  // Occupancy line data
  const occData = periods.map((p) => ({
    quarter: p.quarter,
    occupancy: Number(p.occupancy ?? 0),
  }));

  // Value trend data
  const valueTrendData = periods.map((p) => ({
    quarter: p.quarter,
    value: Number(p.asset_value ?? 0),
  }));

  return (
    <div className="space-y-4" data-testid="asset-cockpit-section">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="NOI"
          value={fmtMoney(financialState?.noi)}
          currentValue={financialState?.noi ? Number(financialState.noi) : null}
          priorValue={prior?.noi ? Number(prior.noi) : null}
          sparkValues={noiValues}
          polarity="up_good"
        />
        <KpiCard
          label="Revenue"
          value={fmtMoney(financialState?.revenue)}
          currentValue={financialState?.revenue ? Number(financialState.revenue) : null}
          priorValue={prior?.revenue ? Number(prior.revenue) : null}
          sparkValues={revenueValues}
          polarity="up_good"
        />
        <KpiCard
          label="Occupancy"
          value={fmtPct(financialState?.occupancy ?? occupancy)}
          currentValue={financialState?.occupancy ? Number(financialState.occupancy) : null}
          priorValue={prior?.occupancy ? Number(prior.occupancy) : null}
          sparkValues={occValues}
          polarity="up_good"
          formatDelta={(d) => `${(d * 100).toFixed(1)}pp`}
        />
        <KpiCard
          label="Value"
          value={fmtMoney(financialState?.asset_value)}
          currentValue={financialState?.asset_value ? Number(financialState.asset_value) : null}
          priorValue={prior?.asset_value ? Number(prior.asset_value) : null}
          sparkValues={valueValues}
          polarity="up_good"
        />
        <KpiCard
          label="Cap Rate"
          value={capRate != null ? `${(capRate * 100).toFixed(2)}%` : "—"}
          currentValue={capRate}
          priorValue={priorCapRate}
          polarity="down_good"
          formatDelta={(d) => `${(d * 10000).toFixed(0)} bps`}
        />
        <KpiCard
          label="NAV"
          value={fmtMoney(financialState?.nav)}
          currentValue={financialState?.nav ? Number(financialState.nav) : null}
          priorValue={prior?.nav ? Number(prior.nav) : null}
          sparkValues={periods.map((p) => Number(p.nav ?? 0))}
          polarity="up_good"
        />
      </div>

      {/* Loan Health Strip */}
      {financialState && (financialState.dscr || financialState.ltv || financialState.debt_yield) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-bm-border/70 bg-bm-surface/20 px-4 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2 mr-2">Loan Health</span>
          {financialState.dscr && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              Number(financialState.dscr) >= 1.25 ? "bg-green-500/10 text-green-400" : Number(financialState.dscr) >= 1.0 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${Number(financialState.dscr) >= 1.25 ? "bg-green-400" : Number(financialState.dscr) >= 1.0 ? "bg-amber-400" : "bg-red-400"}`} />
              DSCR {fmtX(financialState.dscr)}
            </span>
          )}
          {financialState.ltv && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              Number(financialState.ltv) <= 0.65 ? "bg-green-500/10 text-green-400" : Number(financialState.ltv) <= 0.75 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${Number(financialState.ltv) <= 0.65 ? "bg-green-400" : Number(financialState.ltv) <= 0.75 ? "bg-amber-400" : "bg-red-400"}`} />
              LTV {fmtPct(financialState.ltv)}
            </span>
          )}
          {financialState.debt_yield && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              Number(financialState.debt_yield) >= 0.10 ? "bg-green-500/10 text-green-400" : Number(financialState.debt_yield) >= 0.08 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${Number(financialState.debt_yield) >= 0.10 ? "bg-green-400" : Number(financialState.debt_yield) >= 0.08 ? "bg-amber-400" : "bg-red-400"}`} />
              Debt Yield {financialState.debt_yield ? `${(Number(financialState.debt_yield) * 100).toFixed(1)}%` : "—"}
            </span>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Revenue / OpEx / NOI grouped bar chart */}
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            Quarterly P&L
          </h3>
          {barData.length > 0 ? (
            <QuarterlyBarChart
              data={barData}
              bars={[
                { key: "revenue", label: "Revenue", color: CHART_COLORS.revenue },
                { key: "opex", label: "OpEx", color: CHART_COLORS.opex },
                { key: "noi", label: "NOI", color: CHART_COLORS.noi },
              ]}
              height={260}
            />
          ) : (
            <p className="text-sm text-bm-muted2">No quarterly data.</p>
          )}
        </div>

        {/* Occupancy trend line */}
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            Occupancy Trend
          </h3>
          {occData.length > 0 ? (
            <TrendLineChart
              data={occData}
              lines={[
                { key: "occupancy", label: "Occupancy", color: CHART_COLORS.noi },
              ]}
              referenceLines={[{ y: 0.95, label: "95%", color: CHART_COLORS.warning }]}
              format="percent"
              height={260}
              showLegend={false}
            />
          ) : (
            <p className="text-sm text-bm-muted2">No occupancy data.</p>
          )}
        </div>
      </div>

      {/* Asset Value Trend (full width) */}
      {valueTrendData.length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            Asset Value Trend
          </h3>
          <TrendLineChart
            data={valueTrendData}
            lines={[{ key: "value", label: "Asset Value", color: CHART_COLORS.revenue }]}
            format="dollar"
            height={220}
            showLegend={false}
          />
        </div>
      )}

    </div>
  );
}
