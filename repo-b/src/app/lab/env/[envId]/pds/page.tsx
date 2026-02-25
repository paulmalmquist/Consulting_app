"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createPdsProject,
  getPdsPortfolio,
  listPdsProjects,
  runPdsReportPack,
  runPdsSnapshot,
  PdsPortfolioKpis,
  PdsProject,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function fmtMoney(value?: string | number | null): string {
  if (value === null || value === undefined) return "$0";
  const n = Number(value);
  if (Number.isNaN(n)) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function PdsHomePage() {
  const { envId, businessId } = useDomainEnv();
  const [period, setPeriod] = useState(currentPeriod());
  const [projects, setProjects] = useState<PdsProject[]>([]);
  const [portfolio, setPortfolio] = useState<PdsPortfolioKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    project_manager: "",
    stage: "planning",
    approved_budget: "",
    contingency_budget: "",
  });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [projectRows, portfolioRow] = await Promise.all([
        listPdsProjects(envId, businessId || undefined),
        getPdsPortfolio(envId, period, businessId || undefined).catch(() => null),
      ]);
      setProjects(projectRows);
      setPortfolio(portfolioRow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PDS workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId, period]);

  async function onCreateProject(event: FormEvent) {
    event.preventDefault();
    setStatus("Creating project...");
    setError(null);
    try {
      await createPdsProject({
        env_id: envId,
        business_id: businessId || undefined,
        name: form.name,
        stage: form.stage,
        project_manager: form.project_manager || undefined,
        approved_budget: form.approved_budget || "0",
        contingency_budget: form.contingency_budget || "0",
      });
      setForm({ name: "", project_manager: "", stage: "planning", approved_budget: "", contingency_budget: "" });
      await refresh();
      setStatus("Project created.");
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Failed to create project");
    }
  }

  async function onRunSnapshot() {
    setStatus("Running snapshot...");
    setError(null);
    try {
      await runPdsSnapshot({ env_id: envId, business_id: businessId || undefined, period });
      await refresh();
      setStatus("Snapshot completed.");
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Failed to run snapshot");
    }
  }

  async function onRunReportPack() {
    setStatus("Assembling report pack...");
    setError(null);
    try {
      const report = await runPdsReportPack({ env_id: envId, business_id: businessId || undefined, period });
      setStatus(`Report run complete: ${report.run_id}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Failed to run report pack");
    }
  }

  const kpis = useMemo(() => {
    const p = portfolio;
    return [
      { label: "Approved Budget", value: fmtMoney(p?.approved_budget) },
      { label: "Committed", value: fmtMoney(p?.committed) },
      { label: "Spent", value: fmtMoney(p?.spent) },
      { label: "EAC", value: fmtMoney(p?.eac) },
      { label: "Variance", value: fmtMoney(p?.variance) },
      { label: "Contingency Remaining", value: fmtMoney(p?.contingency_remaining) },
      { label: "Open COs", value: p?.open_change_order_count ?? 0 },
      { label: "Pending Approvals", value: p?.pending_approval_count ?? 0 },
      { label: "Top Risks", value: p?.top_risk_count ?? 0 },
    ];
  }, [portfolio]);

  return (
    <section className="space-y-5" data-testid="pds-command-center">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Portfolio Command Center</h2>
          <p className="text-sm text-bm-muted2">Period {period}</p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{kpi.label}</p>
            <p className="mt-1 text-xl font-semibold">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr,360px] gap-4">
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">PM</th>
                <th className="px-4 py-3 font-medium">Approved</th>
                <th className="px-4 py-3 font-medium">EAC</th>
                <th className="px-4 py-3 font-medium">Variance</th>
                <th className="px-4 py-3 font-medium">Open CO $</th>
                <th className="px-4 py-3 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-bm-muted2" colSpan={8}>Loading projects...</td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-bm-muted2" colSpan={8}>No projects yet. Create one to initialize the command center.</td>
                </tr>
              ) : (
                projects.map((project) => (
                  <tr key={project.project_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/lab/env/${envId}/pds/projects/${project.project_id}`} className="hover:underline">
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize">{project.stage.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-bm-muted2">{project.project_manager || "—"}</td>
                    <td className="px-4 py-3">{fmtMoney(project.approved_budget)}</td>
                    <td className="px-4 py-3">{fmtMoney(project.forecast_at_completion)}</td>
                    <td className="px-4 py-3">{fmtMoney(Number(project.approved_budget) - Number(project.forecast_at_completion))}</td>
                    <td className="px-4 py-3">{fmtMoney(project.pending_change_order_amount)}</td>
                    <td className="px-4 py-3">{fmtMoney(project.risk_score)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Create Project</h3>
          <form className="space-y-2" onSubmit={onCreateProject}>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Project name"
              className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <input
              value={form.project_manager}
              onChange={(e) => setForm((prev) => ({ ...prev, project_manager: e.target.value }))}
              placeholder="Project manager"
              className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <select
              value={form.stage}
              onChange={(e) => setForm((prev) => ({ ...prev, stage: e.target.value }))}
              className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            >
              <option value="planning">Planning</option>
              <option value="preconstruction">Preconstruction</option>
              <option value="procurement">Procurement</option>
              <option value="construction">Construction</option>
              <option value="closeout">Closeout</option>
            </select>
            <input
              value={form.approved_budget}
              onChange={(e) => setForm((prev) => ({ ...prev, approved_budget: e.target.value }))}
              placeholder="Approved budget"
              className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <input
              value={form.contingency_budget}
              onChange={(e) => setForm((prev) => ({ ...prev, contingency_budget: e.target.value }))}
              placeholder="Contingency"
              className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <button type="submit" className="w-full rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
              Add Project
            </button>
          </form>
          {status ? <p className="text-xs text-bm-muted2">{status}</p> : null}
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
