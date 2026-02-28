"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getReV2EnvironmentPortfolioKpis, ReV2EnvironmentPortfolioKpis, listReV1Funds, RepeFund } from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { StateCard } from "@/components/ui/StateCard";
import { MetricCard } from "@/components/ui/MetricCard";
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

export default function RepeFundsPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [portfolioKpis, setPortfolioKpis] = useState<ReV2EnvironmentPortfolioKpis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const quarter = pickCurrentQuarter();

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
    <section className="space-y-6" data-testid="re-funds-list">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-display font-bold tracking-tight">Funds</h2>
          <p className="text-sm text-bm-muted2 mt-1">Portfolio of funds in this environment.</p>
        </div>
        <Link href={`${basePath}/funds/new`}>
          <Button>+ New Fund</Button>
        </Link>
      </div>

      {/* Portfolio KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <MetricCard label="Funds" value={portfolioKpis ? String(portfolioKpis.fund_count) : "—"} size="compact" />
        <MetricCard label="Total Commitments" value={fmtMoney(portfolioKpis?.total_commitments)} size="compact" />
        <MetricCard label="Portfolio NAV" value={fmtMoney(portfolioKpis?.portfolio_nav)} size="compact" />
        <MetricCard label="Active Assets" value={portfolioKpis ? String(portfolioKpis.active_assets) : "—"} size="compact" />
      </div>

      {error && (
        <StateCard state="error" title="Failed to load funds" message={error} />
      )}

      {funds.length === 0 && !error ? (
        <StateCard
          state="empty"
          title="No funds yet"
          description="Create your first fund to get started with the portfolio."
          cta={{ label: "Create First Fund", onClick: () => { window.location.href = `${basePath}/funds/new`; } }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {funds.map((fund) => (
            <div
              key={fund.fund_id}
              className="group rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-[2px] hover:shadow-bm-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-display font-semibold truncate">{fund.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center rounded-full border border-bm-border/70 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-bm-muted2 capitalize">
                      {fund.strategy}
                    </span>
                    <span className="text-xs text-bm-muted2">{fund.base_currency || "USD"}</span>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                  fund.status === "closed"
                    ? "bg-bm-muted2/15 text-bm-muted2"
                    : fund.status === "investing"
                    ? "bg-bm-success/15 text-bm-success"
                    : "bg-bm-warning/15 text-bm-warning"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    fund.status === "closed" ? "bg-bm-muted2" : fund.status === "investing" ? "bg-bm-success" : "bg-bm-warning"
                  }`} />
                  {fund.status}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-4 text-xs text-bm-muted2">
                {fund.vintage_year && <span>Vintage {fund.vintage_year}</span>}
                {fund.inception_date && <span>Inception {fund.inception_date.slice(0, 10)}</span>}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <Link
                  href={`${basePath}/funds/${fund.fund_id}`}
                  className="rounded-lg bg-bm-accent px-3 py-1.5 text-sm font-medium text-bm-accentContrast transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-[1px]"
                >
                  Open Fund
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
