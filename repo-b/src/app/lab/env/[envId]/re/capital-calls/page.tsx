"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  if (Number.isNaN(n)) return "\u2014";
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

interface CapitalCall {
  call_id: string;
  fund_id: string;
  fund_name: string;
  call_number: number;
  call_date: string;
  due_date: string;
  amount_requested: string;
  purpose: string | null;
  status: string;
  created_at: string;
  contribution_count: number;
  total_contributed: string;
}

const STATUS_OPTIONS = ["All", "draft", "issued", "closed", "cancelled"] as const;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-400",
  issued: "bg-blue-500/10 text-blue-400",
  closed: "bg-green-500/10 text-green-400",
  cancelled: "bg-red-500/10 text-red-400",
};

export default function CapitalCallsPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [calls, setCalls] = useState<CapitalCall[]>([]);
  const [error, setError] = useState<string | null>(null);

  const statusFilter = searchParams.get("status") || "All";
  const fundFilter = searchParams.get("fund_id") || "All";

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

  const refreshCalls = useCallback(async () => {
    if (!environmentId) return;
    try {
      const url = new URL("/api/re/v2/capital-calls", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load capital calls");
      const data = await res.json();
      setCalls(data.capital_calls || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load capital calls");
    }
  }, [businessId, environmentId]);

  useEffect(() => {
    void refreshCalls();
  }, [refreshCalls]);

  const fundOptions = useMemo(() => {
    const funds = new Map<string, string>();
    for (const c of calls) {
      funds.set(c.fund_id, c.fund_name);
    }
    return Array.from(funds.entries());
  }, [calls]);

  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
      if (statusFilter !== "All" && c.status !== statusFilter) return false;
      if (fundFilter !== "All" && c.fund_id !== fundFilter) return false;
      return true;
    });
  }, [calls, statusFilter, fundFilter]);

  const hasActiveFilters = statusFilter !== "All" || fundFilter !== "All";

  const totalRequested = useMemo(() => {
    return filteredCalls.reduce((sum, c) => sum + (parseFloat(c.amount_requested) || 0), 0);
  }, [filteredCalls]);

  const totalContributed = useMemo(() => {
    return filteredCalls.reduce((sum, c) => sum + (parseFloat(c.total_contributed) || 0), 0);
  }, [filteredCalls]);

  const kpis = useMemo<KpiDef[]>(
    () => [
      { label: "Total Calls", value: String(filteredCalls.length) },
      { label: "Total Requested", value: fmtMoney(totalRequested) },
      { label: "Total Contributed", value: fmtMoney(totalContributed) },
    ],
    [filteredCalls.length, totalRequested, totalContributed]
  );

  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId ? `/lab/env/${environmentId}/re/capital-calls` : basePath + "/capital-calls",
      surface: "capital_call_list",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        capital_calls: filteredCalls.map((c) => ({
          entity_type: "capital_call",
          entity_id: c.call_id,
          name: `Call #${c.call_number}`,
          metadata: {
            fund_name: c.fund_name,
            amount_requested: c.amount_requested,
            status: c.status,
          },
        })),
        metrics: {
          call_count: filteredCalls.length,
          total_requested: totalRequested,
          total_contributed: totalContributed,
        },
        notes: ["Capital calls list"],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, filteredCalls, totalRequested, totalContributed]);

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
    <section className="flex flex-col gap-4" data-testid="re-capital-calls-list">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-bm-text">Capital Calls</h2>
          <p className="mt-1 text-sm text-bm-muted2">Track capital call issuance and partner contributions.</p>
        </div>
      </div>

      <KpiStrip kpis={kpis} />

      <div className="flex flex-wrap items-center gap-2">
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
          Fund
          <select
            className="mt-1 block h-8 w-48 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
            value={fundFilter}
            onChange={(e) => setFilter("fund_id", e.target.value)}
            data-testid="filter-fund"
          >
            <option value="All">All Funds</option>
            {fundOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
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

      {error && <StateCard state="error" title="Failed to load capital calls" message={error} />}

      {filteredCalls.length === 0 && !error ? (
        hasActiveFilters ? (
          <div className="rounded-lg border border-bm-border/20 p-6 text-center text-sm text-bm-muted2">
            No capital calls match the current filters.
          </div>
        ) : (
          <StateCard
            state="empty"
            title="No capital calls yet"
            description="Capital call data is populated from fund call issuance and partner contributions."
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-bm-border/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                <th className="px-4 py-2.5 font-medium">Call #</th>
                <th className="px-4 py-2.5 font-medium">Fund</th>
                <th className="px-4 py-2.5 font-medium">Call Date</th>
                <th className="px-4 py-2.5 font-medium">Due Date</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount Requested</th>
                <th className="px-4 py-2.5 font-medium text-right">Contributed</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/10">
              {filteredCalls.map((c) => (
                <tr
                  key={c.call_id}
                  className="transition-colors duration-75 hover:bg-bm-surface/20 cursor-pointer"
                  onClick={() => router.push(`${basePath}/capital-calls/${c.call_id}`)}
                  data-testid={`capital-call-row-${c.call_id}`}
                >
                  <td className="px-4 py-3 tabular-nums">
                    <Link
                      href={`${basePath}/capital-calls/${c.call_id}`}
                      className="font-medium text-bm-text hover:text-bm-accent"
                      onClick={(e) => e.stopPropagation()}
                    >
                      #{c.call_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">{c.fund_name}</td>
                  <td className="px-4 py-3 tabular-nums text-bm-muted2">{c.call_date}</td>
                  <td className="px-4 py-3 tabular-nums text-bm-muted2">{c.due_date}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(c.amount_requested)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(c.total_contributed)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[c.status] || "bg-bm-surface/40 text-bm-muted2"}`}>
                      {c.status}
                    </span>
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
