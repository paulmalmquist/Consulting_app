"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = ""; // Same-origin — routes through proxy handlers

function fmtDate(d?: string | null): string {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

function stageBadge(stage: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  const s = (stage || "").toLowerCase();
  if (s === "active" || s === "engaged") return <span className={`${base} bg-green-500/15 text-green-400`}>{stage}</span>;
  if (s === "prospect" || s === "qualifying") return <span className={`${base} bg-amber-500/15 text-amber-400`}>{stage}</span>;
  if (s === "closed" || s === "lost") return <span className={`${base} bg-red-500/15 text-red-400`}>{stage}</span>;
  return <span className={`${base} bg-blue-500/15 text-blue-400`}>{stage}</span>;
}

type Account = {
  account_id: string;
  company_name: string;
  industry: string;
  headquarters: string;
  engagement_stage: string;
  champion_name: string;
  pain_summary: string;
  systems_count: number;
  vendors_count: number;
  created_at: string;
  updated_at: string;
};

export default function DiscoveryAccountsPage() {
  const { envId, businessId } = useDomainEnv();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    company_name: "",
    industry: "",
    headquarters: "",
    engagement_stage: "prospect",
    champion_name: "",
    pain_summary: "",
  });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ env_id: envId });
      if (businessId) qs.set("business_id", businessId);
      const res = await fetch(`${API_BASE}/api/discovery/v1/accounts?${qs}`);
      if (!res.ok) throw new Error(`Failed to fetch accounts: ${res.status}`);
      const data = await res.json();
      setAccounts(data.accounts ?? data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE}/api/discovery/v1/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: envId,
          business_id: businessId || undefined,
          ...form,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Create failed: ${res.status}`);
      }
      setForm({ company_name: "", industry: "", headquarters: "", engagement_stage: "prospect", champion_name: "", pain_summary: "" });
      setShowCreate(false);
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-5" data-testid="discovery-accounts">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Accounts</h2>
          <p className="text-sm text-bm-muted2">Client accounts and engagement tracking.</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="shrink-0 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
        >
          + New Account
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold mb-3">Create Account</h3>
          <form className="grid sm:grid-cols-3 gap-2" onSubmit={onCreate}>
            <input required value={form.company_name} onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))} placeholder="Company name" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.industry} onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))} placeholder="Industry" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.headquarters} onChange={(e) => setForm((p) => ({ ...p, headquarters: e.target.value }))} placeholder="Headquarters" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <select value={form.engagement_stage} onChange={(e) => setForm((p) => ({ ...p, engagement_stage: e.target.value }))} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              <option value="prospect">Prospect</option>
              <option value="qualifying">Qualifying</option>
              <option value="engaged">Engaged</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
            <input value={form.champion_name} onChange={(e) => setForm((p) => ({ ...p, champion_name: e.target.value }))} placeholder="Champion name" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.pain_summary} onChange={(e) => setForm((p) => ({ ...p, pain_summary: e.target.value }))} placeholder="Pain summary" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <button type="submit" disabled={creating} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50">
              {creating ? "Creating..." : "Add Account"}
            </button>
          </form>
          {createError && <p className="mt-2 text-xs text-red-400">{createError}</p>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Industry</th>
              <th className="px-4 py-2 font-medium">HQ</th>
              <th className="px-4 py-2 font-medium">Stage</th>
              <th className="px-4 py-2 font-medium">Champion</th>
              <th className="px-4 py-2 font-medium">Systems</th>
              <th className="px-4 py-2 font-medium">Vendors</th>
              <th className="px-4 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={8}>Loading...</td></tr>
            ) : !accounts.length ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={8}>No accounts yet. Click &quot;+ New Account&quot; to get started.</td></tr>
            ) : (
              accounts.map((a) => (
                <React.Fragment key={a.account_id}>
                  <tr className="hover:bg-bm-surface/20 cursor-pointer" onClick={() => setExpandedId(expandedId === a.account_id ? null : a.account_id)}>
                    <td className="px-4 py-3 font-medium">{a.company_name}</td>
                    <td className="px-4 py-3 text-bm-muted2">{a.industry || "\u2014"}</td>
                    <td className="px-4 py-3 text-bm-muted2">{a.headquarters || "\u2014"}</td>
                    <td className="px-4 py-3">{stageBadge(a.engagement_stage)}</td>
                    <td className="px-4 py-3 text-bm-muted2">{a.champion_name || "\u2014"}</td>
                    <td className="px-4 py-3 text-bm-muted2">{a.systems_count ?? 0}</td>
                    <td className="px-4 py-3 text-bm-muted2">{a.vendors_count ?? 0}</td>
                    <td className="px-4 py-3 text-bm-muted2">{fmtDate(a.updated_at)}</td>
                  </tr>
                  {expandedId === a.account_id && (
                    <tr>
                      <td colSpan={8} className="px-4 py-4 bg-bm-surface/10 border-t border-bm-border/30">
                        <div className="grid sm:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-1">Pain Summary</p>
                            <p>{a.pain_summary || "No pain summary recorded."}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-1">Details</p>
                            <p className="text-bm-muted2">Created: {fmtDate(a.created_at)}</p>
                            <p className="text-bm-muted2">Account ID: {a.account_id}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
