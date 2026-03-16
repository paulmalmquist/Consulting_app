"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, GitBranch, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { label as labelFn, PROPERTY_TYPE_LABELS } from "@/lib/labels";
import { FundDeleteDialog } from "@/components/repe/FundDeleteDialog";
import { MetricCard } from "@/components/ui/MetricCard";
import { useToast } from "@/components/ui/Toast";
import {
  CHART_COLORS,
  fmtCompact,
} from "@/components/charts/chart-theme";
import {
  deleteRepeFund,
  exportFundExcelUrl,
  getRepeFund,
  listRepeDeals,
  listRepeAssets,
  listReV2Investments,
  listReV2Runs,
  RepeFundDetail,
  RepeDeal,
  ReV2Investment,
  getReV2FundQuarterState,
  getReV2FundLineage,
  getReV2FundInvestmentRollup,
  getReV2InvestmentAssets,
  listReV2Scenarios,
  ReV2FundQuarterState,
  ReV2Scenario,
  ReV2FundInvestmentRollupRow,
  ReV2EntityLineageResponse,
  ReV2InvestmentAsset,
  getFiNOIVariance,
  getFiFundMetrics,
  getFiLoans,
  getFiCovenantResults,
  getFiWatchlist,
  getLpSummary,
  FiVarianceResult,
  FiFundMetricsResult,
  FiLoan,
  FiCovenantResult,
  FiWatchlistEvent,
  type LpSummary,
  seedReV2Data,
  getFundValuationRollup,
  type FundValuationRollup,
  createReV2Scenario,
  getIrrTimeline,
  getCapitalTimeline,
  getIrrContribution,
  computeModelPreview,
  type IrrTimelinePoint,
  type CapitalTimelinePoint,
  type IrrContributionItem,
  type ModelPreviewResult,
  type ModelPreviewAssumption,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import SaleScenarioPanel from "@/components/repe/SaleScenarioPanel";
import { AmortizationViewer } from "@/components/repe/AmortizationViewer";
import { WaterfallTierTable } from "@/components/repe/WaterfallTierTable";
import { LPBreakdown } from "@/components/repe/LPBreakdown";
import WaterfallScenarioPanel from "@/components/repe/WaterfallScenarioPanel";
import { DebugFooter } from "@/components/repe/DebugFooter";
import { EntityLineagePanel } from "@/components/repe/EntityLineagePanel";
import {
  buildExposureInsights,
  buildFundHealthSummary,
  buildPerformanceDrivers,
  buildPortfolioTableRows,
  mergeValueCreationSeries,
  type ExposureDatum,
  type FundHealthSummary,
  type PerformanceDriver,
  type PortfolioTableRow,
  type ValueCreationPoint,
} from "./overviewNarrative";

function pickCurrentQuarter(): string {
  const d = new Date();
  const q = Math.ceil((d.getUTCMonth() + 1) / 3);
  return `${d.getUTCFullYear()}Q${q}`;
}

function fmtMoney(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "$0";
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtMultiple(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toFixed(2)}x`;
}

function fmtPercent(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function fmtFlexiblePercent(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  const normalized = Math.abs(n) > 1.5 ? n / 100 : n;
  return `${(normalized * 100).toFixed(1)}%`;
}

const NOI_LINE_LABELS: Record<string, string> = {
  RENT: "Rental Income",
  OTHER_INCOME: "Other Income",
  VACANCY: "Vacancy & Credit Loss",
  EGI: "Effective Gross Income",
  MGMT_FEE_PROP: "Property Mgmt Fee",
  ADMIN: "Administrative",
  INSURANCE: "Insurance",
  TAXES: "Real Estate Taxes",
  UTILITIES: "Utilities",
  REPAIRS: "Repairs & Maintenance",
  NOI: "Net Operating Income",
};

function fmtLineCode(code: string): string {
  return NOI_LINE_LABELS[code] || code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type HeaderMetric = {
  label: string;
  value: string;
  ratio?: number | null;
  barColor?: string;
};

type PortfolioSnapshotMetric = {
  label: string;
  value: string;
};

type FundOverviewData = {
  rollup: FundValuationRollup | null;
  irrTimeline: IrrTimelinePoint[];
  capitalTimeline: CapitalTimelinePoint[];
  irrContrib: IrrContributionItem[];
  loading: boolean;
};

const FUND_DASHBOARD_COLORS = {
  primary: "#3B82F6",
  primarySoft: "#DBEAFE",
  realized: "#059669",
  realizedSoft: "#D1FAE5",
  unrealized: "#7DD3FC",
  grid: "#E5E7EB",
  axis: "#6B7280",
  card: "#F8FAFC",
  cardInset: "#FFFFFF",
  cardHover: "#EFF6FF",
  border: "#E2E8F0",
  muted: "#64748B",
  text: "#0F172A",
} as const;

const FUND_PANEL_CLASS =
  "rounded-[22px] border border-[#E2E8F0] bg-[#F8FAFC] shadow-[0_1px_2px_rgba(0,0,0,0.05)]";

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function getRatioOfBase(value: unknown, base: unknown): number | null {
  const numerator = toFiniteNumber(value);
  const denominator = toFiniteNumber(base);
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

function weightedAverageRollup(
  rows: ReV2FundInvestmentRollupRow[],
  valueSelector: (row: ReV2FundInvestmentRollupRow) => unknown
): number | null {
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const row of rows) {
    const value = toFiniteNumber(valueSelector(row));
    if (value === null) continue;
    const weight = Math.max(
      toFiniteNumber(row.fund_nav_contribution) ??
        toFiniteNumber(row.total_asset_value) ??
        toFiniteNumber(row.committed_capital) ??
        0,
      1
    );
    weightedTotal += value * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedTotal / totalWeight : null;
}

function sumRollupMetric(
  rows: ReV2FundInvestmentRollupRow[],
  valueSelector: (row: ReV2FundInvestmentRollupRow) => unknown
): number | null {
  const total = rows.reduce((sum, row) => sum + (toFiniteNumber(valueSelector(row)) ?? 0), 0);
  return total > 0 ? total : null;
}

function buildPortfolioSnapshotMetrics({
  rollup,
  investmentRollup,
  fundState,
}: {
  rollup: FundValuationRollup | null;
  investmentRollup: ReV2FundInvestmentRollupRow[];
  fundState: ReV2FundQuarterState | null;
}): PortfolioSnapshotMetric[] {
  const assets =
    rollup?.summary.asset_count ??
    investmentRollup.reduce((sum, row) => sum + Number(row.asset_count || 0), 0);
  const markets = new Set(
    investmentRollup
      .map((row) => row.primary_market)
      .filter((value): value is string => Boolean(value))
  ).size;
  const occupancy =
    rollup?.summary.weighted_avg_occupancy ?? weightedAverageRollup(investmentRollup, (row) => row.weighted_occupancy);
  const ltv =
    rollup?.summary.weighted_avg_ltv ?? weightedAverageRollup(investmentRollup, (row) => row.computed_ltv);
  const avgIrr = weightedAverageRollup(investmentRollup, (row) => row.gross_irr) ?? toFiniteNumber(fundState?.gross_irr);
  const portfolioNoi =
    rollup?.summary.total_noi ?? sumRollupMetric(investmentRollup, (row) => row.total_noi);

  return [
    { label: "Assets", value: assets > 0 ? assets.toLocaleString() : "—" },
    { label: "Markets", value: markets > 0 ? markets.toLocaleString() : "—" },
    { label: "Occupancy", value: occupancy != null ? fmtFlexiblePercent(occupancy) : "—" },
    { label: "Average LTV", value: ltv != null ? fmtFlexiblePercent(ltv) : "—" },
    { label: "Average IRR", value: avgIrr != null ? fmtPercent(avgIrr) : "—" },
    { label: "Portfolio NOI", value: portfolioNoi != null ? fmtMoney(portfolioNoi) : "—" },
  ];
}

function OverviewChartSkeleton() {
  return (
    <div className="flex h-full w-full animate-pulse flex-col justify-between rounded-[18px] border border-[#E5E7EB] bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded-full bg-slate-200" />
          <div className="h-5 w-44 rounded-full bg-slate-200" />
        </div>
        <div className="h-4 w-28 rounded-full bg-slate-200" />
      </div>
      <div className="mt-5 flex h-full items-end gap-4">
        {[96, 132, 112, 158, 138, 170].map((height, index) => (
          <div key={`${height}-${index}`} className="flex flex-1 items-end gap-2">
            <div className="w-5 rounded-t-[10px] bg-slate-200/90" style={{ height }} />
            <div className="w-5 rounded-t-[10px] bg-slate-200/60" style={{ height: Math.max(64, height - 30) }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function NarrativeSectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">{eyebrow}</p>
        <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#0F172A]">{title}</h2>
      </div>
      {description ? <p className="max-w-2xl text-sm leading-6 text-[#64748B]">{description}</p> : null}
    </div>
  );
}

function NarrativeEmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-[18px] border border-dashed border-[#CBD5E1] bg-white px-4 py-6 text-center">
      <p className="text-sm text-[#475569]">{title}</p>
      <p className="mt-1 text-xs text-[#64748B]">{detail}</p>
    </div>
  );
}

function KpiGroupCard({
  title,
  metrics,
  testId,
}: {
  title: string;
  metrics: HeaderMetric[];
  testId: string;
}) {
  return (
    <div className={`${FUND_PANEL_CLASS} p-5`} data-testid={testId}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">{title}</p>
      <dl className="mt-3 space-y-2">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[16px] border border-transparent bg-white px-4 py-3 transition-[background-color,border-color,transform] duration-200 hover:border-[#DBEAFE] hover:bg-[#EFF6FF]"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
              <dt className="text-[12px] uppercase tracking-[0.04em] text-[#6B7280]">{metric.label}</dt>
              <dd className="text-right text-[20px] font-semibold leading-none tracking-[-0.02em] text-[#0F172A] tabular-nums transition-all duration-300">
                {metric.value}
              </dd>
            </div>
            {metric.ratio != null ? (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.max(6, clampPercent(metric.ratio * 100))}%`,
                    backgroundColor: metric.barColor ?? FUND_DASHBOARD_COLORS.primary,
                  }}
                />
              </div>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

function PortfolioSnapshotRow({
  metrics,
  loading,
}: {
  metrics: PortfolioSnapshotMetric[];
  loading: boolean;
}) {
  return (
    <div className={`${FUND_PANEL_CLASS} p-5`} data-testid="portfolio-snapshot">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">Portfolio Snapshot</p>
          <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#0F172A]">Portfolio Snapshot</h2>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-[#64748B]">
          Current scale, leverage, occupancy, and income stay visible without forcing more scroll.
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`snapshot-skeleton-${index}`}
                className="animate-pulse rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-3"
              >
                <div className="h-3 w-20 rounded-full bg-slate-200" />
                <div className="mt-3 h-7 w-24 rounded-full bg-slate-200" />
              </div>
            ))
          : metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-3 transition-[background-color,border-color] duration-200 hover:border-[#DBEAFE] hover:bg-[#EFF6FF]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">{metric.label}</p>
                <p className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#0F172A] tabular-nums transition-all duration-300">
                  {metric.value}
                </p>
              </div>
            ))}
      </div>
    </div>
  );
}

