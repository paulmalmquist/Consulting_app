"use client";

import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { CloudMetricTile } from "@/components/vultr/CloudMetricTile";
import { FreshnessRow } from "@/components/vultr/FreshnessBadge";
import { getVultrGpuCommandGraph } from "@/lib/vultr-api";
import type { GpuCommandGraphOut } from "@/lib/vultr-contracts";

export default function VultrGpuEconomicsPage() {
  const { envId } = useDomainEnv();
  const [data, setData] = useState<GpuCommandGraphOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVultrGpuCommandGraph(envId)
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
          GPU Economics
        </p>
        <h1 className="text-xl font-semibold tracking-tight">GPU capacity command graph</h1>
        <p className="text-sm text-bm-muted2">
          Phase 5 wires the React Flow graph here. The data feed is live.
        </p>
      </header>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {data ? <FreshnessRow freshness={data.freshness} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.kpis.map((b) => (
          <CloudMetricTile key={b.key} block={b} />
        ))}
      </div>
      {data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Regions", data.regions.length],
            ["GPU SKUs", data.sku_nodes.length],
            ["Customers", data.customer_nodes.length],
            ["Flow edges", data.flows.length],
          ].map(([label, n]) => (
            <div
              key={label as string}
              className="rounded border border-bm-divider/30 bg-bm-bg-1/50 p-3"
            >
              <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{label}</p>
              <p className="mt-1 text-lg font-semibold">{n as number}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
