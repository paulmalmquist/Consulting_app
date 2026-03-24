"use client";

import type {
  ReV2AssetDetail,
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
  ReLeaseSummary,
} from "@/lib/bos-api";
import { resolveAssetMetrics, type ResolvedMetric } from "@/lib/resolve-exit-metrics";
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

import SecondaryMetric from "./shared/SecondaryMetric";
import { fmtSfPsf } from "./format-utils";

/** Format a resolved metric value for display */
function fmtResolved(m: ResolvedMetric, format: "money" | "pct" | "x" | "pctRaw"): string {
  if (m.value == null) return "—";
  switch (format) {
    case "money": return fmtMoney(m.value);
    case "pct": return fmtPct(m.value);
    case "pctRaw": return `${(m.value * 100).toFixed(1)}%`;
    case "x": return fmtX(m.value);
    default: return String(m.value);
  }
}

interface Props {
  detail: ReV2AssetDetail;
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
  occupancy?: number;
  /** Lease summary from /leasing/summary — shown as compact Leasing Signals strip. */
  leaseSummary?: ReLeaseSummary | null;
}

export default function CockpitSection({
  detail,
  financialState,
  periods,
  occupancy,
  leaseSummary,
}: Props) {
  const { asset, property } = detail;
  const m = resolveAssetMetrics(detail, financialState);

  // Prior quarter (second-to-last in sorted periods)
  const prior = periods.length >= 2 ? periods[periods.length - 2] : null;

  // For exited assets, filter chart data to stop at the exit quarter
  const exitQuarter = detail.exit_quarter_state?.quarter;

  // Bar chart data for Revenue/OpEx/NOI
  const barData = periods
    .filter((p) => !m.isExited || !exitQuarter || p.quarter <= exitQuarter)
    .map((p) => ({
      quarter: p.quarter,
      revenue: Number(p.revenue ?? 0),
      opex: Number(p.opex ?? 0),
      noi: Number(p.noi ?? 0),
    }));

  // Occupancy line data
  const occData = periods
    .filter((p) => !m.isExited || !exitQuarter || p.quarter <= exitQuarter)
    .map((p) => ({
      quarter: p.quarter,
      occupancy: Number(p.occupancy ?? 0),
    }));

  // Value trend data
  const valueTrendData = periods
    .filter((p) => !m.isExited || !exitQuarter || p.quarter <= exitQuarter)
    .map((p) => ({
      quarter: p.quarter,
      value: Number(p.asset_value ?? 0),
    }));

  return (
    <div className="space-y-6" data-testid="asset-cockpit-section">
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  EXIT BANNER — shown only for exited/sold assets               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {m.isExited && m.exitBannerText && (
        <div
          className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-5 py-4"
          data-testid="exit-banner"
        >
          <span className="mt-0.5 text-amber-400 text-lg">●</span>
          <div>
            <p className="text-sm font-medium text-amber-300">{m.exitBannerText}</p>
            {m.holdPeriodMonths != null && (
              <p className="mt-1 text-xs text-bm-muted2">
                Hold period: {m.holdPeriodMonths} months
                {asset.acquisition_date && ` (acquired ${new Date(asset.acquisition_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })})`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  POSITION SNAPSHOT                                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="space-y-5">
        <SectionHeader
          eyebrow={m.isExited ? "EXIT SNAPSHOT" : "POSITION SNAPSHOT"}
          title={m.isExited ? "Realized Performance" : "Asset Performance"}
        />

        {/* Grouped Hero KPIs — 3 categories */}
        <div className={BRIEFING_CONTAINER}>
          {/* Operations */}
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 mb-3">
            {m.isExited ? "Operations at Exit" : "Operations"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HeroMetricCard
              label={m.revenue.label}
              value={fmtResolved(m.revenue, "money")}
              accent={BRIEFING_COLORS.performance}
              testId="kpi-revenue"
            />
            <HeroMetricCard
              label={m.noi.label}
              value={fmtResolved(m.noi, "money")}
              accent={BRIEFING_COLORS.performance}
              testId="kpi-noi"
            />
            <HeroMetricCard
              label={m.occupancy.label}
              value={fmtResolved(m.occupancy, "pct")}
              accent={BRIEFING_COLORS.performance}
              testId="kpi-occupancy"
            />
            <HeroMetricCard
              label={m.noiMargin.label}
              value={fmtResolved(m.noiMargin, "pctRaw")}
              accent={BRIEFING_COLORS.performance}
              testId="kpi-noi-margin"
            />
          </div>

          {/* Value / Exit Economics */}
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 mb-3 mt-6">
            {m.isExited ? "Exit Economics" : "Value"}
          </p>
          <div className={`grid gap-4 sm:grid-cols-2 ${m.isExited && m.netProceeds ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
            <HeroMetricCard
              label={m.assetValue.label}
              value={fmtResolved(m.assetValue, "money")}
              accent={BRIEFING_COLORS.capital}
              testId="kpi-asset-value"
            />
            {m.isExited && m.netProceeds ? (
              <HeroMetricCard
                label={m.netProceeds.label}
                value={fmtResolved(m.netProceeds, "money")}
                accent={BRIEFING_COLORS.capital}
                testId="kpi-net-proceeds"
              />
            ) : null}
            {m.isExited && m.gainOnSale ? (
              <HeroMetricCard
                label={m.gainOnSale.label}
                value={fmtResolved(m.gainOnSale, "money")}
                accent={m.gainOnSale.value != null && m.gainOnSale.value >= 0 ? BRIEFING_COLORS.performance : BRIEFING_COLORS.risk}
                testId="kpi-gain-on-sale"
              />
            ) : (
              <HeroMetricCard
                label={m.capRate.label}
                value={m.capRate.value != null ? `${(m.capRate.value * 100).toFixed(2)}%` : "—"}
                accent={BRIEFING_COLORS.capital}
                testId="kpi-cap-rate"
              />
            )}
            {!m.isExited && (
              <HeroMetricCard
                label={m.nav.label}
                value={fmtResolved(m.nav, "money")}
                accent={BRIEFING_COLORS.capital}
                testId="kpi-nav"
              />
            )}
          </div>

          {/* Capital / Debt */}
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 mb-3 mt-6">
            {m.isExited ? "Capital at Exit" : "Capital"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <HeroMetricCard
              label={m.debtBalance.label}
              value={fmtResolved(m.debtBalance, "money")}
              accent={BRIEFING_COLORS.structure}
              testId="kpi-debt"
            />
            <HeroMetricCard
              label={m.ltv.label}
              value={fmtResolved(m.ltv, "pct")}
              accent={BRIEFING_COLORS.structure}
              testId="kpi-ltv"
            />
            <HeroMetricCard
              label={m.dscr.label}
              value={fmtResolved(m.dscr, "x")}
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

        {/* Leasing Signals strip — shown when real lease data is available */}
        {leaseSummary && (
          <div className={BRIEFING_CARD}>
            <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              Leasing Signals
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <SecondaryMetric
                label="WALT"
                value={leaseSummary.walt_years != null ? `${Number(leaseSummary.walt_years).toFixed(1)} yrs` : "—"}
              />
              <SecondaryMetric
                label="Anchor Share"
                value={leaseSummary.anchor_pct != null ? `${(Number(leaseSummary.anchor_pct) * 100).toFixed(0)}%` : "—"}
              />
              <SecondaryMetric
                label="Next Expiry"
                value={leaseSummary.next_expiration ? String(new Date(leaseSummary.next_expiration).getFullYear()) : "—"}
              />
              <SecondaryMetric
                label="In-Place PSF"
                value={fmtSfPsf(leaseSummary.in_place_psf)}
              />
              <SecondaryMetric
                label="Mark-to-Market"
                value={leaseSummary.mark_to_market_pct != null
                  ? `${(Number(leaseSummary.mark_to_market_pct) * 100).toFixed(1)}%`
                  : "—"}
              />
            </div>
          </div>
        )}
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
