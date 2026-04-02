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

function truncate(text: string, max: number): string {
  if (!text) return "\u2014";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

type AccountOption = { account_id: string; company_name: string };
type SessionRow = {
  session_id: string;
  session_date: string;
  attendees: string;
  notes: string;
  files_requested: string;
  next_steps: string;
};

export default function DiscoverySessionsPage() {
  const { envId, businessId } = useDomainEnv();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    session_date: "",
    attendees: "",
    notes: "",
    files_requested: "",
    next_steps: "",
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

  async function loadSessions() {
    if (!selectedAccount) { setSessions([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ env_id: envId, account_id: selectedAccount });
      if (businessId) qs.set("business_id", businessId);
      const res = await fetch(`${API_BASE}/api/discovery/v1/sessions?${qs}`);
      if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions ?? data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE}/api/discovery/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: envId,
          business_id: businessId || undefined,
          account_id: selectedAccount,
          ...form,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Create failed: ${res.status}`);
      }
      setForm({ session_date: "", attendees: "", notes: "", files_requested: "", next_steps: "" });
      setShowCreate(false);
      await loadSessions();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-5" data-testid="discovery-sessions">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Discovery Sessions</h2>
          <p className="text-sm text-bm-muted2">Meeting log — attendees, notes, and follow-ups.</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          disabled={!selectedAccount}
          className="shrink-0 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50"
        >
          + New Session
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
          <h3 className="text-sm font-semibold mb-3">Log Session</h3>
          <form className="grid sm:grid-cols-2 gap-2" onSubmit={onCreate}>
            <input required value={form.session_date} onChange={(e) => setForm((p) => ({ ...p, session_date: e.target.value }))} type="date" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input required value={form.attendees} onChange={(e) => setForm((p) => ({ ...p, attendees: e.target.value }))} placeholder="Attendees (comma-separated)" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Session notes" rows={3} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm sm:col-span-2" />
            <input value={form.files_requested} onChange={(e) => setForm((p) => ({ ...p, files_requested: e.target.value }))} placeholder="Files requested" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.next_steps} onChange={(e) => setForm((p) => ({ ...p, next_steps: e.target.value }))} placeholder="Next steps" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <button type="submit" disabled={creating} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50 sm:col-span-2">
              {creating ? "Creating..." : "Log Session"}
            </button>
          </form>
          {createError && <p className="mt-2 text-xs text-red-400">{createError}</p>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void loadSessions()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Attendees</th>
              <th className="px-4 py-2 font-medium">Notes</th>
              <th className="px-4 py-2 font-medium">Files Requested</th>
              <th className="px-4 py-2 font-medium">Next Steps</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={5}>Loading...</td></tr>
            ) : !selectedAccount ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={5}>Select an account to view sessions.</td></tr>
            ) : !sessions.length ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={5}>No sessions recorded for this account.</td></tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.session_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{fmtDate(s.session_date)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{s.attendees || "\u2014"}</td>
                  <td className="px-4 py-3 text-bm-muted2 max-w-xs">{truncate(s.notes, 80)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{s.files_requested || "\u2014"}</td>
                  <td className="px-4 py-3 text-bm-muted2">{truncate(s.next_steps, 60)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
