"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listReV1Funds, RepeFund } from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";

export default function RepeFundsPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId && !environmentId) return;
    listReV1Funds({
      env_id: environmentId || undefined,
      business_id: businessId || undefined,
    })
      .then(setFunds)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load funds"));
  }, [businessId, environmentId]);

  if (!businessId) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-4 text-sm space-y-2">
        <p className="text-bm-muted2">{loading ? "Initializing REPE workspace..." : "REPE workspace not initialized."}</p>
        {contextError ? <p className="text-red-400">{contextError}</p> : null}
        {!loading ? (
          <button
            type="button"
            className="rounded-lg border border-bm-border px-3 py-2 hover:bg-bm-surface/40"
            onClick={() => void initializeWorkspace()}
          >
            Retry Context Setup
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-4" data-testid="re-funds-list">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Funds</h2>
          <p className="text-sm text-bm-muted2">All funds in this environment.</p>
        </div>
        <Link
          href={`${basePath}/funds/new`}
          className="rounded-lg bg-bm-accent px-3 py-2 text-sm text-white"
        >
          + New Fund
        </Link>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {funds.length === 0 ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-center">
          <p className="text-sm text-bm-muted2">No funds yet.</p>
          <Link href={`${basePath}/funds/new`} className="mt-3 inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
            Create First Fund
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/70 bg-bm-surface/20">
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Name</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Strategy</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Currency</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Status</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Inception</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {funds.map((fund) => (
                <tr key={fund.fund_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{fund.name}</td>
                  <td className="px-4 py-3 text-bm-muted2 capitalize">{fund.strategy}</td>
                  <td className="px-4 py-3 text-bm-muted2">{fund.base_currency || "USD"}</td>
                  <td className="px-4 py-3 text-bm-muted2 capitalize">{fund.status}</td>
                  <td className="px-4 py-3 text-bm-muted2">{fund.inception_date ? fund.inception_date.slice(0, 10) : "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`${basePath}/funds/${fund.fund_id}`} className="text-xs text-bm-accent hover:underline">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
