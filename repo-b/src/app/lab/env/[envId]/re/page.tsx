"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listReV1Funds, RepeFund } from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

export default function ReEnvironmentHomePage() {
  const { envId, businessId } = useReEnv();
  const [funds, setFunds] = useState<RepeFund[]>([]);

  useEffect(() => {
    if (!businessId && !envId) return;
    listReV1Funds({
      env_id: envId || undefined,
      business_id: businessId || undefined,
    })
      .then(setFunds)
      .catch(() => setFunds([]));
  }, [businessId, envId]);

  const base = `/lab/env/${envId}/re`;

  return (
    <section className="space-y-4" data-testid="re-homepage">
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <h2 className="text-2xl font-semibold">Real Estate Workspace</h2>
        <p className="mt-2 text-sm text-bm-muted2">
          Manage funds, investments, and assets in a single drill path.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`${base}/funds/new`} className="rounded-lg bg-bm-accent px-3 py-2 text-sm text-white">
            Create Fund
          </Link>
          <Link href={`${base}/deals`} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
            New Investment
          </Link>
          <Link href={`${base}/assets`} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
            New Asset
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Funds</p>
          <p className="mt-1 text-2xl font-semibold">{funds.length}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">AUM</p>
          <p className="mt-1 text-2xl font-semibold">$0</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">NAV</p>
          <p className="mt-1 text-2xl font-semibold">$0</p>
        </div>
      </div>

      {funds.length === 0 ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
          No funds yet. Start by creating your first fund.
        </div>
      ) : (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Recent Funds</h3>
          <div className="mt-3 space-y-2">
            {funds.slice(0, 5).map((fund) => (
              <Link
                key={fund.fund_id}
                href={`${base}/funds/${fund.fund_id}`}
                className="block rounded-lg border border-bm-border/60 px-3 py-2 hover:bg-bm-surface/40"
              >
                <p className="font-medium">{fund.name}</p>
                <p className="text-xs text-bm-muted2">{fund.strategy.toUpperCase()} · {fund.status}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