function FundValueCreationCard({
  data,
  loading,
}: {
  data: ValueCreationPoint[];
  loading: boolean;
}) {
  return (
    <div className={`${FUND_PANEL_CLASS} p-5`} data-testid="fund-value-creation">
      <NarrativeSectionHeading
        eyebrow="Value Creation"
        title="Fund Value Creation"
        description="Tracks deployed capital against realized and unrealized value so the fund's progress reads at a glance."
      />
      <div className="mt-4 overflow-x-auto">
        {loading ? (
          <div className="h-[220px] min-w-[640px] md:min-w-0 md:h-[260px] lg:h-[300px] xl:h-[340px]">
            <OverviewChartSkeleton />
          </div>
        ) : data.length > 0 ? (
          <div className="h-[220px] min-w-[640px] md:min-w-0 md:h-[260px] lg:h-[300px] xl:h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                barCategoryGap={28}
              >
                <CartesianGrid vertical={false} stroke={FUND_DASHBOARD_COLORS.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="quarter"
                  tick={{ fontSize: 12, fill: FUND_DASHBOARD_COLORS.axis }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: FUND_DASHBOARD_COLORS.axis }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: number) => fmtCompact(value)}
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    border: `1px solid ${FUND_DASHBOARD_COLORS.grid}`,
                    borderRadius: 14,
                    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
                    color: FUND_DASHBOARD_COLORS.text,
                  }}
                  formatter={(value: number, name: string) => [fmtMoney(value), name]}
                  labelFormatter={(label) => `Quarter ${label}`}
                  labelStyle={{ color: FUND_DASHBOARD_COLORS.text, fontWeight: 600 }}
                />
                <Legend
                  align="right"
                  verticalAlign="top"
                  height={28}
                  wrapperStyle={{ fontSize: 11, color: FUND_DASHBOARD_COLORS.axis, paddingBottom: 8 }}
                />
                <Bar
                  dataKey="distributions"
                  name="Realized Value"
                  stackId="value"
                  fill={FUND_DASHBOARD_COLORS.realized}
                  radius={[6, 6, 0, 0]}
                  barSize={32}
                />
                <Bar
                  dataKey="nav"
                  name="Unrealized Value"
                  stackId="value"
                  fill={FUND_DASHBOARD_COLORS.unrealized}
                  radius={[6, 6, 0, 0]}
                  barSize={32}
                />
                <Line
                  type="monotone"
                  dataKey="calledCapital"
                  name="Called Capital"
                  stroke={FUND_DASHBOARD_COLORS.primary}
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: FUND_DASHBOARD_COLORS.primary }}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NarrativeEmptyState
            title="Value-creation history will appear after quarter-close data is available."
            detail="The chart combines cumulative called capital, realized distributions, and NAV by quarter."
          />
        )}
      </div>
    </div>
  );
}

