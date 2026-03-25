"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

import { fmtMoney } from '@/lib/format-utils';
function pickCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / 3);
  return `${now.getUTCFullYear()}Q${q}`;
}

interface CloseRun {
  run_id: string;
  fund_id: string;
  fund_name: string;
  quarter: string;
  status: string;
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

interface FundState {
  id: string;
  fund_id: string;
  fund_name: string;
  quarter: string;
  portfolio_nav: string;
  tvpi: string;
  net_irr: string;
}

const STATUS_OPTIONS = ["All", "pending", "running", "completed", "failed"] as const;

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-400",
    running: "bg-blue-500/10 text-blue-400",
    completed: "bg-green-500/10 text-green-400",
    failed: "bg-red-500/10 text-red-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${colors[status] || "bg-bm-surface/40 text-bm-muted2"}`}>
      {status}
    </span>
  );
}

function fmtDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "\u2014";
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "\u2014";
  const diffMs = end - start;
  if (diffMs < 0) return "\u2014";
  if (diffMs < 1000) return `${diffMs}ms`;
  const secs = Math.round(diffMs / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function fmtTimestamp(ts: string | null): string {
  if (!ts) return "\u2014";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default function PeriodClosePage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [runs, setRuns] = useState<CloseRun[]>([]);
  const [fundStates, setFundStates] = useState<FundState[]>([]);
  const [error, setError] = useState<string | null>(null);

  const statusFilter = searchParams.get("status") || "All";
  const quarterFilter = searchParams.get("quarter") || "";

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

  const refreshData = useCallback(async () => {
    if (!environmentId) return;
    try {
      const url = new URL("/api/re/v2/period-close", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load period close data");
      const data = await res.json();
      setRuns(data.runs || []);
      setFundStates(data.fund_states || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load period close data");
    }
  }, [businessId, environmentId]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (statusFilter !== "All" && run.status !== statusFilter) return false;
      if (quarterFilter && run.quarter !== quarterFilter) return false;
      return true;
    });
  }, [runs, statusFilter, quarterFilter]);

  const hasActiveFilters = statusFilter !== "All" || quarterFilter !== "";

  const completedCount = useMemo(() => runs.filter((r) => r.status === "completed").length, [runs]);

  const uniqueFundCount = useMemo(() => {
    const ids = new Set(runs.map((r) => r.fund_id));
    return ids.size;
  }, [runs]);

  const latestQuarter = useMemo(() => {
    if (fundStates.length === 0) return pickCurrentQuarter();
    return fundStates[0]?.quarter || pickCurrentQuarter();
  }, [fundStates]);

  const kpis = useMemo<KpiDef[]>(
    () => [
      { label: "Funds", value: String(uniqueFundCount) },
      { label: "Completed Closes", value: String(completedCount) },
      { label: "Latest Quarter", value: latestQuarter },
    ],
    [uniqueFundCount, completedCount, latestQuarter]
  );

  // All unique quarters for filter dropdown
  const allQuarters = useMemo(() => {
    const qs = new Set(runs.map((r) => r.quarter).filter(Boolean));
    return Array.from(qs).sort().reverse();
  }, [runs]);

  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId ? `/lab/env/${environmentId}/re/period-close` : basePath + "/period-close",
      surface: "period_close_list",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        runs: filteredRuns.map((run) => ({
          entity_type: "close_run",
          entity_id: run.run_id,
          name: `${run.fund_name} - ${run.quarter}`,
          metadata: {
            status: run.status,
            triggered_by: run.triggered_by,
          },
        })),
        metrics: {
          fund_count: uniqueFundCount,
          completed_count: completedCount,
          latest_quarter: latestQuarter,
        },
        notes: [`Period close dashboard as of ${pickCurrentQuarter()}`],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, filteredRuns, uniqueFundCount, completedCount, latestQuarter]);

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
    <section className="flex flex-col gap-4" data-testid="re-period-close-list">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-bm-text">Period Close</h2>
          <p className="mt-1 text-sm text-bm-muted2">Quarter-end close runs and fund state snapshots.</p>
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
          Quarter
          <select
            className="mt-1 block h-8 w-32 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
            value={quarterFilter}
            onChange={(e) => setFilter("quarter", e.target.value)}
            data-testid="filter-quarter"
          >
            <option value="">All Quarters</option>
            {allQuarters.map((q) => (
              <option key={q} value={q}>{q}</option>
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

      {error && <StateCard state="error" title="Failed to load period close data" message={error} />}

      {filteredRuns.length === 0 && !error ? (
        hasActiveFilters ? (
          <div className="rounded-lg border border-bm-border/20 p-6 text-center text-sm text-bm-muted2">
            No close runs match the current filters.
          </div>
        ) : (
          <StateCard
            state="empty"
            title="No period closes yet"
            description="Quarter-end close runs will appear here once initiated."
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-bm-border/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                <th className="px-4 py-2.5 font-medium">Fund</th>
                <th className="px-4 py-2.5 font-medium">Quarter</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Triggered By</th>
                <th className="px-4 py-2.5 font-medium">Started</th>
                <th className="px-4 py-2.5 font-medium">Completed</th>
                <th className="px-4 py-2.5 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/10">
              {filteredRuns.map((run) => (
                <tr
                  key={run.run_id}
                  className="transition-colors duration-75 hover:bg-bm-surface/20 cursor-pointer"
                  onClick={() => router.push(`${basePath}/period-close/${run.fund_id}`)}
                  data-testid={`close-run-${run.run_id}`}
                >
                  <td className="px-4 py-3 font-medium text-bm-text">{run.fund_name}</td>
                  <td className="px-4 py-3 tabular-nums text-bm-muted2">{run.quarter}</td>
                  <td className="px-4 py-3">{statusBadge(run.status)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{run.triggered_by || "\u2014"}</td>
                  <td className="px-4 py-3 tabular-nums text-bm-muted2">{fmtTimestamp(run.started_at)}</td>
                  <td className="px-4 py-3 tabular-nums text-bm-muted2">{fmtTimestamp(run.completed_at)}</td>
                  <td className="px-4 py-3 tabular-nums text-bm-muted2">{fmtDuration(run.started_at, run.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fund Quarter State Summary */}
      {fundStates.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-bm-text">Latest Fund Quarter States</h3>
          <div className="overflow-x-auto rounded-xl border border-bm-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2.5 font-medium">Fund</th>
                  <th className="px-4 py-2.5 font-medium">Quarter</th>
                  <th className="px-4 py-2.5 font-medium text-right">Portfolio NAV</th>
                  <th className="px-4 py-2.5 font-medium text-right">TVPI</th>
                  <th className="px-4 py-2.5 font-medium text-right">Net IRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/10">
                {fundStates.map((fs) => (
                  <tr
                    key={fs.id}
                    className="transition-colors duration-75 hover:bg-bm-surface/20 cursor-pointer"
                    onClick={() => router.push(`${basePath}/period-close/${fs.fund_id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-bm-text">{fs.fund_name}</td>
                    <td className="px-4 py-3 tabular-nums text-bm-muted2">{fs.quarter}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(fs.portfolio_nav)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fs.tvpi != null ? `${Number(fs.tvpi).toFixed(2)}x` : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fs.net_irr != null ? `${(Number(fs.net_irr) * 100).toFixed(1)}%` : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
