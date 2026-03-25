"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCpPortfolio } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";
import type { CpPortfolioSummary, CpProjectRow } from "@/types/capital-projects";

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function healthBadge(health: string): string {
  switch (health) {
    case "green":
    case "on_track":
      return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
    case "yellow":
    case "at_risk":
      return "border-amber-500/50 bg-amber-500/10 text-amber-300";
    case "red":
    case "critical":
      return "border-rose-500/50 bg-rose-500/10 text-rose-300";
    default:
      return "border-bm-border/50 bg-bm-surface/10 text-bm-muted";
  }
}

function healthLabel(health: string): string {
  return health.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CapitalProjectsPortfolioPage() {
  const { envId, businessId } = useRepeContext();
  const [data, setData] = useState<CpPortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getCpPortfolio(envId || undefined, businessId || undefined)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load portfolio");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [envId, businessId]);

  const kpis = data?.kpis;
  const projects = data?.projects ?? [];

  return (
    <section className="space-y-5" data-testid="cp-portfolio">
      {/* Header */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Capital Projects</p>
        <h1 className="mt-1 font-display text-xl font-semibold text-bm-text">Portfolio Dashboard</h1>
        <p className="mt-1 font-mono text-xs text-bm-muted">
          Unified view of all construction and development projects
        </p>
      </div>

      {loading && <p className="text-sm text-bm-muted2">Loading portfolio data...</p>}
      {error && <p className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}

      {/* KPI Strip */}
      {kpis && (
        <>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Total Budget", value: formatMoney(kpis.total_approved_budget) },
              { label: "Committed", value: formatMoney(kpis.total_committed) },
              { label: "Spent", value: formatMoney(kpis.total_spent) },
              { label: "Forecast", value: formatMoney(kpis.total_forecast) },
              { label: "Variance", value: formatMoney(kpis.total_budget_variance), negative: Number(kpis.total_budget_variance) < 0 },
              { label: "Contingency Left", value: formatMoney(kpis.total_contingency_remaining) },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{kpi.label}</p>
                <p className={`mt-1 text-lg font-semibold ${kpi.negative ? "text-rose-300" : ""}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "On Track", value: kpis.projects_on_track, tone: "text-emerald-300" },
              { label: "At Risk", value: kpis.projects_at_risk, tone: "text-amber-300" },
              { label: "Critical", value: kpis.projects_critical, tone: "text-rose-300" },
              { label: "Open RFIs", value: kpis.total_open_rfis },
              { label: "Overdue Submittals", value: kpis.total_overdue_submittals, tone: kpis.total_overdue_submittals > 0 ? "text-amber-300" : "" },
              { label: "Open Punch Items", value: kpis.total_open_punch_items },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{kpi.label}</p>
                <p className={`mt-1 text-lg font-semibold ${kpi.tone || ""}`}>{kpi.value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Project Table */}
      {!loading && !error && projects.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-bm-border/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 bg-bm-surface/20 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-3 py-2.5 font-medium">Project</th>
                <th className="px-3 py-2.5 font-medium hidden sm:table-cell">Stage</th>
                <th className="px-3 py-2.5 font-medium hidden md:table-cell">Sector</th>
                <th className="px-3 py-2.5 font-medium text-right">Budget</th>
                <th className="px-3 py-2.5 font-medium text-center hidden lg:table-cell">Budget Health</th>
                <th className="px-3 py-2.5 font-medium text-center hidden lg:table-cell">Schedule</th>
                <th className="px-3 py-2.5 font-medium text-center hidden xl:table-cell">Open Items</th>
                <th className="px-3 py-2.5 font-medium text-center">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {projects.map((p: CpProjectRow) => {
                const openItems = p.open_rfis + p.open_submittals + p.open_punch_items + p.pending_change_orders;
                return (
                  <tr key={p.project_id} className="hover:bg-bm-surface/10 transition-colors">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/app/capital-projects/projects/${p.project_id}`}
                        className="font-medium text-bm-text hover:text-bm-accent transition-colors"
                      >
                        {p.name}
                      </Link>
                      {p.project_code && (
                        <span className="ml-2 text-xs text-bm-muted2">{p.project_code}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 capitalize hidden sm:table-cell">{p.stage}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell">{p.sector?.replace(/_/g, " ") || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(p.approved_budget)}</td>
                    <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${healthBadge(p.health.budget_health)}`}>
                        {healthLabel(p.health.budget_health)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${healthBadge(p.health.schedule_health)}`}>
                        {healthLabel(p.health.schedule_health)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center hidden xl:table-cell tabular-nums">{openItems}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${healthBadge(p.health.overall_health)}`}>
                        {healthLabel(p.health.overall_health)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="rounded-xl border border-bm-border/40 bg-bm-surface/10 p-8 text-center">
          <p className="text-sm text-bm-muted2">No capital projects found. Seed the PDS workspace first to populate project data.</p>
        </div>
      )}
    </section>
  );
}