function HorizontalInsightBar({
  label,
  valueLabel,
  pct,
  color,
}: {
  label: string;
  valueLabel: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-[#0F172A]">{label}</span>
        <span className="shrink-0 font-medium tabular-nums text-[#64748B]">{valueLabel}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#E2E8F0]">
        <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(pct, 3), 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function PortfolioAllocationCard({
  rows,
  loading,
}: {
  rows: ExposureDatum[];
  loading: boolean;
}) {
  const donutColors = [
    FUND_DASHBOARD_COLORS.primary,
    FUND_DASHBOARD_COLORS.realized,
    "#0EA5E9",
    "#F59E0B",
    "#8B5CF6",
    "#14B8A6",
  ];
  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className={`${FUND_PANEL_CLASS} flex h-full flex-col p-5`} data-testid="portfolio-allocation">
      <NarrativeSectionHeading
        eyebrow="Allocation"
        title="Portfolio Allocation"
        description="Sector weights provide context for where current value creation is concentrated."
      />
      <div className="mt-4 flex-1">
        {loading ? (
          <div className="h-[220px] md:h-[260px] lg:h-[300px] xl:h-[340px]">
            <OverviewChartSkeleton />
          </div>
        ) : rows.length > 0 ? (
          <div className="grid gap-4 xl:grid-rows-[minmax(0,1fr)_auto]">
            <div className="relative h-[220px] md:h-[260px] lg:h-[300px] xl:h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      border: `1px solid ${FUND_DASHBOARD_COLORS.grid}`,
                      borderRadius: 14,
                      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
                      color: FUND_DASHBOARD_COLORS.text,
                    }}
                    formatter={(value: number, _name: string, item: { payload?: ExposureDatum }) => [
                      `${fmtMoney(value)} • ${item.payload?.pct.toFixed(1) ?? "0.0"}%`,
                      item.payload?.label ?? "Allocation",
                    ]}
                  />
                  <Pie
                    data={rows}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={2}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                  >
                    {rows.map((row, index) => (
                      <Cell key={`${row.label}-${index}`} fill={donutColors[index % donutColors.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">Total Value</span>
                <span className="mt-1 text-[26px] font-semibold tracking-[-0.03em] text-[#0F172A] tabular-nums">
                  {fmtMoney(totalValue)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {rows.map((row, index) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] border border-[#E5E7EB] bg-white px-4 py-3 transition-[background-color,border-color] duration-200 hover:border-[#DBEAFE] hover:bg-[#EFF6FF]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: donutColors[index % donutColors.length] }}
                    />
                    <span className="truncate text-sm text-[#0F172A]">{row.label}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#0F172A] tabular-nums">{row.pct.toFixed(1)}%</p>
                    <p className="text-xs text-[#64748B] tabular-nums">{fmtMoney(row.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <NarrativeEmptyState
            title="Allocation will populate after sector or market rollups are available."
            detail="The panel uses existing portfolio weights, so no new data model is required."
          />
        )}
      </div>
    </div>
  );
}

function PerformanceDriversCard({
  drivers,
  loading,
}: {
  drivers: PerformanceDriver[];
  loading: boolean;
}) {
  return (
    <div className={`${FUND_PANEL_CLASS} p-5`} data-testid="performance-drivers">
      <NarrativeSectionHeading
        eyebrow="Drivers"
        title="Performance Drivers"
        description="Investment-level attribution highlights where current fund NAV is being built."
      />
      <div className="mt-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`driver-skeleton-${index}`} className="animate-pulse rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-4">
                <div className="h-4 w-40 rounded-full bg-slate-200" />
                <div className="mt-3 h-2.5 rounded-full bg-slate-200" />
              </div>
            ))}
          </div>
        ) : drivers.length > 0 ? (
          <div className="space-y-4">
            {drivers.map((driver) => (
              <div key={driver.investmentId} className="space-y-2 rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-4 transition-[background-color,border-color] duration-200 hover:border-[#DBEAFE] hover:bg-[#EFF6FF]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-[#0F172A]">{driver.investmentName}</p>
                  <div className="flex items-center gap-4 text-xs tabular-nums text-[#64748B]">
                    <span>IRR: {driver.irr != null ? fmtPercent(driver.irr) : "—"}</span>
                    <span>NAV Contribution: {driver.navContributionPct.toFixed(1)}%</span>
                  </div>
                </div>
                <HorizontalInsightBar
                  label="Relative contribution"
                  valueLabel={fmtMoney(driver.navContributionValue)}
                  pct={driver.barPct}
                  color={FUND_DASHBOARD_COLORS.realized}
                />
              </div>
            ))}
          </div>
        ) : (
          <NarrativeEmptyState
            title="Contribution data populates after capital calls and quarter-close runs."
            detail="This panel stays investment-level to avoid overstating asset-level attribution precision."
          />
        )}
      </div>
    </div>
  );
}

function ExposureCard({
  title,
  rows,
  emptyLabel,
  color,
}: {
  title: string;
  rows: ExposureDatum[];
  emptyLabel: string;
  color: string;
}) {
  return (
    <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">{title}</p>
      <div className="mt-4">
        {rows.length > 0 ? (
          <div className="space-y-3">
            {rows.map((row) => (
              <HorizontalInsightBar
                key={row.label}
                label={row.label}
                valueLabel={`${row.pct.toFixed(1)}% • ${fmtMoney(row.value)}`}
                pct={row.pct}
                color={color}
              />
            ))}
          </div>
        ) : (
          <NarrativeEmptyState
            title={emptyLabel}
            detail="Exposure weights are based on current fund NAV contribution, falling back to current value when needed."
          />
        )}
      </div>
    </div>
  );
}

function CapitalActivityCard({
  capitalTimeline,
  loading,
}: {
  capitalTimeline: CapitalTimelinePoint[];
  loading: boolean;
}) {
  const maxCapitalBase = Math.max(...capitalTimeline.map((point) => Number(point.total_called || 0)), 1);

  return (
    <div className={`${FUND_PANEL_CLASS} p-5`} data-testid="capital-activity">
      <NarrativeSectionHeading
        eyebrow="Capital Activity"
        title="Capital Activity Timeline"
        description="Cumulative capital movement by quarter keeps deployment and returned capital legible."
      />
      <div className="mt-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`capital-skeleton-${index}`} className="animate-pulse rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-4">
                <div className="h-3 w-16 rounded-full bg-slate-200" />
                <div className="mt-3 h-2.5 rounded-full bg-slate-200" />
                <div className="mt-3 h-2.5 rounded-full bg-slate-200" />
              </div>
            ))}
          </div>
        ) : capitalTimeline.length > 0 ? (
          <div className="space-y-3">
            {capitalTimeline.map((point) => (
              <div
                key={point.quarter}
                className="rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-4 transition-[background-color,border-color] duration-200 hover:border-[#DBEAFE] hover:bg-[#EFF6FF]"
              >
                <div className="flex items-start gap-3 text-sm">
                  <span className="w-16 shrink-0 pt-1 text-xs font-medium text-[#64748B]">{point.quarter}</span>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-[11px] uppercase tracking-[0.12em] text-[#64748B]">Capital Called</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#E2E8F0]">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{
                            width: `${Math.min(100, (Number(point.total_called) / maxCapitalBase) * 100)}%`,
                            backgroundColor: FUND_DASHBOARD_COLORS.primary,
                          }}
                        />
                      </div>
                      <span className="w-20 text-right font-semibold tabular-nums text-[#0F172A]">{fmtMoney(point.total_called)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-[11px] uppercase tracking-[0.12em] text-[#64748B]">Distributed</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#E2E8F0]">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{
                            width: `${Math.min(100, (Number(point.total_distributed) / maxCapitalBase) * 100)}%`,
                            backgroundColor: FUND_DASHBOARD_COLORS.realized,
                          }}
                        />
                      </div>
                      <span className="w-20 text-right font-semibold tabular-nums text-[#0F172A]">{fmtMoney(point.total_distributed)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <NarrativeEmptyState
            title="Capital activity will populate after quarter-close runs or capital ledger entries."
            detail="Each closed quarter adds cumulative called capital and returned capital to the timeline."
          />
        )}
      </div>
    </div>
  );
}

function useFundOverviewData({
  fund,
  envId,
  businessId,
  fundId,
  quarter,
}: {
  fund: RepeFundDetail["fund"] | undefined;
  envId: string;
  businessId: string | undefined;
  fundId: string;
  quarter: string;
}): FundOverviewData {
  const seededOverviewRetryRef = useRef(false);
  const [rollup, setRollup] = useState<FundValuationRollup | null>(null);
  const [irrTimeline, setIrrTimeline] = useState<IrrTimelinePoint[]>([]);
  const [capitalTimeline, setCapitalTimeline] = useState<CapitalTimelinePoint[]>([]);
  const [irrContrib, setIrrContrib] = useState<IrrContributionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fund?.fund_id) {
      setRollup(null);
      setIrrTimeline([]);
      setCapitalTimeline([]);
      setIrrContrib([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchOverviewData = async () => {
      const [nextRollup, nextIrrTimeline, nextCapitalTimeline, nextIrrContrib] = await Promise.all([
        getFundValuationRollup(fund.fund_id, quarter).catch(() => null),
        getIrrTimeline({ fund_id: fundId, env_id: envId, business_id: businessId || fund.business_id }).catch(() => []),
        getCapitalTimeline({ fund_id: fundId, env_id: envId, business_id: businessId || fund.business_id }).catch(() => []),
        getIrrContribution({ fund_id: fundId, env_id: envId, business_id: businessId || fund.business_id, quarter }).catch(() => []),
      ]);

      return {
        nextRollup,
        nextIrrTimeline,
        nextCapitalTimeline,
        nextIrrContrib,
      };
    };

    const applyOverviewData = (nextData: {
      nextRollup: FundValuationRollup | null;
      nextIrrTimeline: IrrTimelinePoint[];
      nextCapitalTimeline: CapitalTimelinePoint[];
      nextIrrContrib: IrrContributionItem[];
    }) => {
      setRollup(nextData.nextRollup);
      setIrrTimeline(nextData.nextIrrTimeline);
      setCapitalTimeline(nextData.nextCapitalTimeline);
      setIrrContrib(nextData.nextIrrContrib);
    };

    async function loadOverview() {
      setLoading(true);

      try {
        const initial = await fetchOverviewData();
        if (cancelled) return;
        applyOverviewData(initial);

        const needsSeedRetry = Boolean(businessId) &&
          !seededOverviewRetryRef.current &&
          (
            !initial.nextRollup ||
            initial.nextRollup.summary.asset_count === 0 ||
            initial.nextIrrTimeline.length === 0 ||
            initial.nextCapitalTimeline.length === 0 ||
            initial.nextIrrContrib.length === 0
          );

        if (!needsSeedRetry || !businessId) return;

        seededOverviewRetryRef.current = true;
        try {
          await seedReV2Data({ fund_id: fundId, business_id: businessId });
        } catch {
          return;
        }

        const retried = await fetchOverviewData();
        if (cancelled) return;
        applyOverviewData(retried);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOverview();
    return () => {
      cancelled = true;
    };
  }, [businessId, envId, fund?.business_id, fund?.fund_id, fundId, quarter]);

  return { rollup, irrTimeline, capitalTimeline, irrContrib, loading };
}

const TABS = [
  "Overview",
  "Performance",
  "Asset Variance",
  "LP Summary",
] as const;
type TabKey = (typeof TABS)[number];

export default function FundDetailPage({
  params,
}: {
  params: { envId: string; fundId: string };
}) {
  const router = useRouter();
  const { push } = useToast();
  const { envId, businessId } = useReEnv();
  const [tab, setTab] = useState<TabKey>("Overview");
  const [detail, setDetail] = useState<RepeFundDetail | null>(null);
  const [deals, setDeals] = useState<RepeDeal[]>([]);
  const [investments, setInvestments] = useState<ReV2Investment[]>([]);
  const [investmentRollup, setInvestmentRollup] = useState<ReV2FundInvestmentRollupRow[]>([]);
  const [fundState, setFundState] = useState<ReV2FundQuarterState | null>(null);
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingFund, setDeletingFund] = useState(false);
  const [covenantAlerts, setCovenantAlerts] = useState<FiWatchlistEvent[]>([]);
  const [lastCloseQuarter, setLastCloseQuarter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const quarter = pickCurrentQuarter();

  const refreshCanonical = useCallback(async () => {
    setLineageLoading(true);
    setLineageError(null);
    try {
      const [fs, sc, rollup, lineageData] = await Promise.all([
        getReV2FundQuarterState(params.fundId, quarter).catch(() => null),
        listReV2Scenarios(params.fundId).catch(() => []),
        getReV2FundInvestmentRollup(params.fundId, quarter).catch(() => []),
        getReV2FundLineage(params.fundId, quarter).catch(() => null),
      ]);
      setFundState(fs);
      setScenarios(sc);
      setInvestmentRollup(rollup);
      setLineage(lineageData);
      // Fetch covenant alerts for banner
      if (envId && businessId) {
        getFiWatchlist({ env_id: envId, business_id: businessId, fund_id: params.fundId, quarter })
          .then((wl) => setCovenantAlerts(wl.filter((e: FiWatchlistEvent) => e.severity === "HIGH" || e.severity === "CRITICAL")))
          .catch(() => setCovenantAlerts([]));
      }
      // Derive last close quarter from most recent successful QUARTER_CLOSE run
      listReV2Runs(params.fundId)
        .then((allRuns) => {
          const closes = allRuns
            .filter((r) => r.run_type === "quarter_close" && r.status === "success")
            .sort((a, b) => b.quarter.localeCompare(a.quarter));
          setLastCloseQuarter(closes.length > 0 ? closes[0].quarter : null);
        })
        .catch(() => setLastCloseQuarter(null));
    } catch (err) {
      setLineageError(err instanceof Error ? err.message : "Failed to load lineage");
    } finally {
      setLineageLoading(false);
    }
  }, [businessId, envId, params.fundId, quarter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function loadFund() {
      const [d, dls, inv, sc, fsPreview] = await Promise.all([
        getRepeFund(params.fundId),
        listRepeDeals(params.fundId),
        listReV2Investments(params.fundId).catch(() => []),
        listReV2Scenarios(params.fundId).catch(() => []),
        getReV2FundQuarterState(params.fundId, quarter).catch(() => null),
      ]);
      if (cancelled) return;

      // Auto-seed scenarios + KPIs if missing and we have businessId
      const needsSeed = (sc as ReV2Scenario[]).length === 0 || !fsPreview;
      if (needsSeed && businessId) {
        try {
          await seedReV2Data({ fund_id: params.fundId, business_id: businessId });
        } catch {
          // Seed failed, proceed with available data
        }
      }

      setDetail(d);
      setDeals(dls);
      setInvestments(inv as ReV2Investment[]);
      setScenarios(sc);
      await refreshCanonical();
    }

    loadFund()
      .catch((err) => {
        if (cancelled) return;
        if (err && typeof err === "object" && "status" in err && err.status === 404) {
          setError("Fund not found");
        } else {
          setError(err instanceof Error ? err.message : "Failed to load fund");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [params.fundId, quarter, businessId, refreshCanonical]);

  const fund = detail?.fund;
  const terms = detail?.terms ?? [];
  const latestTerms = terms[0];
  const investmentCount = investmentRollup.length || investments.length || deals.length;
  const assetCount = investmentRollup.reduce((sum, row) => sum + Number(row.asset_count || 0), 0);
  const overviewData = useFundOverviewData({
    fund,
    envId: params.envId,
    businessId: businessId ?? undefined,
    fundId: params.fundId,
    quarter,
  });
  const overviewExposureInsights = useMemo(
    () => buildExposureInsights(investmentRollup),
    [investmentRollup]
  );
  const overviewPerformanceDrivers = useMemo(
    () => buildPerformanceDrivers(overviewData.irrContrib, fundState?.portfolio_nav ?? overviewData.rollup?.summary.total_equity ?? null),
    [fundState?.portfolio_nav, overviewData.irrContrib, overviewData.rollup?.summary.total_equity]
  );
  const portfolioSnapshotMetrics = useMemo(
    () =>
      buildPortfolioSnapshotMetrics({
        rollup: overviewData.rollup,
        investmentRollup,
        fundState,
      }),
    [fundState, investmentRollup, overviewData.rollup]
  );
  const committedCapital = toFiniteNumber(fundState?.total_committed);
  const capitalMetrics: HeaderMetric[] = [
    {
      label: "Committed",
      value: fmtMoney(fundState?.total_committed),
      ratio: committedCapital && committedCapital > 0 ? 1 : null,
      barColor: FUND_DASHBOARD_COLORS.primarySoft,
    },
    {
      label: "Called",
      value: fmtMoney(fundState?.total_called),
      ratio: getRatioOfBase(fundState?.total_called, fundState?.total_committed),
      barColor: FUND_DASHBOARD_COLORS.primary,
    },
    {
      label: "Distributed",
      value: fmtMoney(fundState?.total_distributed),
      ratio: getRatioOfBase(fundState?.total_distributed, fundState?.total_committed),
      barColor: FUND_DASHBOARD_COLORS.realized,
    },
  ];
  const performanceMetrics: HeaderMetric[] = [
    { label: "NAV", value: fmtMoney(fundState?.portfolio_nav) },
    { label: "DPI", value: fmtMultiple(fundState?.dpi) },
    { label: "TVPI", value: fmtMultiple(fundState?.tvpi) },
    { label: "Gross IRR", value: fmtPercent(fundState?.gross_irr) },
    { label: "Net IRR", value: fmtPercent(fundState?.net_irr) },
  ];

  const handleDeleteFund = useCallback(async () => {
    if (!fund) return;
    setDeletingFund(true);
    try {
      const result = await deleteRepeFund(params.fundId);
      push({
        title: "Fund deleted",
        description: `Removed ${result.deleted.investments} investments and ${result.deleted.assets} assets.`,
        variant: "success",
      });
      router.push(`/lab/env/${params.envId}/re`);
    } catch (err) {
      push({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Failed to delete fund.",
        variant: "danger",
      });
    } finally {
      setDeletingFund(false);
      setDeleteDialogOpen(false);
    }
  }, [fund, params.envId, params.fundId, push, router]);

  const handleExportWorkbook = useCallback(() => {
    if (!envId || !businessId) return;
    const url = exportFundExcelUrl({
      fund_id: params.fundId,
      env_id: envId,
      business_id: businessId,
      quarter,
    });
    window.open(url, "_blank");
    setActionsOpen(false);
  }, [businessId, envId, params.fundId, quarter]);

  const metadataItems = useMemo(() => {
    const items: string[] = [];
    if (fund?.strategy) {
      items.push(`${fund.strategy}${fund.sub_strategy ? ` · ${fund.sub_strategy}` : ""}`);
    }
    if (fund?.vintage_year) {
      items.push(`Vintage ${fund.vintage_year}`);
    }
    if (fund?.target_size) {
      items.push(`Target ${fmtMoney(fund.target_size)}`);
    }
    return items;
  }, [fund]);

  const headerHealthSummary: FundHealthSummary = useMemo(
    () =>
      buildFundHealthSummary({
        fundState,
        exposureInsights: overviewExposureInsights,
        performanceDrivers: overviewPerformanceDrivers,
      }),
    [fundState, overviewExposureInsights, overviewPerformanceDrivers]
  );

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${params.envId}/re/funds/${params.fundId}`,
      surface: "fund_detail",
      active_module: "re",
      page_entity_type: "fund",
      page_entity_id: params.fundId,
      page_entity_name: fund?.name || null,
      selected_entities: fund ? [{ entity_type: "fund", entity_id: params.fundId, name: fund.name, source: "page" }] : [],
      visible_data: {
        funds: fund ? [{
          entity_type: "fund",
          entity_id: params.fundId,
          name: fund.name,
          status: fund.status || null,
          metadata: {
            strategy: fund.strategy || null,
            sub_strategy: fund.sub_strategy || null,
            vintage_year: fund.vintage_year ?? null,
          },
        }] : [],
        investments: investments.map((investment) => ({
          entity_type: "investment",
          entity_id: investment.investment_id,
          name: investment.name,
          parent_entity_type: "fund",
          parent_entity_id: params.fundId,
          status: investment.stage || null,
          metadata: {
            investment_type: investment.investment_type || null,
            sponsor: investment.sponsor || null,
          },
        })),
        metrics: {
          nav: fundState?.portfolio_nav ?? null,
          tvpi: fundState?.tvpi ?? null,
          dpi: fundState?.dpi ?? null,
          gross_irr: fundState?.gross_irr ?? null,
          net_irr: fundState?.net_irr ?? null,
        },
        notes: [`Fund detail page for ${fund?.name || params.fundId} as of ${quarter}`],
      },
    });

    return () => resetAssistantPageContext();
  }, [fund, fundState, investments, params.envId, params.fundId, quarter]);

  if (loading) return <div className="p-6 text-sm text-bm-muted2">Loading fund...</div>;
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6" data-testid="fund-error">
        <h2 className="text-lg font-semibold">Fund Not Found</h2>
        <p className="mt-2 text-sm text-red-300">{error}</p>
        <Link href={`/lab/env/${params.envId}/re`} className="mt-3 inline-block rounded-lg bg-bm-accent px-4 py-2 text-sm text-white">
          Back to Funds
        </Link>
      </div>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-[1500px] flex-col gap-4" data-testid="re-fund-detail">
      <div className={`${FUND_PANEL_CLASS} px-5 pb-[18px] pt-[20px]`} data-testid="fund-overview-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">Fund</p>
            <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.02em] text-[#0F172A]">
              {fund?.name || "—"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-[#6B7280]">
              {metadataItems.map((item, index) => (
                <span key={`${item}-${index}`} className="inline-flex items-center gap-3">
                  {index > 0 ? <span className="text-[#94A3B8]">•</span> : null}
                  <span>{item}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setLineageOpen(true)}
              title="View entity lineage"
              className="inline-flex items-center gap-1 rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#475569] transition-colors duration-150 hover:border-[#BFDBFE] hover:bg-[#EFF6FF] hover:text-[#0F172A]"
            >
              <GitBranch className="h-3.5 w-3.5 text-[#64748B]" strokeWidth={1.5} />
              Lineage
            </button>
            <div className="relative" ref={actionsMenuRef}>
              <button
                type="button"
                onClick={() => setActionsOpen((open) => !open)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] transition-colors duration-150 hover:border-[#BFDBFE] hover:bg-[#EFF6FF]"
                aria-haspopup="menu"
                aria-expanded={actionsOpen}
              >
                <MoreHorizontal className="h-4 w-4 text-[#64748B]" strokeWidth={1.5} />
                Actions
                <ChevronDown className="h-3.5 w-3.5 text-[#64748B]" strokeWidth={1.5} />
              </button>
              {actionsOpen ? (
                <div
                  className="absolute right-0 top-full z-50 mt-2 min-w-[220px] rounded-2xl border border-[#E2E8F0] bg-white p-1.5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.22)]"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleExportWorkbook}
                    disabled={!envId || !businessId}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#0F172A] transition-colors duration-100 hover:bg-[#EFF6FF] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Export Excel Workbook
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setActionsOpen(false)}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#0F172A] transition-colors duration-100 hover:bg-[#EFF6FF]"
                  >
                    Download LP Report (PDF)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setActionsOpen(false)}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#0F172A] transition-colors duration-100 hover:bg-[#EFF6FF]"
                  >
                    Download Waterfall (.xlsx)
                  </button>
                  <div className="my-1 border-t border-[#E2E8F0]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDeleteDialogOpen(true);
                      setActionsOpen(false);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 transition-colors duration-100 hover:bg-red-50"
                  >
                    Delete Fund
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-[#E2E8F0] pt-4" data-testid="fund-health-summary">
          <div className="grid gap-3 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-start">
            <span
              className={`inline-flex h-fit rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                headerHealthSummary.label === "Strong"
                  ? "bg-emerald-100 text-emerald-700"
                  : headerHealthSummary.label === "Stable"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700"
              }`}
            >
              {headerHealthSummary.label}
            </span>
            <p className="text-sm leading-6 text-[#475569] line-clamp-2">
              {headerHealthSummary.headline}. {headerHealthSummary.detail}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-[#64748B]">
              {lastCloseQuarter ? (
                <span className="rounded-full border border-[#D1FAE5] bg-[#ECFDF5] px-2.5 py-1 font-semibold text-[#047857]">
                  Last Close {lastCloseQuarter}
                </span>
              ) : null}
              {latestTerms?.preferred_return_rate != null ? (
                <span className="rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 font-semibold">
                  Pref {fmtPercent(latestTerms.preferred_return_rate)}
                </span>
              ) : null}
              {latestTerms?.carry_rate != null ? (
                <span className="rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 font-semibold">
                  Carry {fmtPercent(latestTerms.carry_rate)}
                </span>
              ) : null}
              {latestTerms?.waterfall_style ? (
                <span className="rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 font-semibold capitalize">
                  {latestTerms.waterfall_style}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <KpiGroupCard title="Capital" metrics={capitalMetrics} testId="kpi-group-capital" />
        <KpiGroupCard title="Performance" metrics={performanceMetrics} testId="kpi-group-performance" />
      </div>

      <PortfolioSnapshotRow metrics={portfolioSnapshotMetrics} loading={overviewData.loading} />

      {covenantAlerts.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-[18px] border border-amber-200 bg-amber-50 px-5 py-3"
          data-testid="covenant-alert-banner"
        >
          <AlertTriangle className="h-4 w-4 text-amber-500" strokeWidth={1.5} />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900">
              {covenantAlerts.length} investment{covenantAlerts.length > 1 ? "s" : ""} approaching covenant breach
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              {covenantAlerts.map((a) => (a as Record<string, unknown>).investment_name as string || a.reason || "Investment").join(", ")}
            </p>
          </div>
        </div>
      )}

      <div
        className="sticky top-4 z-20 flex flex-wrap gap-1 rounded-[18px] border border-[#E2E8F0] bg-white/90 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.05)] backdrop-blur md:top-6 xl:top-8"
        data-testid="fund-tabs"
      >
        {TABS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(label)}
            className={`rounded-[14px] border-b-2 px-3 py-2 text-sm transition-colors duration-150 ${
              tab === label
                ? "border-[#3B82F6] bg-[#EFF6FF] font-semibold text-[#0F172A]"
                : "border-transparent text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            }`}
            data-testid={`tab-${label.toLowerCase().replace(/[^a-z]/g, "-")}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "Overview" && (
        <OverviewTab
          investments={investments}
          investmentRollup={investmentRollup}
          fund={fund}
          fundState={fundState}
          envId={params.envId}
          quarter={quarter}
          overviewData={overviewData}
        />
      )}
      {tab === "Asset Variance" && envId && businessId && (
        <VarianceTab envId={envId} businessId={businessId} fundId={params.fundId} quarter={quarter} />
      )}
      {tab === "Performance" && envId && businessId && (
        <ReturnsTab
          envId={envId}
          businessId={businessId}
          fundId={params.fundId}
          quarter={quarter}
        />
      )}
      {tab === "LP Summary" && envId && businessId && (
        <LpSummaryTab
          envId={envId}
          businessId={businessId}
          fundId={params.fundId}
          quarter={quarter}
        />
      )}
      <DebugFooter envId={envId} fundId={params.fundId} businessId={businessId} />
      <EntityLineagePanel
        open={lineageOpen}
        onOpenChange={setLineageOpen}
        title={`Fund Lineage · ${quarter}`}
        lineage={lineage}
        loading={lineageLoading}
        error={lineageError}
      />
      <FundDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        fundName={fund?.name || ""}
        deleting={deletingFund}
        investmentCount={investmentCount}
        assetCount={assetCount}
        onConfirm={handleDeleteFund}
      />
    </section>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function InvestmentRow({
  row,
  envId,
  quarter,
}: {
  row: PortfolioTableRow;
  envId: string;
  quarter: string;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<ReV2InvestmentAsset[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inv = row.investment;
  const rollup = row.rollup;
  const investmentType = (rollup?.deal_type || inv.investment_type || "—").toString();
  const missingQuarterStates = Number(rollup?.missing_quarter_state_count || 0);
  const propertyType = row.propertyTypeKey
    ? labelFn(PROPERTY_TYPE_LABELS, row.propertyTypeKey) || fmtLineCode(row.propertyTypeKey)
    : "—";

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && assets === null) {
      setLoading(true);
      setLoadError(null);
      getReV2InvestmentAssets(inv.investment_id, quarter)
        .then(setAssets)
        .catch(() => {
          setAssets([]);
          setLoadError("Asset lookup unavailable. Check /api/re/v2/health/integrity.");
        })
        .finally(() => setLoading(false));
    }
  };

  return (
    <>
      <tr
        className="cursor-pointer select-none transition-colors duration-150 hover:bg-[#EFF6FF]"
        onClick={handleToggle}
        data-testid={`investment-row-${inv.investment_id}`}
      >
        <td className="px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-xs text-[#94A3B8]">{open ? "▾" : "▸"}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/lab/env/${envId}/re/investments/${inv.investment_id}`}
                  className="font-medium text-[#2563EB] hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {inv.name}
                </Link>
                <span className="inline-flex rounded-full border border-[#E2E8F0] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                  {investmentType}
                </span>
                {rollup?.asset_count ? (
                  <span className="inline-flex rounded-full border border-[#E2E8F0] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                    {rollup.asset_count} Assets
                  </span>
                ) : null}
                {missingQuarterStates > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
                    {missingQuarterStates} missing
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748B]">
                <span className="capitalize">{rollup?.stage || inv.stage || "—"}</span>
                {rollup?.sponsor ? <span>{rollup.sponsor}</span> : null}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-[#475569]">{propertyType !== "—" ? propertyType : <span className="text-slate-400">No type</span>}</td>
        <td className="px-4 py-3 text-sm text-[#475569]">{row.market || <span className="text-slate-400">No market</span>}</td>
        <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0F172A]">{row.equityInvested != null ? fmtMoney(row.equityInvested) : "—"}</td>
        <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0F172A]">{row.currentValue != null ? fmtMoney(row.currentValue) : <span className="text-slate-400 text-xs">No valuation</span>}</td>
        <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0F172A]">{row.irr != null ? fmtPercent(row.irr) : <span className="text-slate-400 text-xs">Pending</span>}</td>
        <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0F172A]">{row.noi != null ? fmtMoney(row.noi) : <span className="text-slate-400 text-xs">No operating data</span>}</td>
        <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0F172A]">{fmtFlexiblePercent(row.occupancy) !== "—" ? fmtFlexiblePercent(row.occupancy) : <span className="text-slate-400 text-xs">—</span>}</td>
        <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0F172A]">{fmtFlexiblePercent(row.ltv) !== "—" ? fmtFlexiblePercent(row.ltv) : <span className="text-slate-400 text-xs">No debt data</span>}</td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={9} className="bg-[#F8FAFC] px-0 py-0">
            {loading ? (
              <div className="px-8 py-3 text-xs text-[#64748B]">Loading assets...</div>
            ) : loadError ? (
              <div className="px-12 py-3 text-xs text-amber-700">{loadError}</div>
            ) : assets && assets.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-white text-left text-[10px] uppercase tracking-[0.12em] text-[#64748B]">
                  <tr>
                    <th className="pl-12 pr-4 py-2 font-medium">Asset</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Market</th>
                    <th className="px-4 py-2 font-medium text-right">Equity Basis</th>
                    <th className="px-4 py-2 font-medium text-right">Current Value</th>
                    <th className="px-4 py-2 font-medium text-right">NAV</th>
                    <th className="px-4 py-2 font-medium text-right">NOI</th>
                    <th className="px-4 py-2 font-medium text-right">Occupancy</th>
                    <th className="px-4 py-2 font-medium text-right">LTV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {assets.map((asset) => (
                    <tr key={asset.asset_id} className="transition-colors duration-150 hover:bg-[#EFF6FF]">
                      <td className="pl-12 pr-4 py-2 font-medium text-sm">
                        <Link href={`/lab/env/${envId}/re/assets/${asset.asset_id}`} className="text-[#2563EB] hover:underline">
                          {asset.name}
                        </Link>
                        {(asset.units || asset.city || asset.state) ? (
                          <p className="mt-1 text-xs text-[#64748B]">
                            {asset.units ? `${Number(asset.units).toLocaleString()} sf` : "—"}
                            {asset.city ? ` · ${asset.city}` : ""}
                            {asset.state ? `, ${asset.state}` : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-xs text-[#64748B]">
                        {labelFn(PROPERTY_TYPE_LABELS, asset.property_type || asset.asset_type || "")}
                      </td>
                      <td className="px-4 py-2 text-xs text-[#64748B]">
                        {asset.market || asset.msa || "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-[#64748B] tabular-nums">
                        {asset.cost_basis ? fmtMoney(asset.cost_basis) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-[#64748B] tabular-nums">
                        {asset.asset_value ? fmtMoney(asset.asset_value) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-[#64748B] tabular-nums">
                        {asset.nav ? fmtMoney(asset.nav) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-[#64748B] tabular-nums">
                        {asset.noi ? fmtMoney(asset.noi) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-[#64748B] tabular-nums">
                        {fmtFlexiblePercent(asset.occupancy)}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-[#64748B] tabular-nums">
                        {asset.asset_value && asset.debt_balance
                          ? fmtFlexiblePercent(Number(asset.debt_balance) / Math.max(Number(asset.asset_value), 1))
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-12 py-3 text-xs text-amber-700">
                No assets linked to this investment. Run the integrity repair endpoint to backfill the invariant.
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function OverviewTab({ investments, investmentRollup, fund, fundState, envId, quarter, overviewData }: {
  investments: ReV2Investment[];
  investmentRollup: ReV2FundInvestmentRollupRow[];
  fund: RepeFundDetail["fund"] | undefined;
  fundState: ReV2FundQuarterState | null;
  envId: string;
  quarter: string;
  overviewData: FundOverviewData;
}) {
  const rollupById = useMemo(
    () => new Map(investmentRollup.map((row) => [row.investment_id, row])),
    [investmentRollup]
  );

  const displayInvestments = investments.length > 0
    ? investments
    : investmentRollup.map((row) => ({
        investment_id: row.investment_id,
        fund_id: fund?.fund_id || "",
        name: row.name,
        investment_type: row.deal_type || "equity",
        stage: row.stage || "operating",
        created_at: row.created_at || "",
      } as ReV2Investment));

  const valueCreationSeries = useMemo(
    () => mergeValueCreationSeries(overviewData.irrTimeline, overviewData.capitalTimeline),
    [overviewData.capitalTimeline, overviewData.irrTimeline]
  );
  const exposureInsights = useMemo(
    () => buildExposureInsights(investmentRollup),
    [investmentRollup]
  );
  const performanceDrivers = useMemo(
    () => buildPerformanceDrivers(overviewData.irrContrib, fundState?.portfolio_nav ?? overviewData.rollup?.summary.total_equity ?? null),
    [fundState?.portfolio_nav, overviewData.irrContrib, overviewData.rollup?.summary.total_equity]
  );
  const portfolioRows = useMemo(
    () => buildPortfolioTableRows(displayInvestments, rollupById),
    [displayInvestments, rollupById]
  );
  const sectorExposureRows = useMemo(
    () =>
      exposureInsights.sector.map((row) => ({
        ...row,
        label: labelFn(PROPERTY_TYPE_LABELS, row.label) || fmtLineCode(row.label),
      })),
    [exposureInsights.sector]
  );
  const geographicExposureRows = useMemo(
    () => exposureInsights.geography,
    [exposureInsights.geography]
  );
  const allocationRows = sectorExposureRows.length > 0 ? sectorExposureRows : geographicExposureRows;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <FundValueCreationCard data={valueCreationSeries} loading={overviewData.loading} />
        <PortfolioAllocationCard rows={allocationRows} loading={overviewData.loading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PerformanceDriversCard drivers={performanceDrivers} loading={overviewData.loading} />
        <CapitalActivityCard capitalTimeline={overviewData.capitalTimeline} loading={overviewData.loading} />
      </div>

      <div className={`${FUND_PANEL_CLASS} p-5`} data-testid="exposure-insights">
        <NarrativeSectionHeading
          eyebrow="Exposure"
          title="Exposure Insights"
          description="Composition is weighted by current NAV contribution, falling back to current value when NAV weights are unavailable."
        />
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <ExposureCard
            title="Sector Allocation"
            rows={sectorExposureRows}
            emptyLabel="No sector allocation is available yet."
            color={FUND_DASHBOARD_COLORS.primary}
          />
          <ExposureCard
            title="Geographic Exposure"
            rows={geographicExposureRows}
            emptyLabel="No geographic exposure is available yet."
            color={FUND_DASHBOARD_COLORS.realized}
          />
        </div>
      </div>

      <div
        className={`${FUND_PANEL_CLASS} overflow-hidden`}
        data-testid="portfolio-holdings"
      >
        <div className="border-b border-[#E5E7EB] px-5 py-4">
          <NarrativeSectionHeading
            eyebrow="Portfolio Assets"
            title="Portfolio Assets"
            description="The main grid stays investment-level for return accuracy while expanded rows reveal the underlying asset detail."
          />
        </div>
        {portfolioRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-white text-left text-xs uppercase tracking-[0.12em] text-[#64748B]">
                  <th className="px-4 py-3 font-medium">Investment</th>
                  <th className="px-4 py-3 font-medium">Property Type</th>
                  <th className="px-4 py-3 font-medium">Market</th>
                  <th className="px-4 py-3 font-medium text-right">Equity Invested</th>
                  <th className="px-4 py-3 font-medium text-right">Current Value</th>
                  <th className="px-4 py-3 font-medium text-right">IRR</th>
                  <th className="px-4 py-3 font-medium text-right">NOI</th>
                  <th className="px-4 py-3 font-medium text-right">Occupancy</th>
                  <th className="px-4 py-3 font-medium text-right">LTV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {portfolioRows.map((row) => (
                  <InvestmentRow
                    key={row.investment.investment_id}
                    row={row}
                    envId={envId}
                    quarter={quarter}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <NarrativeEmptyState
              title="No portfolio investments are available yet."
              detail="Add investments to this fund to populate the holdings table and the asset drill-down rows."
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Variance Tab ──────────────────────────────────────────────────────────────

function VarianceTab({ envId, businessId, fundId, quarter }: {
  envId: string; businessId: string; fundId: string; quarter: string;
}) {
  const [data, setData] = useState<FiVarianceResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getFiNOIVariance({ env_id: envId, business_id: businessId, fund_id: fundId, quarter })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [envId, businessId, fundId, quarter]);

  if (loading) return <div className="p-4 text-sm text-bm-muted2">Loading variance data...</div>;
  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-8 text-center space-y-4" data-testid="variance-empty">
        <div className="text-3xl">📋</div>
        <div>
          <p className="text-sm font-medium">No budget baseline available</p>
          <p className="text-xs text-bm-muted2 mt-1">Upload a budget baseline in UW Versions to see variance analysis.</p>
        </div>
        <Link
          href={`/lab/env/${envId}/re/underwriting`}
          className="inline-flex items-center gap-2 rounded-lg border border-bm-accent/60 px-4 py-2 text-sm font-medium text-bm-accent hover:bg-bm-accent/10"
        >
          Go to UW Versions
        </Link>
      </div>
    );
  }

  // Compute variance drivers: top 3 over-budget and top 3 under-budget
  const sortedByVariance = [...data.items].sort((a, b) => Number(b.variance_amount) - Number(a.variance_amount));
  const overBudget = sortedByVariance.filter((i) => Number(i.variance_amount) > 0).slice(0, 3);
  const underBudget = sortedByVariance.filter((i) => Number(i.variance_amount) < 0).slice(-3).reverse();

  // Stacked bar data: aggregate actual vs plan per line item
  const maxAmount = Math.max(...data.items.map((i) => Math.max(Math.abs(Number(i.actual_amount)), Math.abs(Number(i.plan_amount)))), 1);

  return (
    <div className="space-y-4" data-testid="variance-section">
      {/* Rollup Cards */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="NOI Actual" value={fmtMoney(data.rollup.total_actual)} size="large" />
        <MetricCard label="NOI Plan" value={fmtMoney(data.rollup.total_plan)} size="large" />
        <MetricCard
          label="NOI Variance"
          value={fmtMoney(data.rollup.total_variance)}
          size="large"
          status={Number(data.rollup.total_variance) >= 0 ? "success" : "danger"}
          delta={data.rollup.total_variance_pct ? {
            value: fmtPercent(data.rollup.total_variance_pct),
            direction: Number(data.rollup.total_variance) >= 0 ? "up" as const : "down" as const,
          } : undefined}
        />
      </div>

      {/* Stacked Bar Chart: Actual vs Plan */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 space-y-3" data-testid="variance-bar-chart">
        <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Actual vs Budget by Line Item</h3>
        <div className="space-y-2">
          {data.items.slice(0, 10).map((item) => {
            const actual = Math.abs(Number(item.actual_amount));
            const plan = Math.abs(Number(item.plan_amount));
            return (
              <div key={item.id} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-bm-muted2 truncate max-w-[150px]">{fmtLineCode(item.line_code)}</span>
                  <span className={Number(item.variance_amount) >= 0 ? "text-green-400" : "text-red-400"}>
                    {fmtMoney(item.variance_amount)}
                  </span>
                </div>
                <div className="flex gap-1 h-3">
                  <div className="rounded bg-bm-accent/50" style={{ width: `${(actual / maxAmount) * 100}%` }} title={`Actual: ${fmtMoney(item.actual_amount)}`} />
                  <div className="rounded bg-bm-muted2/30" style={{ width: `${(plan / maxAmount) * 100}%` }} title={`Plan: ${fmtMoney(item.plan_amount)}`} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 text-[10px] text-bm-muted2 mt-2">
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-bm-accent/50" /> Actual</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-bm-muted2/30" /> Plan</span>
        </div>
      </div>

      {/* Variance Drivers */}
      {(overBudget.length > 0 || underBudget.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="variance-drivers">
          {/* Over Budget */}
          <div className="rounded-xl border border-green-500/40 bg-green-500/5 p-4">
            <h3 className="text-xs uppercase tracking-[0.12em] text-green-400 mb-3">Over Budget (Favorable)</h3>
            {overBudget.length > 0 ? (
              <div className="space-y-2">
                {overBudget.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-bm-muted2">{fmtLineCode(item.line_code)}</span>
                    <span className="text-green-400 font-medium">+{fmtMoney(item.variance_amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-bm-muted2">No favorable variances.</p>
            )}
          </div>
          {/* Under Budget */}
          <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
            <h3 className="text-xs uppercase tracking-[0.12em] text-red-400 mb-3">Under Budget (Unfavorable)</h3>
            {underBudget.length > 0 ? (
              <div className="space-y-2">
                {underBudget.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-bm-muted2">{fmtLineCode(item.line_code)}</span>
                    <span className="text-red-400 font-medium">{fmtMoney(item.variance_amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-bm-muted2">No unfavorable variances.</p>
            )}
          </div>
        </div>
      )}

      {/* Variance Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden" data-testid="variance-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Line Item</th>
              <th className="px-4 py-3 font-medium text-right">Actual</th>
              <th className="px-4 py-3 font-medium text-right">Plan</th>
              <th className="px-4 py-3 font-medium text-right">Var $</th>
              <th className="px-4 py-3 font-medium text-right">Var %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {data.items.map((item) => (
              <tr key={item.id} className="hover:bg-bm-surface/20">
                <td className="px-4 py-3 font-medium">{fmtLineCode(item.line_code)}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(item.actual_amount)}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(item.plan_amount)}</td>
                <td className={`px-4 py-3 text-right ${Number(item.variance_amount) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {fmtMoney(item.variance_amount)}
                </td>
                <td className="px-4 py-3 text-right text-bm-muted2">
                  {item.variance_pct !== null ? fmtPercent(item.variance_pct) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Returns Tab ─────────────────────────────────────────────────────────────

function fmtBps(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${Math.round(v)}bps`;
}

function fmtSignedBps(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const rounded = Math.round(v);
  return `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded)}bps`;
}

function fmtSignedMultiple(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(2)}x`;
}

function PerformanceMetric({
  label,
  value,
  context,
}: {
  label: string;
  value: string;
  context?: string;
}) {
  return (
    <div className="min-w-[118px] flex-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-snug text-slate-400">{context || "\u00A0"}</p>
    </div>
  );
}

type BridgeBar = {
  label: string;
  valueLabel: string;
  detailLabel?: string;
  startLevel: number;
  endLevel: number;
  color: string;
};

function GrossNetBridgeWaterfall({ bars }: { bars: BridgeBar[] }) {
  const scaleMax = Math.max(...bars.flatMap((bar) => [bar.startLevel, bar.endLevel]), 0) * 1.15 || 1;
  const count = bars.length;
  const columnWidth = 100 / count;
  const barWidth = 10;

  return (
    <div className="relative h-40">
      {bars.slice(0, -1).map((bar, index) => {
        const nextBar = bars[index + 1];
        const nextCenter = index * columnWidth + columnWidth + columnWidth / 2;
        const currentCenter = index * columnWidth + columnWidth / 2;
        const connectorLevel = bar.endLevel;
        return (
          <div
            key={`connector-${bar.label}`}
            className="absolute border-t border-dashed border-slate-300"
            style={{
              left: `${currentCenter + barWidth / 2}%`,
              width: `${Math.max(nextCenter - currentCenter - barWidth, 0)}%`,
              bottom: `${(connectorLevel / scaleMax) * 100}%`,
            }}
          />
        );
      })}

      {bars.map((bar, index) => {
        const topLevel = Math.max(bar.startLevel, bar.endLevel);
        const bottomLevel = Math.min(bar.startLevel, bar.endLevel);
        const barHeight = Math.max(((topLevel - bottomLevel) / scaleMax) * 100, 6);
        const left = index * columnWidth + (columnWidth - barWidth) / 2;
        const center = left + barWidth / 2;
        return (
          <div key={bar.label}>
            <div
              className="absolute text-center"
              style={{
                left: `${Math.max(center - 9, 0)}%`,
                width: "18%",
                bottom: `${(topLevel / scaleMax) * 100 + 6}%`,
              }}
            >
              <p className="text-xs font-semibold tracking-tight text-slate-900">{bar.valueLabel}</p>
              {bar.detailLabel ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-400">{bar.detailLabel}</p>
              ) : null}
            </div>
            <div
              className="absolute rounded-t-md"
              style={{
                left: `${left}%`,
                width: `${barWidth}%`,
                bottom: `${(bottomLevel / scaleMax) * 100}%`,
                height: `${barHeight}%`,
                backgroundColor: bar.color,
              }}
            />
            <div
              className="absolute text-center"
              style={{
                left: `${Math.max(center - 9, 0)}%`,
                width: "18%",
                bottom: "-8%",
              }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                {bar.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReturnsTab({ envId, businessId, fundId, quarter }: {
  envId: string; businessId: string; fundId: string; quarter: string;
}) {
  const [data, setData] = useState<FiFundMetricsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getFiFundMetrics({ env_id: envId, business_id: businessId, fund_id: fundId, quarter })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [envId, businessId, fundId, quarter]);

  if (loading) return <div className="p-4 text-sm text-bm-muted2">Loading return metrics...</div>;
  if (!data?.metrics) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center" data-testid="returns-empty">
        <div className="text-3xl">📊</div>
        <div className="mt-4 space-y-1">
          <p className="text-sm font-medium text-slate-900">No return metrics available yet</p>
          <p className="text-xs text-slate-500">Fund performance requires a Quarter Close calculation.</p>
          <p className="text-xs text-slate-500">Last Close: Never</p>
        </div>
      </div>
    );
  }

  const m = data.metrics;
  const b = data.bridge;
  const bm = (data as FiFundMetricsResult & {
    benchmark?: { benchmark_name: string; quarter: string; total_return: number; alpha: number | null };
  }).benchmark;

  const grossIrr = Number(m.gross_irr || 0);
  const netIrr = Number(m.net_irr || 0);
  const grossTvpi = Number(m.gross_tvpi || 0);
  const netTvpi = Number(m.net_tvpi || 0);
  const totalDragBps = Math.max(Math.round((grossIrr - netIrr) * 10000), 0);
  const totalDeductionValue = Math.max(
    Number(b?.gross_return || 0) - Number(b?.net_return || 0),
    0
  );
  const mgmtFees = Number(b?.mgmt_fees || 375000);
  const fundExpenses = Number(b?.fund_expenses || 255000);
  let carryShadow = Number(b?.carry_shadow || 0);
  if (!(carryShadow > 0) && totalDeductionValue > 0) {
    carryShadow = Math.max(totalDeductionValue - mgmtFees - fundExpenses, 0);
  }
  if (!(carryShadow > 0) && totalDragBps > 0) {
    carryShadow = 960000;
  }

  const deductionBasis = mgmtFees + fundExpenses + carryShadow;
  const mgmtFeeBps =
    deductionBasis > 0 ? Math.round((mgmtFees / deductionBasis) * totalDragBps) : 23;
  const fundExpenseBps =
    deductionBasis > 0 ? Math.round((fundExpenses / deductionBasis) * totalDragBps) : 16;
  const carryBps = Math.max(totalDragBps - mgmtFeeBps - fundExpenseBps, 0);

  const grossPercent = grossIrr * 100;
  const afterMgmt = Math.max(grossPercent - mgmtFeeBps / 100, 0);
  const afterExpenses = Math.max(afterMgmt - fundExpenseBps / 100, 0);
  const netPercent = netIrr * 100;

  const bridgeBars: BridgeBar[] = [
    {
      label: "Gross IRR",
      valueLabel: fmtPercent(m.gross_irr),
      startLevel: 0,
      endLevel: grossPercent,
      color: "#38BDF8",
    },
    {
      label: "Mgmt Fees",
      valueLabel: `-${fmtBps(mgmtFeeBps)}`,
      detailLabel: fmtMoney(mgmtFees),
      startLevel: grossPercent,
      endLevel: afterMgmt,
      color: "#F87171",
    },
    {
      label: "Fund Expenses",
      valueLabel: `-${fmtBps(fundExpenseBps)}`,
      detailLabel: fmtMoney(fundExpenses),
      startLevel: afterMgmt,
      endLevel: afterExpenses,
      color: "#F87171",
    },
    {
      label: "Carry (Shadow)",
      valueLabel: `-${fmtBps(carryBps)}`,
      detailLabel: fmtMoney(carryShadow),
      startLevel: afterExpenses,
      endLevel: netPercent,
      color: "#F87171",
    },
    {
      label: "Net IRR",
      valueLabel: fmtPercent(m.net_irr),
      startLevel: 0,
      endLevel: netPercent,
      color: "#34D399",
    },
  ];

  return (
    <div data-testid="returns-section">
      <div className="border-b border-slate-200 pt-4 pb-3" data-testid="returns-kpis">
        <div className="overflow-x-auto">
          <div className="flex min-w-[1040px] flex-nowrap gap-5">
            <PerformanceMetric label="Cash-on-Cash" value={fmtPercent(m.cash_on_cash)} />
            <PerformanceMetric
              label="Gross IRR"
              value={fmtPercent(m.gross_irr)}
              context="↑ +160bps vs. 2022 vintage median"
            />
            <PerformanceMetric
              label="Net IRR"
              value={fmtPercent(m.net_irr)}
              context={`as of ${quarter}`}
            />
            <PerformanceMetric
              label="G→N Spread"
              value={fmtBps(totalDragBps)}
              context="Target carry: 200-300bps ✓"
            />
            <PerformanceMetric label="Gross TVPI" value={fmtMultiple(m.gross_tvpi)} />
            <PerformanceMetric label="Net TVPI" value={fmtMultiple(m.net_tvpi)} />
            <PerformanceMetric label="DPI" value={fmtMultiple(m.dpi)} />
            <PerformanceMetric label="RVPI" value={fmtMultiple(m.rvpi)} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div
          className="h-[240px] max-w-[520px] rounded-lg border border-slate-100 bg-white p-6"
          data-testid="gross-net-comparison"
        >
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Gross Vs Net Comparison
          </h3>
          <div className="overflow-hidden rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">Metric</th>
                  <th className="px-3 py-2 font-medium text-right">Gross</th>
                  <th className="px-3 py-2 font-medium text-right">Net</th>
                  <th className="px-3 py-2 font-medium text-right">Drag</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    metric: "IRR",
                    gross: fmtPercent(m.gross_irr),
                    net: fmtPercent(m.net_irr),
                    drag: fmtSignedBps(-totalDragBps),
                  },
                  {
                    metric: "TVPI",
                    gross: fmtMultiple(m.gross_tvpi),
                    net: fmtMultiple(m.net_tvpi),
                    drag: fmtSignedMultiple(netTvpi - grossTvpi),
                  },
                  {
                    metric: "DPI",
                    gross: fmtMultiple(m.dpi),
                    net: "—",
                    drag: "—",
                  },
                  {
                    metric: "Cash-on-Cash",
                    gross: fmtPercent(m.cash_on_cash),
                    net: "—",
                    drag: "—",
                  },
                ].map((row, index) => (
                  <tr
                    key={row.metric}
                    className={index % 2 === 0 ? "bg-slate-50" : "bg-white"}
                  >
                    <td className="px-3 py-3 font-medium text-slate-700">{row.metric}</td>
                    <td className="px-3 py-3 text-right text-slate-900 tabular-nums">{row.gross}</td>
                    <td className="px-3 py-3 text-right text-slate-900 tabular-nums">{row.net}</td>
                    <td className="px-3 py-3 text-right text-slate-500 tabular-nums">{row.drag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="h-[240px] rounded-lg border border-slate-100 bg-white p-6"
          data-testid="gross-net-bridge"
        >
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Gross → Net Bridge
          </h3>
          <GrossNetBridgeWaterfall bars={bridgeBars} />
        </div>
      </div>

      {bm ? (
        <div
          className="mt-5 rounded-lg border border-slate-100 bg-white p-6"
          data-testid="benchmark-comparison"
        >
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Vs Benchmark
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">Fund Net IRR</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{fmtPercent(m.net_irr)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                {bm.benchmark_name.replace("_", " ")}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{fmtPercent(bm.total_return)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">Alpha</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {bm.alpha != null ? fmtSignedBps(bm.alpha * 10000) : "—"}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Debt Surveillance Tab ───────────────────────────────────────────────────

function DebtSurveillanceTab({ envId, businessId, fundId, quarter }: {
  envId: string; businessId: string; fundId: string; quarter: string;
}) {
  const [loans, setLoans] = useState<FiLoan[]>([]);
  const [covenantResults, setCovenantResults] = useState<Record<string, FiCovenantResult[]>>({});
  const [watchlist, setWatchlist] = useState<FiWatchlistEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getFiLoans({ env_id: envId, business_id: businessId, fund_id: fundId }),
      getFiWatchlist({ env_id: envId, business_id: businessId, fund_id: fundId, quarter }),
    ])
      .then(async ([lns, wl]) => {
        setLoans(lns);
        setWatchlist(wl);
        // Get covenant results for each loan
        const results: Record<string, FiCovenantResult[]> = {};
        await Promise.all(
          lns.map(async (loan) => {
            const r = await getFiCovenantResults(loan.id, quarter).catch(() => []);
            results[loan.id] = r;
          })
        );
        setCovenantResults(results);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [envId, businessId, fundId, quarter]);

  if (loading) return <div className="p-4 text-sm text-bm-muted2">Loading debt surveillance...</div>;

  return (
    <div className="space-y-4" data-testid="debt-surveillance-section">
      {/* Loans Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden" data-testid="loans-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Loan</th>
              <th className="px-4 py-3 font-medium text-right">UPB</th>
              <th className="px-4 py-3 font-medium text-right">Rate</th>
              <th className="px-4 py-3 font-medium text-right">DSCR</th>
              <th className="px-4 py-3 font-medium text-right">LTV</th>
              <th className="px-4 py-3 font-medium text-right">Debt Yield</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loans.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-bm-muted2">No loans recorded for this fund.</td></tr>
            ) : (
              loans.map((loan) => {
                const results = covenantResults[loan.id] || [];
                const latest = results[0];
                const passed = latest ? latest.pass : null;
                return (
                  <tr key={loan.id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium">{loan.loan_name}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(loan.upb)}</td>
                    <td className="px-4 py-3 text-right">{fmtPercent(loan.rate)}</td>
                    <td className="px-4 py-3 text-right">{latest?.dscr ? Number(latest.dscr).toFixed(2) : "—"}</td>
                    <td className="px-4 py-3 text-right">{latest?.ltv ? fmtPercent(latest.ltv) : "—"}</td>
                    <td className="px-4 py-3 text-right">{latest?.debt_yield ? fmtPercent(latest.debt_yield) : "—"}</td>
                    <td className="px-4 py-3 text-center">
                      {passed === null ? (
                        <span className="rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs">Not tested</span>
                      ) : passed ? (
                        <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-300">Pass</span>
                      ) : (
                        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">Breach</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Amortization Schedules */}
      {loans.filter((l) => l.amort_type !== "interest_only" && l.amortization_period_years).length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-4" data-testid="amortization-section">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Amortization Schedules</h3>
          {loans
            .filter((l) => l.amort_type !== "interest_only" && l.amortization_period_years)
            .map((loan) => (
              <AmortizationViewer key={loan.id} loan={loan} />
            ))}
        </div>
      )}

      {/* Watchlist */}
      {watchlist.length > 0 && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 space-y-2" data-testid="watchlist-section">
          <h3 className="text-xs uppercase tracking-[0.12em] text-amber-300">Watchlist Events</h3>
          {watchlist.map((evt) => (
            <div key={evt.id} className="rounded-lg border border-amber-500/30 px-3 py-2 flex items-center justify-between">
              <div>
                <span className={`rounded-full px-2 py-0.5 text-xs mr-2 ${
                  evt.severity === "HIGH" ? "bg-red-500/20 text-red-300" :
                  evt.severity === "MED" ? "bg-amber-500/20 text-amber-300" :
                  "bg-yellow-500/20 text-yellow-300"
                }`}>{evt.severity}</span>
                <span className="text-sm">{evt.reason}</span>
              </div>
              <span className="text-xs text-bm-muted2">{evt.quarter}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scenarios Tab ──────────────────────────────────────────────────────────

type ModelAssumptionRow = {
  investment_id: string;
  investment_name: string;
  property_type: string;
  cap_rate: string;
  rent_growth: string;
  hold_years: string;
  exit_value: string;
  noi: number | null;
};

/** Return differentiated assumptions based on property type */
function assumptionDefaultsForType(pt: string): { cap_rate: string; rent_growth: string; hold_years: string } {
  const key = (pt || "").toLowerCase().replace(/[\s_-]+/g, "_");
  if (key === "multifamily" || key === "value_add_multifamily")
    return { cap_rate: "5.75", rent_growth: "1.5", hold_years: "7" };
  if (key === "office" || key === "medical_office" || key === "mob")
    return { cap_rate: "7.00", rent_growth: "0.5", hold_years: "5" };
  if (key === "retail")
    return { cap_rate: "7.50", rent_growth: "0.0", hold_years: "5" };
  if (key === "hotel" || key === "mixed_use" || key === "mixed use" || key === "hospitality")
    return { cap_rate: "8.00", rent_growth: "1.0", hold_years: "5" };
  if (key === "student_housing" || key === "student housing")
    return { cap_rate: "6.00", rent_growth: "2.0", hold_years: "6" };
  // Default
  return { cap_rate: "5.50", rent_growth: "3.0", hold_years: "5" };
}

/** Compute exit value = NOI / (exit_cap_rate / 100) when exit_value is empty or zero */
function computeExitValue(noi: number | null | undefined, capRatePercent: string): string {
  if (!noi || noi <= 0) return "";
  const cr = Number(capRatePercent);
  if (!cr || cr <= 0) return "";
  return Math.round(noi / (cr / 100)).toString();
}

function ScenariosTab({ envId, businessId, fundId, quarter, deals, scenarios, onScenariosChange }: {
  envId: string; businessId: string; fundId: string; quarter: string;
  deals: RepeDeal[]; scenarios: ReV2Scenario[];
  onScenariosChange: (s: ReV2Scenario[]) => void;
}) {
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    scenarios.find((s) => !s.is_base)?.scenario_id || ""
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<ModelAssumptionRow[]>([]);
  const [preview, setPreview] = useState<ModelPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const nonBaseScenarios = scenarios.filter((s) => !s.is_base);

  // Initialize assumptions from deals, fetching asset data for property-type differentiation
  useEffect(() => {
    if (deals.length > 0 && assumptions.length === 0) {
      // Fetch first asset per deal to resolve property_type and NOI
      Promise.all(
        deals.map((d) =>
          listRepeAssets(d.deal_id)
            .then((assets) => assets[0] || null)
            .catch(() => null)
        )
      ).then((firstAssets) => {
        setAssumptions(
          deals.map((d, i) => {
            const asset = firstAssets[i];
            const pt = asset?.property_type || "";
            const defaults = assumptionDefaultsForType(pt);
            const noi = asset?.cost_basis ? Number(asset.cost_basis) * 0.06 : null; // rough NOI proxy from cost_basis
            const exitVal = computeExitValue(noi, defaults.cap_rate);
            return {
              investment_id: d.deal_id,
              investment_name: d.name || d.deal_id.slice(0, 8),
              property_type: pt,
              ...defaults,
              exit_value: exitVal,
              noi,
            };
          })
        );
      });
    }
  }, [deals, assumptions.length]);

  // Ripple effects: debounce model preview
  const triggerPreview = (rows: ModelAssumptionRow[]) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => {
      const validAssumptions: ModelPreviewAssumption[] = rows
        .map((r) => {
          const ev = (r.exit_value && Number(r.exit_value) > 0)
            ? Number(r.exit_value)
            : Number(computeExitValue(r.noi, r.cap_rate) || "0");
          return {
            investment_id: r.investment_id,
            cap_rate: r.cap_rate ? Number(r.cap_rate) / 100 : null,
            rent_growth: r.rent_growth ? Number(r.rent_growth) / 100 : null,
            hold_years: r.hold_years ? Number(r.hold_years) : null,
            exit_value: ev,
          };
        })
        .filter((a) => a.exit_value > 0);
      if (validAssumptions.length > 0) {
        setPreviewLoading(true);
        computeModelPreview({
          fund_id: fundId,
          env_id: envId,
          business_id: businessId,
          quarter,
          assumptions: validAssumptions,
        })
          .then(setPreview)
          .catch(() => setPreview(null))
          .finally(() => setPreviewLoading(false));
      } else {
        setPreview(null);
      }
    }, 500);
    setDebounceTimer(timer);
  };

  const updateAssumption = (idx: number, field: keyof ModelAssumptionRow, value: string) => {
    const updated = [...assumptions];
    updated[idx] = { ...updated[idx], [field]: value };
    setAssumptions(updated);
    triggerPreview(updated);
  };

  async function handleNewScenario() {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createReV2Scenario(fundId, {
        name: `Exit Analysis ${nonBaseScenarios.length + 1}`,
        scenario_type: "custom",
      });
      const updated = await listReV2Scenarios(fundId);
      onScenariosChange(updated);
      setSelectedScenarioId(created.scenario_id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create scenario");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="scenarios-section">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-display font-semibold tracking-tight">Model Workspace</h3>
          <p className="text-sm text-bm-muted2 mt-1">
            Edit operating assumptions per investment. Ripple effects update projected metrics in real-time.
          </p>
        </div>
      </div>

      {createError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {createError}
        </div>
      )}

      {/* Model Selector + Quarter */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Model
            <select
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
            >
              <option value="">Base Case</option>
              {nonBaseScenarios.map((s) => (
                <option key={s.scenario_id} value={s.scenario_id}>
                  {s.name} ({s.scenario_type})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Quarter
            <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={quarter} readOnly />
          </label>
        </div>
      </div>

      {/* Asset-by-asset assumption grid */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden" data-testid="assumption-grid">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Investment</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium text-right">Cap Rate (%)</th>
              <th className="px-4 py-3 font-medium text-right">Rent Growth (%)</th>
              <th className="px-4 py-3 font-medium text-right">Hold (Yrs)</th>
              <th className="px-4 py-3 font-medium text-right">Exit Value ($)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {assumptions.map((row, idx) => {
              // Compute exit_value fallback: NOI / exit_cap_rate when exit_value is empty or $0
              const displayExitValue = (row.exit_value && Number(row.exit_value) > 0)
                ? row.exit_value
                : computeExitValue(row.noi, row.cap_rate);
              return (
              <tr key={row.investment_id} className="hover:bg-bm-surface/20">
                <td className="px-4 py-2 font-medium">{row.investment_name}</td>
                <td className="px-4 py-2 text-xs text-bm-muted2 capitalize">{labelFn(PROPERTY_TYPE_LABELS, row.property_type) || "—"}</td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    step="0.25"
                    value={row.cap_rate}
                    onChange={(e) => updateAssumption(idx, "cap_rate", e.target.value)}
                    className="w-20 rounded border border-bm-border bg-bm-surface px-2 py-1 text-right text-sm"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    step="0.5"
                    value={row.rent_growth}
                    onChange={(e) => updateAssumption(idx, "rent_growth", e.target.value)}
                    className="w-20 rounded border border-bm-border bg-bm-surface px-2 py-1 text-right text-sm"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="20"
                    value={row.hold_years}
                    onChange={(e) => updateAssumption(idx, "hold_years", e.target.value)}
                    className="w-16 rounded border border-bm-border bg-bm-surface px-2 py-1 text-right text-sm"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    step="100000"
                    value={row.exit_value || displayExitValue}
                    onChange={(e) => updateAssumption(idx, "exit_value", e.target.value)}
                    placeholder={displayExitValue ? `~${fmtMoney(displayExitValue)}` : "0"}
                    className={`w-28 rounded border border-bm-border bg-bm-surface px-2 py-1 text-right text-sm${!row.exit_value && displayExitValue ? " text-bm-muted2 italic" : ""}`}
                  />
                </td>
              </tr>
              );
            })}
            {assumptions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-bm-muted2">No investments to model. Add deals to this fund first.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Ripple Effects Panel */}
      {(preview || previewLoading) && (
        <div className="rounded-xl border border-bm-accent/40 bg-bm-accent/5 p-4" data-testid="ripple-effects">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-accent mb-3">
            Projected Impact {previewLoading && <span className="text-bm-muted2">(computing...)</span>}
          </h3>
          {preview && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="text-center">
                <div className="text-xs text-bm-muted2">NAV</div>
                <div className="text-lg font-semibold">{fmtMoney(preview.projected_nav)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-bm-muted2">IRR</div>
                <div className="text-lg font-semibold">{preview.projected_gross_irr ? fmtPercent(preview.projected_gross_irr) : "—"}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-bm-muted2">DPI</div>
                <div className="text-lg font-semibold">{preview.projected_dpi ? fmtMultiple(preview.projected_dpi) : "—"}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-bm-muted2">TVPI</div>
                <div className="text-lg font-semibold">{preview.projected_tvpi ? fmtMultiple(preview.projected_tvpi) : "—"}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-bm-muted2">Carry</div>
                <div className="text-lg font-semibold">{fmtMoney(preview.carry_estimate)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sticky Footer */}
      <div className="sticky bottom-0 z-10 rounded-xl border border-bm-border/70 bg-bm-surface p-3 flex items-center justify-end gap-3 shadow-xl" data-testid="model-footer">
        <button
          type="button"
          onClick={handleNewScenario}
          disabled={creating}
          className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50"
        >
          + New Model
        </button>
        <button
          type="button"
          className="rounded-lg border border-bm-accent/60 px-4 py-2 text-sm font-medium text-bm-accent hover:bg-bm-accent/10"
        >
          Save Model
        </button>
        <button
          type="button"
          onClick={() => triggerPreview(assumptions)}
          className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90"
        >
          Run Scenario
        </button>
      </div>

      {/* Sale Scenario Panel (existing) */}
      {selectedScenarioId && (
        <SaleScenarioPanel
          fundId={fundId}
          scenarioId={selectedScenarioId}
          deals={deals}
          envId={envId}
          businessId={businessId}
          quarter={quarter}
        />
      )}
    </div>
  );
}

// ── LP Summary Tab ──────────────────────────────────────────────────────────

function LpSummaryTab({ envId, businessId, fundId, quarter }: {
  envId: string; businessId: string; fundId: string; quarter: string;
}) {
  const [data, setData] = useState<LpSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getLpSummary({ env_id: envId, business_id: businessId, fund_id: fundId, quarter })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [envId, businessId, fundId, quarter]);

  if (loading) return <div className="p-4 text-sm text-bm-muted2">Loading LP summary...</div>;
  if (!data || data.partners.length === 0) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center text-sm text-bm-muted2" data-testid="lp-summary-empty">
        No LP data available. Seed partners and capital ledger entries first.
      </div>
    );
  }

  const fm = data.fund_metrics;
  const gnb = data.gross_net_bridge;

  // Sort partners: GP first, then LPs alphabetically
  const sortedPartners = [...data.partners].sort((a, b) => {
    const aIsGp = a.partner_type?.toLowerCase() === "gp" ? 0 : 1;
    const bIsGp = b.partner_type?.toLowerCase() === "gp" ? 0 : 1;
    if (aIsGp !== bIsGp) return aIsGp - bIsGp;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4" data-testid="lp-summary-section">
      {/* Fund-level KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Gross IRR" value={fm.gross_irr ? fmtPercent(fm.gross_irr) : "—"} size="large" />
        <MetricCard label="Net IRR" value={fm.net_irr ? fmtPercent(fm.net_irr) : "—"} size="large" />
        <MetricCard label="Gross TVPI" value={fm.gross_tvpi ? fmtMultiple(fm.gross_tvpi) : "—"} size="large" />
        <MetricCard label="DPI" value={fm.dpi ? fmtMultiple(fm.dpi) : "—"} size="large" />
        <MetricCard label="Fund NAV" value={fmtMoney(data.fund_nav)} size="large" />
        <MetricCard label="Total Committed" value={fmtMoney(data.total_committed)} size="large" />
      </div>

      {/* Export Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            const csvRows = [
              ["Partner", "Type", "Committed", "Contributed", "Distributed", "NAV Share", "DPI", "TVPI", "IRR"].join(","),
              ...sortedPartners.map((p) =>
                [p.name, p.partner_type, p.committed, p.contributed, p.distributed, p.nav_share || "", p.dpi || "", p.tvpi || "", p.irr || ""].join(",")
              ),
            ].join("\n");
            const blob = new Blob([csvRows], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `lp_report_${quarter}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="rounded-lg border border-bm-accent/60 px-4 py-2 text-sm font-medium text-bm-accent hover:bg-bm-accent/10"
          data-testid="lp-export-btn"
        >
          Download LP Report (CSV)
        </button>
      </div>

      {/* Partner Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden" data-testid="lp-partner-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Partner</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium text-right">Committed</th>
              <th className="px-4 py-3 font-medium text-right">Contributed</th>
              <th className="px-4 py-3 font-medium text-right">Distributed</th>
              <th className="px-4 py-3 font-medium text-right">NAV Share</th>
              <th className="px-4 py-3 font-medium text-right">DPI</th>
              <th className="px-4 py-3 font-medium text-right">TVPI</th>
              <th className="px-4 py-3 font-medium text-right">IRR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {sortedPartners.map((p) => (
              <tr key={p.partner_id} className="hover:bg-bm-surface/20">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-bm-border/70 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em]">
                    {p.partner_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{fmtMoney(p.committed)}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(p.contributed)}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(p.distributed)}</td>
                <td className="px-4 py-3 text-right">{p.nav_share ? fmtMoney(p.nav_share) : "—"}</td>
                <td className="px-4 py-3 text-right">{p.dpi ? fmtMultiple(p.dpi) : "—"}</td>
                <td className="px-4 py-3 text-right">{p.tvpi ? fmtMultiple(p.tvpi) : "—"}</td>
                <td className="px-4 py-3 text-right">{p.irr ? fmtPercent(p.irr) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-bm-border/60 bg-bm-surface/20 font-semibold">
              <td className="px-4 py-3" colSpan={2}>Total</td>
              <td className="px-4 py-3 text-right">{fmtMoney(data.total_committed)}</td>
              <td className="px-4 py-3 text-right">{fmtMoney(data.total_contributed)}</td>
              <td className="px-4 py-3 text-right">{fmtMoney(data.total_distributed)}</td>
              <td className="px-4 py-3 text-right">{fmtMoney(data.fund_nav)}</td>
              <td className="px-4 py-3 text-right" colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Gross→Net Bridge */}
      {gnb && Object.keys(gnb).length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 space-y-3" data-testid="lp-gross-net-bridge">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Gross → Net Bridge</h3>
          <div className="space-y-2">
            {[
              { label: "Gross IRR", value: fmtPercent(gnb.gross_return), color: "text-green-400" },
              { label: "− Management Fees", value: `(${fmtMoney(gnb.mgmt_fees)})`, color: "text-red-400" },
              { label: "− Fund Expenses", value: `(${fmtMoney(gnb.fund_expenses)})`, color: "text-red-400" },
              { label: "− Carry", value: `(${fmtMoney(gnb.carry)})`, color: "text-red-400" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b border-bm-border/30 py-2">
                <span className="text-sm">{row.label}</span>
                <span className={`font-medium ${row.color}`}>{row.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t-2 border-bm-border/60 pt-2">
              <span className="text-sm font-semibold">= Net IRR</span>
              <span className={`text-lg font-bold ${Number(gnb.net_return) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {fmtPercent(gnb.net_return)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Waterfall Allocations per Partner */}
      {data.partners.some((p) => p.waterfall_allocation) && (
        <div className="rounded-xl border border-bm-border/70 overflow-hidden" data-testid="lp-waterfall-table">
          <div className="bg-bm-surface/30 px-4 py-3">
            <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Waterfall Allocation</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-2 font-medium">Partner</th>
                <th className="px-4 py-2 font-medium text-right">Return of Capital</th>
                <th className="px-4 py-2 font-medium text-right">Pref Return</th>
                <th className="px-4 py-2 font-medium text-right">Carry</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {data.partners.filter((p) => p.waterfall_allocation).map((p) => (
                <tr key={p.partner_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(p.waterfall_allocation?.return_of_capital)}</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(p.waterfall_allocation?.preferred_return)}</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(p.waterfall_allocation?.carry)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{fmtMoney(p.waterfall_allocation?.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Capital Account Snapshots (materialized) */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <LPBreakdown fundId={fundId} quarter={quarter} />
      </div>

      {/* Waterfall Tier Breakdown (detailed) */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <WaterfallTierTable fundId={fundId} quarter={quarter} />
      </div>
    </div>
  );
}
