"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getCpProjectDashboard,
  getCpProjectBudget,
  listCpChangeOrders,
  listCpCommitments,
  listCpRisks,
  listCpRfis,
  listCpSubmittals,
  listCpPunchItems,
  listCpMilestones,
  listCpDailyLogs,
  listCpMeetings,
  listCpDrawings,
  listCpPayApps,
} from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";
import type {
  CpProjectDashboard,
  CpBudgetSummary,
  CpChangeOrder,
  CpContract,
  CpRisk,
  CpRfi,
  CpSubmittal,
  CpPunchItem,
  CpScheduleSnapshot,
  CpDailyLog,
  CpMeeting,
  CpDrawing,
  CpPayApp,
} from "@/types/capital-projects";

const TABS = [
  "Overview", "Financials", "Schedule", "Risks & Issues",
  "RFIs", "Submittals", "Punch List", "Daily Logs",
  "Meetings", "Drawings", "Pay Apps", "Reports",
] as const;
type TabKey = (typeof TABS)[number];

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function healthBadge(h: string) {
  switch (h) {
    case "green": case "on_track": return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
    case "yellow": case "at_risk": return "border-amber-500/50 bg-amber-500/10 text-amber-300";
    case "red": case "critical": return "border-rose-500/50 bg-rose-500/10 text-rose-300";
    default: return "border-bm-border/50 bg-bm-surface/10 text-bm-muted";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "open": case "pending": case "draft": return "border-amber-500/50 bg-amber-500/10 text-amber-300";
    case "approved": case "closed": case "completed": case "paid": return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
    case "rejected": return "border-rose-500/50 bg-rose-500/10 text-rose-300";
    case "in_progress": case "submitted": case "under_review": case "in_review": return "border-blue-500/50 bg-blue-500/10 text-blue-300";
    default: return "border-bm-border/50 bg-bm-surface/10 text-bm-muted";
  }
}

