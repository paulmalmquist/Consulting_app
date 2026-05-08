"use client";

import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { CloudMetricTile } from "@/components/vultr/CloudMetricTile";
import { FreshnessRow } from "@/components/vultr/FreshnessBadge";
import { getVultrExecutive } from "@/lib/vultr-api";
import type { VultrEnvelope } from "@/lib/vultr-contracts";

export default function VultrExecutivePage() {
  const { envId } = useDomainEnv();
  const [data, setData] = useState<VultrEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVultrExecutive(envId, "30D")
      .then((d) => !cancelled && setData(d))
      .catch((err: unknown) =>
        !cancelled && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
    };
  }, [envId]);

  return (
    <section className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
          Executive
        </p>
        <h1 className="text-xl font-semibold tracking-tight">Executive operating dashboard</h1>
        <p className="text-sm text-bm-muted2">Phase 5 will expand this surface. The data feed is live.</p>
      </header>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {data ? <FreshnessRow freshness={data.freshness} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.metric_blocks.map((block) => (
          <CloudMetricTile key={block.key} block={block} />
        ))}
      </div>
      <p className="text-xs text-bm-muted2">
        Bridge stages: {(data?.data?.bridge as { stages?: unknown[] } | undefined)?.stages?.length ?? 0} ·
        Exceptions: {data?.exceptions.length ?? 0}
      </p>
    </section>
  );
}
