"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, GitBranch, Leaf } from "lucide-react";
import { label as labelFn, RUN_TYPE_LABELS, STATUS_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/labels";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { MetricCard } from "@/components/ui/MetricCard";
import {
  getRepeFund,
  listRepeDeals,
  listRepeAssets,
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

const TABS = [
  "Overview",
  "Performance",
  "Asset Variance",
  "Debt Surveillance",
  "Scenarios",
  "Waterfall Scenario",
  "LP Summary",
  "Run Center",
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
  const [exportOpen, setExportOpen] = useState(false);
  const [covenantAlerts, setCovenantAlerts] = useState<FiWatchlistEvent[]>([]);
  const [lastCloseQuarter, setLastCloseQuarter] = useState<string | null>(null);
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
  const headerKpis: KpiDef[] = [
    { label: "Committed", value: fmtMoney(fundState?.total_committed) },
    { label: "Called", value: fmtMoney(fundState?.total_called) },
    { label: "Distributed", value: fmtMoney(fundState?.total_distributed) },
    { label: "NAV", value: fmtMoney(fundState?.portfolio_nav) },
    { label: "DPI", value: fmtMultiple(fundState?.dpi) },
    { label: "TVPI", value: fmtMultiple(fundState?.tvpi) },
    { label: "Gross IRR", value: fmtPercent(fundState?.gross_irr) },
    { label: "Net IRR", value: fmtPercent(fundState?.net_irr) },
  ];

  // Filter tabs: hide Debt Surveillance for equity funds
  const visibleTabs = TABS.filter((t) => t !== "Debt Surveillance" || isDebtFund);

  return (
    <section className="flex flex-col gap-4" data-testid="re-fund-detail">
      <div className="rounded-lg border border-bm-border/20 bg-bm-surface/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Fund</p>
            <h1 className="mt-1 font-display text-xl font-semibold text-bm-text">{fund?.name || "—"}</h1>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-md border border-bm-border/30 px-3 py-1.5 text-sm transition-colors duration-100 hover:bg-bm-surface/20"
            >
              Export
              <ChevronDown className="h-3.5 w-3.5 text-bm-muted" strokeWidth={1.5} />
            </button>
            {exportOpen && (
              <div
                className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-bm-border/20 bg-bm-surface/95"
                onBlur={() => setExportOpen(false)}
              >
                <div className="space-y-0.5 p-1">
                  {envId && businessId && (
                    <div className="rounded-md" onClick={() => setExportOpen(false)}>
                      <ExcelExportButton
                        fundId={params.fundId}
                        envId={envId}
                        businessId={businessId}
                        quarter={quarter}
                      />
                    </div>
                  )}
                  <button type="button" className="w-full rounded-md px-3 py-1.5 text-left text-sm text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text">
                    Download LP Report (PDF)
                  </button>
                  <button type="button" className="w-full rounded-md px-3 py-1.5 text-left text-sm text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text">
                    Download Waterfall (.xlsx)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-xs text-bm-muted">
          {fund?.strategy && (
            <span className="uppercase tracking-[0.08em]">{fund.strategy}{fund.sub_strategy ? ` · ${fund.sub_strategy}` : ""}</span>
          )}
          {fund?.vintage_year && <span>Vintage {fund.vintage_year}</span>}
          {fund?.target_size && <span>Target {fmtMoney(fund.target_size)}</span>}
          {lastCloseQuarter && (
            <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-[11px] text-green-400">
              Last Close: {lastCloseQuarter}
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setLineageOpen(true)}
            title="View entity lineage"
            className="inline-flex items-center gap-1 rounded-md border border-bm-border/30 px-2.5 py-1 text-xs transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text"
          >
            <GitBranch className="h-3.5 w-3.5 text-bm-muted" strokeWidth={1.5} />
            Lineage
          </button>
          <Link
            href={`/lab/env/${params.envId}/re/sustainability?section=portfolio-footprint&fundId=${params.fundId}`}
            title="Sustainability dashboard"
            className="inline-flex items-center gap-1 rounded-md border border-bm-border/30 px-2.5 py-1 text-xs transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text"
          >
            <Leaf className="h-3.5 w-3.5 text-bm-muted" strokeWidth={1.5} />
            Sustainability
          </Link>
        </div>

        {latestTerms && (
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-bm-border/20 pt-3 text-sm">
            <div><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Pref Return</dt><dd className="font-semibold tabular-nums">{fmtPercent(latestTerms.preferred_return_rate)}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Carry</dt><dd className="font-semibold tabular-nums">{fmtPercent(latestTerms.carry_rate)}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Waterfall</dt><dd className="font-semibold capitalize">{latestTerms.waterfall_style || "—"}</dd></div>
          </dl>
        )}
      </div>

      <KpiStrip kpis={headerKpis} />

      {covenantAlerts.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg border border-amber-500/60 bg-amber-500/10 px-5 py-3"
          data-testid="covenant-alert-banner"
        >
          <AlertTriangle className="h-4 w-4 text-amber-400" strokeWidth={1.5} />
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

      <div className="flex flex-wrap gap-1 rounded-lg border border-bm-border/20 bg-bm-surface/40 p-1" data-testid="fund-tabs">
        {visibleTabs.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(label)}
            className={`rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors duration-100 ${
              tab === label
                ? "bg-bm-surface/30 text-bm-text"
                : "text-bm-muted hover:bg-bm-surface/20 hover:text-bm-text"
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
          businessId={businessId ?? undefined}
          fundId={params.fundId}
          quarter={quarter}
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
          onNavigateToRunCenter={() => setTab("Run Center")}
        />
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
          {rollup?.fund_nav_contribution ? fmtMoney(rollup.fund_nav_contribution) : rollup?.nav ? fmtMoney(rollup.nav) : "—"}
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
                      <td className="px-4 py-2 text-xs text-bm-muted2">
                        {labelFn(PROPERTY_TYPE_LABELS, asset.property_type || asset.asset_type || "")}
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

function OverviewTab({ investments, investmentRollup, deals, scenarios, fund, envId, businessId, fundId, quarter }: {
  investments: ReV2Investment[];
  investmentRollup: ReV2FundInvestmentRollupRow[];
  deals: RepeDeal[];
  scenarios: ReV2Scenario[];
  fund: RepeFundDetail["fund"] | undefined;
  envId: string;
  businessId: string | undefined;
  fundId: string;
  quarter: string;
}) {
  const rollupById = new Map(investmentRollup.map((row) => [row.investment_id, row]));
  const nonBaseScenarioCount = scenarios.filter((scenario) => !scenario.is_base).length;

  // Valuation rollup
  const [rollup, setRollup] = useState<FundValuationRollup | null>(null);
  // IRR timeline (NAV sparkline)
  const [irrTimeline, setIrrTimeline] = useState<IrrTimelinePoint[]>([]);
  // Capital timeline
  const [capitalTimeline, setCapitalTimeline] = useState<CapitalTimelinePoint[]>([]);
  // IRR contribution
  const [irrContrib, setIrrContrib] = useState<IrrContributionItem[]>([]);

  useEffect(() => {
    if (!fund?.fund_id) return;
    getFundValuationRollup(fund.fund_id, quarter).then(setRollup).catch(() => {});
    if (businessId) {
      getIrrTimeline({ fund_id: fundId, env_id: envId, business_id: businessId }).then(setIrrTimeline).catch(() => []);
      getCapitalTimeline({ fund_id: fundId, env_id: envId, business_id: businessId }).then(setCapitalTimeline).catch(() => []);
      getIrrContribution({ fund_id: fundId, env_id: envId, business_id: businessId, quarter }).then(setIrrContrib).catch(() => []);
    }
  }, [fund?.fund_id, quarter, businessId, envId, fundId]);

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

  // Compute sparkline bar heights for NAV timeline
  const navValues = irrTimeline.map((p) => Number(p.portfolio_nav || 0));
  const maxNav = Math.max(...navValues, 1);

  // Top 3 performers by IRR contribution
  const topPerformers = [...irrContrib]
    .sort((a, b) => Number(b.irr_contribution || b.fund_nav_contribution || 0) - Number(a.irr_contribution || a.fund_nav_contribution || 0))
    .slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Fund Value Chart — NAV sparkline */}
      {irrTimeline.length > 1 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="nav-sparkline">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2 mb-3">Fund NAV Over Time</h3>
          <div className="flex items-end gap-1 h-20">
            {irrTimeline.map((point, i) => {
              const val = Number(point.portfolio_nav || 0);
              const pct = maxNav > 0 ? (val / maxNav) * 100 : 0;
              return (
                <div key={point.quarter} className="flex-1 flex flex-col items-center gap-1" title={`${point.quarter}: ${fmtMoney(val)}`}>
                  <div className="w-full rounded-t bg-bm-accent/70 transition-all" style={{ height: `${Math.max(pct, 2)}%` }} />
                  {(i === 0 || i === irrTimeline.length - 1 || i === Math.floor(irrTimeline.length / 2)) && (
                    <span className="text-[9px] text-bm-muted2">{point.quarter}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs text-bm-muted2">
            <span>{irrTimeline[0]?.quarter}: {fmtMoney(navValues[0])}</span>
            <span>{irrTimeline[irrTimeline.length - 1]?.quarter}: {fmtMoney(navValues[navValues.length - 1])}</span>
          </div>
        </div>
      )}

      {/* Two-column: Top Performers + Capital Activity Timeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Performers */}
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="top-performers">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2 mb-3">
            Top Performers by IRR Contribution
          </h3>
          {topPerformers.length > 0 ? (
            <div className="space-y-3">
              {topPerformers.map((item, idx) => {
                const contrib = Number(item.irr_contribution || item.fund_nav_contribution || 0);
                const maxContrib = Math.max(...topPerformers.map((t) => Math.abs(Number(t.irr_contribution || t.fund_nav_contribution || 0))), 1);
                const pct = (Math.abs(contrib) / maxContrib) * 100;
                return (
                  <div key={item.investment_id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{idx + 1}. {item.investment_name}</span>
                      <span className={`font-semibold ${contrib >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {item.investment_irr ? fmtPercent(item.investment_irr) : fmtMoney(contrib)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-bm-surface/40 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${contrib >= 0 ? "bg-green-500/60" : "bg-red-500/60"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-bm-border px-4 py-6 text-center">
              <p className="text-sm text-bm-muted2">Contribution data populates after capital calls are recorded.</p>
              <p className="text-xs text-bm-muted2 mt-1">Run a quarter-close or seed capital ledger entries to see LP contributions.</p>
            </div>
          )}
        </div>

        {/* Capital Activity Timeline */}
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="capital-timeline">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2 mb-3">
            Capital Activity Timeline
          </h3>
          {capitalTimeline.length > 0 ? (
            <div className="space-y-2">
              {capitalTimeline.map((point) => (
                <div key={point.quarter} className="flex items-center gap-3 text-sm">
                  <span className="w-16 text-xs text-bm-muted2 shrink-0">{point.quarter}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] uppercase text-bm-muted2 w-12">Called</span>
                        <div className="flex-1 h-3 rounded-full bg-bm-surface/40 overflow-hidden">
                          <div className="h-full rounded-full bg-bm-accent/60" style={{ width: `${Math.min(100, (Number(point.total_called) / Math.max(Number(capitalTimeline[capitalTimeline.length - 1]?.total_called || 1), 1)) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-medium w-16 text-right">{fmtMoney(point.total_called)}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] uppercase text-bm-muted2 w-12">Dist</span>
                        <div className="flex-1 h-3 rounded-full bg-bm-surface/40 overflow-hidden">
                          <div className="h-full rounded-full bg-green-500/60" style={{ width: `${Math.min(100, (Number(point.total_distributed) / Math.max(Number(capitalTimeline[capitalTimeline.length - 1]?.total_called || 1), 1)) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-medium w-16 text-right">{fmtMoney(point.total_distributed)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-bm-border px-4 py-6 text-center">
              <p className="text-sm text-bm-muted2">Capital activity timeline populates after quarter-close runs.</p>
              <p className="text-xs text-bm-muted2 mt-1">Each closed quarter adds called capital and distribution totals.</p>
            </div>
          )}
        </div>
      </div>

      {/* IRR Contribution Bar Chart (all investments) */}
      {irrContrib.length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="irr-contribution-chart">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2 mb-3">
            Contribution to Fund IRR
          </h3>
          <div className="space-y-2">
            {irrContrib.map((item) => {
              const contrib = Number(item.irr_contribution || item.fund_nav_contribution || 0);
              const maxContrib = Math.max(...irrContrib.map((t) => Math.abs(Number(t.irr_contribution || t.fund_nav_contribution || 0))), 1);
              const pct = (Math.abs(contrib) / maxContrib) * 100;
              return (
                <div key={item.investment_id} className="flex items-center gap-3">
                  <span className="w-32 text-xs truncate text-bm-muted2">{item.investment_name}</span>
                  <div className="flex-1 h-4 rounded-full bg-bm-surface/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${contrib >= 0 ? "bg-green-500/60" : "bg-red-500/60"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold w-16 text-right ${contrib >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {fmtMoney(contrib)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

function ReturnsTab({ envId, businessId, fundId, quarter, onNavigateToRunCenter }: {
  envId: string; businessId: string; fundId: string; quarter: string;
  onNavigateToRunCenter?: () => void;
}) {
  const [data, setData] = useState<FiFundMetricsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [irrTimeline, setIrrTimeline] = useState<IrrTimelinePoint[]>([]);
  const [spreadTooltipOpen, setSpreadTooltipOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getFiFundMetrics({ env_id: envId, business_id: businessId, fund_id: fundId, quarter }),
      getIrrTimeline({ fund_id: fundId, env_id: envId, business_id: businessId }).catch(() => []),
    ])
      .then(([metrics, timeline]) => {
        setData(metrics);
        setIrrTimeline(timeline);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [envId, businessId, fundId, quarter]);

  if (loading) return <div className="p-4 text-sm text-bm-muted2">Loading return metrics...</div>;
  if (!data?.metrics) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-8 text-center space-y-4" data-testid="returns-empty">
        <div className="text-3xl">📊</div>
        <div>
          <p className="text-sm font-medium">No return metrics available yet</p>
          <p className="text-xs text-bm-muted2 mt-1">Fund performance requires a Quarter Close calculation.</p>
          <p className="text-xs text-bm-muted2">Last Close: Never</p>
        </div>
        {onNavigateToRunCenter && (
          <button
            type="button"
            onClick={onNavigateToRunCenter}
            className="inline-flex items-center gap-2 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90"
            data-testid="returns-run-quarter-close-cta"
          >
            Run Quarter Close
          </button>
        )}
      </div>
    );
  }

  const m = data.metrics;
  const b = data.bridge;
  const bm = (data as Record<string, unknown>).benchmark as { benchmark_name: string; quarter: string; total_return: number; alpha: number } | null;

  // Gross vs Net IRR data for column chart
  const grossIrr = Number(m.gross_irr || 0);
  const netIrr = Number(m.net_irr || 0);
  const maxIrr = Math.max(Math.abs(grossIrr), Math.abs(netIrr), 0.01);

  return (
    <div className="space-y-4" data-testid="returns-section">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="returns-kpis">
        <MetricCard label="Cash-on-Cash" value={fmtPercent(m.cash_on_cash)} size="large" />
        <MetricCard label="Gross IRR" value={fmtPercent(m.gross_irr)} size="large" />
        <MetricCard label="Net IRR" value={fmtPercent(m.net_irr)} size="large" />
        <MetricCard label="Gross TVPI" value={fmtMultiple(m.gross_tvpi)} size="large" />
        <MetricCard label="Net TVPI" value={fmtMultiple(m.net_tvpi)} size="large" />
        <div className="relative">
          <div
            onMouseEnter={() => setSpreadTooltipOpen(true)}
            onMouseLeave={() => setSpreadTooltipOpen(false)}
          >
            <MetricCard
              label="G→N Spread"
              value={m.gross_net_spread ? `${Math.round(Number(m.gross_net_spread) * 10000)}bps` : "—"}
              size="large"
            />
          </div>
          {spreadTooltipOpen && (
            <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 rounded-lg border border-bm-border/70 bg-bm-surface px-3 py-2 text-xs text-bm-muted2 shadow-xl whitespace-nowrap">
              Gross IRR minus Net IRR ({fmtPercent(m.gross_irr)} − {fmtPercent(m.net_irr)})
            </div>
          )}
        </div>
      </div>

      {/* Additional metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="DPI" value={fmtMultiple(m.dpi)} size="compact" />
        <MetricCard label="RVPI" value={fmtMultiple(m.rvpi)} size="compact" />
      </div>

      {/* Quarterly IRR Timeline Chart */}
      {irrTimeline.length > 1 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 space-y-3" data-testid="irr-timeline-chart">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Quarterly Net IRR Over Time</h3>
          <div className="flex items-end gap-1 h-24">
            {irrTimeline.map((point, i) => {
              const val = Number(point.net_irr || 0);
              const maxVal = Math.max(...irrTimeline.map((p) => Math.abs(Number(p.net_irr || 0))), 0.01);
              const pct = (Math.abs(val) / maxVal) * 100;
              return (
                <div key={point.quarter} className="flex-1 flex flex-col items-center gap-1" title={`${point.quarter}: ${fmtPercent(val)}`}>
                  <div
                    className={`w-full rounded-t transition-all ${val >= 0 ? "bg-green-500/60" : "bg-red-500/60"}`}
                    style={{ height: `${Math.max(pct, 4)}%` }}
                  />
                  {(i % Math.max(1, Math.floor(irrTimeline.length / 6)) === 0 || i === irrTimeline.length - 1) && (
                    <span className="text-[9px] text-bm-muted2">{point.quarter}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gross vs Net Side-by-Side Column Chart */}
      {(m.gross_irr != null || m.net_irr != null) && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 space-y-3" data-testid="gross-net-comparison">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Gross vs Net Comparison</h3>
          <div className="grid grid-cols-2 gap-6">
            {[
              { label: "Gross IRR", value: grossIrr, display: fmtPercent(m.gross_irr) },
              { label: "Net IRR", value: netIrr, display: fmtPercent(m.net_irr) },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center">
                <div className="w-full h-28 flex items-end justify-center">
                  <div
                    className={`w-16 rounded-t ${item.label.includes("Gross") ? "bg-bm-accent/60" : "bg-green-500/60"}`}
                    style={{ height: `${maxIrr > 0 ? (Math.abs(item.value) / maxIrr) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-lg font-semibold mt-2">{item.display}</span>
                <span className="text-xs text-bm-muted2">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-6 mt-2">
            {[
              { label: "Gross TVPI", value: Number(m.gross_tvpi || 0), display: fmtMultiple(m.gross_tvpi) },
              { label: "Net TVPI", value: Number(m.net_tvpi || 0), display: fmtMultiple(m.net_tvpi) },
            ].map((item) => {
              const maxTvpi = Math.max(Number(m.gross_tvpi || 0), Number(m.net_tvpi || 0), 0.01);
              return (
                <div key={item.label} className="flex flex-col items-center">
                  <div className="w-full h-16 flex items-end justify-center">
                    <div
                      className={`w-16 rounded-t ${item.label.includes("Gross") ? "bg-bm-accent/40" : "bg-green-500/40"}`}
                      style={{ height: `${maxTvpi > 0 ? (item.value / maxTvpi) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold mt-1">{item.display}</span>
                  <span className="text-xs text-bm-muted2">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              { label: "Gross IRR", value: fmtPercent(b.gross_return), color: "text-green-400" },
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
              <span className="text-sm font-semibold">= Net IRR</span>
              <span className={`text-lg font-bold ${Number(b.net_return) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {fmtPercent(b.net_return)}
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
                  <th className="px-4 py-2 font-medium">Duration</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {runs.map((r) => {
                  let duration = "—";
                  if (r.started_at && r.completed_at) {
                    const ms = new Date(r.completed_at).getTime() - new Date(r.started_at).getTime();
                    if (ms < 1000) duration = `${ms}ms`;
                    else if (ms < 60_000) duration = `${(ms / 1000).toFixed(1)}s`;
                    else duration = `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
                  } else if (r.started_at && r.status !== "success" && r.status !== "failed") {
                    duration = "running...";
                  }
                  return (
                  <tr key={r.run_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-2 font-mono text-xs">{r.run_id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-xs">{labelFn(RUN_TYPE_LABELS, r.run_type)}</td>
                    <td className="px-4 py-2 text-xs">{r.quarter}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        r.status === "success" ? "bg-green-500/20 text-green-300" :
                        r.status === "failed" ? "bg-red-500/20 text-red-300" :
                        "bg-yellow-500/20 text-yellow-300"
                      }`}>{labelFn(STATUS_LABELS, r.status)}</span>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-bm-muted2">{duration}</td>
                    <td className="px-4 py-2 text-xs text-bm-muted2">{r.started_at?.slice(0, 19).replace("T", " ")}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