function agingDays(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export default function CpProjectDetailPage({ params }: { params: { projectId: string } }) {
  const { envId, businessId } = useRepeContext();
  const [tab, setTab] = useState<TabKey>("Overview");
  const [dashboard, setDashboard] = useState<CpProjectDashboard | null>(null);
  const [budget, setBudget] = useState<CpBudgetSummary | null>(null);
  const [changeOrders, setChangeOrders] = useState<CpChangeOrder[]>([]);
  const [contracts, setContracts] = useState<CpContract[]>([]);
  const [risks, setRisks] = useState<CpRisk[]>([]);
  const [rfis, setRfis] = useState<CpRfi[]>([]);
  const [submittals, setSubmittals] = useState<CpSubmittal[]>([]);
  const [punchItems, setPunchItems] = useState<CpPunchItem[]>([]);
  const [milestones, setMilestones] = useState<CpScheduleSnapshot[]>([]);
  const [dailyLogs, setDailyLogs] = useState<CpDailyLog[]>([]);
  const [meetings, setMeetings] = useState<CpMeeting[]>([]);
  const [drawings, setDrawings] = useState<CpDrawing[]>([]);
  const [payApps, setPayApps] = useState<CpPayApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const eid = envId || undefined;
  const bid = businessId || undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getCpProjectDashboard(params.projectId, eid, bid),
      getCpProjectBudget(params.projectId, eid, bid).catch(() => null),
      listCpChangeOrders(params.projectId, eid, bid).catch(() => []),
      listCpCommitments(params.projectId, eid, bid).catch(() => []),
      listCpRisks(params.projectId, eid, bid).catch(() => []),
      listCpRfis(params.projectId, eid, bid).catch(() => []),
      listCpSubmittals(params.projectId, eid, bid).catch(() => []),
      listCpPunchItems(params.projectId, eid, bid).catch(() => []),
      listCpMilestones(params.projectId, eid, bid).catch(() => []),
      listCpDailyLogs(params.projectId, eid, bid).catch(() => []),
      listCpMeetings(params.projectId, eid, bid).catch(() => []),
      listCpDrawings(params.projectId, eid, bid).catch(() => []),
      listCpPayApps(params.projectId, eid, bid).catch(() => []),
    ])
      .then(([dash, bud, cos, ctrs, rsk, rfi, sub, pnch, mls, dlg, mtg, drw, pa]) => {
        if (cancelled) return;
        setDashboard(dash);
        if (bud) setBudget(bud);
        setChangeOrders(cos as CpChangeOrder[]);
        setContracts(ctrs as CpContract[]);
        setRisks(rsk as CpRisk[]);
        setRfis(rfi as CpRfi[]);
        setSubmittals(sub as CpSubmittal[]);
        setPunchItems(pnch as CpPunchItem[]);
        setMilestones(mls as CpScheduleSnapshot[]);
        setDailyLogs(dlg as CpDailyLog[]);
        setMeetings(mtg as CpMeeting[]);
        setDrawings(drw as CpDrawing[]);
        setPayApps(pa as CpPayApp[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load project");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [params.projectId, eid, bid]);

  const kpis = useMemo(() => {
    if (!dashboard) return [];
    return [
      { label: "Budget Health", value: dashboard.health.budget_health.replace(/_/g, " "), tone: healthBadge(dashboard.health.budget_health) },
      { label: "Schedule Health", value: dashboard.health.schedule_health.replace(/_/g, " "), tone: healthBadge(dashboard.health.schedule_health) },
      { label: "Open RFIs", value: String(dashboard.open_rfis) },
      { label: "Open Risks", value: String(dashboard.open_risks) },
      { label: "Pending COs", value: String(dashboard.pending_change_orders) },
      { label: "Contingency", value: formatMoney(dashboard.contingency_remaining) },
    ];
  }, [dashboard]);

  const p = dashboard;

  return (
    <section className="space-y-4" data-testid="cp-project-detail">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Project Cockpit</p>
          <h2 className="text-2xl font-semibold">{p?.name || `Project ${params.projectId.slice(0, 8)}`}</h2>
          <p className="text-sm text-bm-muted2">
            {p?.project_code || ""}
            {p?.sector ? ` · ${p.sector.replace(/_/g, " ")}` : ""}
            {p?.region ? ` · ${p.region}` : ""}
            {p?.market ? `, ${p.market}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {p && (
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${healthBadge(p.health.overall_health)}`}>
              {p.health.overall_health.replace(/_/g, " ").toUpperCase()}
            </span>
          )}
          <Link href="/app/capital-projects" className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
            Back to Portfolio
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{kpi.label}</p>
            <p className="mt-1 text-lg font-semibold capitalize">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-2 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {TABS.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                t === tab ? "border-bm-accent/60 bg-bm-accent/10" : "border-bm-border/70 hover:bg-bm-surface/40"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        {loading && <p className="text-sm text-bm-muted2">Loading project data...</p>}
        {error && <p className="text-sm text-rose-300">{error}</p>}

        {/* ─── OVERVIEW ─── */}
        {!loading && !error && tab === "Overview" && p && (
          <div className="space-y-4">
            {/* Hero */}
            <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
              <div className="space-y-3">
                {p.description && <p className="text-sm text-bm-muted">{p.description}</p>}
                <div className="grid gap-2 grid-cols-2 text-sm">
                  <div><span className="text-bm-muted2">GC:</span> {p.gc_name || "—"}</div>
                  <div><span className="text-bm-muted2">Architect:</span> {p.architect_name || "—"}</div>
                  <div><span className="text-bm-muted2">Owner Rep:</span> {p.owner_rep || "—"}</div>
                  <div><span className="text-bm-muted2">PM:</span> {p.project_manager || "—"}</div>
                  <div><span className="text-bm-muted2">Start:</span> {formatDate(p.start_date)}</div>
                  <div><span className="text-bm-muted2">Target End:</span> {formatDate(p.target_end_date)}</div>
                </div>
                <div className="grid gap-2 grid-cols-2 text-sm">
                  <div><span className="text-bm-muted2">Original Budget:</span> {formatMoney(p.original_budget)}</div>
                  <div><span className="text-bm-muted2">Approved Budget:</span> {formatMoney(p.approved_budget)}</div>
                  <div><span className="text-bm-muted2">Committed:</span> {formatMoney(p.committed_amount)}</div>
                  <div><span className="text-bm-muted2">Spent:</span> {formatMoney(p.spent_amount)}</div>
                  <div><span className="text-bm-muted2">Forecast:</span> {formatMoney(p.forecast_at_completion)}</div>
                  <div><span className="text-bm-muted2">Variance:</span> <span className={Number(p.budget_variance) < 0 ? "text-rose-300" : ""}>{formatMoney(p.budget_variance)}</span></div>
                </div>
              </div>
              {/* Recent Activity */}
              <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Recent Activity</p>
                <div className="mt-3 space-y-2">
                  {p.recent_activity.length === 0 ? (
                    <p className="text-sm text-bm-muted2">No recent activity yet.</p>
                  ) : (
                    p.recent_activity.map((item, i) => (
                      <div key={`${item.type}-${i}`} className="rounded-lg border border-bm-border/50 px-3 py-2">
                        <div className="text-sm font-medium">{item.label || item.type}</div>
                        <div className="text-xs text-bm-muted2">{item.type.replace(/_/g, " ")} · {item.status} · {formatDate(item.created_at)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            {/* Milestones */}
            <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Milestone Timeline</p>
              <div className="mt-3 space-y-2">
                {p.milestones.length === 0 ? (
                  <p className="text-sm text-bm-muted2">No milestones loaded.</p>
                ) : (
                  p.milestones.map((m) => (
                    <div key={m.milestone_id} className="rounded-lg border border-bm-border/50 px-3 py-2 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{m.milestone_name}</div>
                        <div className="text-xs text-bm-muted2">
                          Baseline {formatDate(m.baseline_date)} · Current {formatDate(m.current_date)}
                          {m.actual_date ? ` · Actual ${formatDate(m.actual_date)}` : ""}
                        </div>
                      </div>
                      <span className="text-xs text-bm-muted2">{m.is_critical || m.is_on_critical_path ? "Critical" : "Standard"}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── FINANCIALS ─── */}
        {!loading && !error && tab === "Financials" && (
          <div className="space-y-4">
            {/* Budget Summary */}
            {budget && (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  {[
                    { label: "Approved", value: formatMoney(budget.totals.approved_budget) },
                    { label: "Committed", value: formatMoney(budget.totals.committed_amount) },
                    { label: "Spent", value: formatMoney(budget.totals.spent_amount) },
                    { label: "Variance", value: formatMoney(budget.totals.variance), negative: Number(budget.totals.variance) < 0 },
                  ].map((c) => (
                    <div key={c.label} className="rounded-lg border border-bm-border/60 p-3">
                      <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{c.label}</div>
                      <div className={`mt-1 text-lg font-semibold ${c.negative ? "text-rose-300" : ""}`}>{c.value}</div>
                    </div>
                  ))}
                </div>
                {/* Budget Lines */}
                <div className="overflow-hidden rounded-lg border border-bm-border/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-bm-border/50 bg-bm-surface/20 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                        <th className="px-3 py-2 font-medium">Cost Code</th>
                        <th className="px-3 py-2 font-medium">Line</th>
                        <th className="px-3 py-2 font-medium text-right">Approved</th>
                        <th className="px-3 py-2 font-medium text-right">Committed</th>
                        <th className="px-3 py-2 font-medium text-right">Invoiced</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bm-border/40">
                      {budget.lines.length === 0 ? (
                        <tr><td className="px-3 py-4 text-bm-muted2" colSpan={5}>No budget lines loaded.</td></tr>
                      ) : (
                        budget.lines.map((line) => (
                          <tr key={line.budget_line_id}>
                            <td className="px-3 py-2">{line.cost_code}</td>
                            <td className="px-3 py-2">{line.line_label}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.approved_amount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.committed_amount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.invoiced_amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {/* Change Orders */}
            <div>
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">Change Orders ({changeOrders.length})</p>
              {changeOrders.length === 0 ? <p className="text-sm text-bm-muted2">No change orders.</p> : (
                <div className="overflow-hidden rounded-lg border border-bm-border/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-bm-border/50 bg-bm-surface/20 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                        <th className="px-3 py-2 font-medium">Ref</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium text-right">Cost Impact</th>
                        <th className="px-3 py-2 font-medium text-right">Schedule Days</th>
                        <th className="px-3 py-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bm-border/40">
                      {changeOrders.map((co) => (
                        <tr key={co.change_order_id}>
                          <td className="px-3 py-2 font-medium">{co.change_order_ref}</td>
                          <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(co.status)}`}>{co.status}</span></td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(co.amount_impact)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{co.schedule_impact_days}d</td>
                          <td className="px-3 py-2 text-bm-muted2">{formatDate(co.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Contracts */}
            <div>
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">Commitments / Contracts ({contracts.length})</p>
              {contracts.length === 0 ? <p className="text-sm text-bm-muted2">No contracts.</p> : (
                <div className="overflow-hidden rounded-lg border border-bm-border/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-bm-border/50 bg-bm-surface/20 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                        <th className="px-3 py-2 font-medium">Contract #</th>
                        <th className="px-3 py-2 font-medium">Vendor</th>
                        <th className="px-3 py-2 font-medium text-right">Value</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bm-border/40">
                      {contracts.map((c) => (
                        <tr key={c.contract_id}>
                          <td className="px-3 py-2 font-medium">{c.contract_number}</td>
                          <td className="px-3 py-2">{c.vendor_name || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(c.contract_value)}</td>
                          <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(c.status)}`}>{c.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── SCHEDULE ─── */}
        {!loading && !error && tab === "Schedule" && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">Milestones ({milestones.length})</p>
            {milestones.length === 0 ? <p className="text-sm text-bm-muted2">No milestones loaded.</p> : (
              <div className="space-y-2">
                {milestones.map((m) => {
                  const slip = m.baseline_date && m.current_date
                    ? Math.floor((new Date(m.current_date).getTime() - new Date(m.baseline_date).getTime()) / 86400000)
                    : 0;
                  return (
                    <div key={m.milestone_id} className="rounded-lg border border-bm-border/50 px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{m.milestone_name}</div>
                        <div className="text-xs text-bm-muted2">
                          Baseline: {formatDate(m.baseline_date)} · Current: {formatDate(m.current_date)}
                          {m.actual_date ? ` · Actual: ${formatDate(m.actual_date)}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {slip > 0 && <span className="text-xs text-amber-300">+{slip}d slip</span>}
                        {(m.is_critical || m.is_on_critical_path) && (
                          <span className="rounded-full border border-rose-500/50 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-300">Critical Path</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── RISKS & ISSUES ─── */}
        {!loading && !error && tab === "Risks & Issues" && (
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">Risks ({risks.length})</p>
            {risks.length === 0 ? <p className="text-sm text-bm-muted2">No risks recorded.</p> : (
              <div className="overflow-hidden rounded-lg border border-bm-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bm-border/50 bg-bm-surface/20 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                      <th className="px-3 py-2 font-medium">Risk</th>
                      <th className="px-3 py-2 font-medium">Probability</th>
                      <th className="px-3 py-2 font-medium text-right">Impact</th>
                      <th className="px-3 py-2 font-medium">Owner</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bm-border/40">
                    {risks.map((r) => (
                      <tr key={r.risk_id}>
                        <td className="px-3 py-2 font-medium">{r.risk_title}</td>
                        <td className="px-3 py-2">{(Number(r.probability) * 100).toFixed(0)}%</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.impact_amount)}</td>
                        <td className="px-3 py-2 text-bm-muted2">{r.mitigation_owner || "—"}</td>
                        <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(r.status)}`}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── RFIs ─── */}
        {!loading && !error && tab === "RFIs" && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">RFI Log ({rfis.length})</p>
            {rfis.length === 0 ? <p className="text-sm text-bm-muted2">No RFIs recorded.</p> : (
              <div className="overflow-hidden rounded-lg border border-bm-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bm-border/50 bg-bm-surface/20 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Subject</th>
                      <th className="px-3 py-2 font-medium hidden md:table-cell">Discipline</th>
                      <th className="px-3 py-2 font-medium hidden lg:table-cell">Assigned To</th>
                      <th className="px-3 py-2 font-medium">Due</th>
                      <th className="px-3 py-2 font-medium">Aging</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bm-border/40">
                    {rfis.map((r) => {
                      const age = agingDays(r.created_at);
                      const overdue = r.due_date && r.status === "open" && new Date(r.due_date) < new Date();
                      return (
                        <tr key={r.rfi_id} className={overdue ? "bg-rose-500/5" : ""}>
                          <td className="px-3 py-2 font-medium">{r.rfi_number}</td>
                          <td className="px-3 py-2">{r.subject}</td>
                          <td className="px-3 py-2 capitalize hidden md:table-cell">{r.discipline || "—"}</td>
                          <td className="px-3 py-2 text-bm-muted2 hidden lg:table-cell">{r.assigned_to || "—"}</td>
                          <td className="px-3 py-2 text-bm-muted2">{formatDate(r.due_date)}</td>
                          <td className="px-3 py-2 tabular-nums">{age !== null ? `${age}d` : "—"}{overdue ? " ⚠" : ""}</td>
                          <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(r.status)}`}>{r.status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── SUBMITTALS ─── */}
        {!loading && !error && tab === "Submittals" && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">Submittal Log ({submittals.length})</p>
            {submittals.length === 0 ? <p className="text-sm text-bm-muted2">No submittals recorded.</p> : (
              <div className="overflow-hidden rounded-lg border border-bm-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bm-border/50 bg-bm-surface/20 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium hidden md:table-cell">Spec</th>
                      <th className="px-3 py-2 font-medium hidden lg:table-cell">Rev</th>
                      <th className="px-3 py-2 font-medium">Required</th>
                      <th className="px-3 py-2 font-medium hidden md:table-cell">Reviewer</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bm-border/40">
                    {submittals.map((s) => {
                      const overdue = s.required_date && s.status === "pending" && new Date(s.required_date) < new Date();
                      return (
                        <tr key={s.submittal_id} className={overdue ? "bg-rose-500/5" : ""}>
                          <td className="px-3 py-2 font-medium">{s.submittal_number}</td>
                          <td className="px-3 py-2">{s.description || "—"}</td>
                          <td className="px-3 py-2 hidden md:table-cell">{s.spec_section || "—"}</td>
                          <td className="px-3 py-2 hidden lg:table-cell">{s.revision || "—"}</td>
                          <td className="px-3 py-2 text-bm-muted2">{formatDate(s.required_date)}{overdue ? " ⚠" : ""}</td>
                          <td className="px-3 py-2 text-bm-muted2 hidden md:table-cell">{s.reviewer_name || "—"}</td>
                          <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(s.status)}`}>{s.status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── PUNCH LIST ─── */}
        {!loading && !error && tab === "Punch List" && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">Punch Items ({punchItems.length})</p>
            {punchItems.length === 0 ? <p className="text-sm text-bm-muted2">No punch items.</p> : (
              <div className="overflow-hidden rounded-lg border border-bm-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bm-border/50 bg-bm-surface/20 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium hidden md:table-cell">Location</th>
                      <th className="px-3 py-2 font-medium hidden lg:table-cell">Trade</th>
                      <th className="px-3 py-2 font-medium hidden lg:table-cell">Severity</th>
                      <th className="px-3 py-2 font-medium">Assignee</th>
                      <th className="px-3 py-2 font-medium">Due</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bm-border/40">
                    {punchItems.map((pi) => (
                      <tr key={pi.punch_item_id}>
                        <td className="px-3 py-2 font-medium">{pi.title}</td>
                        <td className="px-3 py-2 hidden md:table-cell">{[pi.location, pi.floor, pi.room].filter(Boolean).join(" / ") || "—"}</td>
                        <td className="px-3 py-2 hidden lg:table-cell">{pi.trade || "—"}</td>
                        <td className="px-3 py-2 capitalize hidden lg:table-cell">{pi.severity || "—"}</td>
                        <td className="px-3 py-2 text-bm-muted2">{pi.assignee || "—"}</td>
                        <td className="px-3 py-2 text-bm-muted2">{formatDate(pi.due_date)}</td>
                        <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(pi.status)}`}>{pi.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── DAILY LOGS ─── */}
        {!loading && !error && tab === "Daily Logs" && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">Daily Logs ({dailyLogs.length})</p>
            {dailyLogs.length === 0 ? <p className="text-sm text-bm-muted2">No daily logs.</p> : (
              <div className="space-y-2">
                {dailyLogs.map((log) => (
                  <div key={log.daily_log_id} className="rounded-lg border border-bm-border/50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{formatDate(log.log_date)}</div>
                      <div className="flex items-center gap-3 text-xs text-bm-muted2">
                        {log.weather_conditions && <span>{log.weather_conditions}</span>}
                        {log.weather_high != null && <span>{log.weather_high}°/{log.weather_low}°F</span>}
                        <span>{log.manpower_count} workers</span>
                      </div>
                    </div>
                    {log.superintendent && <p className="text-xs text-bm-muted2 mb-1">Super: {log.superintendent}</p>}
                    {log.work_completed && <p className="text-sm">{log.work_completed}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-bm-muted2">
                      {log.deliveries && <span>Deliveries: {log.deliveries}</span>}
                      {log.equipment && <span>Equipment: {log.equipment}</span>}
                      {log.visitors && <span>Visitors: {log.visitors}</span>}
                      {log.incidents && <span className="text-amber-300">Incidents: {log.incidents}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── MEETINGS ─── */}
        {!loading && !error && tab === "Meetings" && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">Meetings ({meetings.length})</p>
            {meetings.length === 0 ? <p className="text-sm text-bm-muted2">No meetings recorded.</p> : (
              <div className="space-y-3">
                {meetings.map((m) => (
                  <div key={m.meeting_id} className="rounded-lg border border-bm-border/50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium capitalize">{m.meeting_type.replace(/_/g, " ")}</span>
                        <span className="ml-2 text-xs text-bm-muted2">{formatDate(m.meeting_date)}</span>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(m.status)}`}>{m.status}</span>
                    </div>
                    {m.location && <p className="text-xs text-bm-muted2">Location: {m.location} · Called by: {m.called_by || "—"}</p>}
                    {m.minutes && <p className="text-sm mt-1">{m.minutes}</p>}
                    {m.items && m.items.length > 0 && (
                      <div className="mt-2 border-t border-bm-border/30 pt-2">
                        <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-1">Action Items</p>
                        {m.items.map((item) => (
                          <div key={item.meeting_item_id} className="flex items-center justify-between text-sm py-1">
                            <div>
                              <span className="font-medium">{item.topic}</span>
                              {item.responsible_party && <span className="ml-2 text-xs text-bm-muted2">→ {item.responsible_party}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              {item.due_date && <span className="text-xs text-bm-muted2">{formatDate(item.due_date)}</span>}
                              <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(item.status)}`}>{item.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── DRAWINGS ─── */}
        {!loading && !error && tab === "Drawings" && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">Drawing Register ({drawings.length})</p>
            {drawings.length === 0 ? <p className="text-sm text-bm-muted2">No drawings registered.</p> : (
              <div className="overflow-hidden rounded-lg border border-bm-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bm-border/50 bg-bm-surface/20 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                      <th className="px-3 py-2 font-medium">Discipline</th>
                      <th className="px-3 py-2 font-medium">Sheet</th>
                      <th className="px-3 py-2 font-medium">Title</th>
                      <th className="px-3 py-2 font-medium">Rev</th>
                      <th className="px-3 py-2 font-medium hidden md:table-cell">Issue Date</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bm-border/40">
                    {drawings.map((d) => (
                      <tr key={d.drawing_id}>
                        <td className="px-3 py-2 capitalize">{d.discipline.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2 font-medium">{d.sheet_number}</td>
                        <td className="px-3 py-2">{d.title}</td>
                        <td className="px-3 py-2">{d.revision}</td>
                        <td className="px-3 py-2 text-bm-muted2 hidden md:table-cell">{formatDate(d.issue_date)}</td>
                        <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(d.status)}`}>{d.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── PAY APPS ─── */}
        {!loading && !error && tab === "Pay Apps" && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">Pay Applications ({payApps.length})</p>
            {payApps.length === 0 ? <p className="text-sm text-bm-muted2">No pay applications.</p> : (
              <div className="space-y-3">
                {payApps.map((pa) => (
                  <div key={pa.pay_app_id} className="rounded-lg border border-bm-border/50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium">Pay App #{pa.pay_app_number}</span>
                        {pa.contract_number && <span className="ml-2 text-xs text-bm-muted2">Contract: {pa.contract_number}</span>}
                        {pa.vendor_name && <span className="ml-2 text-xs text-bm-muted2">· {pa.vendor_name}</span>}
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(pa.status)}`}>{pa.status}</span>
                    </div>
                    {pa.billing_period_start && (
                      <p className="text-xs text-bm-muted2 mb-2">Period: {formatDate(pa.billing_period_start)} – {formatDate(pa.billing_period_end)}</p>
                    )}
                    <div className="grid gap-2 grid-cols-2 md:grid-cols-4 text-sm">
                      <div><span className="text-bm-muted2">Scheduled Value:</span> {formatMoney(pa.scheduled_value)}</div>
                      <div><span className="text-bm-muted2">Completed + Stored:</span> {formatMoney(pa.total_completed_stored)}</div>
                      <div><span className="text-bm-muted2">Retainage ({Number(pa.retainage_pct).toFixed(0)}%):</span> {formatMoney(pa.retainage_amount)}</div>
                      <div className="font-semibold"><span className="text-bm-muted2">Current Due:</span> {formatMoney(pa.current_payment_due)}</div>
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-bm-muted2">
                      {pa.submitted_date && <span>Submitted: {formatDate(pa.submitted_date)}</span>}
                      {pa.approved_date && <span>Approved: {formatDate(pa.approved_date)}</span>}
                      {pa.paid_date && <span>Paid: {formatDate(pa.paid_date)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── REPORTS ─── */}
        {!loading && !error && tab === "Reports" && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">Reports</p>
            <p className="text-sm text-bm-muted">
              Report generation is available through the PDS engine. Use the PDS snapshot and report pack endpoints to generate construction project reports.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { label: "Budget Variance Report", desc: "Approved vs committed vs forecast by cost code" },
                { label: "Change Order Log", desc: "All COs with status, impact, and approval timeline" },
                { label: "RFI Aging Report", desc: "Open RFIs sorted by days outstanding" },
                { label: "Submittal Aging Report", desc: "Submittals past required date" },
                { label: "Punch List Summary", desc: "Open items by location, trade, and severity" },
                { label: "Monthly Owner Report", desc: "Executive summary for owner/lender distribution" },
              ].map((report) => (
                <div key={report.label} className="rounded-lg border border-bm-border/50 p-3">
                  <p className="font-medium text-sm">{report.label}</p>
                  <p className="text-xs text-bm-muted2 mt-1">{report.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
