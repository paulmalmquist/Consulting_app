"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ui/MetricCard";
import {
  getRepeFund,
  listRepeDeals,
  RepeFundDetail,
  RepeDeal,
  getReV2FundQuarterState,
  getReV2FundMetrics,
  runReV2QuarterClose,
  listReV2Scenarios,
  ReV2FundQuarterState,
  ReV2FundMetrics,
  ReV2Scenario,
  ReV2QuarterCloseResult,
  getFiNOIVariance,
  getFiFundMetrics,
  getFiLoans,
  getFiCovenantResults,
  getFiWatchlist,
  runFiQuarterClose,
  runFiCovenantTests,
  runFiWaterfallShadow,
  listFiRuns,
  listFiUwVersions,
  getLpSummary,
  FiVarianceResult,
  FiFundMetricsResult,
  FiLoan,
  FiCovenantResult,
  FiWatchlistEvent,
  FiRun,
  FiUwVersion,
  type LpSummary,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import SaleScenarioPanel from "@/components/repe/SaleScenarioPanel";

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
  const [fundState, setFundState] = useState<ReV2FundQuarterState | null>(null);
  const [fundMetrics, setFundMetrics] = useState<ReV2FundMetrics | null>(null);
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const quarter = pickCurrentQuarter();

  const isDebtFund = detail?.fund?.strategy === "debt";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getRepeFund(params.fundId),
      listRepeDeals(params.fundId),
      getReV2FundQuarterState(params.fundId, quarter).catch(() => null),
      getReV2FundMetrics(params.fundId, quarter).catch(() => null),
      listReV2Scenarios(params.fundId).catch(() => []),
    ])
      .then(([d, dls, fs, fm, sc]) => {
        if (cancelled) return;
        setDetail(d);
        setDeals(dls);
        setFundState(fs);
        setFundMetrics(fm);
        setScenarios(sc);
      })
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
  }, [params.fundId, quarter]);

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
        <OverviewTab deals={deals} scenarios={scenarios} fund={fund} />
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
    </section>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ deals, scenarios, fund }: {
  deals: RepeDeal[];
  scenarios: ReV2Scenario[];
  fund: RepeFundDetail["fund"] | undefined;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <MetricCard label="Investments" value={String(deals.length)} size="large" />
      <MetricCard label="Strategy" value={fund?.strategy?.toUpperCase() || "—"} size="large" />
      <MetricCard label="Scenarios" value={String(scenarios.length)} size="large" />
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

function RunCenterTab({ envId, businessId, fundId, quarter, isDebtFund }: {
  envId: string; businessId: string; fundId: string; quarter: string; isDebtFund: boolean;
}) {
  const [runs, setRuns] = useState<FiRun[]>([]);
  const [uwVersions, setUwVersions] = useState<FiUwVersion[]>([]);
  const [selectedUwVersionId, setSelectedUwVersionId] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      listFiRuns({ env_id: envId, business_id: businessId, fund_id: fundId }).catch(() => []),
      listFiUwVersions({ env_id: envId, business_id: businessId }).catch(() => []),
    ]).then(([r, uv]) => {
      setRuns(r);
      setUwVersions(uv);
      if (uv.length > 0) setSelectedUwVersionId(uv[0].id);
    });
  }, [envId, businessId, fundId]);

  const refreshRuns = () => {
    listFiRuns({ env_id: envId, business_id: businessId, fund_id: fundId }).then(setRuns).catch(() => {});
  };

  const handleQuarterClose = async () => {
    setRunning("quarter_close");
    setError(null);
    setResult(null);
    try {
      const res = await runFiQuarterClose({
        env_id: envId,
        business_id: businessId,
        fund_id: fundId,
        quarter,
        uw_version_id: selectedUwVersionId || undefined,
      });
      setResult(`Quarter Close: ${res.status} (run ${res.run_id.slice(0, 8)})`);
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
      const res = await runFiWaterfallShadow({
        env_id: envId,
        business_id: businessId,
        fund_id: fundId,
        quarter,
      });
      setResult(`Waterfall Shadow: ${res.status} (carry: ${fmtMoney(res.carry_shadow)})`);
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
                  <tr key={r.id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-2 font-mono text-xs">{r.id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-xs">{r.run_type}</td>
                    <td className="px-4 py-2 text-xs">{r.quarter}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        r.status === "success" ? "bg-green-500/20 text-green-300" :
                        r.status === "failed" ? "bg-red-500/20 text-red-300" :
                        "bg-yellow-500/20 text-yellow-300"
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-bm-muted2">{r.created_at?.slice(0, 19).replace("T", " ")}</td>
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

function ScenariosTab({ envId, businessId, fundId, quarter, deals, scenarios }: {
  envId: string; businessId: string; fundId: string; quarter: string;
  deals: RepeDeal[]; scenarios: ReV2Scenario[];
}) {
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    scenarios.find((s) => !s.is_base)?.scenario_id || ""
  );

  const nonBaseScenarios = scenarios.filter((s) => !s.is_base);

  return (
    <div className="space-y-4" data-testid="scenarios-section">
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
            No scenarios created yet. Create a scenario via the API to start modeling.
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
    </div>
  );
}
