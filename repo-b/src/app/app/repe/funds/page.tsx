"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  deleteRepeFund,
  getReV2EnvironmentPortfolioKpis,
  ReV2EnvironmentPortfolioKpis,
  listReV1Funds,
  RepeFund,
  getCapitalActivity,
  getAssetMapPoints,
  type CapitalActivityResponse,
  type AssetMapResponse,
} from "@/lib/bos-api";
import { CapitalActivityCard } from "@/components/repe/portfolio/CapitalActivityCard";
import { PortfolioAssetMap } from "@/components/repe/portfolio/PortfolioAssetMap";
import { FundDeleteDialog } from "@/components/repe/FundDeleteDialog";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";
import { useToast } from "@/components/ui/Toast";
import {
  RepeIndexScaffold,
  reIndexActionClass,
  reIndexControlLabelClass,
  reIndexInputClass,
  reIndexNumericCellClass,
  reIndexPrimaryCellClass,
  reIndexSecondaryCellClass,
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

function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const STATUS_OPTIONS = ["All", "fundraising", "investing", "harvesting", "closed"] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  fundraising: { bg: "bg-bm-accent/15", text: "text-bm-accent", dot: "bg-bm-accent" },
  investing: { bg: "bg-bm-success/15", text: "text-bm-success", dot: "bg-bm-success" },
  harvesting: { bg: "bg-purple-500/15", text: "text-purple-400", dot: "bg-purple-400" },
  closed: { bg: "bg-bm-muted2/15", text: "text-bm-muted2", dot: "bg-bm-muted2" },
};

const FUND_TYPE_LABELS: Record<string, string> = {
  closed_end: "Closed-End",
  open_end: "Open-End",
  sma: "SMA",
  co_invest: "Co-Invest",
};

type SortColumn = "name" | "vintage" | "commitment" | "status";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = {
  fundraising: 0,
  investing: 1,
  harvesting: 2,
  closed: 3,
};

