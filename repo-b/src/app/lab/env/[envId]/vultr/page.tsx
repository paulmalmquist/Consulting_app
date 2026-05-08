"use client";

import { useEffect, useState } from "react";
import { Suspense } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { CloudMetricTile } from "@/components/vultr/CloudMetricTile";
import { FreshnessRow } from "@/components/vultr/FreshnessBadge";
import { GpuCapacityCommandGraph } from "@/components/vultr/GpuCapacityCommandGraph";
import { getVultrSummary } from "@/lib/vultr-api";
import type { VultrEnvelope } from "@/lib/vultr-contracts";

export default function VultrLandingPage() {
  const { envId } = useDomainEnv();
  const [summary, setSummary] = useState<VultrEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getVultrSummary(envId)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [envId]);

  return (
    <section className="space-y-6" data-testid="vultr-landing">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
          Vultr Cloud Intelligence OS
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Operating console for usage-based cloud and GPU compute
        </h1>
        <p className="text-sm text-bm-muted2">
          Reconciles platform telemetry, billing, NetSuite-style accounting,
          Salesforce-style CRM, support, and infra incidents into one trusted
          executive view. Every metric carries provenance, freshness, and a
          fail-closed null reason.
        </p>
      </header>

      {error ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {summary ? <FreshnessRow freshness={summary.freshness} /> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !summary
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-lg border border-bm-divider/30 bg-bm-bg-1/40"
              />
            ))
          : summary?.metric_blocks.map((block) => (
              <CloudMetricTile key={block.key} block={block} />
            ))}
      </div>

      {/* Flagship GPU Capacity Command Graph */}
      <div className="space-y-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
            GPU Capacity Command Graph
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Region · SKU · Customer flow
          </h2>
        </div>
        <Suspense
          fallback={
            <div className="h-[480px] animate-pulse rounded-lg border border-bm-divider/30 bg-bm-bg-1/40" />
          }
        >
          <GpuCapacityCommandGraph envId={envId} />
        </Suspense>
      </div>
    </section>
  );
}
