"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createCreditCase, CreditCase, listCreditCases } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function fmtMoney(value?: string | number | null): string {
  if (value === null || value === undefined) return "$0";
  const n = Number(value);
  if (Number.isNaN(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function CreditHubPage() {
  const { envId, businessId } = useDomainEnv();
  const [cases, setCases] = useState<CreditCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    case_number: "",
    borrower_name: "",
    facility_type: "term_loan",
    requested_amount: "",
    risk_grade: "",
  });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listCreditCases(envId, businessId || undefined);
      setCases(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load credit cases");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  async function onCreateCase(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("Creating case...");
    try {
      await createCreditCase({
        env_id: envId,
        business_id: businessId || undefined,
        case_number: form.case_number,
        borrower_name: form.borrower_name,
        facility_type: form.facility_type,
        requested_amount: form.requested_amount || "0",
        risk_grade: form.risk_grade || undefined,
      });
      setForm({ case_number: "", borrower_name: "", facility_type: "term_loan", requested_amount: "", risk_grade: "" });
      await refresh();
      setStatus("Case created.");
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Failed to create case");
    }
  }

  const watchlistCount = cases.filter((item) => item.stage === "watchlist").length;

  return (
    <section className="space-y-5" data-testid="credit-risk-hub">
      <div>
        <h2 className="text-2xl font-semibold">Credit Risk Hub</h2>
        <p className="text-sm text-bm-muted2">Underwriting, committee governance, covenant monitoring, and workout visibility.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Active Cases</p>
          <p className="mt-1 text-xl font-semibold">{cases.length}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Watchlist</p>
          <p className="mt-1 text-xl font-semibold">{watchlistCount}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Requested Exposure</p>
          <p className="mt-1 text-xl font-semibold">{fmtMoney(cases.reduce((sum, item) => sum + Number(item.requested_amount || 0), 0))}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Approved Exposure</p>
          <p className="mt-1 text-xl font-semibold">{fmtMoney(cases.reduce((sum, item) => sum + Number(item.approved_amount || 0), 0))}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr,340px] gap-4">
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-3 font-medium">Case</th>
                <th className="px-4 py-3 font-medium">Borrower</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Risk Grade</th>
                <th className="px-4 py-3 font-medium">Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {loading ? (
                <tr><td className="px-4 py-6 text-bm-muted2" colSpan={5}>Loading cases...</td></tr>
              ) : cases.length === 0 ? (
                <tr><td className="px-4 py-6 text-bm-muted2" colSpan={5}>No cases yet.</td></tr>
              ) : (
                cases.map((item) => (
                  <tr key={item.case_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/lab/env/${envId}/credit/cases/${item.case_id}`} className="hover:underline">
                        {item.case_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{item.borrower_name}</td>
                    <td className="px-4 py-3 capitalize">{item.stage.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">{item.risk_grade || "—"}</td>
                    <td className="px-4 py-3">{fmtMoney(item.requested_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold mb-3">Create Case</h3>
          <form className="space-y-2" onSubmit={onCreateCase}>
            <input required value={form.case_number} onChange={(e) => setForm((prev) => ({ ...prev, case_number: e.target.value }))} placeholder="Case number" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input required value={form.borrower_name} onChange={(e) => setForm((prev) => ({ ...prev, borrower_name: e.target.value }))} placeholder="Borrower" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.facility_type} onChange={(e) => setForm((prev) => ({ ...prev, facility_type: e.target.value }))} placeholder="Facility type" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.requested_amount} onChange={(e) => setForm((prev) => ({ ...prev, requested_amount: e.target.value }))} placeholder="Requested amount" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input value={form.risk_grade} onChange={(e) => setForm((prev) => ({ ...prev, risk_grade: e.target.value }))} placeholder="Risk grade" className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <button type="submit" className="w-full rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">Add Case</button>
          </form>
          {status ? <p className="mt-2 text-xs text-bm-muted2">{status}</p> : null}
          {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
