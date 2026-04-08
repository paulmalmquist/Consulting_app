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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_TICK_STYLE, GRID_STYLE, fmtCompact } from "@/components/charts/chart-theme";
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

  const isMultiplier = timeMetric === "dpi" || timeMetric === "tvpi";

  // Cross-sectional fund comparison for the current quarter
  const comparisonBarData = useMemo(() => {
    return funds
      .filter((f) => f.state)
      .map((f, i) => ({
        name: f.name,
        value: Number(f.state![timeMetric] ?? 0),
        color: FUND_COLORS[i % FUND_COLORS.length],
      }));
  }, [funds, timeMetric]);

  // NAV-weighted average across funds
  function navWeightedAvg(field: "gross_irr" | "net_irr"): string {
    const valid = funds.filter((f) => f.state?.[field] != null && f.state?.portfolio_nav);
    if (valid.length === 0) return "—";
    const totalNav = valid.reduce((s, f) => s + Number(f.state!.portfolio_nav ?? 0), 0);
    if (totalNav === 0) return "—";
    const wtd = valid.reduce((s, f) => s + Number(f.state![field]!) * Number(f.state!.portfolio_nav ?? 0), 0) / totalNav;
    return fmtPct(wtd);
  }

  // Compute weighted portfolio-level KPIs from fund states
  const computedGrossIrr = useMemo(() => navWeightedAvg("gross_irr"), [funds]);
  const computedNetIrr = useMemo(() => navWeightedAvg("net_irr"), [funds]);

  // Sanity indicators: median gross IRR and per-fund percentile rank
  const irrSanity = useMemo(() => {
    const valid = funds
      .map((f, i) => ({ idx: i, irr: f.state?.gross_irr != null ? Number(f.state.gross_irr) : null }))
      .filter((x): x is { idx: number; irr: number } => x.irr !== null);

    if (valid.length === 0) return { median: null, ranks: {} as Record<number, string> };

    const sorted = [...valid].sort((a, b) => a.irr - b.irr);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1].irr + sorted[mid].irr) / 2
      : sorted[mid].irr;

    // Sanity check: warn if all IRRs are within 0.5% of each other
    const spread = sorted[sorted.length - 1].irr - sorted[0].irr;
    if (spread < 0.005 && valid.length > 1) {
      console.warn("[IRR sanity] All funds have near-identical gross IRR — cash flows may not be differentiated");
    }

    const ranks: Record<number, string> = {};
    valid.forEach((x) => {
      const rank = sorted.findIndex((s) => s.idx === x.idx) + 1;
      const pct = Math.round((rank / sorted.length) * 100);
      const delta = x.irr - median;
      ranks[x.idx] = delta >= 0 ? `+${(delta * 100).toFixed(1)}pp vs median` : `${(delta * 100).toFixed(1)}pp vs median`;
    });

    return { median, ranks };
  }, [funds]);

  const computedDscr = useMemo(() => {
    const withDscr = funds.filter((f) => f.state?.weighted_dscr != null && f.state?.portfolio_nav != null);
    if (withDscr.length === 0) return "—";
    // NAV-weighted portfolio DSCR: weight each fund's DSCR by its NAV
    const totalNav = withDscr.reduce((s, f) => s + Number(f.state!.portfolio_nav ?? 0), 0);
    if (totalNav <= 0) {
      // Fallback to simple average if all NAVs are zero
      const avg = withDscr.reduce((s, f) => s + Number(f.state!.weighted_dscr!), 0) / withDscr.length;
      return `${avg.toFixed(2)}x`;
    }
    const wtd = withDscr.reduce(
      (s, f) => s + Number(f.state!.weighted_dscr!) * Number(f.state!.portfolio_nav ?? 0), 0
    ) / totalNav;
    return `${wtd.toFixed(2)}x`;
  }, [funds]);

  // Signal bar data
  const signals = useMemo(() => {
    const withState = funds.filter((f) => f.state);
    const items: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }[] = [];
    if (withState.length === 0) return items;

    // Top NAV fund
    const topNav = withState.reduce((best, f) =>
      Number(f.state!.portfolio_nav ?? 0) > Number(best.state!.portfolio_nav ?? 0) ? f : best
    );
    if (topNav.state?.portfolio_nav) {
      items.push({ label: "Top NAV", value: `${topNav.name}: ${fmtMoney(topNav.state.portfolio_nav)}` });
    }

    // DSCR watch count
    const dscrWatch = withState.filter((f) => f.state!.weighted_dscr != null && Number(f.state!.weighted_dscr) < 1.25);
    if (dscrWatch.length > 0) {
      items.push({
        label: "DSCR Watch",
        value: `${dscrWatch.length} fund${dscrWatch.length > 1 ? "s" : ""} below 1.25x`,
        tone: "negative",
      });
    }

    // DPI leader
    const topDpi = withState.reduce((best, f) =>
      Number(f.state!.dpi ?? 0) > Number(best.state!.dpi ?? 0) ? f : best
    );
    if (topDpi.state?.dpi && Number(topDpi.state.dpi) > 0) {
      items.push({ label: "DPI Leader", value: `${topDpi.name}: ${fmtMultiple(topDpi.state.dpi)}`, tone: "positive" });
    }

    return items;
  }, [funds]);

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
              {
                label: "Funds",
                value: portfolioKpis ? String(portfolioKpis.fund_count) : "—",
              },
              {
                label: "Active Assets",
                value: portfolioKpis ? String(portfolioKpis.active_assets) : "—",
              },
              { label: "Total Commitments", value: fmtMoneyOrDash(portfolioKpis?.total_commitments) },
              { label: "Portfolio NAV", value: fmtMoneyOrDash(portfolioKpis?.portfolio_nav) },
              {
                label: "Gross IRR",
                value: portfolioKpis?.gross_irr != null
                  ? fmtPct(parseFloat(portfolioKpis.gross_irr))
                  : computedGrossIrr,
              },
              {
                label: "Net IRR",
                value: portfolioKpis?.net_irr != null
                  ? fmtPct(parseFloat(portfolioKpis.net_irr))
                  : computedNetIrr,
              },
              { label: "Wtd DSCR", value: computedDscr },
            ]}
          />
        }
        className="w-full"
      >
        {/* ── SIGNAL BAR ── */}
        {!loading && signals.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bm-border/20 bg-bm-surface/[0.02] px-4 py-1.5">
            <span className="text-[9px] uppercase tracking-[0.14em] text-bm-muted2 font-semibold">Signals</span>
            {signals.map((s, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs">
                <span className="text-[10px] uppercase tracking-[0.1em] text-bm-muted2">{s.label}:</span>
                <span className={`font-medium ${
                  s.tone === "positive" ? "text-green-400" :
                  s.tone === "negative" ? "text-red-400" :
                  "text-bm-text"
                }`}>{s.value}</span>
                {i < signals.length - 1 && <span className="text-bm-border/40 ml-1.5">|</span>}
              </span>
            ))}
          </div>
        )}

        {/* ── FUND COMPARISON + MAP (analytics first on mobile, 60/40 on desktop) ── */}
        {!loading && funds.length > 0 && (
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">

            <div className="order-1 lg:order-2 rounded-lg border border-bm-border/30 bg-bm-surface/[0.02] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight text-bm-text">Fund Comparison</h3>
                  <p className="text-[10px] text-bm-muted2 mt-0.5">As of {quarter} · point-in-time</p>
                </div>
                <select
                  value={timeMetric}
                  onChange={(e) => setTimeMetric(e.target.value as TimeMetric)}
                  className="rounded border border-bm-border bg-bm-surface px-2 py-0.5 text-[11px] text-bm-text focus:border-bm-accent focus:outline-none"
                >
                  {TIME_METRIC_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {comparisonBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={comparisonBarData} margin={{ top: 8, right: 8, left: 4, bottom: 32 }}>
                    <CartesianGrid vertical={false} {...GRID_STYLE} />
                    <XAxis
                      dataKey="name"
                      tick={{ ...AXIS_TICK_STYLE, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      tick={AXIS_TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => isMultiplier ? fmtMultiple(v) : fmtCompact(v)}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number) => [
                        isMultiplier ? fmtMultiple(value) : fmtCompact(value),
                        TIME_METRIC_OPTIONS.find((o) => o.value === timeMetric)?.label ?? timeMetric,
                      ]}
                      labelStyle={{ color: "hsl(210, 24%, 94%)", fontWeight: 600 }}
                    />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={48}>
                      {comparisonBarData.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[240px] text-sm text-bm-muted2">
                  No fund data available
                </div>
              )}
            </div>

            <div className="order-2 lg:order-1">
              <PortfolioAssetMap data={mapData} loading={mapLoading} />
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
                  {funds.map((fund, fundIdx) => {
                    const pctInvested = fund.state?.total_committed && fund.state?.total_called
                      ? Number(fund.state.total_called) / Number(fund.state.total_committed)
                      : null;
                    const irrVariance = irrSanity.ranks[fundIdx] ?? null;
                    return (
                    <tr key={fund.fund_id} className={reIndexTableRowClass}>
                      <td className="px-3 py-3 align-middle">
                        <Link href={`${base}/funds/${fund.fund_id}`} className={reIndexPrimaryCellClass}>
                          {fund.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 align-middle text-[12px] uppercase tracking-[0.04em] text-bm-muted2">
                        {fund.strategy?.toUpperCase() ?? "—"}
                      </td>
                      <td className="px-3 py-3 align-middle text-[12px] tracking-[0.04em] text-bm-muted2">
                        {fund.vintage_year}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}
                          title={fund.state == null ? `No quarter state for ${quarter}` : undefined}>
                        {fmtMoney(fund.state?.total_committed)}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}
                          title={fund.state?.portfolio_nav == null ? `No NAV data for ${quarter}` : undefined}>
                        {fmtMoney(fund.state?.portfolio_nav)}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}
                          title={fund.state?.gross_irr == null ? `No IRR data for ${quarter} — run quarter close` : (irrVariance ?? undefined)}>
                        <span>{fmtPct(fund.state?.gross_irr)}</span>
                        {irrVariance && fund.state?.gross_irr != null && (
                          <span className="block text-[9px] text-bm-muted2/60 leading-none mt-0.5">
                            {irrVariance}
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}
                          title={fund.state?.net_irr == null ? `No net IRR data for ${quarter} — run quarter close` : undefined}>
                        {fmtPct(fund.state?.net_irr)}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}
                          title={fund.state?.dpi == null ? `No DPI data for ${quarter}` : undefined}>
                        {fmtMultiple(fund.state?.dpi)}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}
                          title={fund.state?.tvpi == null ? `No TVPI data for ${quarter}` : undefined}>
                        {fmtMultiple(fund.state?.tvpi)}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}
                          title={pctInvested == null ? `No capital data for ${quarter}` : undefined}>
                        {pctInvested != null ? `${(pctInvested * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <span className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/18 px-2.5 py-1 text-[11px] capitalize text-bm-muted2">
                          {fund.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right align-middle">
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
