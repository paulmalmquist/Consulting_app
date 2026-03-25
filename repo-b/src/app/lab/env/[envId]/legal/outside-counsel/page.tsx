"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { createLegalFirm, listLegalFirms, LegalFirm } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

import { fmtMoney } from '@/lib/format-utils';
function ratingStars(rating?: string | null): string {
  if (!rating) return "—";
  const n = Number(rating);
  if (Number.isNaN(n)) return "—";
  const full = Math.round(n * 5);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

export default function OutsideCounselPage() {
  const { envId, businessId } = useDomainEnv();
  const [firms, setFirms] = useState<LegalFirm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firm_name: "",
    primary_contact: "",
    contact_email: "",
    contact_phone: "",
    specialties: "",
  });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listLegalFirms(envId, businessId || undefined);
      setFirms(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load firms");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [envId, businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onCreateFirm(event: FormEvent) {
    event.preventDefault();
    setCreateError(null);
    try {
      await createLegalFirm({
        env_id: envId,
        business_id: businessId || undefined,
        firm_name: form.firm_name,
        primary_contact: form.primary_contact || undefined,
        contact_email: form.contact_email || undefined,
        contact_phone: form.contact_phone || undefined,
        specialties: form.specialties ? form.specialties.split(",").map((s) => s.trim()).filter(Boolean) : [],
      });
      setForm({ firm_name: "", primary_contact: "", contact_email: "", contact_phone: "", specialties: "" });
      setShowCreate(false);
      await refresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create firm");
    }
  }

  return (
    <section className="space-y-5" data-testid="legal-outside-counsel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Outside Counsel</h2>
          <p className="text-sm text-bm-muted2">Law firm relationships, matter assignments, and spend performance.</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="shrink-0 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
        >
          + Add Firm
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold mb-3">Add Law Firm</h3>
          <form className="grid sm:grid-cols-2 gap-2" onSubmit={onCreateFirm}>
            <input required value={form.firm_name} onChange={(e) => setForm((p) => ({ ...p, firm_name: e.target.value }))} placeholder="Firm name *" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.primary_contact} onChange={(e) => setForm((p) => ({ ...p, primary_contact: e.target.value }))} placeholder="Primary contact" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input type="email" value={form.contact_email} onChange={(e) => setForm((p) => ({ ...p, contact_email: e.target.value }))} placeholder="Email" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.contact_phone} onChange={(e) => setForm((p) => ({ ...p, contact_phone: e.target.value }))} placeholder="Phone" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.specialties} onChange={(e) => setForm((p) => ({ ...p, specialties: e.target.value }))} placeholder="Specialties (comma-separated)" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm sm:col-span-2" />
            <button type="submit" className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">Add Firm</button>
          </form>
          {createError && <p className="mt-2 text-xs text-red-400">{createError}</p>}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      )}

      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Firm</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Specialties</th>
              <th className="px-4 py-3 font-medium">Matters</th>
              <th className="px-4 py-3 font-medium">YTD Spend</th>
              <th className="px-4 py-3 font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={7}>Loading firms...</td></tr>
            ) : firms.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={7}>No law firms added yet. Click &ldquo;+ Add Firm&rdquo; to get started.</td></tr>
            ) : (
              firms.map((f) => (
                <tr key={f.firm_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{f.firm_name}</td>
                  <td className="px-4 py-3">
                    <p>{f.primary_contact || "—"}</p>
                    {f.contact_email && <p className="text-xs text-bm-muted2">{f.contact_email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {f.specialties.length > 0
                      ? f.specialties.map((s, i) => <span key={i} className="mr-1 text-xs rounded-full border border-bm-border/70 px-2 py-0.5">{s}</span>)
                      : <span className="text-bm-muted2">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">{f.matter_count}</td>
                  <td className="px-4 py-3 font-medium">{fmtMoney(f.ytd_spend)}</td>
                  <td className="px-4 py-3 text-amber-400 text-xs">{ratingStars(f.performance_rating)}</td>
                  <td className="px-4 py-3 capitalize text-bm-muted2">{f.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
