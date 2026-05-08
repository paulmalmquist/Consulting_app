"use client";

import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { FreshnessRow } from "@/components/vultr/FreshnessBadge";
import { getVultrDataModel } from "@/lib/vultr-api";
import type { VultrEnvelope } from "@/lib/vultr-contracts";

type MetricDef = {
  key: string;
  label: string;
  formula: string;
  primary_source: string;
  joined_with: string[];
  null_rules: string[];
  refresh_cadence: string;
};

export default function VultrDataModelPage() {
  const { envId } = useDomainEnv();
  const [data, setData] = useState<VultrEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVultrDataModel(envId)
      .then((d) => !cancelled && setData(d))
      .catch((err: unknown) =>
        !cancelled && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
    };
  }, [envId]);

  const defs = (data?.data?.metric_definitions as MetricDef[] | undefined) ?? [];

  return (
    <section className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Data Model</p>
        <h1 className="text-xl font-semibold tracking-tight">Canonical schema + metric definitions</h1>
        <p className="text-sm text-bm-muted2">
          Every metric on this surface is defined here. Source, formula, null rules, refresh cadence.
        </p>
      </header>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {data ? <FreshnessRow freshness={data.freshness} /> : null}
      <div className="space-y-3">
        {defs.map((m) => (
          <div key={m.key} className="rounded border border-bm-divider/30 bg-bm-bg-1/50 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{m.label}</h3>
              <code className="font-mono text-[10px] text-bm-muted2">{m.key}</code>
            </div>
            <p className="mt-2 font-mono text-xs text-bm-muted2">{m.formula}</p>
            <p className="mt-2 text-xs">
              <span className="text-bm-muted2">Primary source:</span>{" "}
              <code className="font-mono">{m.primary_source}</code>
            </p>
            {m.null_rules.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-bm-muted2">
                {m.null_rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-xs text-bm-muted2">Refresh: {m.refresh_cadence}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
