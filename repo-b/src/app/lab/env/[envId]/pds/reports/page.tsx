"use client";

import { useState } from "react";
import { runPdsReportPack, runPdsSnapshot } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function PdsReportsPage() {
  const { envId, businessId } = useDomainEnv();
  const [period, setPeriod] = useState(currentPeriod());
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSnapshot() {
    setStatus("Running snapshot...");
    setError(null);
    try {
      const run = await runPdsSnapshot({ env_id: envId, business_id: businessId || undefined, period });
      setStatus(`Snapshot complete · ${run.run_id}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Snapshot failed");
    }
  }

  async function onReport() {
    setStatus("Building report pack...");
    setError(null);
    try {
      const run = await runPdsReportPack({ env_id: envId, business_id: businessId || undefined, period });
      setStatus(`Report pack complete · ${run.run_id}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Report pack failed");
    }
  }

  return (
    <section className="space-y-4" data-testid="pds-reports-page">
      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">PDS Delivery</p>
        <h2 className="text-2xl font-semibold">Reports</h2>
        <p className="text-sm text-bm-muted2">Run deterministic snapshots and assemble reporting packs from the current portfolio state.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-bm-border bg-bm-surface px-2.5 py-2 text-sm"
        />
        <button
          type="button"
          className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
          onClick={() => void onSnapshot()}
        >
          Run Snapshot
        </button>
        <button
          type="button"
          className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
          onClick={() => void onReport()}
        >
          Run Report Pack
        </button>
      </div>
      {status ? <p className="text-sm text-bm-muted2">{status}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </section>
  );
}
