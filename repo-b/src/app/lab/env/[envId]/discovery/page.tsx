"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_BOS_API_URL || "http://localhost:8000";

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

type DashboardKpis = {
  total_accounts: number;
  active_engagements: number;
  total_systems: number;
  total_vendors: number;
  vendor_spend: number | string;
  pain_points: number;
};

type AccountRow = {
  account_id: string;
  company_name: string;
  industry: string;
  engagement_stage: string;
  systems_count: number;
  vendors_count: number;
  updated_at: string;
};

export default function DiscoveryCommandCenterPage() {
  const { envId, businessId } = useDomainEnv();
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    industry: "",
    engagement_stage: "prospect",
  });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ env_id: envId });
      if (businessId) qs.set("business_id", businessId);
      const [dashRes, acctRes] = await Promise.all([
        fetch(`${API_BASE}/api/discovery/v1/dashboard?${qs}`),
        fetch(`${API_BASE}/api/discovery/v1/accounts?${qs}`),
      ]);
      if (!dashRes.ok) throw new Error(`Dashboard: ${dashRes.status}`);
      if (!acctRes.ok) throw new Error(`Accounts: ${acctRes.status}`);
      const dashData = await dashRes.json();
      const acctData = await acctRes.json();
      setKpis(dashData.kpis ?? dashData);
      setAccounts(acctData.accounts ?? acctData ?? []);
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
          company_name: form.company_name,
          industry: form.industry,
          engagement_stage: form.engagement_stage,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Create failed: ${res.status}`);
      }
      setForm({ company_name: "", industry: "", engagement_stage: "prospect" });
      setShowCreate(false);
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-5" data-testid="discovery-command-center">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Discovery Lab</h2>
          <p className="text-sm text-bm-muted2">Client engagement overview — accounts, systems, vendors, and pain points.</p>
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
            <select value={form.engagement_stage} onChange={(e) => setForm((p) => ({ ...p, engagement_stage: e.target.value }))} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              <option value="prospect">Prospect</option>
              <option value="qualifying">Qualifying</option>
              <option value="engaged">Engaged</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
            <button type="submit" disabled={creating} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50">
              {creating ? "Creating..." : "Add Account"}
            </button>
          </form>
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

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Accounts", value: kpis?.total_accounts ?? 0 },
          { label: "Active Engagements", value: kpis?.active_engagements ?? 0 },
          { label: "Total Systems", value: kpis?.total_systems ?? 0 },
          { label: "Total Vendors", value: kpis?.total_vendors ?? 0 },
          { label: "Vendor Spend", value: fmtMoney(kpis?.vendor_spend), isMoney: true },
          { label: "Pain Points", value: kpis?.pain_points ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{label}</p>
            <p className="mt-1 text-xl font-semibold">{loading ? "\u2014" : value}</p>
          </div>
        ))}
      </div>

      {/* Accounts Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <div className="border-b border-bm-border/50 px-4 py-3 flex items-center justify-between bg-bm-surface/30">
          <h3 className="text-sm font-semibold">Accounts</h3>
          <Link href={`/lab/env/${envId}/discovery/accounts`} className="text-xs text-bm-muted2 hover:underline">All accounts &rarr;</Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Industry</th>
              <th className="px-4 py-2 font-medium">Stage</th>
              <th className="px-4 py-2 font-medium">Systems</th>
              <th className="px-4 py-2 font-medium">Vendors</th>
              <th className="px-4 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={6}>Loading...</td></tr>
            ) : !accounts.length ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={6}>No accounts yet. Click &quot;+ New Account&quot; to get started.</td></tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.account_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/lab/env/${envId}/discovery/accounts`} className="hover:underline">{a.company_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">{a.industry || "\u2014"}</td>
                  <td className="px-4 py-3">{stageBadge(a.engagement_stage)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{a.systems_count ?? 0}</td>
                  <td className="px-4 py-3 text-bm-muted2">{a.vendors_count ?? 0}</td>
                  <td className="px-4 py-3 text-bm-muted2">{fmtDate(a.updated_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
