"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = ""; // Same-origin — routes through proxy handlers

type Account = { account_id: string; account_name: string };
type IngestionJob = {
  job_id: string;
  artifact_name: string;
  status: string;
  started_at: string;
  row_count?: number;
};
type KPIs = {
  total_artifacts: number;
  total_entities: number;
  total_mappings: number;
};

export default function DataStudioCommandCenterPage() {
  const { envId, businessId } = useDomainEnv();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAccounts() {
      try {
        const qs = new URLSearchParams({ env_id: envId });
        if (businessId) qs.set("business_id", businessId);
        const res = await fetch(`${API_BASE}/api/discovery/v1/accounts?${qs}`);
        if (!res.ok) throw new Error("Failed to load accounts");
        const data = await res.json();
        const list: Account[] = data.accounts ?? data ?? [];
        setAccounts(list);
        if (list.length > 0) setSelectedAccount(list[0].account_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
      }
    }
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  useEffect(() => {
    if (!selectedAccount) {
      setLoading(false);
      return;
    }
    async function loadDashboard() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ env_id: envId });
        if (businessId) qs.set("business_id", businessId);

        const [kpiRes, jobsRes] = await Promise.all([
          fetch(`${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/kpis?${qs}`),
          fetch(`${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/ingestion-jobs?${qs}`),
        ]);

        if (kpiRes.ok) {
          setKpis(await kpiRes.json());
        } else {
          setKpis({ total_artifacts: 0, total_entities: 0, total_mappings: 0 });
        }

        if (jobsRes.ok) {
          const jd = await jobsRes.json();
          setJobs(jd.jobs ?? jd ?? []);
        } else {
          setJobs([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId, selectedAccount]);

  function statusBadge(status: string) {
    const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
    if (status === "completed" || status === "success")
      return <span className={`${base} bg-green-500/15 text-green-400`}>{status}</span>;
    if (status === "running" || status === "processing")
      return <span className={`${base} bg-blue-500/15 text-blue-400`}>{status}</span>;
    if (status === "failed" || status === "error")
      return <span className={`${base} bg-red-500/15 text-red-400`}>{status}</span>;
    return <span className={`${base} bg-bm-surface/60 text-bm-muted2`}>{status}</span>;
  }

  const quickLinks = [
    { href: `/lab/env/${envId}/data-studio/intake`, label: "Data Intake", desc: "Upload and manage source artifacts" },
    { href: `/lab/env/${envId}/data-studio/schema`, label: "Schema Viewer", desc: "Inspect inferred schemas and column profiles" },
    { href: `/lab/env/${envId}/data-studio/entities`, label: "Canonical Model", desc: "Define canonical entities and fields" },
    { href: `/lab/env/${envId}/data-studio/mappings`, label: "Field Mappings", desc: "Map source fields to canonical entities" },
    { href: `/lab/env/${envId}/data-studio/lineage`, label: "Data Lineage", desc: "Trace data flow from source to entity" },
  ];

  return (
    <section className="space-y-5" data-testid="data-studio-command-center">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Data Studio</h2>
          <p className="text-sm text-bm-muted2">Ingest, profile, map, and govern client data artifacts.</p>
        </div>
      </div>

      {/* Account Selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-bm-muted2">Account</label>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
        >
          {accounts.length === 0 && <option value="">No accounts</option>}
          {accounts.map((a) => (
            <option key={a.account_id} value={a.account_id}>{a.account_name}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total Artifacts</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "--" : (kpis?.total_artifacts ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total Entities</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "--" : (kpis?.total_entities ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total Mappings</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "--" : (kpis?.total_mappings ?? 0)}</p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 hover:bg-bm-surface/40 transition-colors"
          >
            <p className="text-sm font-semibold">{link.label}</p>
            <p className="mt-1 text-xs text-bm-muted2">{link.desc}</p>
          </Link>
        ))}
      </div>

      {/* Recent Ingestion Jobs */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <div className="border-b border-bm-border/50 px-4 py-3 bg-bm-surface/30">
          <h3 className="text-sm font-semibold">Recent Ingestion Jobs</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Artifact</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Rows</th>
              <th className="px-4 py-2 font-medium">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>Loading...</td></tr>
            ) : jobs.length === 0 ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>No ingestion jobs yet.</td></tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.job_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{j.artifact_name}</td>
                  <td className="px-4 py-3">{statusBadge(j.status)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{j.row_count ?? "--"}</td>
                  <td className="px-4 py-3 text-bm-muted2">{j.started_at ? new Date(j.started_at).toLocaleString() : "--"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
