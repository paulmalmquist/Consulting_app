"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createLegalMatter, LegalMatter, listLegalMatters } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function fmtMoney(value?: string | number | null): string {
  if (value === null || value === undefined) return "$0";
  const n = Number(value);
  if (Number.isNaN(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function LegalOpsPage() {
  const { envId, businessId } = useDomainEnv();
  const [matters, setMatters] = useState<LegalMatter[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    matter_number: "",
    title: "",
    matter_type: "Contract",
    risk_level: "medium",
    budget_amount: "",
  });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listLegalMatters(envId, businessId || undefined);
      setMatters(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load matters");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  async function onCreateMatter(event: FormEvent) {
    event.preventDefault();
    setStatus("Creating matter...");
    setError(null);
    try {
      await createLegalMatter({
        env_id: envId,
        business_id: businessId || undefined,
        matter_number: form.matter_number,
        title: form.title,
        matter_type: form.matter_type,
        risk_level: form.risk_level,
        budget_amount: form.budget_amount || "0",
      });
      setForm({ matter_number: "", title: "", matter_type: "Contract", risk_level: "medium", budget_amount: "" });
      await refresh();
      setStatus("Matter created.");
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Failed to create matter");
    }
  }

  const litigationExposure = matters.reduce((sum, row) => sum + Number(row.actual_spend || 0), 0);

  return (
    <section className="space-y-5" data-testid="legal-ops-command">
      <div>
        <h2 className="text-2xl font-semibold">Legal Ops Command</h2>
        <p className="text-sm text-bm-muted2">Matter management, obligations/deadlines, approvals, and spend controls.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Open Matters</p><p className="mt-1 text-xl font-semibold">{matters.length}</p></div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">High Risk</p><p className="mt-1 text-xl font-semibold">{matters.filter((m) => m.risk_level === "high").length}</p></div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Budgeted Spend</p><p className="mt-1 text-xl font-semibold">{fmtMoney(matters.reduce((sum, row) => sum + Number(row.budget_amount || 0), 0))}</p></div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Actual Spend</p><p className="mt-1 text-xl font-semibold">{fmtMoney(litigationExposure)}</p></div>
      </div>

      <div className="grid lg:grid-cols-[1fr,340px] gap-4">
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-3 font-medium">Matter</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 font-medium">Counterparty</th>
                <th className="px-4 py-3 font-medium">Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {loading ? (
                <tr><td className="px-4 py-6 text-bm-muted2" colSpan={5}>Loading matters...</td></tr>
              ) : matters.length === 0 ? (
                <tr><td className="px-4 py-6 text-bm-muted2" colSpan={5}>No matters yet.</td></tr>
              ) : (
                matters.map((matter) => (
                  <tr key={matter.matter_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium"><Link href={`/lab/env/${envId}/legal/matters/${matter.matter_id}`} className="hover:underline">{matter.matter_number}</Link></td>
                    <td className="px-4 py-3">{matter.matter_type}</td>
                    <td className="px-4 py-3 capitalize">{matter.risk_level}</td>
                    <td className="px-4 py-3">{matter.counterparty || "—"}</td>
                    <td className="px-4 py-3">{fmtMoney(matter.budget_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold mb-3">Create Matter</h3>
          <form className="space-y-2" onSubmit={onCreateMatter}>
            <input required value={form.matter_number} onChange={(e) => setForm((prev) => ({ ...prev, matter_number: e.target.value }))} placeholder="Matter number" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input required value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Matter title" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.matter_type} onChange={(e) => setForm((prev) => ({ ...prev, matter_type: e.target.value }))} placeholder="Matter type" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <select value={form.risk_level} onChange={(e) => setForm((prev) => ({ ...prev, risk_level: e.target.value }))} className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <input value={form.budget_amount} onChange={(e) => setForm((prev) => ({ ...prev, budget_amount: e.target.value }))} placeholder="Budget" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <button type="submit" className="w-full rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">Add Matter</button>
          </form>
          {status ? <p className="mt-2 text-xs text-bm-muted2">{status}</p> : null}
          {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
