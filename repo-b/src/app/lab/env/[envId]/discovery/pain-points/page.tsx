"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

import { fmtMoney } from '@/lib/format-utils';
const API_BASE = process.env.NEXT_PUBLIC_BOS_API_URL || "http://localhost:8000";

function severityBadge(level: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  const l = (level || "").toLowerCase();
  if (l === "critical") return <span className={`${base} bg-red-500/15 text-red-400`}>{level}</span>;
  if (l === "high") return <span className={`${base} bg-orange-500/15 text-orange-400`}>{level}</span>;
  if (l === "medium") return <span className={`${base} bg-amber-500/15 text-amber-400`}>{level}</span>;
  if (l === "low") return <span className={`${base} bg-green-500/15 text-green-400`}>{level}</span>;
  return <span className={`${base} bg-blue-500/15 text-blue-400`}>{level || "N/A"}</span>;
}

function categoryBadge(cat: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  const c = (cat || "").toLowerCase();
  if (c === "process") return <span className={`${base} bg-purple-500/15 text-purple-400`}>{cat}</span>;
  if (c === "technology") return <span className={`${base} bg-blue-500/15 text-blue-400`}>{cat}</span>;
  if (c === "people") return <span className={`${base} bg-teal-500/15 text-teal-400`}>{cat}</span>;
  if (c === "data") return <span className={`${base} bg-cyan-500/15 text-cyan-400`}>{cat}</span>;
  if (c === "compliance") return <span className={`${base} bg-red-500/15 text-red-400`}>{cat}</span>;
  return <span className={`${base} bg-gray-500/15 text-gray-400`}>{cat || "Other"}</span>;
}

const CATEGORIES = ["Process", "Technology", "People", "Data", "Compliance", "Other"];
const SEVERITIES = ["low", "medium", "high", "critical"];

type AccountOption = { account_id: string; company_name: string };
type PainPointRow = {
  pain_point_id: string;
  title: string;
  category: string;
  severity: string;
  estimated_annual_cost: number | string;
  source: string;
  description: string;
};

export default function DiscoveryPainPointsPage() {
  const { envId, businessId } = useDomainEnv();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [painPoints, setPainPoints] = useState<PainPointRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    category: "Process",
    severity: "medium",
    estimated_annual_cost: "",
    description: "",
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

  async function loadPainPoints() {
    if (!selectedAccount) { setPainPoints([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ env_id: envId, account_id: selectedAccount });
      if (businessId) qs.set("business_id", businessId);
      const res = await fetch(`${API_BASE}/api/discovery/v1/pain-points?${qs}`);
      if (!res.ok) throw new Error(`Failed to fetch pain points: ${res.status}`);
      const data = await res.json();
      setPainPoints(data.pain_points ?? data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pain points");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  useEffect(() => {
    void loadPainPoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE}/api/discovery/v1/pain-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: envId,
          business_id: businessId || undefined,
          account_id: selectedAccount,
          ...form,
          estimated_annual_cost: form.estimated_annual_cost ? Number(form.estimated_annual_cost) : 0,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Create failed: ${res.status}`);
      }
      setForm({ title: "", category: "Process", severity: "medium", estimated_annual_cost: "", description: "" });
      setShowCreate(false);
      await loadPainPoints();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create pain point");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-5" data-testid="discovery-pain-points">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Pain Points</h2>
          <p className="text-sm text-bm-muted2">Identified pain points, categorized by severity and estimated cost impact.</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          disabled={!selectedAccount}
          className="shrink-0 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50"
        >
          + New Pain Point
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
          <h3 className="text-sm font-semibold mb-3">Add Pain Point</h3>
          <form className="grid sm:grid-cols-3 gap-2" onSubmit={onCreate}>
            <input required value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={form.severity} onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value }))} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              {SEVERITIES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <input value={form.estimated_annual_cost} onChange={(e) => setForm((p) => ({ ...p, estimated_annual_cost: e.target.value }))} placeholder="Estimated annual cost ($)" type="number" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" rows={2} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm sm:col-span-2" />
            <button type="submit" disabled={creating} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50">
              {creating ? "Creating..." : "Add Pain Point"}
            </button>
          </form>
          {createError && <p className="mt-2 text-xs text-red-400">{createError}</p>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void loadPainPoints()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Est. Annual Cost</th>
              <th className="px-4 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={5}>Loading...</td></tr>
            ) : !selectedAccount ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={5}>Select an account to view pain points.</td></tr>
            ) : !painPoints.length ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={5}>No pain points recorded for this account.</td></tr>
            ) : (
              painPoints.map((p) => (
                <tr key={p.pain_point_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{p.title}</td>
                  <td className="px-4 py-3">{categoryBadge(p.category)}</td>
                  <td className="px-4 py-3">{severityBadge(p.severity)}</td>
                  <td className="px-4 py-3">{fmtMoney(p.estimated_annual_cost)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{p.source || "\u2014"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
