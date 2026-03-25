"use client";

import React, { useEffect, useState } from "react";
import { listLegalSpendEntries, LegalSpendEntry } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

import { fmtDate, fmtMoney } from '@/lib/format-utils';
export default function LegalSpendPage() {
  const { envId, businessId } = useDomainEnv();
  const [entries, setEntries] = useState<LegalSpendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listLegalSpendEntries(envId, businessId || undefined)
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load spend entries"))
      .finally(() => setLoading(false));
  }, [envId, businessId]);

  const totalSpend = entries.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  // Top firms by spend
  const firmSpend: Record<string, number> = {};
  entries.forEach((e) => {
    const firm = e.outside_counsel || "Unknown";
    firmSpend[firm] = (firmSpend[firm] ?? 0) + Number(e.amount || 0);
  });
  const topFirms = Object.entries(firmSpend).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <section className="space-y-5" data-testid="legal-spend">
      <div>
        <h2 className="text-2xl font-semibold">Legal Spend</h2>
        <p className="text-sm text-bm-muted2">Outside counsel invoices, budget tracking, and spend analysis.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total Invoiced</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "—" : fmtMoney(totalSpend)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Invoices</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "—" : entries.length}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Avg Invoice</p>
          <p className="mt-1 text-xl font-semibold">{loading || !entries.length ? "—" : fmtMoney(totalSpend / entries.length)}</p>
        </div>
      </div>

      {/* Top firms */}
      {!loading && topFirms.length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold mb-3">Top Firms by Spend</h3>
          <div className="space-y-2">
            {topFirms.map(([firm, amount]) => {
              const pct = totalSpend > 0 ? (amount / totalSpend) * 100 : 0;
              return (
                <div key={firm} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-sm truncate">{firm}</span>
                  <div className="flex-1 h-2 rounded-full bg-bm-surface/60 overflow-hidden">
                    <div className="h-full rounded-full bg-bm-accent/70" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-16 text-right text-sm font-medium">{fmtMoney(amount)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      )}

      {/* Invoice table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Invoice Ref</th>
              <th className="px-4 py-3 font-medium">Firm</th>
              <th className="px-4 py-3 font-medium">Matter</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={5}>Loading invoices...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={5}>No spend entries yet. Add invoices from within a matter workspace.</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.legal_spend_entry_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{e.invoice_ref || "—"}</td>
                  <td className="px-4 py-3">{e.outside_counsel || "—"}</td>
                  <td className="px-4 py-3">
                    <p>{e.matter_number || "—"}</p>
                    {e.matter_title && <p className="text-xs text-bm-muted2 truncate max-w-xs">{e.matter_title}</p>}
                  </td>
                  <td className="px-4 py-3 font-medium">{fmtMoney(e.amount)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{fmtDate(e.incurred_date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
