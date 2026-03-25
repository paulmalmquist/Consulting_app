"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

import { fmtMoney, fmtMultiple } from '@/lib/format-utils';
function pickCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / 3);
  return `${now.getUTCFullYear()}Q${q}`;
}

interface Investor {
  partner_id: string;
  name: string;
  partner_type: string;
  created_at: string;
  fund_count: number;
  total_committed: string;
  tvpi: string | null;
  irr: string | null;
}

const TYPE_OPTIONS = ["All", "lp", "gp", "co_invest"] as const;

export default function InvestorsPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const quarter = pickCurrentQuarter();

  const typeFilter = searchParams.get("type") || "All";
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

  const refreshInvestors = useCallback(async () => {
    if (!environmentId) return;
    try {
      const url = new URL("/api/re/v2/investors", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      url.searchParams.set("quarter", quarter);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load investors");
      const data = await res.json();
      setInvestors(data.investors || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load investors");
    }
  }, [businessId, environmentId, quarter]);

  useEffect(() => {
    void refreshInvestors();
  }, [refreshInvestors]);

  const filteredInvestors = useMemo(() => {
    return investors.filter((inv) => {
      if (typeFilter !== "All" && inv.partner_type !== typeFilter) return false;
      if (searchQuery && !inv.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [investors, typeFilter, searchQuery]);

  const hasActiveFilters = typeFilter !== "All" || searchQuery !== "";

  const totalCommitted = useMemo(() => {
    return filteredInvestors.reduce((sum, inv) => sum + (parseFloat(inv.total_committed) || 0), 0);
  }, [filteredInvestors]);

  const kpis = useMemo<KpiDef[]>(
    () => [
      { label: "Investors", value: String(filteredInvestors.length) },
      { label: "Total Committed", value: fmtMoney(totalCommitted) },
    ],
    [filteredInvestors.length, totalCommitted]
  );

  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId ? `/lab/env/${environmentId}/re/investors` : basePath + "/investors",
      surface: "investor_list",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        investors: filteredInvestors.map((inv) => ({
          entity_type: "investor",
          entity_id: inv.partner_id,
          name: inv.name,
          metadata: {
            partner_type: inv.partner_type,
            fund_count: inv.fund_count,
            total_committed: inv.total_committed,
          },
        })),
        metrics: {
          investor_count: filteredInvestors.length,
          total_committed: totalCommitted,
        },
        notes: [`Investors page as of ${quarter}`],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, filteredInvestors, totalCommitted, quarter]);

  if (!businessId) {
    if (loading) return <StateCard state="loading" />;
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
    <section className="flex flex-col gap-4" data-testid="re-investors-list">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-bm-text">Investors</h2>
          <p className="mt-1 text-sm text-bm-muted2">Limited partners and co-investors across funds.</p>
        </div>
      </div>

      <KpiStrip kpis={kpis} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Type
          <select
            className="mt-1 block h-8 w-32 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
            value={typeFilter}
            onChange={(e) => setFilter("type", e.target.value)}
            data-testid="filter-type"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t === "All" ? "All Types" : t === "lp" ? "LP" : t === "gp" ? "GP" : "Co-Invest"}
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
            placeholder="Investor name..."
            data-testid="filter-search"
          />
        </label>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => router.replace("?", { scroll: false })}
            className="rounded-md border border-bm-border/30 px-3 py-1.5 text-xs text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text"
          >
            Clear Filters
          </button>
        )}
      </div>

      {error && <StateCard state="error" title="Failed to load investors" message={error} />}

      {filteredInvestors.length === 0 && !error ? (
        hasActiveFilters ? (
          <div className="rounded-lg border border-bm-border/20 p-6 text-center text-sm text-bm-muted2">
            No investors match the current filters.
          </div>
        ) : (
          <StateCard
            state="empty"
            title="No investors yet"
            description="Investor data is populated from fund partner records and commitments."
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-bm-border/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium text-right">Funds</th>
                <th className="px-4 py-2.5 font-medium text-right">Total Committed</th>
                <th className="px-4 py-2.5 font-medium text-right">TVPI</th>
                <th className="px-4 py-2.5 font-medium text-right">IRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/10">
              {filteredInvestors.map((inv) => (
                <tr
                  key={inv.partner_id}
                  className="transition-colors duration-75 hover:bg-bm-surface/20 cursor-pointer"
                  onClick={() => router.push(`${basePath}/investors/${inv.partner_id}`)}
                  data-testid={`investor-row-${inv.partner_id}`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`${basePath}/investors/${inv.partner_id}`}
                      className="font-medium text-bm-text hover:text-bm-accent"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {inv.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">
                    <span className="rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs">
                      {inv.partner_type === "lp" ? "LP" : inv.partner_type === "gp" ? "GP" : inv.partner_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{inv.fund_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(inv.total_committed)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMultiple(inv.tvpi)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {inv.irr != null ? `${(Number(inv.irr) * 100).toFixed(1)}%` : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
