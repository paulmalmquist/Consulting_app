"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = process.env.NEXT_PUBLIC_BOS_API_URL || "http://localhost:8000";

type Account = { account_id: string; account_name: string };
type Entity = { entity_id: string; entity_name: string };
type System = { system_id: string; system_name: string };
type EntityMapping = {
  entity_mapping_id: string;
  source_table: string;
  entity_name?: string;
  system_name?: string;
  confidence_score?: number;
};

export default function FieldMappingsPage() {
  const { envId, businessId } = useDomainEnv();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [mappings, setMappings] = useState<EntityMapping[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [systems, setSystems] = useState<System[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    entity_id: "",
    system_id: "",
    source_table: "",
    confidence_score: "0.8",
  });

  const qs = () => {
    const p = new URLSearchParams({ env_id: envId });
    if (businessId) p.set("business_id", businessId);
    return p.toString();
  };

  // Load accounts
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

  // Load mappings + entities + systems
  async function loadData() {
    if (!selectedAccount) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [mapRes, entRes, sysRes] = await Promise.all([
        fetch(`${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/entity-mappings?${qs()}`),
        fetch(`${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/entities?${qs()}`),
        fetch(`${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/systems?${qs()}`),
      ]);

      if (mapRes.ok) {
        const d = await mapRes.json();
        setMappings(d.entity_mappings ?? d.mappings ?? d ?? []);
      } else {
        setMappings([]);
      }

      if (entRes.ok) {
        const d = await entRes.json();
        setEntities(d.entities ?? d ?? []);
      }

      if (sysRes.ok) {
        const d = await sysRes.json();
        setSystems(d.systems ?? d ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mappings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId, selectedAccount]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormStatus("Creating...");
    setFormError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/entity-mappings?${qs()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_id: form.entity_id,
            system_id: form.system_id || undefined,
            source_table: form.source_table,
            confidence_score: parseFloat(form.confidence_score) || 0.8,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Failed to create mapping");
      }
      setForm({ entity_id: "", system_id: "", source_table: "", confidence_score: "0.8" });
      setShowForm(false);
      setFormStatus(null);
      await loadData();
    } catch (err) {
      setFormStatus(null);
      setFormError(err instanceof Error ? err.message : "Failed to create mapping");
    }
  }

  function confidenceBar(score?: number) {
    const pct = Math.round((score ?? 0) * 100);
    const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 w-24 rounded-full bg-bm-surface/60 overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-bm-muted2">{pct}%</span>
      </div>
    );
  }

  return (
    <section className="space-y-5" data-testid="data-studio-mappings">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Field Mappings</h2>
          <p className="text-sm text-bm-muted2">Map source tables and systems to canonical entities.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
        >
          + New Mapping
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

      {/* Create Mapping Form */}
      {showForm && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold mb-3">Create Entity Mapping</h3>
          <form className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2" onSubmit={onSubmit}>
            <select
              required
              value={form.entity_id}
              onChange={(e) => setForm((p) => ({ ...p, entity_id: e.target.value }))}
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            >
              <option value="">Select entity...</option>
              {entities.map((ent) => (
                <option key={ent.entity_id} value={ent.entity_id}>{ent.entity_name}</option>
              ))}
            </select>
            <select
              value={form.system_id}
              onChange={(e) => setForm((p) => ({ ...p, system_id: e.target.value }))}
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            >
              <option value="">Select system (optional)...</option>
              {systems.map((s) => (
                <option key={s.system_id} value={s.system_id}>{s.system_name}</option>
              ))}
            </select>
            <input
              required
              value={form.source_table}
              onChange={(e) => setForm((p) => ({ ...p, source_table: e.target.value }))}
              placeholder="Source table name"
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <input
              value={form.confidence_score}
              onChange={(e) => setForm((p) => ({ ...p, confidence_score: e.target.value }))}
              placeholder="Confidence (0-1)"
              type="number"
              step="0.01"
              min="0"
              max="1"
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 sm:col-span-2 lg:col-span-4"
            >
              Create Mapping
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

      {/* Mappings Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <div className="border-b border-bm-border/50 px-4 py-3 bg-bm-surface/30">
          <h3 className="text-sm font-semibold">Entity Mappings</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Source Table</th>
              <th className="px-4 py-2 font-medium">Entity</th>
              <th className="px-4 py-2 font-medium">System</th>
              <th className="px-4 py-2 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>Loading...</td></tr>
            ) : mappings.length === 0 ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>No mappings yet. Click &quot;+ New Mapping&quot; to create one.</td></tr>
            ) : (
              mappings.map((m) => (
                <tr key={m.entity_mapping_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{m.source_table}</td>
                  <td className="px-4 py-3 text-bm-muted2">{m.entity_name ?? "--"}</td>
                  <td className="px-4 py-3 text-bm-muted2">{m.system_name ?? "--"}</td>
                  <td className="px-4 py-3">{confidenceBar(m.confidence_score)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
