"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = process.env.NEXT_PUBLIC_BOS_API_URL || "http://localhost:8000";

type Account = { account_id: string; account_name: string };
type Entity = {
  entity_id: string;
  entity_name: string;
  description?: string;
  source_count?: number;
  field_count?: number;
};

export default function CanonicalModelPage() {
  const { envId, businessId } = useDomainEnv();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ entity_name: "", description: "" });

  const qs = () => {
    const p = new URLSearchParams({ env_id: envId });
    if (businessId) p.set("business_id", businessId);
    return p.toString();
  };

  useEffect(() => {
    async function load() {
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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  async function loadEntities() {
    if (!selectedAccount) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/entities?${qs()}`
      );
      if (!res.ok) throw new Error("Failed to load entities");
      const data = await res.json();
      setEntities(data.entities ?? data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEntities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId, selectedAccount]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormStatus("Creating...");
    setFormError(null);
    try {
      const res = await fetch(`${API_BASE}/api/data-studio/v1/entities?${qs()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccount,
          entity_name: form.entity_name,
          description: form.description || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Failed to create entity");
      }
      setForm({ entity_name: "", description: "" });
      setShowForm(false);
      setFormStatus(null);
      await loadEntities();
    } catch (err) {
      setFormStatus(null);
      setFormError(err instanceof Error ? err.message : "Failed to create entity");
    }
  }

  return (
    <section className="space-y-5" data-testid="data-studio-entities">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Canonical Model</h2>
          <p className="text-sm text-bm-muted2">Define and manage canonical entities for the data model.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
        >
          + New Entity
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

      {/* Create Entity Form */}
      {showForm && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold mb-3">Create Entity</h3>
          <form className="grid sm:grid-cols-3 gap-2" onSubmit={onSubmit}>
            <input
              required
              value={form.entity_name}
              onChange={(e) => setForm((p) => ({ ...p, entity_name: e.target.value }))}
              placeholder="Entity name (e.g. Invoice)"
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <input
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Description (optional)"
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Create Entity
            </button>
          </form>
          {formStatus && <p className="mt-2 text-xs text-bm-muted2">{formStatus}</p>}
          {formError && <p className="mt-2 text-xs text-red-400">{formError}</p>}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Entity Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <div className="border-b border-bm-border/50 px-4 py-3 bg-bm-surface/30">
          <h3 className="text-sm font-semibold">Entities</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Entity Name</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Sources</th>
              <th className="px-4 py-2 font-medium">Fields</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>Loading...</td></tr>
            ) : entities.length === 0 ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>No entities defined. Click &quot;+ New Entity&quot; to create one.</td></tr>
            ) : (
              entities.map((e) => (
                <tr key={e.entity_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{e.entity_name}</td>
                  <td className="px-4 py-3 text-bm-muted2">{e.description || "--"}</td>
                  <td className="px-4 py-3 text-bm-muted2">{e.source_count ?? 0}</td>
                  <td className="px-4 py-3 text-bm-muted2">{e.field_count ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
