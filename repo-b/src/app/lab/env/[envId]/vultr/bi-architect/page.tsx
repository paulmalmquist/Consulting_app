"use client";

import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { FreshnessRow } from "@/components/vultr/FreshnessBadge";
import { getVultrQuality } from "@/lib/vultr-api";
import type { VultrEnvelope } from "@/lib/vultr-contracts";

type Check = { name: string; ok: boolean; detail: string };

export default function VultrBiArchitectPage() {
  const { envId } = useDomainEnv();
  const [data, setData] = useState<VultrEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVultrQuality(envId)
      .then((d) => !cancelled && setData(d))
      .catch((err: unknown) =>
        !cancelled && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
    };
  }, [envId]);

  const checks = (data?.data?.checks as Check[] | undefined) ?? [];
  const overall = data?.data?.overall_ok as boolean | undefined;

  return (
    <section className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bm-muted2">BI Architect</p>
        <h1 className="text-xl font-semibold tracking-tight">Workbench + data quality</h1>
        <p className="text-sm text-bm-muted2">
          Structural integrity checks, source precedence notes, and architecture decisions.
        </p>
      </header>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {data ? <FreshnessRow freshness={data.freshness} /> : null}
      {overall !== undefined ? (
        <p
          className={`inline-block rounded border px-3 py-1 text-xs uppercase tracking-[0.14em] ${
            overall
              ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
              : "border-rose-500/40 bg-rose-950/30 text-rose-200"
          }`}
        >
          {overall ? "All checks passing" : "Checks failing"}
        </p>
      ) : null}
      <ul className="space-y-2">
        {checks.map((c) => (
          <li
            key={c.name}
            className="flex items-center justify-between rounded border border-bm-divider/30 bg-bm-bg-1/50 px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  c.ok ? "bg-emerald-400" : "bg-rose-400"
                }`}
                aria-hidden
              />
              <span className="font-medium">{c.name}</span>
            </span>
            <span className="font-mono text-xs text-bm-muted2">{c.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