function RepeFundsPageContent() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const { push } = useToast();
  const searchParams = useSearchParams();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [portfolioKpis, setPortfolioKpis] = useState<ReV2EnvironmentPortfolioKpis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RepeFund | null>(null);
  const [deletingFundId, setDeletingFundId] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [capitalActivity, setCapitalActivity] = useState<CapitalActivityResponse | null>(null);
  const [capitalActivityLoading, setCapitalActivityLoading] = useState(true);
  const [capitalActivityHorizon, setCapitalActivityHorizon] = useState<"12m" | "24m" | "all">("24m");
  const [assetMap, setAssetMap] = useState<AssetMapResponse | null>(null);
  const [assetMapLoading, setAssetMapLoading] = useState(true);
  const quarter = pickCurrentQuarter();

  const strategyFilter = searchParams.get("strategy") || "All";
  const vintageFilter = searchParams.get("vintage") || "All";
  const statusFilter = searchParams.get("status") || "All";
  const searchQuery = searchParams.get("q") || "";

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "All" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  const refreshFunds = useCallback(async () => {
    if (!businessId && !environmentId) return;
    try {
      setFunds(await listReV1Funds({
        env_id: environmentId || undefined,
        business_id: businessId || undefined,
      }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load funds");
    }
  }, [businessId, environmentId]);

  const refreshPortfolioKpis = useCallback(async () => {
    if (!environmentId) {
      setPortfolioKpis(null);
      return;
    }
    try {
      setPortfolioKpis(await getReV2EnvironmentPortfolioKpis(environmentId, quarter));
    } catch {
      setPortfolioKpis(null);
    }
  }, [environmentId, quarter]);

  useEffect(() => {
    void refreshFunds();
  }, [refreshFunds]);

  useEffect(() => {
    void refreshPortfolioKpis();
  }, [refreshPortfolioKpis]);

  // Fetch capital activity for overview chart
  useEffect(() => {
    if (!businessId && !environmentId) return;
    setCapitalActivityLoading(true);
    getCapitalActivity({
      env_id: environmentId || undefined,
      business_id: businessId || undefined,
      horizon: capitalActivityHorizon,
    })
      .then(setCapitalActivity)
      .catch(() => setCapitalActivity(null))
      .finally(() => setCapitalActivityLoading(false));
  }, [businessId, environmentId, capitalActivityHorizon]);

  // Fetch asset map points for overview map
  useEffect(() => {
    if (!businessId && !environmentId) return;
    setAssetMapLoading(true);
    getAssetMapPoints({
      env_id: environmentId || undefined,
      business_id: businessId || undefined,
    })
      .then(setAssetMap)
      .catch(() => setAssetMap(null))
      .finally(() => setAssetMapLoading(false));
  }, [businessId, environmentId]);

  const strategies = useMemo(() => {
    const set = new Set<string>();
    funds.forEach((f) => {
      if (f.strategy) set.add(f.strategy);
    });
    return Array.from(set).sort();
  }, [funds]);

  const vintageYears = useMemo(() => {
    const set = new Set<string>();
    funds.forEach((f) => {
      if (f.vintage_year) set.add(String(f.vintage_year));
    });
    return Array.from(set).sort().reverse();
  }, [funds]);

  const filteredFunds = useMemo(() => {
    return funds.filter((f) => {
      if (strategyFilter !== "All" && f.strategy !== strategyFilter) return false;
      if (vintageFilter !== "All" && String(f.vintage_year) !== vintageFilter) return false;
      if (statusFilter !== "All" && f.status !== statusFilter) return false;
      if (searchQuery && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [funds, strategyFilter, vintageFilter, statusFilter, searchQuery]);

  const sortedFunds = useMemo(() => {
    if (!sortCol) return filteredFunds;
    return [...filteredFunds].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "vintage":
          cmp = (a.vintage_year || 0) - (b.vintage_year || 0);
          break;
        case "commitment":
          cmp = Number(a.target_size || 0) - Number(b.target_size || 0);
          break;
        case "status":
          cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredFunds, sortCol, sortDir]);

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const hasActiveFilters =
    strategyFilter !== "All" ||
    vintageFilter !== "All" ||
    statusFilter !== "All" ||
    searchQuery !== "";

  const uniqueStrategies = new Set(filteredFunds.map((f) => f.strategy)).size;
  const activeFundCount = filteredFunds.filter((f) => f.status === "investing").length;

  const kpis = useMemo<KpiDef[]>(
    () => [
      {
        label: "Funds",
        value: String(filteredFunds.length),
        delta: { value: `Across ${uniqueStrategies} ${uniqueStrategies === 1 ? "strategy" : "strategies"}`, tone: "neutral" as const },
      },
      {
        label: "Total Committed",
        value: fmtMoney(portfolioKpis?.total_commitments),
        delta: portfolioKpis ? { value: `${filteredFunds.filter((f) => f.target_size && Number(f.target_size) > 0).length} funds with targets`, tone: "neutral" as const } : undefined,
      },
      {
        label: "Portfolio NAV",
        value: fmtMoney(portfolioKpis?.portfolio_nav),
        delta: portfolioKpis ? { value: quarter.replace("Q", " Q"), tone: "neutral" as const } : undefined,
      },
      {
        label: "Active Assets",
        value: portfolioKpis ? String(portfolioKpis.active_assets) : "—",
        delta: activeFundCount > 0 ? { value: `across ${activeFundCount} active ${activeFundCount === 1 ? "fund" : "funds"}`, tone: "neutral" as const } : undefined,
      },
    ],
    [filteredFunds, portfolioKpis, uniqueStrategies, activeFundCount, quarter]
  );

  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId ? `/lab/env/${environmentId}/re/funds` : basePath + "/funds",
      surface: "fund_portfolio",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        funds: filteredFunds.map((fund) => ({
          entity_type: "fund",
          entity_id: fund.fund_id,
          name: fund.name,
          status: fund.status || null,
          metadata: {
            strategy: fund.strategy || null,
            vintage_year: fund.vintage_year ?? null,
          },
        })),
        metrics: {
          fund_count: filteredFunds.length,
          portfolio_nav: portfolioKpis?.portfolio_nav ?? null,
          total_commitments: portfolioKpis?.total_commitments ?? null,
          active_assets: portfolioKpis?.active_assets ?? null,
        },
        notes: [`Funds page as of ${quarter}`],
      },
    });

    return () => resetAssistantPageContext();
  }, [basePath, environmentId, filteredFunds, portfolioKpis, quarter]);

  const clearFilters = () => {
    router.replace("?", { scroll: false });
  };

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

  if (!businessId) {
    if (loading) {
      return <StateCard state="loading" />;
    }
    return (
      <StateCard
        state="error"
        title="REPE workspace not initialized"
        message={contextError || "Unable to resolve workspace context."}
        onRetry={() => void initializeWorkspace()}
      />
    );
  }

  const sortableThClass = "px-4 py-3 font-medium cursor-pointer select-none transition-colors hover:text-bm-text";

  return (
    <>
      <RepeIndexScaffold
        title="Funds"
        subtitle="Portfolio of funds in this environment."
        action={
          <Link href={`${basePath}/funds/new`} className={reIndexActionClass} data-testid="btn-new-fund">
            + New Fund
          </Link>
        }
        metrics={
          <>
            <KpiStrip variant="band" kpis={kpis} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <CapitalActivityCard
                data={capitalActivity}
                loading={capitalActivityLoading}
                onHorizonChange={setCapitalActivityHorizon}
              />
              <PortfolioAssetMap
                data={assetMap}
                loading={assetMapLoading}
              />
            </div>
          </>
        }
        controls={
          <div className="flex flex-wrap items-end gap-x-3 gap-y-3 border-b border-bm-border/20 pb-5">
            <label className={reIndexControlLabelClass}>
              Strategy
              <select
                className={`${reIndexInputClass} w-40`}
                value={strategyFilter}
                onChange={(e) => setFilter("strategy", e.target.value)}
                data-testid="filter-strategy"
              >
                <option value="All">All Strategies</option>
                {strategies.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>

            <label className={reIndexControlLabelClass}>
              Vintage
              <select
                className={`${reIndexInputClass} w-28`}
                value={vintageFilter}
                onChange={(e) => setFilter("vintage", e.target.value)}
                data-testid="filter-vintage"
              >
                <option value="All">All Years</option>
                {vintageYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>

            <label className={reIndexControlLabelClass}>
              Status
              <select
                className={`${reIndexInputClass} w-32`}
                value={statusFilter}
                onChange={(e) => setFilter("status", e.target.value)}
                data-testid="filter-status"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === "All" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label className={reIndexControlLabelClass}>
              Search
              <input
                className={`${reIndexInputClass} w-48`}
                value={searchQuery}
                onChange={(e) => setFilter("q", e.target.value)}
                placeholder="Fund name..."
                data-testid="filter-search"
              />
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center rounded-md border border-bm-border/70 px-3 text-[11px] uppercase tracking-[0.12em] text-bm-muted2 transition-colors duration-100 hover:bg-bm-surface/25 hover:text-bm-text"
              >
                Clear Filters
              </button>
            )}
          </div>
        }
        className="w-full"
      >
        <section data-testid="re-funds-list">
          {error ? (
            <StateCard state="error" title="Failed to load funds" message={error} />
          ) : sortedFunds.length === 0 ? (
            hasActiveFilters ? (
              <div className="rounded-xl border border-bm-border/20 p-6 text-center text-sm text-bm-muted2">
                No funds match the current filters.
              </div>
            ) : (
              <StateCard
                state="empty"
                title="No funds yet"
                description="Create your first fund to get started with the portfolio."
                cta={{ label: "Create First Fund", onClick: () => { window.location.href = `${basePath}/funds/new`; } }}
              />
            )
          ) : (
            <div className={reIndexTableShellClass}>
              <table className={`${reIndexTableClass} min-w-[960px]`}>
                <thead>
                  <tr className={reIndexTableHeadRowClass}>
                    <th className={sortableThClass} onClick={() => handleSort("name")}>
                      Fund {sortCol === "name" && <span className="ml-0.5 text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </th>
                    <th className={sortableThClass} onClick={() => handleSort("vintage")}>
                      Vintage {sortCol === "vintage" && <span className="ml-0.5 text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </th>
                    <th className={`${sortableThClass} text-right`} onClick={() => handleSort("commitment")}>
                      Commitment {sortCol === "commitment" && <span className="ml-0.5 text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">NAV</th>
                    <th className="px-4 py-3 text-right font-medium">DPI</th>
                    <th className="px-4 py-3 text-right font-medium">TVPI</th>
                    <th className={sortableThClass} onClick={() => handleSort("status")}>
                      Status {sortCol === "status" && <span className="ml-0.5 text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </th>
                    <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className={reIndexTableBodyClass}>
                  {sortedFunds.map((fund) => {
                    const colors = STATUS_COLORS[fund.status] || STATUS_COLORS.closed;
                    return (
                      <tr
                        key={fund.fund_id}
                        data-testid={`fund-row-${fund.fund_id}`}
                        className={reIndexTableRowClass}
                      >
                        <td className="px-4 py-4 align-middle">
                          <Link
                            href={`${basePath}/funds/${fund.fund_id}`}
                            className={reIndexPrimaryCellClass}
                          >
                            {fund.name}
                          </Link>
                          <p className={`mt-0.5 ${reIndexSecondaryCellClass}`}>
                            {fund.strategy && <span className="capitalize">{fund.strategy}</span>}
                            {fund.strategy && fund.fund_type && " · "}
                            {fund.fund_type && (FUND_TYPE_LABELS[fund.fund_type] || fund.fund_type)}
                          </p>
                        </td>
                        <td className={`px-4 py-4 align-middle ${reIndexSecondaryCellClass}`}>
                          {fund.vintage_year || "—"}
                        </td>
                        <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                          {fmtMoney(fund.target_size)}
                        </td>
                        <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass} text-bm-muted2`}>
                          —
                        </td>
                        <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass} text-bm-muted2`}>
                          —
                        </td>
                        <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass} text-bm-muted2`}>
                          —
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] capitalize ${colors.bg} ${colors.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                            {fund.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-middle text-right">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(fund); }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-bm-muted2 transition-colors hover:bg-bm-danger/10 hover:text-bm-danger"
                            data-testid={`delete-fund-${fund.fund_id}`}
                            title="Delete fund"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </button>
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

export default function RepeFundsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-bm-border/20 p-4 text-sm text-bm-muted2">
          Loading funds...
        </div>
      }
    >
      <RepeFundsPageContent />
    </Suspense>
  );
}
