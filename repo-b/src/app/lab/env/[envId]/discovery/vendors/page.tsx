"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

import { fmtDate, fmtMoney } from '@/lib/format-utils';
const API_BASE = process.env.NEXT_PUBLIC_BOS_API_URL || "http://localhost:8000";

function riskBadge(level: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  const l = (level || "").toLowerCase();
  if (l === "high" || l === "critical") return <span className={`${base} bg-red-500/15 text-red-400`}>{level}</span>;
  if (l === "medium") return <span className={`${base} bg-amber-500/15 text-amber-400`}>{level}</span>;
  if (l === "low") return <span className={`${base} bg-green-500/15 text-green-400`}>{level}</span>;
  return <span className={`${base} bg-blue-500/15 text-blue-400`}>{level || "N/A"}</span>;
}

function difficultyBadge(d: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  const v = (d || "").toLowerCase();
  if (v === "hard" || v === "very_hard") return <span className={`${base} bg-red-500/15 text-red-400`}>{d}</span>;
  if (v === "medium" || v === "moderate") return <span className={`${base} bg-amber-500/15 text-amber-400`}>{d}</span>;
  if (v === "easy") return <span className={`${base} bg-green-500/15 text-green-400`}>{d}</span>;
  return <span className={`${base} bg-blue-500/15 text-blue-400`}>{d || "N/A"}</span>;
}

const LOCK_IN_LEVELS = ["low", "medium", "high", "critical"];
const DIFFICULTY_LEVELS = ["easy", "moderate", "hard", "very_hard"];

type AccountOption = { account_id: string; company_name: string };
type VendorRow = {
  vendor_id: string;
  vendor_name: string;
  category: string;
  annual_spend: number | string;
  lock_in_risk: string;
  replacement_difficulty: string;
  contract_end_date: string;
};

export default function DiscoveryVendorsPage() {
  const { envId, businessId } = useDomainEnv();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vendor_name: "",
    category: "",
    annual_spend: "",
    lock_in_risk: "medium",
    replacement_difficulty: "moderate",
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

  async function loadVendors() {
    if (!selectedAccount) { setVendors([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ env_id: envId, account_id: selectedAccount });
      if (businessId) qs.set("business_id", businessId);
      const res = await fetch(`${API_BASE}/api/discovery/v1/vendors?${qs}`);
      if (!res.ok) throw new Error(`Failed to fetch vendors: ${res.status}`);
      const data = await res.json();
      setVendors(data.vendors ?? data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  useEffect(() => {
    void loadVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE}/api/discovery/v1/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: envId,
          business_id: businessId || undefined,
          account_id: selectedAccount,
          ...form,
          annual_spend: form.annual_spend ? Number(form.annual_spend) : 0,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Create failed: ${res.status}`);
      }
      setForm({ vendor_name: "", category: "", annual_spend: "", lock_in_risk: "medium", replacement_difficulty: "moderate" });
      setShowCreate(false);
      await loadVendors();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create vendor");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-5" data-testid="discovery-vendors">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Vendors</h2>
          <p className="text-sm text-bm-muted2">Vendor landscape, spend, and lock-in risk analysis.</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          disabled={!selectedAccount}
          className="shrink-0 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50"
        >
          + New Vendor
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
          <h3 className="text-sm font-semibold mb-3">Add Vendor</h3>
          <form className="grid sm:grid-cols-3 gap-2" onSubmit={onCreate}>
            <input required value={form.vendor_name} onChange={(e) => setForm((p) => ({ ...p, vendor_name: e.target.value }))} placeholder="Vendor name" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder="Category" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.annual_spend} onChange={(e) => setForm((p) => ({ ...p, annual_spend: e.target.value }))} placeholder="Annual spend ($)" type="number" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <select value={form.lock_in_risk} onChange={(e) => setForm((p) => ({ ...p, lock_in_risk: e.target.value }))} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              {LOCK_IN_LEVELS.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
            </select>
            <select value={form.replacement_difficulty} onChange={(e) => setForm((p) => ({ ...p, replacement_difficulty: e.target.value }))} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              {DIFFICULTY_LEVELS.map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1).replace("_", " ")}</option>)}
            </select>
            <button type="submit" disabled={creating} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50">
              {creating ? "Creating..." : "Add Vendor"}
            </button>
          </form>
          {createError && <p className="mt-2 text-xs text-red-400">{createError}</p>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void loadVendors()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Vendor</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Annual Spend</th>
              <th className="px-4 py-2 font-medium">Lock-in Risk</th>
              <th className="px-4 py-2 font-medium">Replacement</th>
              <th className="px-4 py-2 font-medium">Contract End</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={6}>Loading...</td></tr>
            ) : !selectedAccount ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={6}>Select an account to view vendors.</td></tr>
            ) : !vendors.length ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={6}>No vendors recorded for this account.</td></tr>
            ) : (
              vendors.map((v) => (
                <tr key={v.vendor_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{v.vendor_name}</td>
                  <td className="px-4 py-3 text-bm-muted2">{v.category || "\u2014"}</td>
                  <td className="px-4 py-3">{fmtMoney(v.annual_spend)}</td>
                  <td className="px-4 py-3">{riskBadge(v.lock_in_risk)}</td>
                  <td className="px-4 py-3">{difficultyBadge(v.replacement_difficulty)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{fmtDate(v.contract_end_date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
