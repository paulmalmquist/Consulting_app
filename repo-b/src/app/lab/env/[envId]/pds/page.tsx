"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPdsPortfolioDashboard, runPdsReportPack, runPdsSnapshot } from "@/lib/bos-api";
import type { PdsPortfolioDashboard } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "0%";
  return `${Math.round(amount * 100)}%`;
}

export default function PdsHomePage() {
  const { envId, businessId } = useDomainEnv();
  const [period, setPeriod] = useState(currentPeriod());
  const [dashboard, setDashboard] = useState<PdsPortfolioDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await getPdsPortfolioDashboard(envId, period, businessId || undefined);
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load command center");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [businessId, envId, period]);

  async function onRunSnapshot() {
    setStatus("Running snapshot...");
    setError(null);
    try {
      const run = await runPdsSnapshot({ env_id: envId, business_id: businessId || undefined, period });
      setStatus(`Snapshot complete · run ${run.run_id}`);
      await refresh();
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Snapshot failed");
    }
  }

  async function onRunReportPack() {
    setStatus("Assembling report pack...");
    setError(null);
    try {
      const run = await runPdsReportPack({ env_id: envId, business_id: businessId || undefined, period });
      setStatus(`Report run complete · ${run.run_id}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Report pack failed");
    }
  }

  const kpis = dashboard?.kpis;

  return (
    <section className="space-y-5" data-testid="pds-command-center">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">PDS Delivery</p>
          <h2 className="text-2xl font-semibold">Portfolio Command Center</h2>
          <p className="text-sm text-bm-muted2">Period {period}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-bm-border bg-bm-surface px-2.5 py-2 text-sm"
            aria-label="period"
          />
          <button
            type="button"
            className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            onClick={() => void onRunSnapshot()}
          >
            Run Snapshot
          </button>
          <button
            type="button"
            className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            onClick={() => void onRunReportPack()}
          >
            Run Report Pack
          </button>
          <Link
            href={`/lab/env/${envId}/pds/projects/new`}
            className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
          >
            New Project
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Active Projects</p>
          <p className="mt-1 text-xl font-semibold">{kpis?.active_project_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Budget Under Mgmt</p>
          <p className="mt-1 text-xl font-semibold">{formatMoney(kpis?.approved_budget)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Projects On Schedule</p>
          <p className="mt-1 text-xl font-semibold">{formatPercent(kpis?.projects_on_schedule_pct)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Projects On Budget</p>
          <p className="mt-1 text-xl font-semibold">{formatPercent(kpis?.projects_on_budget_pct)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Pending COs</p>
          <p className="mt-1 text-xl font-semibold">{kpis?.pending_approval_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Top Risks</p>
          <p className="mt-1 text-xl font-semibold">{kpis?.top_risk_count ?? 0}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Project Health Grid</h3>
            <Link href={`/lab/env/${envId}/pds/projects`} className="text-xs text-bm-muted2 hover:underline">
              View all projects
            </Link>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {loading ? (
              <p className="text-sm text-bm-muted2">Loading dashboard...</p>
            ) : dashboard?.projects.length ? (
              dashboard.projects.map((project) => (
                <Link
                  key={project.project_id}
                  href={`/lab/env/${envId}/pds/projects/${project.project_id}`}
                  className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-3 hover:bg-bm-surface/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{project.name}</div>
                      <div className="text-xs text-bm-muted2">
                        {project.project_code || "No code"}
                        {project.sector ? ` · ${project.sector}` : ""}
                      </div>
                    </div>
                    <span className="text-xs text-bm-muted2">{project.schedule_health.replace(/_/g, " ")}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-bm-muted2">
                        <span>Budget</span>
                        <span>{formatPercent(project.budget_used_ratio)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-bm-surface">
                        <div className="h-full bg-bm-accent" style={{ width: formatPercent(project.budget_used_ratio) }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-bm-muted2">
                      <span>Open RFIs {project.open_rfis}</span>
                      <span>Open Risks {project.open_risks}</span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-bm-muted2">No projects yet. Create the first project to populate the command center.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h3 className="text-sm font-semibold">Alert Panel</h3>
            <div className="mt-3 space-y-2">
              {loading ? (
                <p className="text-sm text-bm-muted2">Loading alerts...</p>
              ) : dashboard?.alerts.length ? (
                dashboard.alerts.map((alert, index) => (
                  <div key={`${alert.project_id}-${index}`} className="rounded-lg border border-bm-border/50 px-3 py-2 text-sm">
                    {alert.message}
                  </div>
                ))
              ) : (
                <p className="text-sm text-bm-muted2">No active alerts.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h3 className="text-sm font-semibold">Recent Activity</h3>
            <div className="mt-3 space-y-2">
              {loading ? (
                <p className="text-sm text-bm-muted2">Loading activity...</p>
              ) : dashboard?.recent_activity.length ? (
                dashboard.recent_activity.map((item, index) => (
                  <div key={`${item.project_id}-${index}`} className="rounded-lg border border-bm-border/50 px-3 py-2">
                    <div className="text-sm font-medium">{item.project_name}</div>
                    <div className="text-xs text-bm-muted2">
                      {item.type.replace(/_/g, " ")} · {item.label || "Activity"} · {item.status || "active"}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-bm-muted2">No recent activity yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {status ? <p className="text-xs text-bm-muted2">{status}</p> : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </section>
  );
}
