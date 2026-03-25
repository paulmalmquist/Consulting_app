"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

import { fmtMoney } from '@/lib/format-utils';
const API_BASE = process.env.NEXT_PUBLIC_BOS_API_URL || "http://localhost:8000";

function painBadge(level: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  const l = (level || "").toLowerCase();
  if (l === "high" || l === "critical") return <span className={`${base} bg-red-500/15 text-red-400`}>{level}</span>;
  if (l === "medium") return <span className={`${base} bg-amber-500/15 text-amber-400`}>{level}</span>;
  if (l === "low") return <span className={`${base} bg-green-500/15 text-green-400`}>{level}</span>;
  return <span className={`${base} bg-blue-500/15 text-blue-400`}>{level || "N/A"}</span>;
}

function dispositionBadge(d: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  const v = (d || "").toLowerCase();
  if (v === "replace") return <span className={`${base} bg-red-500/15 text-red-400`}>{d}</span>;
  if (v === "keep") return <span className={`${base} bg-green-500/15 text-green-400`}>{d}</span>;
  if (v === "evaluate") return <span className={`${base} bg-amber-500/15 text-amber-400`}>{d}</span>;
  return <span className={`${base} bg-blue-500/15 text-blue-400`}>{d || "N/A"}</span>;
}

const SYSTEM_CATEGORIES = ["ERP", "CRM", "HRIS", "Finance", "Marketing", "Analytics", "Security", "Infrastructure", "Collaboration", "Custom", "Other"];
const PAIN_LEVELS = ["low", "medium", "high", "critical"];
const DISPOSITIONS = ["keep", "evaluate", "replace"];

type AccountOption = { account_id: string; company_name: string };
type SystemRow = {
  system_id: string;
  system_name: string;
  vendor_name: string;
  system_category: string;
  annual_cost: number | string;
  pain_level: string;
  disposition: string;
  replacement_candidate: boolean;
};

export default function DiscoverySystemsPage() {
  const { envId, businessId } = useDomainEnv();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    system_name: "",
    vendor_name: "",
    system_category: "Other",
    annual_cost: "",
    pain_level: "medium",
    disposition: "evaluate",
  });

  async function loadAccounts() {
    try {
      const qs = new URLSearchParams({ env_id: envId });
      if (businessId) qs.set("business_id", businessId);
      const res = await fetch(`${API_BASE}/api/discovery/v1/accounts?${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      const list: AccountOption[] = (data.accounts ?? data ?? []).map((a: Record<string, string>) => ({
        account_id: a.account_id,
        company_name: a.company_name,
      }));
      setAccounts(list);
      if (list.length && !selectedAccount) setSelectedAccount(list[0].account_id);
    } catch { /* ignore */ }
  }

  async function loadSystems() {
    if (!selectedAccount) { setSystems([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ env_id: envId, account_id: selectedAccount });
      if (businessId) qs.set("business_id", businessId);
      const res = await fetch(`${API_BASE}/api/discovery/v1/systems?${qs}`);
      if (!res.ok) throw new Error(`Failed to fetch systems: ${res.status}`);
      const data = await res.json();
      setSystems(data.systems ?? data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load systems");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  useEffect(() => {
    void loadSystems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE}/api/discovery/v1/systems`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: envId,
          business_id: businessId || undefined,
          account_id: selectedAccount,
          ...form,
          annual_cost: form.annual_cost ? Number(form.annual_cost) : 0,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Create failed: ${res.status}`);
      }
      setForm({ system_name: "", vendor_name: "", system_category: "Other", annual_cost: "", pain_level: "medium", disposition: "evaluate" });
      setShowCreate(false);
      await loadSystems();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create system");
    } finally {
      setCreating(false);
    }
  }

  // Summary stats
  const totalCost = systems.reduce((s, r) => s + Number(r.annual_cost || 0), 0);
  const byCategory: Record<string, number> = {};
  systems.forEach((r) => { byCategory[r.system_category] = (byCategory[r.system_category] || 0) + 1; });

  return (
    <section className="space-y-5" data-testid="discovery-systems">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Systems Inventory</h2>
          <p className="text-sm text-bm-muted2">Technology landscape analysis per account.</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          disabled={!selectedAccount}
          className="shrink-0 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50"
        >
          + New System
        </button>
      </div>

      {/* Account selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-bm-muted2">Account:</label>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm min-w-[200px]"
        >
          <option value="">Select account...</option>
          {accounts.map((a) => (
            <option key={a.account_id} value={a.account_id}>{a.company_name}</option>
          ))}
        </select>
      </div>

      {/* Create form */}
      {showCreate && selectedAccount && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold mb-3">Add System</h3>
          <form className="grid sm:grid-cols-3 gap-2" onSubmit={onCreate}>
            <input required value={form.system_name} onChange={(e) => setForm((p) => ({ ...p, system_name: e.target.value }))} placeholder="System name" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.vendor_name} onChange={(e) => setForm((p) => ({ ...p, vendor_name: e.target.value }))} placeholder="Vendor name" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <select value={form.system_category} onChange={(e) => setForm((p) => ({ ...p, system_category: e.target.value }))} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              {SYSTEM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={form.annual_cost} onChange={(e) => setForm((p) => ({ ...p, annual_cost: e.target.value }))} placeholder="Annual cost ($)" type="number" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <select value={form.pain_level} onChange={(e) => setForm((p) => ({ ...p, pain_level: e.target.value }))} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              {PAIN_LEVELS.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
            </select>
            <select value={form.disposition} onChange={(e) => setForm((p) => ({ ...p, disposition: e.target.value }))} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              {DISPOSITIONS.map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
            </select>
            <button type="submit" disabled={creating} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50">
              {creating ? "Creating..." : "Add System"}
            </button>
          </form>
          {createError && <p className="mt-2 text-xs text-red-400">{createError}</p>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void loadSystems()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {/* Summary stats */}
      {!loading && systems.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total Annual Cost</p>
            <p className="mt-1 text-lg font-semibold">{fmtMoney(totalCost)}</p>
          </div>
          {Object.entries(byCategory).map(([cat, count]) => (
            <div key={cat} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{cat}</p>
              <p className="mt-1 text-lg font-semibold">{count}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">System</th>
              <th className="px-4 py-2 font-medium">Vendor</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Annual Cost</th>
              <th className="px-4 py-2 font-medium">Pain</th>
              <th className="px-4 py-2 font-medium">Disposition</th>
              <th className="px-4 py-2 font-medium">Replace?</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={7}>Loading...</td></tr>
            ) : !selectedAccount ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={7}>Select an account to view systems.</td></tr>
            ) : !systems.length ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={7}>No systems recorded for this account.</td></tr>
            ) : (
              systems.map((s) => (
                <tr key={s.system_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{s.system_name}</td>
                  <td className="px-4 py-3 text-bm-muted2">{s.vendor_name || "\u2014"}</td>
                  <td className="px-4 py-3 text-bm-muted2">{s.system_category || "\u2014"}</td>
                  <td className="px-4 py-3">{fmtMoney(s.annual_cost)}</td>
                  <td className="px-4 py-3">{painBadge(s.pain_level)}</td>
                  <td className="px-4 py-3">{dispositionBadge(s.disposition)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{s.replacement_candidate ? "Yes" : "No"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
