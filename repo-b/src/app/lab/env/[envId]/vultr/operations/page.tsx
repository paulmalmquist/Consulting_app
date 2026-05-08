"use client";

import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { FreshnessRow } from "@/components/vultr/FreshnessBadge";
import { getVultrOperations } from "@/lib/vultr-api";
import type { VultrEnvelope } from "@/lib/vultr-contracts";

export default function VultrOperationsPage() {
  const { envId } = useDomainEnv();
  const [data, setData] = useState<VultrEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVultrOperations(envId)
      .then((d) => !cancelled && setData(d))
      .catch((err: unknown) =>
        !cancelled && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
    };
  }, [envId]);

  const d = data?.data ?? {};

  return (
    <section className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Operations</p>
        <h1 className="text-xl font-semibold tracking-tight">Support + incidents + reliability</h1>
        <p className="text-sm text-bm-muted2">Phase 6 will pair this with the regional reliability map.</p>
      </header>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {data ? <FreshnessRow freshness={data.freshness} /> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Tickets (30d)", (d.tickets as unknown[] | undefined)?.length ?? 0],
          ["Open tickets", (d.open_tickets as number | undefined) ?? 0],
          ["SLA breaches (30d)", (d.sla_breaches_30d as number | undefined) ?? 0],
          ["Incidents (90d)", (d.incidents as unknown[] | undefined)?.length ?? 0],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded border border-bm-divider/30 bg-bm-bg-1/50 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{label}</p>
            <p className="mt-1 text-lg font-semibold">{n as number}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
