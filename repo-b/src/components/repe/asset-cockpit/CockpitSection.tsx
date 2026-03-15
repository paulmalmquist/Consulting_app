"use client";

import type {
  ReV2AssetDetail,
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
} from "@/lib/bos-api";
import { PROPERTY_TYPE_LABELS, label } from "@/lib/labels";
import { QuarterlyBarChart, TrendLineChart } from "@/components/charts";
import { CHART_COLORS } from "@/components/charts/chart-theme";
import SectorCapacityCard from "./SectorCapacityCard";
import { fmtMoney, fmtPct, fmtX, fmtText, fmtYear } from "./format-utils";

// Shared design-language components
import SectionHeader from "./shared/SectionHeader";
import HeroMetricCard from "./shared/HeroMetricCard";
import { BRIEFING_COLORS, BRIEFING_CONTAINER, BRIEFING_CARD } from "./shared/briefing-colors";

// Panel components
import TenantProfilePanel from "./panels/TenantProfilePanel";
import LeaseExpirationPanel from "./panels/LeaseExpirationPanel";
import RentEconomicsPanel from "./panels/RentEconomicsPanel";
import MarketContextPanel from "./panels/MarketContextPanel";
import CapExTrackingPanel from "./panels/CapExTrackingPanel";
import ValueDriversPanel from "./panels/ValueDriversPanel";
import InvestmentThesisCard from "./panels/InvestmentThesisCard";
import RiskIndicatorsPanel from "./panels/RiskIndicatorsPanel";
import ICReviewPanel from "./panels/ICReviewPanel";

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

  // NOI Margin
  const noiMargin =
    financialState?.noi && financialState?.revenue
      ? Number(financialState.noi) / Number(financialState.revenue)
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
    <div className="space-y-6" data-testid="asset-cockpit-section">
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  POSITION SNAPSHOT                                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="space-y-5">
        <SectionHeader
          eyebrow="POSITION SNAPSHOT"
          title="Asset Performance"
        />

        {/* Grouped Hero KPIs — 3 categories */}
        <div className={BRIEFING_CONTAINER}>
          {/* Operations */}
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 mb-3">
            Operations
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HeroMetricCard
              label="Revenue"
              value={fmtMoney(financialState?.revenue)}
              accent={BRIEFING_COLORS.performance}
              testId="kpi-revenue"
            />
            <HeroMetricCard
              label="NOI"
              value={fmtMoney(financialState?.noi)}
              accent={BRIEFING_COLORS.performance}
              testId="kpi-noi"
            />
            <HeroMetricCard
              label="Occupancy"
              value={fmtPct(financialState?.occupancy ?? occupancy)}
              accent={BRIEFING_COLORS.performance}
              testId="kpi-occupancy"
            />
            <HeroMetricCard
              label="NOI Margin"
              value={noiMargin != null ? `${(noiMargin * 100).toFixed(1)}%` : "—"}
              accent={BRIEFING_COLORS.performance}
              testId="kpi-noi-margin"
            />
          </div>

          {/* Value */}
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 mb-3 mt-6">
            Value
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <HeroMetricCard
              label="Asset Value"
              value={fmtMoney(financialState?.asset_value)}
              accent={BRIEFING_COLORS.capital}
              testId="kpi-asset-value"
            />
            <HeroMetricCard
              label="Cap Rate"
              value={capRate != null ? `${(capRate * 100).toFixed(2)}%` : "—"}
              accent={BRIEFING_COLORS.capital}
              testId="kpi-cap-rate"
            />
            <HeroMetricCard
              label="NAV"
              value={fmtMoney(financialState?.nav)}
              accent={BRIEFING_COLORS.capital}
              testId="kpi-nav"
            />
          </div>

          {/* Capital */}
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 mb-3 mt-6">
            Capital
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <HeroMetricCard
              label="Debt Balance"
              value={fmtMoney(financialState?.debt_balance)}
              accent={BRIEFING_COLORS.structure}
              testId="kpi-debt"
            />
            <HeroMetricCard
              label="LTV"
              value={fmtPct(financialState?.ltv)}
              accent={BRIEFING_COLORS.structure}
              testId="kpi-ltv"
            />
            <HeroMetricCard
              label="DSCR"
              value={fmtX(financialState?.dscr)}
              accent={BRIEFING_COLORS.structure}
              testId="kpi-dscr"
            />
          </div>
        </div>

        {/* Property Details + Sector Capacity */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`${BRIEFING_CARD} p-5`}>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
              Property Details
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-bm-muted2">Property Type</dt><dd className="font-medium text-bm-text">{label(PROPERTY_TYPE_LABELS, property.property_type ?? "")}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Market</dt><dd className="font-medium text-bm-text">{fmtText(property.market)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">City / State</dt><dd className="font-medium text-bm-text">{property.city ? `${property.city}, ${property.state}` : "—"}</dd></div>
              <div><dt className="text-xs text-bm-muted2">MSA</dt><dd className="font-medium text-bm-text">{fmtText(property.msa)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Square Feet</dt><dd className="font-medium text-bm-text">{property.square_feet ? `${(Number(property.square_feet) / 1000).toFixed(0)}K SF` : "—"}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Year Built</dt><dd className="font-medium text-bm-text">{fmtYear(property.year_built)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Cost Basis</dt><dd className="font-medium text-bm-text">{fmtMoney(asset.cost_basis)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Status</dt><dd className="font-medium text-bm-text capitalize">{asset.status}</dd></div>
            </dl>
          </div>

          <SectorCapacityCard property={property} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  OPERATING PERFORMANCE                                         */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="space-y-5">
        <SectionHeader
          eyebrow="OPERATING PERFORMANCE"
          title="Financial & Operational Trends"
        />

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Revenue / OpEx / NOI grouped bar chart */}
          <div className={BRIEFING_CARD}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2 mb-3">
              Quarterly P&L
            </p>
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
          <div className={BRIEFING_CARD}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2 mb-3">
              Occupancy Trend
            </p>
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
          <div className={BRIEFING_CARD}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2 mb-3">
              Asset Value Trend
            </p>
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
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  LEASING & TENANTS                                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="space-y-5">
        <SectionHeader
          eyebrow="LEASING & TENANTS"
          title="Income Stability & Tenant Quality"
        />

        <TenantProfilePanel detail={detail} />
        <div className="grid gap-4 lg:grid-cols-2">
          <LeaseExpirationPanel />
          <RentEconomicsPanel detail={detail} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  MARKET & CONTEXT                                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <MarketContextPanel detail={detail} />

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  CAPITAL DEPLOYMENT                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="space-y-5">
        <SectionHeader
          eyebrow="CAPITAL DEPLOYMENT"
          title="CapEx & Value Creation"
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <CapExTrackingPanel />
          <ValueDriversPanel financialState={financialState} periods={periods} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  INVESTMENT STRATEGY                                           */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="space-y-5">
        <SectionHeader
          eyebrow="INVESTMENT STRATEGY"
          title="Thesis & Governance"
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <InvestmentThesisCard />
          <ICReviewPanel />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  RISK & MONITORING                                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <RiskIndicatorsPanel financialState={financialState} />
    </div>
  );
}
