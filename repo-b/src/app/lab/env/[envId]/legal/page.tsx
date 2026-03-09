"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  createLegalMatter,
  getLegalDashboard,
  LegalDashboard,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function fmtMoney(value?: string | number | null): string {
  if (value === null || value === undefined) return "$0";
  const n = Number(value);
  if (Number.isNaN(n)) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

function riskBadge(level: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (level === "high") return <span className={`${base} bg-red-500/15 text-red-400`}>High</span>;
  if (level === "medium") return <span className={`${base} bg-amber-500/15 text-amber-400`}>Medium</span>;
  return <span className={`${base} bg-green-500/15 text-green-400`}>Low</span>;
}

const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "review", label: "Review" },
  { key: "negotiation", label: "Negotiation" },
  { key: "pending_signature", label: "Pending Sig." },
  { key: "executed", label: "Executed" },
];

const GOV_LABELS: Record<string, string> = {
  board_meeting: "Board Meeting",
  resolution: "Resolution",
  entity_filing: "Entity Filing",
  corporate_action: "Corporate Action",
};

export default function LegalCommandCenterPage() {
  const { envId, businessId } = useDomainEnv();
  const [dashboard, setDashboard] = useState<LegalDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick-create matter form
  const [showCreate, setShowCreate] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    matter_number: "",
    title: "",
    matter_type: "Contract",
    risk_level: "medium",
    budget_amount: "",
  });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await getLegalDashboard(envId, businessId || undefined);
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  async function onCreateMatter(event: FormEvent) {
    event.preventDefault();
    setCreateStatus("Creating...");
    setCreateError(null);
    try {
      await createLegalMatter({
        env_id: envId,
        business_id: businessId || undefined,
        matter_number: form.matter_number,
        title: form.title,
        matter_type: form.matter_type,
        risk_level: form.risk_level,
        budget_amount: form.budget_amount || "0",
      });
      setForm({ matter_number: "", title: "", matter_type: "Contract", risk_level: "medium", budget_amount: "" });
      setShowCreate(false);
      setCreateStatus(null);
      await refresh();
    } catch (err) {
      setCreateStatus(null);
      setCreateError(err instanceof Error ? err.message : "Failed to create matter");
    }
  }

  const kpis = dashboard?.kpis;

  return (
    <section className="space-y-5" data-testid="legal-command-center">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Legal Command Center</h2>
          <p className="text-sm text-bm-muted2">General counsel overview — risk exposure, contracts, workload, and spend.</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="shrink-0 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
        >
          + New Matter
        </button>
      </div>

      {/* Create matter inline form */}
      {showCreate && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold mb-3">Create Matter</h3>
          <form className="grid sm:grid-cols-3 gap-2" onSubmit={onCreateMatter}>
            <input required value={form.matter_number} onChange={(e) => setForm((p) => ({ ...p, matter_number: e.target.value }))} placeholder="Matter number (e.g. LEG-2026-001)" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input required value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Matter title" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.matter_type} onChange={(e) => setForm((p) => ({ ...p, matter_type: e.target.value }))} placeholder="Type (e.g. Litigation)" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <select value={form.risk_level} onChange={(e) => setForm((p) => ({ ...p, risk_level: e.target.value }))} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              <option value="low">Low Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="high">High Risk</option>
            </select>
            <input value={form.budget_amount} onChange={(e) => setForm((p) => ({ ...p, budget_amount: e.target.value }))} placeholder="Budget ($)" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">Add Matter</button>
          </form>
          {createStatus && <p className="mt-2 text-xs text-bm-muted2">{createStatus}</p>}
          {createError && <p className="mt-2 text-xs text-red-400">{createError}</p>}
        </div>
      )}

      {/* Global error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {/* KPI Strip — 8 cards in 2 rows of 4 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Open Matters</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "—" : (kpis?.open_matters ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Litigation Exposure</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "—" : fmtMoney(kpis?.litigation_exposure)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Contracts in Review</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "—" : (kpis?.contracts_pending_review ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Contracts Expiring (30d)</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "—" : (kpis?.contracts_expiring_soon ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Regulatory Deadlines (30d)</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "—" : (kpis?.regulatory_deadlines_30d ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Outside Counsel YTD</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "—" : fmtMoney(kpis?.outside_counsel_spend_ytd)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Legal Budget</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "—" : fmtMoney(kpis?.total_budget)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">High Risk Matters</p>
          <p className="mt-1 text-xl font-semibold text-red-400">{loading ? "—" : (kpis?.high_risk_matters ?? 0)}</p>
        </div>
      </div>

      {/* Main panels 2-column */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Legal Risk Radar */}
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <div className="border-b border-bm-border/50 px-4 py-3 flex items-center justify-between bg-bm-surface/30">
            <h3 className="text-sm font-semibold">Legal Risk Radar</h3>
            <Link href={`/lab/env/${envId}/legal/matters`} className="text-xs text-bm-muted2 hover:underline">All matters →</Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-2 font-medium">Matter</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Risk</th>
                <th className="px-4 py-2 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {loading ? (
                <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>Loading...</td></tr>
              ) : !dashboard?.risk_radar.length ? (
                <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>No high-risk matters.</td></tr>
              ) : (
                dashboard.risk_radar.map((m) => (
                  <tr key={m.matter_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3">
                      <Link href={`/lab/env/${envId}/legal/matters/${m.matter_id}`} className="font-medium hover:underline">
                        {m.matter_number}
                      </Link>
                      <span className="ml-2 text-bm-muted2 text-xs">{m.title}</span>
                    </td>
                    <td className="px-4 py-3 text-bm-muted2">{m.matter_type}</td>
                    <td className="px-4 py-3">{riskBadge(m.risk_level)}</td>
                    <td className="px-4 py-3 text-bm-muted2">{m.internal_owner || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Contract Pipeline */}
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <div className="border-b border-bm-border/50 px-4 py-3 flex items-center justify-between bg-bm-surface/30">
            <h3 className="text-sm font-semibold">Contract Pipeline</h3>
            <Link href={`/lab/env/${envId}/legal/contracts`} className="text-xs text-bm-muted2 hover:underline">All contracts →</Link>
          </div>
          <div className="p-4 space-y-3">
            {loading ? (
              <p className="text-sm text-bm-muted2">Loading...</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {PIPELINE_STAGES.map(({ key, label }) => {
                    const count = dashboard?.contract_pipeline[key] ?? 0;
                    return (
                      <Link
                        key={key}
                        href={`/lab/env/${envId}/legal/contracts`}
                        className="flex items-center gap-2 rounded-full border border-bm-border/70 px-3 py-1.5 text-sm hover:bg-bm-surface/40"
                      >
                        <span className="text-bm-muted2">{label}</span>
                        <span className="rounded-full bg-bm-surface/60 px-1.5 py-0.5 text-xs font-semibold">{count}</span>
                      </Link>
                    );
                  })}
                </div>
                {!dashboard?.contract_pipeline || Object.values(dashboard.contract_pipeline).every((v) => v === 0) ? (
                  <p className="text-sm text-bm-muted2">No contracts yet. Add contracts from within a matter workspace.</p>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <div className="border-b border-bm-border/50 px-4 py-3 flex items-center justify-between bg-bm-surface/30">
            <h3 className="text-sm font-semibold">Upcoming Deadlines</h3>
            <Link href={`/lab/env/${envId}/legal/compliance`} className="text-xs text-bm-muted2 hover:underline">Compliance →</Link>
          </div>
          <div className="divide-y divide-bm-border/40">
            {loading ? (
              <p className="px-4 py-5 text-sm text-bm-muted2">Loading...</p>
            ) : !dashboard?.upcoming_deadlines.length ? (
              <p className="px-4 py-5 text-sm text-bm-muted2">No deadlines in the next 30 days.</p>
            ) : (
              dashboard.upcoming_deadlines.map((d) => (
                <div key={d.deadline_id} className="px-4 py-3 flex items-center justify-between gap-2 hover:bg-bm-surface/20">
                  <div>
                    <p className="text-sm font-medium">{d.deadline_type}</p>
                    <p className="text-xs text-bm-muted2">{d.matter_number} — {d.title}</p>
                  </div>
                  <span className="shrink-0 text-xs text-amber-400 font-medium">{fmtDate(d.due_date)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Legal Spend Summary */}
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <div className="border-b border-bm-border/50 px-4 py-3 flex items-center justify-between bg-bm-surface/30">
            <h3 className="text-sm font-semibold">Legal Spend</h3>
            <Link href={`/lab/env/${envId}/legal/spend`} className="text-xs text-bm-muted2 hover:underline">All invoices →</Link>
          </div>
          <div className="p-4 space-y-3">
            {loading ? (
              <p className="text-sm text-bm-muted2">Loading...</p>
            ) : (() => {
              const spent = Number(dashboard?.spend_summary.ytd_spend ?? 0);
              const budget = Number(dashboard?.spend_summary.ytd_budget ?? 0);
              const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
              return (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-bm-muted2">YTD Spend</span>
                    <span className="font-semibold">{fmtMoney(spent)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-bm-muted2">Total Budget</span>
                    <span className="font-semibold">{fmtMoney(budget)}</span>
                  </div>
                  {budget > 0 && (
                    <div className="space-y-1">
                      <div className="h-2 w-full rounded-full bg-bm-surface/60 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-green-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-bm-muted2">{pct.toFixed(0)}% of budget used</p>
                    </div>
                  )}
                  {budget === 0 && (
                    <p className="text-sm text-bm-muted2">No budget set on open matters.</p>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Governance Alerts */}
        <div className="rounded-xl border border-bm-border/70 overflow-hidden lg:col-span-2">
          <div className="border-b border-bm-border/50 px-4 py-3 flex items-center justify-between bg-bm-surface/30">
            <h3 className="text-sm font-semibold">Governance Alerts</h3>
            <Link href={`/lab/env/${envId}/legal/governance`} className="text-xs text-bm-muted2 hover:underline">Governance →</Link>
          </div>
          {loading ? (
            <p className="px-4 py-5 text-sm text-bm-muted2">Loading...</p>
          ) : !dashboard?.governance_alerts.length ? (
            <p className="px-4 py-5 text-sm text-bm-muted2">No pending governance items. Add board meetings, resolutions, and entity filings in the Governance module.</p>
          ) : (
            <div className="divide-y divide-bm-border/40">
              {dashboard.governance_alerts.map((g) => (
                <div key={g.governance_item_id} className="px-4 py-3 flex items-center justify-between gap-2 hover:bg-bm-surface/20">
                  <div>
                    <p className="text-sm font-medium">{g.title}</p>
                    <p className="text-xs text-bm-muted2">{GOV_LABELS[g.item_type] ?? g.item_type}{g.entity_name ? ` — ${g.entity_name}` : ""}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {g.scheduled_date && <p className="text-xs text-bm-muted2">{fmtDate(g.scheduled_date)}</p>}
                    <p className="text-xs capitalize text-amber-400">{g.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
