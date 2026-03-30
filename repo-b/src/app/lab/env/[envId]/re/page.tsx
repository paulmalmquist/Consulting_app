"use client";

import React from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  deleteRepeFund,
  getReV2EnvironmentPortfolioKpis,
  getReV2FundQuarterState,
  getAssetMapPoints,
  RepeFund,
  ReV2EnvironmentPortfolioKpis,
  ReV2FundQuarterState,
  type AssetMapResponse,
} from "@/lib/bos-api";
import { listReV1Funds } from "@/lib/bos-api";
import { FundDeleteDialog } from "@/components/repe/FundDeleteDialog";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { KpiStrip } from "@/components/repe/asset-cockpit/KpiStrip";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { fmtMoney, fmtMultiple, fmtPct } from '@/lib/format-utils';
import { PortfolioAssetMap } from "@/components/repe/portfolio/PortfolioAssetMap";
import { TrendLineChart } from "@/components/charts";
import { CHART_COLORS } from "@/components/charts/chart-theme";
import { useRepeFiltersOptional } from "@/components/repe/workspace/RepeFilterContext";
import {
  RepeIndexScaffold,
  reIndexNumericCellClass,
  reIndexPrimaryCellClass,
  reIndexTableBodyClass,
  reIndexTableClass,
  reIndexTableHeadRowClass,
  reIndexTableRowClass,
  reIndexTableShellClass,
} from "@/components/repe/RepeIndexScaffold";

function pickCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / 3);
  return `${now.getUTCFullYear()}Q${q}`;
}

function fmtMoneyOrDash(v: string | number | undefined | null): string {
  if (v == null) return "—";
  return fmtMoney(v);
}

const createFundActionClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border border-bm-border/70 bg-bm-surface/20 text-bm-text transition-[transform,colors,box-shadow] duration-[120ms] hover:-translate-y-[1px] hover:border-bm-border/90 hover:bg-bm-surface/35 focus-visible:outline-none focus-visible:shadow-[0_0_4px_hsl(var(--bm-accent)/0.3)] focus-visible:ring-1 focus-visible:ring-bm-ring/50";

const deleteFundActionClass =
  "h-8 w-8 rounded-full border border-bm-border/55 bg-transparent p-0 text-bm-muted2 transition-[transform,colors,box-shadow] duration-[120ms] hover:border-bm-danger/25 hover:bg-bm-danger/8 hover:text-bm-danger";

type FundRow = RepeFund & { state?: ReV2FundQuarterState | null };

type TimeMetric = "portfolio_nav" | "total_called" | "dpi" | "tvpi";
const TIME_METRIC_OPTIONS: { value: TimeMetric; label: string }[] = [
  { value: "portfolio_nav", label: "NAV" },
  { value: "total_called", label: "Called Capital" },
  { value: "dpi", label: "DPI" },
  { value: "tvpi", label: "TVPI" },
];

const FUND_COLORS = [
  CHART_COLORS.revenue,
  CHART_COLORS.noi,
  CHART_COLORS.opex,
  "#a78bfa", // violet
  "#f97316", // orange
  "#06b6d4", // cyan
];

