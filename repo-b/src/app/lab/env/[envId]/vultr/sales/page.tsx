"use client";

import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { FreshnessRow } from "@/components/vultr/FreshnessBadge";
import { getVultrSales } from "@/lib/vultr-api";
import type { VultrEnvelope } from "@/lib/vultr-contracts";

type FunnelRow = { stage: string; count: number; amount_usd: string };

export default function VultrSalesPage() {
  const { envId } = useDomainEnv();
  const [data, setData] = useState<VultrEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVultrSales(envId)
      .then((d) => !cancelled && setData(d))
      .catch((err: unknown) =>
        !cancelled && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
    };
  }, [envId]);

  const funnel = (data?.data?.funnel as FunnelRow[] | undefined) ?? [];

  return (
    <section className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Sales</p>
        <h1 className="text-xl font-semibold tracking-tight">Pipeline → activation</h1>
        <p className="text-sm text-bm-muted2">Phase 6 will pair pipeline with closed-won-to-activation tracking.</p>
      </header>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {data ? <FreshnessRow freshness={data.freshness} /> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {funnel.map((f) => (
          <div key={f.stage} className="rounded border border-bm-divider/30 bg-bm-bg-1/50 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{f.stage}</p>
            <p className="mt-1 text-lg font-semibold">{f.count}</p>
            <p className="font-mono text-xs text-bm-muted2">
              ${Number(f.amount_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
