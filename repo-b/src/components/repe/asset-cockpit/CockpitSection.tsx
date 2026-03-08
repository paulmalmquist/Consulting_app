"use client";

import type {
  ReV2AssetDetail,
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
} from "@/lib/bos-api";
import { PROPERTY_TYPE_LABELS, label } from "@/lib/labels";
import { KpiStrip, type KpiDef } from "./KpiStrip";
import { QuarterlyBarChart, TrendLineChart } from "@/components/charts";
import { CHART_COLORS } from "@/components/charts/chart-theme";
import SectorCapacityCard from "./SectorCapacityCard";
import { fmtMoney, fmtPct, fmtX, fmtText, fmtYear } from "./format-utils";

interface Props {
  detail: ReV2AssetDetail;
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
  occupancy?: number;
}

export default function CockpitSection({
  detail,
  financialState,
  periods,
  occupancy,
}: Props) {
  const { asset, property } = detail;

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
      {/* KPI Strip */}
      <KpiStrip
        kpis={[
          {
            label: "NOI",
            value: fmtMoney(financialState?.noi),
            ...(prior?.noi && financialState?.noi ? {
              delta: {
                value: `${((Number(financialState.noi) - Number(prior.noi)) / Number(prior.noi) * 100).toFixed(1)}%`,
                tone: Number(financialState.noi) >= Number(prior.noi) ? "positive" as const : "negative" as const,
              },
            } : {}),
          },
          {
            label: "Revenue",
            value: fmtMoney(financialState?.revenue),
            ...(prior?.revenue && financialState?.revenue ? {
              delta: {
                value: `${((Number(financialState.revenue) - Number(prior.revenue)) / Number(prior.revenue) * 100).toFixed(1)}%`,
                tone: Number(financialState.revenue) >= Number(prior.revenue) ? "positive" as const : "negative" as const,
              },
            } : {}),
          },
          { label: "Occupancy", value: fmtPct(financialState?.occupancy ?? occupancy) },
          { label: "Value", value: fmtMoney(financialState?.asset_value) },
          {
            label: "Cap Rate",
            value: capRate != null ? `${(capRate * 100).toFixed(2)}%` : "—",
            ...(priorCapRate != null && capRate != null ? {
              delta: {
                value: `${((capRate - priorCapRate) * 10000).toFixed(0)} bps`,
                tone: capRate <= priorCapRate ? "positive" as const : "negative" as const,
              },
            } : {}),
          },
          { label: "NAV", value: fmtMoney(financialState?.nav) },
        ]}
      />

      {/* Property Details + Sector Capacity */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Property Details */}
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
            Property Details
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-bm-muted2">Property Type</dt><dd className="font-medium">{label(PROPERTY_TYPE_LABELS, property.property_type ?? "")}</dd></div>
            <div><dt className="text-xs text-bm-muted2">Market</dt><dd className="font-medium">{fmtText(property.market)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">City / State</dt><dd className="font-medium">{property.city ? `${property.city}, ${property.state}` : "—"}</dd></div>
            <div><dt className="text-xs text-bm-muted2">MSA</dt><dd className="font-medium">{fmtText(property.msa)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">Square Feet</dt><dd className="font-medium">{property.square_feet ? `${(Number(property.square_feet) / 1000).toFixed(0)}K SF` : "—"}</dd></div>
            <div><dt className="text-xs text-bm-muted2">Year Built</dt><dd className="font-medium">{fmtYear(property.year_built)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">Cost Basis</dt><dd className="font-medium">{fmtMoney(asset.cost_basis)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">Status</dt><dd className="font-medium">{asset.status}</dd></div>
          </dl>
        </div>

        {/* Sector Capacity */}
        <SectorCapacityCard property={property} />
      </div>

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
              syncId="cockpit-sync"
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
              syncId="cockpit-sync"
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
            syncId="cockpit-sync"
          />
        </div>
      )}

    </div>
  );
}
