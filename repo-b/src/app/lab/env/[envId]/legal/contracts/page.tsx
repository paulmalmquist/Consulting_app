"use client";

import React, { useEffect, useState } from "react";
import { listLegalContracts, LegalContract } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "review", label: "Review" },
  { key: "negotiation", label: "Negotiation" },
  { key: "pending_signature", label: "Pending Signature" },
  { key: "executed", label: "Executed" },
];

function statusBadge(status: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  switch (status) {
    case "executed": return <span className={`${base} bg-green-500/15 text-green-400`}>Executed</span>;
    case "pending_signature": return <span className={`${base} bg-blue-500/15 text-blue-400`}>Pending Sig.</span>;
    case "negotiation": return <span className={`${base} bg-purple-500/15 text-purple-400`}>Negotiation</span>;
    case "review": return <span className={`${base} bg-amber-500/15 text-amber-400`}>Review</span>;
    default: return <span className={`${base} bg-bm-surface/60 text-bm-muted2`}>{status}</span>;
  }
}

export default function LegalContractsPage() {
  const { envId, businessId } = useDomainEnv();
  const [contracts, setContracts] = useState<LegalContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    listLegalContracts(envId, businessId || undefined, statusFilter || undefined)
      .then(setContracts)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load contracts"))
      .finally(() => setLoading(false));
  }, [envId, businessId, statusFilter]);

  // Compute stage counts from current list (no filter applied)
  const stageCounts: Record<string, number> = {};
  contracts.forEach((c) => {
    stageCounts[c.status] = (stageCounts[c.status] ?? 0) + 1;
  });

  return (
    <section className="space-y-5" data-testid="legal-contracts">
      <div>
        <h2 className="text-2xl font-semibold">Contracts</h2>
        <p className="text-sm text-bm-muted2">Contract lifecycle management — all active and pending agreements.</p>
      </div>

      {/* Pipeline stage pills */}
      <div className="flex flex-wrap gap-2">
        {PIPELINE_STAGES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? "" : key)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              statusFilter === key
                ? "border-bm-accent bg-bm-accent/10 text-bm-accent"
                : "border-bm-border/70 hover:bg-bm-surface/40"
            }`}
          >
            <span>{label}</span>
            <span className="rounded-full bg-bm-surface/60 px-1.5 py-0.5 text-xs font-semibold">
              {statusFilter === key ? contracts.length : (stageCounts[key] ?? 0)}
            </span>
          </button>
        ))}
        {statusFilter && (
          <button onClick={() => setStatusFilter("")} className="rounded-full border border-bm-border/70 px-3 py-1.5 text-sm text-bm-muted2 hover:bg-bm-surface/40">
            Clear filter ×
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      )}

      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Contract Ref</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Counterparty</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Effective</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium">Auto-Renew</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={7}>Loading contracts...</td></tr>
            ) : contracts.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={7}>
                {statusFilter ? `No contracts with status "${statusFilter}".` : "No contracts yet. Create contracts from within a matter workspace."}
              </td></tr>
            ) : (
              contracts.map((c) => (
                <tr key={c.legal_contract_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{c.contract_ref}</td>
                  <td className="px-4 py-3">{c.contract_type}</td>
                  <td className="px-4 py-3">{c.counterparty_name || "—"}</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{fmtDate(c.effective_date)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{fmtDate(c.expiration_date)}</td>
                  <td className="px-4 py-3">{c.auto_renew ? <span className="text-green-400">Yes</span> : <span className="text-bm-muted2">No</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
