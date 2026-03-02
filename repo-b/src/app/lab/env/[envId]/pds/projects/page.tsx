"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listPdsProjects } from "@/lib/bos-api";
import type { PdsProject } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const STATUS_STYLES: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  archived: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  cancelled: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  on_hold: "border-amber-500/30 bg-amber-500/10 text-amber-200",
};

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ratio(value: string | number, total: string | number): number {
  const numerator = Number(value);
  const denominator = Number(total);
  if (!denominator || Number.isNaN(numerator) || Number.isNaN(denominator)) return 0;
  return Math.max(0, Math.min(1, numerator / denominator));
}

export default function PdsProjectsIndexPage() {
  const { envId, businessId } = useDomainEnv();
  const [projects, setProjects] = useState<PdsProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    stage: "",
    status: "",
    project_manager: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await listPdsProjects(envId, businessId || undefined, {
          stage: filters.stage || undefined,
          status: filters.status || undefined,
          project_manager: filters.project_manager || undefined,
          limit: 100,
        });
        if (!cancelled) setProjects(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load projects");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [businessId, envId, filters]);

  const managerOptions = useMemo(() => {
    const values = new Set<string>();
    projects.forEach((project) => {
      if (project.project_manager) values.add(project.project_manager);
    });
    return Array.from(values).sort();
  }, [projects]);

  return (
    <section className="space-y-4" data-testid="pds-projects-index">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">PDS Delivery</p>
          <h2 className="text-2xl font-semibold">Projects</h2>
          <p className="text-sm text-bm-muted2">Portfolio delivery health across all active jobs.</p>
        </div>
        <Link
          href={`/lab/env/${envId}/pds/projects/new`}
          className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
        >
          New Project
        </Link>
      </div>

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Stage
            <select
              className="mt-1 block w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={filters.stage}
              onChange={(e) => setFilters((current) => ({ ...current, stage: e.target.value }))}
            >
              <option value="">All Stages</option>
              <option value="planning">Planning</option>
              <option value="preconstruction">Preconstruction</option>
              <option value="procurement">Procurement</option>
              <option value="construction">Construction</option>
              <option value="closeout">Closeout</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Status
            <select
              className="mt-1 block w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={filters.status}
              onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Project Manager
            <select
              className="mt-1 block w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={filters.project_manager}
              onChange={(e) => setFilters((current) => ({ ...current, project_manager: e.target.value }))}
            >
              <option value="">All Managers</option>
              {managerOptions.map((manager) => (
                <option key={manager} value={manager}>
                  {manager}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-bm-border/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Start</th>
              <th className="px-4 py-3 font-medium">Target End</th>
              <th className="px-4 py-3 font-medium">Budget</th>
              <th className="px-4 py-3 font-medium">% Used</th>
              <th className="px-4 py-3 font-medium">PM</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-bm-muted2">
                  Loading projects...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-red-300">
                  {error}
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-bm-muted2">
                  No projects match the current filters.
                </td>
              </tr>
            ) : (
              projects.map((project) => {
                const usedRatio = ratio(project.spent_amount, project.approved_budget);
                return (
                  <tr key={project.project_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3">
                      <div className="font-medium">{project.name}</div>
                      <div className="text-xs text-bm-muted2">
                        {project.project_code || "No code"}
                        {project.sector ? ` · ${project.sector}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">{project.stage.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${
                          STATUS_STYLES[project.status] || "border-bm-border/70 bg-bm-surface/40 text-bm-text"
                        }`}
                      >
                        {project.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-bm-muted2">{formatDate(project.start_date)}</td>
                    <td className="px-4 py-3 text-bm-muted2">{formatDate(project.target_end_date)}</td>
                    <td className="px-4 py-3">{formatMoney(project.approved_budget)}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="h-2 overflow-hidden rounded-full bg-bm-surface">
                          <div
                            className={`h-full ${usedRatio > 0.9 ? "bg-rose-400" : "bg-bm-accent"}`}
                            style={{ width: `${Math.round(usedRatio * 100)}%` }}
                          />
                        </div>
                        <div className="text-xs text-bm-muted2">{Math.round(usedRatio * 100)}%</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-bm-muted2">{project.project_manager || "—"}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/lab/env/${envId}/pds/projects/${project.project_id}`}
                        className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
