"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getPdsProjectBudget,
  getPdsProjectOverview,
  getPdsProjectSchedule,
  listPdsProjectChangeOrders,
  listPdsProjectContracts,
  listPdsProjectSiteReports,
  runPdsReportPack,
  runPdsSnapshot,
} from "@/lib/bos-api";
import type { PdsChangeOrder, PdsProjectOverview, PdsSiteReport } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const TABS = ["Overview", "Budget", "Schedule", "Change Orders", "Contracts", "Field Reports", "AI Assistant"] as const;

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

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PdsProjectCockpitPage({ params }: { params: { projectId: string; envId: string } }) {
  const { envId, businessId } = useDomainEnv();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Overview");
  const [period, setPeriod] = useState(currentPeriod());
  const [overview, setOverview] = useState<PdsProjectOverview | null>(null);
  const [budget, setBudget] = useState<Awaited<ReturnType<typeof getPdsProjectBudget>> | null>(null);
  const [schedule, setSchedule] = useState<Awaited<ReturnType<typeof getPdsProjectSchedule>> | null>(null);
  const [changeOrders, setChangeOrders] = useState<PdsChangeOrder[]>([]);
  const [contracts, setContracts] = useState<Array<Record<string, unknown>>>([]);
  const [siteReports, setSiteReports] = useState<PdsSiteReport[]>([]);
  const [beforeAfterMode, setBeforeAfterMode] = useState<"before" | "after">("before");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [overviewData, budgetData, scheduleData, changeOrderData, contractData, reportData] = await Promise.all([
          getPdsProjectOverview(params.projectId, envId, businessId || undefined),
          getPdsProjectBudget(params.projectId, envId, businessId || undefined),
          getPdsProjectSchedule(params.projectId, envId, businessId || undefined),
          listPdsProjectChangeOrders(params.projectId, envId, businessId || undefined),
          listPdsProjectContracts(params.projectId, envId, businessId || undefined),
          listPdsProjectSiteReports(params.projectId, envId, businessId || undefined),
        ]);

        if (cancelled) return;
        setOverview(overviewData);
        setBudget(budgetData);
        setSchedule(scheduleData);
        setChangeOrders(changeOrderData);
        setContracts(contractData);
        setSiteReports(reportData);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load project cockpit");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [businessId, envId, params.projectId]);

  async function onRunSnapshot() {
    setStatus("Running project snapshot...");
    setError(null);
    try {
      const run = await runPdsSnapshot({
        env_id: envId,
        business_id: businessId || undefined,
        period,
        project_id: params.projectId,
      });
      setStatus(`Snapshot complete · run ${run.run_id}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Snapshot failed");
    }
  }

  async function onRunReport() {
    setStatus("Building report pack...");
    setError(null);
    try {
      const run = await runPdsReportPack({
        env_id: envId,
        business_id: businessId || undefined,
        period,
      });
      setStatus(`Report pack complete · run ${run.run_id}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Report pack failed");
    }
  }

  const kpis = useMemo(() => {
    if (!overview) return [];
    return [
      { label: "Budget Health", value: formatMoney(overview.budget.variance) },
      { label: "Schedule Health", value: overview.schedule.schedule_health.replace(/_/g, " ") },
      { label: "Open RFIs", value: overview.counts.open_rfis },
      { label: "Open Risks", value: overview.counts.open_risks },
      { label: "Team Size", value: overview.counts.team_size },
      { label: "Pending COs", value: overview.counts.pending_change_orders },
    ];
  }, [overview]);

  const project = overview?.project;
  const projectedRecovery = useMemo(() => {
    if (!overview) return null;
    const variance = Number(overview.budget.variance || 0);
    const slipDays = Number(overview.schedule.total_slip_days || 0);
    const pendingChangeOrders = Number(overview.counts.pending_change_orders || 0);
    const criticalFlags = Number(overview.schedule.critical_flags || 0);
    const varianceReduction = Math.round(Math.abs(variance) * Math.min(0.45, 0.2 + pendingChangeOrders * 0.05));
    const slipReduction = Math.min(slipDays, Math.max(7, criticalFlags * 5));
    const projectedVariance = variance < 0 ? variance + varianceReduction : variance;
    const projectedSlip = Math.max(0, slipDays - slipReduction);
    return {
      variance,
      projectedVariance,
      slipDays,
      projectedSlip,
      recommendedAction:
        pendingChangeOrders > 0
          ? "Approve the recovery change package and lock the revised forecast."
          : criticalFlags > 0
            ? "Escalate the critical path recovery plan with the primary vendor."
            : "Reforecast the remaining work and clear remaining blockers.",
    };
  }, [overview]);

  return (
    <section className="space-y-4" data-testid="pds-project-cockpit">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Project Cockpit</p>
          <h2 className="text-2xl font-semibold">{project?.name || `Project ${params.projectId.slice(0, 8)}`}</h2>
          <p className="text-sm text-bm-muted2">
            {project?.project_code || "No code"}
            {project?.sector ? ` · ${project.sector}` : ""}
            {project?.project_type ? ` · ${project.project_type}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-bm-border bg-bm-surface px-2.5 py-2 text-sm"
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
            onClick={() => void onRunReport()}
          >
            Generate Recovery Report
          </button>
          <Link
            href={`/lab/env/${envId}/pds/projects`}
            className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
          >
            Back to Projects
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{kpi.label}</p>
            <p className="mt-1 text-lg font-semibold">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-2 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                tab === activeTab
                  ? "border-bm-accent/60 bg-bm-accent/10"
                  : "border-bm-border/70 hover:bg-bm-surface/40"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        {loading ? <p className="text-sm text-bm-muted2">Loading project data...</p> : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        {!loading && !error && activeTab === "Overview" && overview ? (
          <div className="space-y-4">
            {projectedRecovery ? (
              <section className="rounded-xl border border-pds-accent/25 bg-pds-accent/[0.08] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Before / After</p>
                    <h3 className="mt-1 text-lg font-semibold text-bm-text">What changes if we execute the recommendation?</h3>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setBeforeAfterMode("before")}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${beforeAfterMode === "before" ? "border-pds-accent/35 bg-pds-accent/10 text-pds-accentText" : "border-bm-border/60 text-bm-muted2"}`}
                    >
                      Before
                    </button>
                    <button
                      type="button"
                      onClick={() => setBeforeAfterMode("after")}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${beforeAfterMode === "after" ? "border-pds-accent/35 bg-pds-accent/10 text-pds-accentText" : "border-bm-border/60 text-bm-muted2"}`}
                    >
                      After
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-bm-border/60 bg-[#101922] p-3">
                    <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Variance</div>
                    <div className={`mt-1 text-lg font-semibold ${(beforeAfterMode === "before" ? projectedRecovery.variance : projectedRecovery.projectedVariance) < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                      {formatMoney(beforeAfterMode === "before" ? projectedRecovery.variance : projectedRecovery.projectedVariance)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-bm-border/60 bg-[#101922] p-3">
                    <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Schedule Slip</div>
                    <div className="mt-1 text-lg font-semibold">
                      {beforeAfterMode === "before" ? projectedRecovery.slipDays : projectedRecovery.projectedSlip} days
                    </div>
                  </div>
                  <div className="rounded-lg border border-bm-border/60 bg-[#101922] p-3">
                    <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Recommended Action</div>
                    <div className="mt-1 text-sm font-medium text-bm-text">{projectedRecovery.recommendedAction}</div>
                  </div>
                </div>
              </section>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
              <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Milestone Timeline</p>
                <div className="mt-3 space-y-2">
                  {overview.schedule.items.length === 0 ? (
                    <p className="text-sm text-bm-muted2">No milestones have been loaded yet.</p>
                  ) : (
                    overview.schedule.items.map((item) => (
                      <div key={item.milestone_id} className="rounded-lg border border-bm-border/50 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{item.milestone_name}</div>
                            <div className="text-xs text-bm-muted2">
                              Baseline {formatDate(item.baseline_date)} · Current {formatDate(item.current_date)}
                            </div>
                          </div>
                          <span className="text-xs text-bm-muted2">{item.is_critical ? "Critical" : "Standard"}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Recent Activity</p>
                <div className="mt-3 space-y-2">
                  {overview.recent_activity.length === 0 ? (
                    <p className="text-sm text-bm-muted2">No recent activity yet.</p>
                  ) : (
                    overview.recent_activity.map((item, index) => (
                      <div key={`${item.type}-${index}`} className="rounded-lg border border-bm-border/50 px-3 py-2">
                        <div className="text-sm font-medium">{item.label || item.type}</div>
                        <div className="text-xs text-bm-muted2">
                          {item.type.replace(/_/g, " ")} · {item.status || "active"} · {formatDate(item.created_at)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTab === "Budget" && budget ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-bm-border/60 p-3">
                <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Approved</div>
                <div className="mt-1 text-lg font-semibold">{formatMoney(budget.totals.approved_budget)}</div>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Committed</div>
                <div className="mt-1 text-lg font-semibold">{formatMoney(budget.totals.committed_amount)}</div>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Spent</div>
                <div className="mt-1 text-lg font-semibold">{formatMoney(budget.totals.spent_amount)}</div>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Variance</div>
                <div className={`mt-1 text-lg font-semibold ${Number(budget.totals.variance) < 0 ? "text-rose-300" : ""}`}>
                  {formatMoney(budget.totals.variance)}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-bm-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/50 bg-bm-surface/20 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                    <th className="px-3 py-2 font-medium">Cost Code</th>
                    <th className="px-3 py-2 font-medium">Line</th>
                    <th className="px-3 py-2 font-medium">Approved</th>
                    <th className="px-3 py-2 font-medium">Committed</th>
                    <th className="px-3 py-2 font-medium">Invoiced</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/40">
                  {budget.lines.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-bm-muted2" colSpan={5}>
                        No budget lines have been loaded yet.
                      </td>
                    </tr>
                  ) : (
                    budget.lines.map((line) => (
                      <tr key={line.budget_line_id}>
                        <td className="px-3 py-2">{line.cost_code}</td>
                        <td className="px-3 py-2">{line.line_label}</td>
                        <td className="px-3 py-2">{formatMoney(line.approved_amount)}</td>
                        <td className="px-3 py-2">{formatMoney(line.committed_amount)}</td>
                        <td className="px-3 py-2">{formatMoney(line.invoiced_amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTab === "Schedule" && schedule ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-bm-muted2">
              <span>Health: {schedule.schedule_health.replace(/_/g, " ")}</span>
              <span>Total slip: {schedule.total_slip_days} days</span>
              <span>Critical flags: {schedule.critical_flags}</span>
              <span>Next milestone: {formatDate(schedule.next_milestone_date)}</span>
            </div>
            <div className="space-y-2">
              {schedule.items.length === 0 ? (
                <p className="text-sm text-bm-muted2">No milestones have been defined yet.</p>
              ) : (
                schedule.items.map((item) => (
                  <div key={item.milestone_id} className="rounded-lg border border-bm-border/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{item.milestone_name}</div>
                        <div className="text-xs text-bm-muted2">
                          Baseline {formatDate(item.baseline_date)} · Current {formatDate(item.current_date)} · Actual {formatDate(item.actual_date)}
                        </div>
                      </div>
                      {item.slip_reason ? <div className="text-xs text-amber-200">{item.slip_reason}</div> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTab === "Change Orders" ? (
          <div className="space-y-2">
            {changeOrders.length === 0 ? (
              <p className="text-sm text-bm-muted2">No change orders yet.</p>
            ) : (
              changeOrders.map((changeOrder) => (
                <div key={changeOrder.change_order_id} className="rounded-lg border border-bm-border/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{changeOrder.change_order_ref}</div>
                      <div className="text-xs text-bm-muted2">
                        {changeOrder.status} · {changeOrder.schedule_impact_days} days
                      </div>
                    </div>
                    <div className="text-sm">{formatMoney(changeOrder.amount_impact)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {!loading && !error && activeTab === "Contracts" ? (
          <div className="space-y-2">
            {contracts.length === 0 ? (
              <p className="text-sm text-bm-muted2">No contracts have been loaded yet.</p>
            ) : (
              contracts.map((contract) => (
                <div key={String(contract.contract_id)} className="rounded-lg border border-bm-border/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{String(contract.contract_number)}</div>
                      <div className="text-xs text-bm-muted2">
                        {String(contract.resolved_vendor_name || contract.vendor_name || "Unassigned vendor")}
                      </div>
                    </div>
                    <div className="text-sm">{formatMoney(contract.contract_value as string | number | null)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {!loading && !error && activeTab === "Field Reports" ? (
          <div className="space-y-2">
            {siteReports.length === 0 ? (
              <p className="text-sm text-bm-muted2">No site reports have been logged yet.</p>
            ) : (
              siteReports.map((report) => (
                <div key={report.site_report_id} className="rounded-lg border border-bm-border/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{formatDate(report.report_date)}</div>
                      <div className="text-xs text-bm-muted2">
                        {report.weather || "No weather"} · Workers on site {report.workers_on_site}
                      </div>
                    </div>
                    <div className="text-xs text-bm-muted2">{report.summary || report.work_performed || "No summary"}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {!loading && !error && activeTab === "AI Assistant" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-bm-border/60 bg-[#101922] p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Locked Demo Commands</p>
              <p className="mt-2 text-sm text-bm-muted2">The flagship demo only allows four commands so the answer stays explainable and consistent.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                "Why is this project over budget?",
                "What are the top risks?",
                "What should we do?",
                "Generate report",
              ].map((prompt) => (
                <Link
                  key={prompt}
                  href={`/lab/env/${envId}/pds/ai-query?q=${encodeURIComponent(`${prompt} ${project?.name || "this project"}`)}&project_name=${encodeURIComponent(project?.name || "Project")}`}
                  className="rounded-lg border border-bm-border/60 bg-bm-surface/10 p-4 text-sm font-medium text-bm-text transition hover:bg-bm-surface/25"
                >
                  {prompt}
                </Link>
              ))}
            </div>
            <div className="rounded-lg border border-pds-accent/25 bg-pds-accent/[0.08] p-4 text-sm text-bm-muted2">
              Recommended next step: open the recovery command, then generate the report from this project context.
            </div>
          </div>
        ) : null}
      </div>

      {status ? <p className="text-xs text-bm-muted2">{status}</p> : null}
    </section>
  );
}