export default function ReFundListPage() {
  const { envId, businessId } = useReEnv();
  const { push } = useToast();
  const filterCtx = useRepeFiltersOptional();
  const [funds, setFunds] = useState<FundRow[]>([]);
  const [portfolioKpis, setPortfolioKpis] = useState<ReV2EnvironmentPortfolioKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<FundRow | null>(null);
  const [deletingFundId, setDeletingFundId] = useState<string | null>(null);

  // Map data
  const [mapData, setMapData] = useState<AssetMapResponse | null>(null);
  const [mapLoading, setMapLoading] = useState(false);

  // Time series controls
  const [timeMetric, setTimeMetric] = useState<TimeMetric>("portfolio_nav");
  const [normalizeByVintage, setNormalizeByVintage] = useState(false);

  const quarter = pickCurrentQuarter();

  const refreshFunds = useCallback(async () => {
    if (!businessId && !envId) return;
    setLoading(true);
    try {
      const rows = await listReV1Funds({ env_id: envId || undefined, business_id: businessId || undefined });
      const enriched: FundRow[] = await Promise.all(
        rows.map(async (f) => {
          try {
            const state = await getReV2FundQuarterState(f.fund_id, quarter);
            return { ...f, state };
          } catch {
            return { ...f, state: null };
          }
        })
      );
      setFunds(enriched);
    } catch {
      setFunds([]);
    } finally {
      setLoading(false);
    }
  }, [businessId, envId, quarter]);

  const refreshPortfolioKpis = useCallback(async () => {
    if (!envId) {
      setPortfolioKpis(null);
      return;
    }
    try {
      setPortfolioKpis(await getReV2EnvironmentPortfolioKpis(envId, quarter));
    } catch {
      setPortfolioKpis(null);
    }
  }, [envId, quarter]);

  useEffect(() => {
    void refreshFunds();
  }, [refreshFunds]);

  useEffect(() => {
    void refreshPortfolioKpis();
  }, [refreshPortfolioKpis]);

  // Fetch asset map data
  useEffect(() => {
    if (!envId) return;
    setMapLoading(true);
    getAssetMapPoints({ env_id: envId, status: "all" })
      .then(setMapData)
      .catch(() => setMapData(null))
      .finally(() => setMapLoading(false));
  }, [envId]);

  // Populate filter options from loaded fund data
  useEffect(() => {
    if (!filterCtx || funds.length === 0) return;
    const fundOpts = funds.map((f) => ({ value: f.fund_id, label: f.name }));
    const vintageSet = new Set(funds.map((f) => f.vintage_year).filter(Boolean));
    const vintageOpts = [...vintageSet].sort().map((v) => ({ value: String(v), label: String(v) }));
    const statusSet = new Set(funds.map((f) => f.status).filter(Boolean));
    const statusOpts = [...statusSet].sort().map((s) => ({ value: s, label: s }));
    filterCtx.setOptions({ funds: fundOpts, vintages: vintageOpts, statuses: statusOpts });
  }, [funds, filterCtx]);

  // Build time series data from fund quarter states
  const timeSeriesData = useMemo(() => {
    const fundsWithState = funds.filter((f) => f.state);
    if (fundsWithState.length === 0) return [];

    // For now we have one quarter per fund (current). Build a single-point series.
    // When multi-quarter data is available, this will become a real time series.
    return fundsWithState.map((f) => ({
      fund_name: f.name,
      quarter: f.state!.quarter,
      value: Number(f.state![timeMetric] ?? 0),
    }));
  }, [funds, timeMetric]);

  // Aggregate for the TrendLineChart: reshape into { quarter, fund1, fund2, ... }
  const chartData = useMemo(() => {
    const fundsWithState = funds.filter((f) => f.state);
    if (fundsWithState.length === 0) return [];
    // Group by quarter
    const quarterMap: Record<string, Record<string, number>> = {};
    for (const f of fundsWithState) {
      const q = f.state!.quarter;
      if (!quarterMap[q]) quarterMap[q] = { quarter: 0 } as unknown as Record<string, number>;
      quarterMap[q][f.name] = Number(f.state![timeMetric] ?? 0);
    }
    return Object.entries(quarterMap).map(([q, vals]) => ({ quarter: q, ...vals }));
  }, [funds, timeMetric]);

  const chartLines = useMemo(() => {
    return funds
      .filter((f) => f.state)
      .map((f, i) => ({
        key: f.name,
        label: f.name,
        color: FUND_COLORS[i % FUND_COLORS.length],
      }));
  }, [funds]);

  // Apply filters to displayed funds
  const filteredFunds = useMemo(() => {
    if (!filterCtx) return funds;
    const { filters } = filterCtx;
    return funds.filter((f) => {
      if (filters.fund && f.fund_id !== filters.fund) return false;
      if (filters.vintage && String(f.vintage_year) !== filters.vintage) return false;
      if (filters.status && f.status !== filters.status) return false;
      return true;
    });
  }, [funds, filterCtx]);

  const base = `/lab/env/${envId}/re`;

  const handleDeleteFund = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletingFundId(deleteTarget.fund_id);
    try {
      const result = await deleteRepeFund(deleteTarget.fund_id);
      setFunds((current) => current.filter((fund) => fund.fund_id !== deleteTarget.fund_id));
      setDeleteTarget(null);
      void refreshFunds();
      void refreshPortfolioKpis();
      push({
        title: "Fund deleted",
        description: `Removed ${result.deleted.investments} investments and ${result.deleted.assets} assets.`,
        variant: "success",
      });
    } catch (err) {
      push({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Failed to delete fund.",
        variant: "danger",
      });
    } finally {
      setDeletingFundId(null);
    }
  }, [deleteTarget, push, refreshFunds, refreshPortfolioKpis]);

  return (
    <>
      <RepeIndexScaffold
        title="Fund Portfolio"
        subtitle={`As of ${quarter}`}
        action={
          <Link
            href={`${base}/funds/new`}
            className={createFundActionClass}
            aria-label="Create Fund"
            title="Create Fund"
          >
            <Plus aria-hidden="true" size={16} strokeWidth={2.1} />
            <span className="sr-only">Create Fund</span>
          </Link>
        }
        metrics={
          <KpiStrip
            variant="band"
            kpis={[
              { label: "Funds", value: portfolioKpis ? portfolioKpis.fund_count : "—" },
              { label: "Total Commitments", value: fmtMoneyOrDash(portfolioKpis?.total_commitments) },
              { label: "Portfolio NAV", value: fmtMoneyOrDash(portfolioKpis?.portfolio_nav) },
              { label: "Active Assets", value: portfolioKpis ? portfolioKpis.active_assets : "—" },
            ]}
          />
        }
        className="w-full"
      >
        {/* ── MAP + TIME SERIES (50/50) ── */}
        {!loading && funds.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            {/* Portfolio Asset Map */}
            <PortfolioAssetMap data={mapData} loading={mapLoading} />

            {/* Portfolio Time Series */}
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/[0.03] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[1.05rem] font-semibold tracking-tight text-bm-text">
                  Portfolio Trends
                </h3>
                <div className="flex items-center gap-2">
                  <select
                    value={timeMetric}
                    onChange={(e) => setTimeMetric(e.target.value as TimeMetric)}
                    className="rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1 text-xs text-bm-text focus:border-bm-accent focus:outline-none"
                  >
                    {TIME_METRIC_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-bm-muted2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={normalizeByVintage}
                      onChange={(e) => setNormalizeByVintage(e.target.checked)}
                      className="h-3 w-3 rounded border-bm-border bg-bm-surface text-bm-accent focus:ring-bm-accent"
                    />
                    Normalize
                  </label>
                </div>
              </div>
              {chartData.length > 0 && chartLines.length > 0 ? (
                <TrendLineChart
                  data={chartData}
                  lines={chartLines}
                  format={timeMetric === "dpi" || timeMetric === "tvpi" ? "number" : "dollar"}
                  height={240}
                  showLegend={chartLines.length <= 6}
                />
              ) : (
                <div className="flex items-center justify-center h-[240px] text-sm text-bm-muted2">
                  No time series data available
                </div>
              )}
            </div>
          </div>
        )}

        <section data-testid="re-fund-list">
          {loading ? (
            <div className="flex items-center justify-center rounded-xl border border-bm-border/70 py-14 text-sm text-bm-muted2">
              Loading funds...
            </div>
          ) : funds.length === 0 ? (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/10 p-8 text-center">
              <p className="text-sm text-bm-muted2">No funds yet.</p>
              <Link href={`${base}/funds/new`} className="mt-3 inline-flex text-sm text-bm-accent hover:text-bm-text">
                Create your first fund
              </Link>
            </div>
          ) : (
            <div className={reIndexTableShellClass}>
              <table className={`${reIndexTableClass} min-w-[1320px]`}>
                <thead>
                  <tr className={reIndexTableHeadRowClass}>
                    <th className="px-4 py-3 font-medium">Fund Name</th>
                    <th className="px-4 py-3 font-medium">Strategy</th>
                    <th className="px-4 py-3 font-medium">Vintage</th>
                    <th className="px-4 py-3 text-right font-medium">AUM</th>
                    <th className="px-4 py-3 text-right font-medium">NAV</th>
                    <th className="px-4 py-3 text-right font-medium">Gross IRR</th>
                    <th className="px-4 py-3 text-right font-medium">Net IRR</th>
                    <th className="px-4 py-3 text-right font-medium">DPI</th>
                    <th className="px-4 py-3 text-right font-medium">TVPI</th>
                    <th className="px-4 py-3 text-right font-medium">% Invested</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className={reIndexTableBodyClass}>
                  {filteredFunds.map((fund) => {
                    const pctInvested = fund.state?.total_committed && fund.state?.total_called
                      ? Number(fund.state.total_called) / Number(fund.state.total_committed)
                      : null;
                    return (
                    <tr key={fund.fund_id} className={reIndexTableRowClass}>
                      <td className="px-4 py-4 align-middle">
                        <Link href={`${base}/funds/${fund.fund_id}`} className={reIndexPrimaryCellClass}>
                          {fund.name}
                        </Link>
                      </td>
                      <td className="px-4 py-4 align-middle text-[12px] uppercase tracking-[0.04em] text-bm-muted2">
                        {fund.strategy?.toUpperCase() ?? "—"}
                      </td>
                      <td className="px-4 py-4 align-middle text-[12px] tracking-[0.04em] text-bm-muted2">
                        {fund.vintage_year}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtMoney(fund.state?.total_committed)}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtMoney(fund.state?.portfolio_nav)}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtPct(fund.state?.gross_irr)}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtPct(fund.state?.net_irr)}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtMultiple(fund.state?.dpi)}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtMultiple(fund.state?.tvpi)}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {pctInvested != null ? `${(pctInvested * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <span className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/18 px-2.5 py-1 text-[11px] capitalize text-bm-muted2">
                          {fund.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right align-middle">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={deleteFundActionClass}
                          onClick={() => setDeleteTarget(fund)}
                          data-testid={`delete-fund-${fund.fund_id}`}
                          aria-label={`Delete ${fund.name}`}
                          title={`Delete ${fund.name}`}
                        >
                          <Minus aria-hidden="true" size={14} strokeWidth={2.1} />
                          <span className="sr-only">Delete {fund.name}</span>
                        </Button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </RepeIndexScaffold>
      <FundDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        fundName={deleteTarget?.name || ""}
        deleting={deleteTarget ? deletingFundId === deleteTarget.fund_id : false}
        onConfirm={handleDeleteFund}
      />
    </>
  );
}
