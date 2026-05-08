"use client";

import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { FreshnessRow } from "@/components/vultr/FreshnessBadge";
import { getVultrCustomers } from "@/lib/vultr-api";
import type { VultrEnvelope } from "@/lib/vultr-contracts";

type CustomerRow = {
  customer_id: string;
  display_name: string;
  segment: string | null;
  contract_type: string | null;
  open_tickets: number;
  churn_risk_score: number | null;
};

export default function VultrCustomersPage() {
  const { envId } = useDomainEnv();
  const [data, setData] = useState<VultrEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVultrCustomers(envId, { limit: 100 })
      .then((d) => !cancelled && setData(d))
      .catch((err: unknown) =>
        !cancelled && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
    };
  }, [envId]);

  const rows = (data?.data?.customers as CustomerRow[] | undefined) ?? [];

  return (
    <section className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Customers</p>
        <h1 className="text-xl font-semibold tracking-tight">Customer 360</h1>
        <p className="text-sm text-bm-muted2">Phase 6 will add detail drawers, filters, and segments.</p>
      </header>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {data ? <FreshnessRow freshness={data.freshness} /> : null}
      <div className="overflow-hidden rounded border border-bm-divider/30">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-divider/40 bg-bm-bg-2/40 text-left text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Segment</th>
              <th className="px-3 py-2 font-medium">Contract</th>
              <th className="px-3 py-2 font-medium">Open Tickets</th>
              <th className="px-3 py-2 font-medium">Churn Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-divider/20">
            {rows.map((r) => (
              <tr key={r.customer_id} className="hover:bg-bm-bg-2/30">
                <td className="px-3 py-2 font-medium">{r.display_name}</td>
                <td className="px-3 py-2 text-bm-muted2">{r.segment || "—"}</td>
                <td className="px-3 py-2 text-bm-muted2">{r.contract_type || "—"}</td>
                <td className="px-3 py-2">{r.open_tickets}</td>
                <td className="px-3 py-2 font-mono">
                  {r.churn_risk_score === null ? "—" : Number(r.churn_risk_score).toFixed(1)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !error ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-bm-muted2">
                  Loading customers…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
