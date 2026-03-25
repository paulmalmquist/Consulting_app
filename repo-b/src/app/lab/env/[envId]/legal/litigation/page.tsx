"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { listLegalLitigation, LegalLitigationCase } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

import { fmtMoney } from '@/lib/format-utils';
function statusBadge(status: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "open") return <span className={`${base} bg-red-500/15 text-red-400`}>Open</span>;
  if (status === "settled") return <span className={`${base} bg-green-500/15 text-green-400`}>Settled</span>;
  if (status === "dismissed") return <span className={`${base} bg-bm-surface/60 text-bm-muted2`}>Dismissed</span>;
  return <span className={`${base} bg-amber-500/15 text-amber-400`}>{status}</span>;
}

export default function LegalLitigationPage() {
  const { envId, businessId } = useDomainEnv();
  const [cases, setCases] = useState<LegalLitigationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listLegalLitigation(envId, businessId || undefined)
      .then(setCases)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load litigation cases"))
      .finally(() => setLoading(false));
  }, [envId, businessId]);

  const openCases = cases.filter((c) => c.status === "open");
  const totalExposure = openCases.reduce((sum, c) => sum + Number(c.exposure_estimate || 0), 0);
  const totalReserve = openCases.reduce((sum, c) => sum + Number(c.reserve_amount || 0), 0);

  return (
    <section className="space-y-5" data-testid="legal-litigation">
      <div>
        <h2 className="text-2xl font-semibold">Litigation</h2>
        <p className="text-sm text-bm-muted2">Active cases, exposure tracking, reserves, and dispute management.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Open Cases</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "—" : openCases.length}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total Exposure</p>
          <p className="mt-1 text-xl font-semibold text-red-400">{loading ? "—" : fmtMoney(totalExposure)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total Reserves</p>
          <p className="mt-1 text-xl font-semibold">{loading ? "—" : fmtMoney(totalReserve)}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      )}

      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Matter</th>
              <th className="px-4 py-3 font-medium">Jurisdiction</th>
              <th className="px-4 py-3 font-medium">Claims</th>
              <th className="px-4 py-3 font-medium">Exposure</th>
              <th className="px-4 py-3 font-medium">Reserve</th>
              <th className="px-4 py-3 font-medium">Insurance</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={7}>Loading litigation cases...</td></tr>
            ) : cases.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={7}>No litigation cases. Add cases from within a matter workspace.</td></tr>
            ) : (
              cases.map((c) => (
                <tr key={c.litigation_case_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3">
                    <Link href={`/lab/env/${envId}/legal/matters/${c.matter_id}`} className="font-medium hover:underline">
                      {c.matter_number || "—"}
                    </Link>
                    {c.matter_title && <p className="text-xs text-bm-muted2 truncate max-w-[160px]">{c.matter_title}</p>}
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">{c.jurisdiction || "—"}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-bm-muted2">{c.claims || "—"}</td>
                  <td className="px-4 py-3 font-medium text-red-400">{fmtMoney(c.exposure_estimate)}</td>
                  <td className="px-4 py-3">{fmtMoney(c.reserve_amount)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{c.insurance_carrier || "—"}</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
