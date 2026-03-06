"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  getReV2EnvironmentPortfolioKpis,
  ReV2EnvironmentPortfolioKpis,
  listReV1Funds,
  RepeFund,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";
import { Button } from "@/components/ui/Button";

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

const STATUS_OPTIONS = ["All", "investing", "closed", "fundraising"] as const;

function RepeFundsPageContent() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [portfolioKpis, setPortfolioKpis] = useState<ReV2EnvironmentPortfolioKpis | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!businessId && !environmentId) return;
    listReV1Funds({
      env_id: environmentId || undefined,
      business_id: businessId || undefined,
    })
      .then(setFunds)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load funds"));
  }, [businessId, environmentId]);

  useEffect(() => {
    if (!environmentId) {
      setPortfolioKpis(null);
      return;
    }
    getReV2EnvironmentPortfolioKpis(environmentId, quarter)
      .then(setPortfolioKpis)
      .catch(() => setPortfolioKpis(null));
  }, [environmentId, quarter]);

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

  const hasActiveFilters =
    strategyFilter !== "All" ||
    vintageFilter !== "All" ||
    statusFilter !== "All" ||
    searchQuery !== "";

  const kpis = useMemo<KpiDef[]>(
    () => [
      { label: "Funds", value: String(filteredFunds.length) },
      { label: "Total Committed", value: fmtMoney(portfolioKpis?.total_commitments) },
      { label: "Portfolio NAV", value: fmtMoney(portfolioKpis?.portfolio_nav) },
      { label: "Active Assets", value: portfolioKpis ? String(portfolioKpis.active_assets) : "—" },
      { label: "Warnings", value: portfolioKpis ? String(portfolioKpis.warnings.length) : "—" },
    ],
    [filteredFunds.length, portfolioKpis]
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

  return (
    <section className="flex flex-col gap-4" data-testid="re-funds-list">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-bm-text">Funds</h2>
          <p className="mt-1 text-sm text-bm-muted2">Portfolio of funds in this environment.</p>
        </div>
        <Link href={`${basePath}/funds/new`}>
          <Button className="h-auto rounded-md px-3 py-1.5 text-sm shadow-none transition-colors duration-100 hover:translate-y-0 hover:shadow-none">
            + New Fund
          </Button>
        </Link>
      </div>

      <KpiStrip kpis={kpis} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Strategy
          <select
            className="mt-1 block h-8 w-40 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
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

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Vintage
          <select
            className="mt-1 block h-8 w-28 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
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

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Status
          <select
            className="mt-1 block h-8 w-32 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
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

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Search
          <input
            className="mt-1 block h-8 w-48 rounded-md border border-bm-border/30 bg-bm-surface/40 px-3 text-xs placeholder:text-bm-muted2"
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
            className="rounded-md border border-bm-border/30 px-3 py-1.5 text-xs text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text"
          >
            Clear Filters
          </button>
        )}
      </div>

      {error && (
        <StateCard state="error" title="Failed to load funds" message={error} />
      )}

      {filteredFunds.length === 0 && !error ? (
        hasActiveFilters ? (
          <div className="rounded-lg border border-bm-border/20 p-6 text-center text-sm text-bm-muted2">
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredFunds.map((fund) => (
            <div
              key={fund.fund_id}
              data-testid={`fund-row-${fund.fund_id}`}
              className="rounded-lg border border-bm-border/20 bg-bm-surface/40 p-4 transition-colors duration-100 hover:bg-bm-surface/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-semibold text-bm-text">
                    <Link href={`${basePath}/funds/${fund.fund_id}`} className="hover:text-bm-accent">
                      {fund.name}
                    </Link>
                  </h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-bm-border/30 px-2.5 py-0.5 font-mono text-[11px] text-bm-muted capitalize">
                      {fund.strategy}
                    </span>
                    <span className="font-mono text-xs text-bm-muted">{fund.base_currency || "USD"}</span>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] capitalize ${
                  fund.status === "closed"
                    ? "bg-bm-muted2/15 text-bm-muted2"
                    : fund.status === "investing"
                    ? "bg-bm-success/15 text-bm-success"
                    : "bg-bm-warning/15 text-bm-warning"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    fund.status === "closed"
                      ? "bg-bm-muted2"
                      : fund.status === "investing"
                      ? "bg-bm-success"
                      : "bg-bm-warning"
                  }`} />
                  {fund.status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-bm-muted">
                {fund.vintage_year && <span>Vintage {fund.vintage_year}</span>}
                {fund.inception_date && <span>Inception {fund.inception_date.slice(0, 10)}</span>}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Target</p>
                  <p className="mt-1 text-sm font-semibold text-bm-text tabular-nums">{fmtMoney(fund.target_size)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Term</p>
                  <p className="mt-1 text-sm font-semibold text-bm-text tabular-nums">
                    {fund.term_years ? `${fund.term_years}Y` : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Cadence</p>
                  <p className="mt-1 text-sm font-semibold text-bm-text">{fund.quarter_cadence.replace(/_/g, " ")}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <Link
                  href={`${basePath}/funds/${fund.fund_id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-bm-border/30 px-2.5 py-1.5 font-mono text-xs text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text"
                >
                  Open Fund
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
