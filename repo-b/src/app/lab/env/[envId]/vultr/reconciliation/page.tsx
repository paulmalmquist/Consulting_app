"use client";

import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { FreshnessRow } from "@/components/vultr/FreshnessBadge";
import { getVultrReconciliation } from "@/lib/vultr-api";
import type { VultrEnvelope } from "@/lib/vultr-contracts";

export default function VultrReconciliationPage() {
  const { envId } = useDomainEnv();
  const [data, setData] = useState<VultrEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVultrReconciliation(envId, { limit: 200 })
      .then((d) => !cancelled && setData(d))
      .catch((err: unknown) =>
        !cancelled && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
    };
  }, [envId]);

  const bridge = data?.data?.bridge as
    | { stages?: { stage_key: string; label: string; amount_usd: number | null }[]; exceptions_total_usd?: number; exceptions_count?: number }
    | undefined;

  return (
    <section className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
          Reconciliation
        </p>
        <h1 className="text-xl font-semibold tracking-tight">Six-stage bridge + exceptions</h1>
        <p className="text-sm text-bm-muted2">Phase 6 will render the full bridge UI. The data feed is live.</p>
      </header>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {data ? <FreshnessRow freshness={data.freshness} /> : null}
      {bridge?.stages?.length ? (
        <ol className="space-y-1 text-sm">
          {bridge.stages.map((s) => (
            <li
              key={s.stage_key}
              className="flex items-center justify-between rounded border border-bm-divider/30 bg-bm-bg-1/50 px-3 py-2"
            >
              <span className="font-medium">{s.label}</span>
              <span className="font-mono text-bm-muted2">
                {s.amount_usd === null ? "—" : `$${Number(s.amount_usd).toLocaleString()}`}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="text-xs text-bm-muted2">
        Exceptions: {data?.exceptions.length ?? 0} · Total ${(bridge?.exceptions_total_usd ?? 0).toLocaleString()}
      </p>
    </section>
  );
}
