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

const EVENT_TYPE_LABELS: Record<string, string> = {
  sale: "Sale",
  partial_sale: "Partial Sale",
  refinance: "Refinance",
  operating_dist: "Operating Distribution",
};

interface DistributionEvent {
  event_id: string;
  fund_id: string;
  fund_name: string;
  event_type: string;
  total_amount: string;
  effective_date: string;
  status: string;
  created_at: string;
  payout_count: number;
  total_payouts: string;
}

const STATUS_OPTIONS = ["All", "pending", "processed", "cancelled"] as const;
const EVENT_TYPE_OPTIONS = ["All", "sale", "partial_sale", "refinance", "operating_dist"] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  processed: "bg-green-500/10 text-green-400",
  cancelled: "bg-red-500/10 text-red-400",
};

export default function DistributionsPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<DistributionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const statusFilter = searchParams.get("status") || "All";
  const eventTypeFilter = searchParams.get("event_type") || "All";
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

  const refreshEvents = useCallback(async () => {
    if (!environmentId) return;
    try {
      const url = new URL("/api/re/v2/distributions", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load distributions");
      const data = await res.json();
      setEvents(data.distributions || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load distributions");
    }
  }, [businessId, environmentId]);

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents]);

  const fundOptions = useMemo(() => {
    const funds = new Map<string, string>();
    for (const e of events) {
      funds.set(e.fund_id, e.fund_name);
    }
    return Array.from(funds.entries());
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (statusFilter !== "All" && e.status !== statusFilter) return false;
      if (eventTypeFilter !== "All" && e.event_type !== eventTypeFilter) return false;
      if (fundFilter !== "All" && e.fund_id !== fundFilter) return false;
      return true;
    });
  }, [events, statusFilter, eventTypeFilter, fundFilter]);

  const hasActiveFilters = statusFilter !== "All" || eventTypeFilter !== "All" || fundFilter !== "All";

  const totalDistributed = useMemo(() => {
    return filteredEvents.reduce((sum, e) => sum + (parseFloat(e.total_amount) || 0), 0);
  }, [filteredEvents]);

  const kpis = useMemo<KpiDef[]>(
    () => [
      { label: "Total Events", value: String(filteredEvents.length) },
      { label: "Total Distributed", value: fmtMoney(totalDistributed) },
    ],
    [filteredEvents.length, totalDistributed]
  );

  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId ? `/lab/env/${environmentId}/re/distributions` : basePath + "/distributions",
      surface: "distribution_list",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        distributions: filteredEvents.map((e) => ({
          entity_type: "distribution_event",
          entity_id: e.event_id,
          name: EVENT_TYPE_LABELS[e.event_type] || e.event_type,
          metadata: {
            fund_name: e.fund_name,
            total_amount: e.total_amount,
            status: e.status,
          },
        })),
        metrics: {
          event_count: filteredEvents.length,
          total_distributed: totalDistributed,
        },
        notes: ["Distributions list"],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, filteredEvents, totalDistributed]);

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
    <section className="flex flex-col gap-4" data-testid="re-distributions-list">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-bm-text">Distributions</h2>
          <p className="mt-1 text-sm text-bm-muted2">Track distribution events and per-partner payouts.</p>
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
          Event Type
          <select
            className="mt-1 block h-8 w-44 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
            value={eventTypeFilter}
            onChange={(e) => setFilter("event_type", e.target.value)}
            data-testid="filter-event-type"
          >
            {EVENT_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t === "All" ? "All Types" : EVENT_TYPE_LABELS[t] || t}
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

      {error && <StateCard state="error" title="Failed to load distributions" message={error} />}

      {filteredEvents.length === 0 && !error ? (
        hasActiveFilters ? (
          <div className="rounded-lg border border-bm-border/20 p-6 text-center text-sm text-bm-muted2">
            No distribution events match the current filters.
          </div>
        ) : (
          <StateCard
            state="empty"
            title="No distributions yet"
            description="Distribution data is populated from fund exit events and partner payout records."
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-bm-border/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                <th className="px-4 py-2.5 font-medium">Event Type</th>
                <th className="px-4 py-2.5 font-medium">Fund</th>
                <th className="px-4 py-2.5 font-medium">Effective Date</th>
                <th className="px-4 py-2.5 font-medium text-right">Total Amount</th>
                <th className="px-4 py-2.5 font-medium text-right">Payouts</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/10">
              {filteredEvents.map((e) => (
                <tr
                  key={e.event_id}
                  className="transition-colors duration-75 hover:bg-bm-surface/20 cursor-pointer"
                  onClick={() => router.push(`${basePath}/distributions/${e.event_id}`)}
                  data-testid={`distribution-row-${e.event_id}`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`${basePath}/distributions/${e.event_id}`}
                      className="font-medium text-bm-text hover:text-bm-accent"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {EVENT_TYPE_LABELS[e.event_type] || e.event_type}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">{e.fund_name}</td>
                  <td className="px-4 py-3 tabular-nums text-bm-muted2">{e.effective_date}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(e.total_amount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.payout_count}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[e.status] || "bg-bm-surface/40 text-bm-muted2"}`}>
                      {e.status}
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
