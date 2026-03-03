"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ui/MetricCard";
import {
  getRepeFund,
  listRepeDeals,
  listReV2Investments,
  RepeFundDetail,
  RepeDeal,
  ReV2Investment,
  getReV2FundQuarterState,
  getReV2FundMetrics,
  getReV2FundLineage,
  getReV2FundInvestmentRollup,
  getReV2InvestmentAssets,
  runReV2QuarterClose,
  runReV2Waterfall,
  listReV2Scenarios,
  listReV2Runs,
  ReV2FundQuarterState,
  ReV2FundMetrics,
  ReV2Scenario,
  ReV2RunProvenance,
  ReV2FundInvestmentRollupRow,
  ReV2EntityLineageResponse,
  ReV2InvestmentAsset,
  getFiNOIVariance,
  getFiFundMetrics,
  getFiLoans,
  getFiCovenantResults,
  getFiWatchlist,
  runFiCovenantTests,
  listFiUwVersions,
  getLpSummary,
  FiVarianceResult,
  FiFundMetricsResult,
  FiLoan,
  FiCovenantResult,
  FiWatchlistEvent,
  FiUwVersion,
  type LpSummary,
  seedReV2Data,
  getFundValuationRollup,
  type FundValuationRollup,
  createReV2Scenario,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import SaleScenarioPanel from "@/components/repe/SaleScenarioPanel";
import { AmortizationViewer } from "@/components/repe/AmortizationViewer";
import { WaterfallTierTable } from "@/components/repe/WaterfallTierTable";
import { LPBreakdown } from "@/components/repe/LPBreakdown";
import { ExcelExportButton } from "@/components/repe/ExcelExportButton";
import WaterfallScenarioPanel from "@/components/repe/WaterfallScenarioPanel";
import { DebugFooter } from "@/components/repe/DebugFooter";
import { EntityLineagePanel } from "@/components/repe/EntityLineagePanel";

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

const TABS = [
  "Overview",
  "Variance (NOI)",
  "Returns (Gross/Net)",
  "Debt Surveillance",
  "Run Center",
  "Scenarios",
  "LP Summary",
  "Waterfall Scenario",
] as const;
type TabKey = (typeof TABS)[number];

export default function FundDetailPage({
  params,
}: {
  params: { envId: string; fundId: string };
}) {
  const { envId, businessId } = useReEnv();
  const [tab, setTab] = useState<TabKey>("Overview");
  const [detail, setDetail] = useState<RepeFundDetail | null>(null);
  const [deals, setDeals] = useState<RepeDeal[]>([]);
  const [investments, setInvestments] = useState<ReV2Investment[]>([]);
  const [investmentRollup, setInvestmentRollup] = useState<ReV2FundInvestmentRollupRow[]>([]);
  const [fundState, setFundState] = useState<ReV2FundQuarterState | null>(null);
  const [fundMetrics, setFundMetrics] = useState<ReV2FundMetrics | null>(null);
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState<string | null>(null);
  const [covenantAlerts, setCovenantAlerts] = useState<FiWatchlistEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const quarter = pickCurrentQuarter();

  const isDebtFund = detail?.fund?.strategy === "debt";

  const refreshCanonical = async () => {
    setLineageLoading(true);
    setLineageError(null);
    try {
      const [fs, fm, sc, rollup, lineageData] = await Promise.all([
        getReV2FundQuarterState(params.fundId, quarter).catch(() => null),
        getReV2FundMetrics(params.fundId, quarter).catch(() => null),
        listReV2Scenarios(params.fundId).catch(() => []),
        getReV2FundInvestmentRollup(params.fundId, quarter).catch(() => []),
        getReV2FundLineage(params.fundId, quarter).catch(() => null),
      ]);
      setFundState(fs);
      setFundMetrics(fm);
      setScenarios(sc);
      setInvestmentRollup(rollup);
      setLineage(lineageData);
      // Fetch covenant alerts for banner
      if (envId && businessId) {
        getFiWatchlist({ env_id: envId, business_id: businessId, fund_id: params.fundId, quarter })
          .then((wl) => setCovenantAlerts(wl.filter((e: FiWatchlistEvent) => e.severity === "HIGH" || e.severity === "CRITICAL")))
          .catch(() => setCovenantAlerts([]));
      }
    } catch (err) {
      setLineageError(err instanceof Error ? err.message : "Failed to load lineage");
    } finally {
      setLineageLoading(false);
    }
  };

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
  }, [params.fundId, quarter, businessId]);

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

  const fund = detail?.fund;
  const terms = detail?.terms ?? [];
  const latestTerms = terms[0];

  // Filter tabs: hide Debt Surveillance for equity funds
  const visibleTabs = TABS.filter((t) => t !== "Debt Surveillance" || isDebtFund);

  return (
    <section className="space-y-5" data-testid="re-fund-detail">
      {/* Fund Header */}
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Fund</p>
            <h1 className="mt-1 text-2xl font-display font-bold tracking-tight">{fund?.name || "—"}</h1>
            <p className="mt-1 text-sm text-bm-muted2">
              {fund?.strategy?.toUpperCase()}{fund?.sub_strategy ? ` · ${fund.sub_strategy}` : ""}
              {fund?.vintage_year ? ` · Vintage ${fund.vintage_year}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/lab/env/${params.envId}/re/sustainability?section=portfolio-footprint&fundId=${params.fundId}`}
              className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Sustainability
            </Link>
            <button
              type="button"
              onClick={() => setLineageOpen(true)}
              className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Lineage
            </button>
            {envId && businessId && (
              <ExcelExportButton
                fundId={params.fundId}
                envId={envId}
                businessId={businessId}
                quarter={quarter}
              />
            )}
          </div>
          {latestTerms && (
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div><dt className="text-xs text-bm-muted2">Pref Return</dt><dd className="font-medium">{fmtPercent(latestTerms.preferred_return_rate)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Carry</dt><dd className="font-medium">{fmtPercent(latestTerms.carry_rate)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Waterfall</dt><dd className="font-medium capitalize">{latestTerms.waterfall_style || "—"}</dd></div>
              {fund?.target_size ? <div><dt className="text-xs text-bm-muted2">Target Size</dt><dd className="font-medium">{fmtMoney(fund.target_size)}</dd></div> : null}
            </dl>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <MetricCard label="NAV" value={fmtMoney(fundState?.portfolio_nav)} size="large" />
        <MetricCard label="Committed" value={fmtMoney(fundState?.total_committed)} size="large" />
        <MetricCard label="Called" value={fmtMoney(fundState?.total_called)} size="large" />
        <MetricCard label="Distributed" value={fmtMoney(fundState?.total_distributed)} size="compact" />
        <MetricCard label="DPI" value={fmtMultiple(fundState?.dpi)} size="compact" />
        <MetricCard label="TVPI" value={fmtMultiple(fundState?.tvpi)} size="compact" />
        <MetricCard label="IRR" value={fmtPercent(fundMetrics?.irr)} size="compact" />
      </div>

      {/* Covenant Alert Banner */}
      {covenantAlerts.length > 0 && (
        <div
          className="rounded-xl border border-amber-500/60 bg-amber-500/10 px-5 py-3 flex items-center gap-3"
          data-testid="covenant-alert-banner"
        >
          <span className="text-amber-400 text-lg">&#9888;</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-300">
              {covenantAlerts.length} investment{covenantAlerts.length > 1 ? "s" : ""} approaching covenant breach
            </p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              {covenantAlerts.map((a) => (a as Record<string, unknown>).investment_name as string || a.reason || "Investment").join(", ")}
              {" — review Debt Surveillance tab"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTab("Debt Surveillance")}
            className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20"
          >
            Review
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-2 flex flex-wrap gap-2" data-testid="fund-tabs">
        {visibleTabs.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(label)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-[transform,box-shadow] duration-[120ms] ${
              tab === label
                ? "border-transparent border-b-2 border-b-bm-accent bg-bm-surface/30 text-bm-text font-medium"
                : "border-transparent text-bm-muted hover:bg-bm-surface/30 hover:text-bm-text"
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
          deals={deals}
          scenarios={scenarios}
          fund={fund}
          envId={params.envId}
          quarter={quarter}
        />
      )}
      {tab === "Variance (NOI)" && envId && businessId && (
        <VarianceTab envId={envId} businessId={businessId} fundId={params.fundId} quarter={quarter} />
      )}
      {tab === "Returns (Gross/Net)" && envId && businessId && (
        <ReturnsTab envId={envId} businessId={businessId} fundId={params.fundId} quarter={quarter} />
      )}
      {tab === "Debt Surveillance" && isDebtFund && envId && businessId && (
        <DebtSurveillanceTab envId={envId} businessId={businessId} fundId={params.fundId} quarter={quarter} />
      )}
      {tab === "Run Center" && envId && businessId && (
        <RunCenterTab
          envId={envId}
          businessId={businessId}
          fundId={params.fundId}
          quarter={quarter}
          isDebtFund={isDebtFund || false}
          onCanonicalRefresh={refreshCanonical}
        />
      )}
      {tab === "Scenarios" && envId && businessId && (
        <ScenariosTab
          envId={envId}
          businessId={businessId}
          fundId={params.fundId}
          quarter={quarter}
          deals={deals}
          scenarios={scenarios}
          onScenariosChange={setScenarios}
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
      {tab === "Waterfall Scenario" && envId && businessId && (
        <WaterfallScenarioPanel
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
    </section>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function InvestmentRow({
  inv,
  envId,
  quarter,
  rollup,
}: {
  inv: ReV2Investment;
  envId: string;
  quarter: string;
  rollup?: ReV2FundInvestmentRollupRow;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<ReV2InvestmentAsset[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        className="hover:bg-bm-surface/20 cursor-pointer select-none"
        onClick={handleToggle}
        data-testid={`investment-row-${inv.investment_id}`}
      >
        <td className="px-4 py-3">
          <span className="mr-2 text-bm-muted2 text-xs">{open ? "▾" : "▸"}</span>
          <Link
            href={`/lab/env/${envId}/re/investments/${inv.investment_id}`}
            className="font-medium text-bm-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {inv.name}
          </Link>
        </td>
        <td className="px-4 py-3 text-bm-muted2 text-xs capitalize">{inv.investment_type || "—"}</td>
        <td className="px-4 py-3 text-bm-muted2 text-xs capitalize">{inv.stage || "—"}</td>
        <td className="px-4 py-3 text-right text-sm">
          {inv.committed_capital ? fmtMoney(inv.committed_capital) : "—"}
        </td>
        <td className="px-4 py-3 text-right text-sm">
          {rollup?.fund_nav_contribution ? fmtMoney(rollup.fund_nav_contribution) : "—"}
        </td>
        <td className="px-4 py-3 text-center">
          <Link
            href={`/lab/env/${envId}/re/investments/${inv.investment_id}`}
            className="text-xs text-bm-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Detail →
          </Link>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="px-0 py-0 bg-bm-surface/10">
            {loading ? (
              <div className="px-8 py-3 text-xs text-bm-muted2">Loading assets...</div>
            ) : loadError ? (
              <div className="px-12 py-3 text-xs text-amber-300">{loadError}</div>
            ) : assets && assets.length > 0 ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-bm-border/30">
                  {assets.map((asset) => (
                    <tr key={asset.asset_id} className="hover:bg-bm-surface/20">
                      <td className="pl-12 pr-4 py-2 text-bm-muted2 text-xs w-8">└</td>
                      <td className="px-2 py-2 font-medium text-sm">
                        <Link href={`/lab/env/${envId}/re/assets/${asset.asset_id}`} className="text-bm-accent hover:underline">
                          {asset.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-bm-muted2 capitalize">
                        {asset.property_type || asset.asset_type}
                      </td>
                      <td className="px-4 py-2 text-xs text-bm-muted2">
                        {asset.cost_basis ? fmtMoney(asset.cost_basis) : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-bm-muted2">
                        {asset.units ? `${Number(asset.units).toLocaleString()} sf` : "—"}
                        {asset.market ? ` · ${asset.market}` : ""}
                      </td>
                      <td className="px-4 py-2 text-xs text-bm-muted2 text-right">
                        {asset.asset_value ? fmtMoney(asset.asset_value) : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-bm-muted2 text-right">
                        {asset.nav ? fmtMoney(asset.nav) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-12 py-3 text-xs text-amber-300">
                No assets linked to this investment. Run the integrity repair endpoint to backfill the invariant.
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function OverviewTab({ investments, investmentRollup, deals, scenarios, fund, envId, quarter }: {
  investments: ReV2Investment[];
  investmentRollup: ReV2FundInvestmentRollupRow[];
  deals: RepeDeal[];
  scenarios: ReV2Scenario[];
  fund: RepeFundDetail["fund"] | undefined;
  envId: string;
  quarter: string;
}) {
  const rollupById = new Map(investmentRollup.map((row) => [row.investment_id, row]));
  const nonBaseScenarioCount = scenarios.filter((scenario) => !scenario.is_base).length;

  // Valuation rollup
  const [rollup, setRollup] = useState<FundValuationRollup | null>(null);
  useEffect(() => {
    if (!fund?.fund_id) return;
    getFundValuationRollup(fund.fund_id, quarter)
      .then(setRollup)
      .catch(() => {});
  }, [fund?.fund_id, quarter]);
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

  return (
    <div className="space-y-4">
      {/* Summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard label="Investments" value={String(investmentRollup.length || investments.length || deals.length)} size="large" />
        <MetricCard label="Strategy" value={fund?.strategy?.toUpperCase() || "—"} size="large" />
        <MetricCard label="Scenarios" value={String(nonBaseScenarioCount)} size="large" />
      </div>

      {/* Investment list */}
      {displayInvestments.length > 0 && (
        <div className="rounded-xl border border-bm-border/70 overflow-hidden" data-testid="investment-list">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-3 font-medium">Investment</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium text-right">Committed</th>
                <th className="px-4 py-3 font-medium text-right">Fund NAV</th>
                <th className="px-4 py-3 font-medium text-center">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {displayInvestments.map((inv) => (
                <InvestmentRow
                  key={inv.investment_id}
                  inv={inv}
                  envId={envId}
                  quarter={quarter}
                  rollup={rollupById.get(inv.investment_id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Valuation Rollup Card */}
      {rollup && rollup.summary.asset_count > 0 ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="valuation-rollup">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            Portfolio Valuation · {quarter}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Portfolio Value</p>
              <p className="mt-1 text-lg font-bold">{fmtMoney(rollup.summary.total_portfolio_value)}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Total Equity</p>
              <p className="mt-1 text-lg font-bold">{fmtMoney(rollup.summary.total_equity)}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Wtd Avg Cap Rate</p>
              <p className="mt-1 text-lg font-bold">{rollup.summary.weighted_avg_cap_rate != null ? `${(rollup.summary.weighted_avg_cap_rate * 100).toFixed(2)}%` : "—"}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Wtd Avg LTV</p>
              <p className="mt-1 text-lg font-bold">{rollup.summary.weighted_avg_ltv != null ? `${(rollup.summary.weighted_avg_ltv * 100).toFixed(1)}%` : "—"}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-bm-muted2">{rollup.summary.asset_count} assets · Total NOI: {fmtMoney(rollup.summary.total_noi)}</p>
        </div>
      ) : null}
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
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center text-sm text-bm-muted2" data-testid="variance-empty">
        No variance data available. Run a Quarter Close with accounting data and a budget baseline first.
      </div>
    );
  }

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
                <td className="px-4 py-3 font-medium">{item.line_code}</td>
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
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center text-sm text-bm-muted2" data-testid="returns-empty">
        No return metrics available. Run a Quarter Close first.
      </div>
    );
  }

  const m = data.metrics;
  const b = data.bridge;
  const bm = (data as Record<string, unknown>).benchmark as { benchmark_name: string; quarter: string; total_return: number; alpha: number } | null;

  return (
    <div className="space-y-4" data-testid="returns-section">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="returns-kpis">
        <MetricCard label="Cash-on-Cash" value={fmtPercent(m.cash_on_cash)} size="large" />
        <MetricCard label="Gross IRR" value={fmtPercent(m.gross_irr)} size="large" />
        <MetricCard label="Net IRR" value={fmtPercent(m.net_irr)} size="large" />
        <MetricCard label="Gross TVPI" value={fmtMultiple(m.gross_tvpi)} size="large" />
        <MetricCard label="Net TVPI" value={fmtMultiple(m.net_tvpi)} size="large" />
        <MetricCard label="Spread" value={m.gross_net_spread ? `${(Number(m.gross_net_spread) * 100).toFixed(0)}bps` : "—"} size="large" />
      </div>

      {/* Additional metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="DPI" value={fmtMultiple(m.dpi)} size="compact" />
        <MetricCard label="RVPI" value={fmtMultiple(m.rvpi)} size="compact" />
      </div>

      {/* Benchmark Comparison */}
      {bm && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 space-y-3" data-testid="benchmark-comparison">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">vs Benchmark — {bm.benchmark_name?.replace("_", " ")}</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-xs text-bm-muted2 uppercase tracking-wide">Fund Net Return</div>
              <div className="text-lg font-semibold mt-1">{fmtPercent(m.net_irr)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-bm-muted2 uppercase tracking-wide">{bm.benchmark_name?.replace("_", " ")}</div>
              <div className="text-lg font-semibold mt-1">{fmtPercent(bm.total_return)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-bm-muted2 uppercase tracking-wide">Alpha</div>
              <div className={`text-lg font-bold mt-1 ${bm.alpha >= 0 ? "text-green-400" : "text-red-400"}`}>
                {bm.alpha != null ? `${bm.alpha >= 0 ? "+" : ""}${(bm.alpha * 10000).toFixed(0)}bps` : "—"}
              </div>
            </div>
          </div>
          {bm.alpha != null && (
            <div className={`text-sm text-center ${bm.alpha >= 0 ? "text-green-400" : "text-red-400"}`}>
              Winston {bm.alpha >= 0 ? "outperforms" : "underperforms"} {bm.benchmark_name?.replace("_", " ")} by {Math.abs(Math.round(bm.alpha * 10000))}bps on a net basis
            </div>
          )}
        </div>
      )}

      {/* Gross→Net Bridge */}
      {b && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 space-y-3" data-testid="gross-net-bridge">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Gross → Net Bridge</h3>
          <div className="space-y-2">
            {[
              { label: "Gross Return", value: fmtMoney(b.gross_return), color: "text-green-400" },
              { label: "− Management Fees", value: `(${fmtMoney(b.mgmt_fees)})`, color: "text-red-400" },
              { label: "− Fund Expenses", value: `(${fmtMoney(b.fund_expenses)})`, color: "text-red-400" },
              { label: "− Carry (Shadow)", value: `(${fmtMoney(b.carry_shadow)})`, color: "text-red-400" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b border-bm-border/30 py-2">
                <span className="text-sm">{row.label}</span>
                <span className={`font-medium ${row.color}`}>{row.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t-2 border-bm-border/60 pt-2">
              <span className="text-sm font-semibold">= Net Return</span>
              <span className={`text-lg font-bold ${Number(b.net_return) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {fmtMoney(b.net_return)}
              </span>
            </div>
          </div>
        </div>
      )}
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

// ── Run Center Tab ──────────────────────────────────────────────────────────

function RunCenterTab({ envId, businessId, fundId, quarter, isDebtFund, onCanonicalRefresh }: {
  envId: string;
  businessId: string;
  fundId: string;
  quarter: string;
  isDebtFund: boolean;
  onCanonicalRefresh: () => Promise<void>;
}) {
  const [runs, setRuns] = useState<ReV2RunProvenance[]>([]);
  const [uwVersions, setUwVersions] = useState<FiUwVersion[]>([]);
  const [selectedUwVersionId, setSelectedUwVersionId] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      listReV2Runs(fundId, quarter).catch(() => []),
      listFiUwVersions({ env_id: envId, business_id: businessId }).catch(() => []),
    ]).then(([r, uv]) => {
      setRuns(r);
      setUwVersions(uv);
      if (uv.length > 0) setSelectedUwVersionId(uv[0].id);
    });
  }, [envId, businessId, fundId, quarter]);

  const refreshRuns = () => {
    listReV2Runs(fundId, quarter).then(setRuns).catch(() => {});
  };

  const handleQuarterClose = async () => {
    setRunning("quarter_close");
    setError(null);
    setResult(null);
    try {
      const res = await runReV2QuarterClose(fundId, {
        quarter,
        run_waterfall: false,
      });
      setResult(`Quarter Close: ${res.status} (run ${res.run_id.slice(0, 8)})`);
      await onCanonicalRefresh();
      refreshRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quarter close failed");
    } finally {
      setRunning(null);
    }
  };

  const handleWaterfallShadow = async () => {
    setRunning("waterfall");
    setError(null);
    setResult(null);
    try {
      const res = await runReV2Waterfall(fundId, {
        quarter,
        run_type: "shadow",
      });
      setResult(`Waterfall Shadow: ${res.status} (run ${res.run_id.slice(0, 8)})`);
      await onCanonicalRefresh();
      refreshRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Waterfall run failed");
    } finally {
      setRunning(null);
    }
  };

  const handleCovenantTest = async () => {
    setRunning("covenant");
    setError(null);
    setResult(null);
    try {
      const res = await runFiCovenantTests({
        env_id: envId,
        business_id: businessId,
        fund_id: fundId,
        quarter,
      });
      setResult(`Covenant Tests: ${res.status} — ${res.violations} violations / ${res.total_tested} tested`);
      refreshRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Covenant test failed");
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="run-center-section">
      {/* Config */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Quarter
            <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={quarter} readOnly />
          </label>
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Budget Baseline (UW Version)
            <select
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={selectedUwVersionId}
              onChange={(e) => setSelectedUwVersionId(e.target.value)}
            >
              <option value="">None (skip variance)</option>
              {uwVersions.map((uv) => (
                <option key={uv.id} value={uv.id}>{uv.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleQuarterClose}
            disabled={running !== null}
            className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-50"
            data-testid="run-quarter-close"
          >
            {running === "quarter_close" ? "Running..." : "Run Quarter Close"}
          </button>
          <button
            type="button"
            onClick={handleWaterfallShadow}
            disabled={running !== null}
            className="rounded-lg border border-bm-accent/60 px-4 py-2 text-sm font-medium text-bm-accent hover:bg-bm-accent/10 disabled:opacity-50"
          >
            {running === "waterfall" ? "Running..." : "Run Waterfall (Shadow)"}
          </button>
          {isDebtFund && (
            <button
              type="button"
              onClick={handleCovenantTest}
              disabled={running !== null}
              className="rounded-lg border border-amber-500/60 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
              data-testid="run-covenant-tests"
            >
              {running === "covenant" ? "Testing..." : "Run Covenant Tests"}
            </button>
          )}
        </div>
      </div>

      {/* Result Toast */}
      {result && (
        <div className="rounded-xl border border-green-500/50 bg-green-500/10 p-4 text-sm" data-testid="run-result-toast">
          {result}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Run History */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3" data-testid="run-history">
        <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Run History</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-bm-muted2">No runs yet.</p>
        ) : (
          <div className="rounded-xl border border-bm-border/70 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="px-4 py-2 font-medium">Run ID</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Quarter</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {runs.map((r) => (
                  <tr key={r.run_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-2 font-mono text-xs">{r.run_id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-xs">{r.run_type}</td>
                    <td className="px-4 py-2 text-xs">{r.quarter}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        r.status === "success" ? "bg-green-500/20 text-green-300" :
                        r.status === "failed" ? "bg-red-500/20 text-red-300" :
                        "bg-yellow-500/20 text-yellow-300"
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-bm-muted2">{r.started_at?.slice(0, 19).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scenarios Tab ──────────────────────────────────────────────────────────

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

  const nonBaseScenarios = scenarios.filter((s) => !s.is_base);

  async function handleNewScenario() {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createReV2Scenario(fundId, {
        name: `Sale Scenario ${nonBaseScenarios.length + 1}`,
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
      {/* Header with New Scenario button */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-display font-semibold tracking-tight">Scenarios</h3>
          <p className="text-sm text-bm-muted2 mt-1">
            Model hypothetical exits and compare impact on fund returns.
          </p>
        </div>
        <button
          type="button"
          onClick={handleNewScenario}
          disabled={creating}
          className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-bm-accentContrast transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-[1px] disabled:opacity-50"
          data-testid="new-sale-scenario-btn"
        >
          {creating ? "Creating..." : "+ New Sale Scenario"}
        </button>
      </div>

      {createError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {createError}
        </div>
      )}

      {/* Scenario selector */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Active Scenario
          <select
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={selectedScenarioId}
            onChange={(e) => setSelectedScenarioId(e.target.value)}
          >
            <option value="">Select a scenario</option>
            {nonBaseScenarios.map((s) => (
              <option key={s.scenario_id} value={s.scenario_id}>
                {s.name} ({s.scenario_type})
              </option>
            ))}
          </select>
        </label>
        {nonBaseScenarios.length === 0 && (
          <p className="mt-2 text-sm text-bm-muted2">
            No scenarios yet. Click &ldquo;+ New Sale Scenario&rdquo; above to start modeling.
          </p>
        )}
      </div>

      {/* Sale Scenario Panel */}
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
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {data.partners.map((p) => (
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
              <td className="px-4 py-3 text-right" colSpan={2} />
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
              { label: "Gross Return", value: fmtMoney(gnb.gross_return), color: "text-green-400" },
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
              <span className="text-sm font-semibold">= Net Return</span>
              <span className={`text-lg font-bold ${Number(gnb.net_return) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {fmtMoney(gnb.net_return)}
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
