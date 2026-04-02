"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = ""; // Same-origin — routes through proxy handlers

type Account = { account_id: string; account_name: string };

type Artifact = {
  artifact_id: string;
  filename: string;
  file_type: string;
  mime_type?: string;
  row_count?: number;
  column_count?: number;
  processing_status: string;
  created_at: string;
};

const FILE_TYPES = ["excel", "csv", "pdf", "screenshot", "export", "other"] as const;

function typeBadge(ft: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  const colors: Record<string, string> = {
    excel: "bg-green-500/15 text-green-400",
    csv: "bg-blue-500/15 text-blue-400",
    pdf: "bg-red-500/15 text-red-400",
    screenshot: "bg-purple-500/15 text-purple-400",
    export: "bg-amber-500/15 text-amber-400",
  };
  return <span className={`${base} ${colors[ft] ?? "bg-bm-surface/60 text-bm-muted2"}`}>{ft}</span>;
}

function statusBadge(status: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "completed" || status === "profiled")
    return <span className={`${base} bg-green-500/15 text-green-400`}>{status}</span>;
  if (status === "processing" || status === "ingesting")
    return <span className={`${base} bg-blue-500/15 text-blue-400`}>{status}</span>;
  if (status === "failed" || status === "error")
    return <span className={`${base} bg-red-500/15 text-red-400`}>{status}</span>;
  return <span className={`${base} bg-bm-surface/60 text-bm-muted2`}>{status}</span>;
}

export default function DataIntakePage() {
  const { envId, businessId } = useDomainEnv();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload form
  const [showForm, setShowForm] = useState(false);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    filename: "",
    file_type: "excel" as string,
    mime_type: "",
    notes: "",
  });

  const qs = (extra?: Record<string, string>) => {
    const p = new URLSearchParams({ env_id: envId });
    if (businessId) p.set("business_id", businessId);
    if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p.toString();
  };

  useEffect(() => {
    async function loadAccounts() {
      try {
        const res = await fetch(`${API_BASE}/api/discovery/v1/accounts?${qs()}`);
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
    async function loadArtifacts() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/artifacts?${qs()}`
        );
        if (!res.ok) throw new Error("Failed to load artifacts");
        const data = await res.json();
        setArtifacts(data.artifacts ?? data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load artifacts");
      } finally {
        setLoading(false);
      }
    }
    void loadArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId, selectedAccount]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormStatus("Creating...");
    setFormError(null);
    try {
      const res = await fetch(`${API_BASE}/api/data-studio/v1/artifacts?${qs()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccount,
          filename: form.filename,
          file_type: form.file_type,
          mime_type: form.mime_type || undefined,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Failed to create artifact");
      }
      setForm({ filename: "", file_type: "excel", mime_type: "", notes: "" });
      setShowForm(false);
      setFormStatus(null);
      // Refresh list
      const listRes = await fetch(
        `${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/artifacts?${qs()}`
      );
      if (listRes.ok) {
        const data = await listRes.json();
        setArtifacts(data.artifacts ?? data ?? []);
      }
    } catch (err) {
      setFormStatus(null);
      setFormError(err instanceof Error ? err.message : "Failed to create artifact");
    }
  }

  return (
    <section className="space-y-5" data-testid="data-studio-intake">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Data Intake</h2>
          <p className="text-sm text-bm-muted2">Upload and manage source data artifacts.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
        >
          + New Artifact
        </button>
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

      {/* Upload Form */}
      {showForm && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold mb-3">Upload Artifact Metadata</h3>
          <form className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2" onSubmit={onSubmit}>
            <input
              required
              value={form.filename}
              onChange={(e) => setForm((p) => ({ ...p, filename: e.target.value }))}
              placeholder="Filename (e.g. Q4_Revenue.xlsx)"
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <select
              value={form.file_type}
              onChange={(e) => setForm((p) => ({ ...p, file_type: e.target.value }))}
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            >
              {FILE_TYPES.map((ft) => (
                <option key={ft} value={ft}>{ft}</option>
              ))}
            </select>
            <input
              value={form.mime_type}
              onChange={(e) => setForm((p) => ({ ...p, mime_type: e.target.value }))}
              placeholder="MIME type (optional)"
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <input
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Notes (optional)"
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 sm:col-span-2 lg:col-span-4"
            >
              Create Artifact
            </button>
          </form>
          {formStatus && <p className="mt-2 text-xs text-bm-muted2">{formStatus}</p>}
          {formError && <p className="mt-2 text-xs text-red-400">{formError}</p>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Artifact Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <div className="border-b border-bm-border/50 px-4 py-3 bg-bm-surface/30">
          <h3 className="text-sm font-semibold">Artifacts</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Filename</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Rows</th>
              <th className="px-4 py-2 font-medium">Columns</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={6}>Loading...</td></tr>
            ) : artifacts.length === 0 ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={6}>No artifacts yet. Click &quot;+ New Artifact&quot; to add one.</td></tr>
            ) : (
              artifacts.map((a) => (
                <tr key={a.artifact_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{a.filename}</td>
                  <td className="px-4 py-3">{typeBadge(a.file_type)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{a.row_count ?? "--"}</td>
                  <td className="px-4 py-3 text-bm-muted2">{a.column_count ?? "--"}</td>
                  <td className="px-4 py-3">{statusBadge(a.processing_status)}</td>
                  <td className="px-4 py-3 text-bm-muted2">
                    {a.created_at ? new Date(a.created_at).toLocaleDateString() : "--"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
