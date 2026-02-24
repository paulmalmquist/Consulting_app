"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listRepeFunds, RepeFund } from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";

export default function RepeWaterfallsPage() {
  const { businessId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [selectedFundId, setSelectedFundId] = useState("");

  useEffect(() => {
    if (!businessId) return;
    listRepeFunds(businessId)
      .then((rows) => {
        setFunds(rows);
        setSelectedFundId(rows[0]?.fund_id || "");
      })
      .catch(() => setFunds([]));
  }, [businessId]);

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
            Initialize REPE Workspace
          </button>
        ) : null}
      </div>
    );
  }

  if (funds.length === 0) {
    return (
      <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-2" data-testid="repe-waterfall-empty-funds">
        <h2 className="text-lg font-semibold">Waterfalls</h2>
        <p className="text-sm text-bm-muted2">Waterfall runs are fund-scoped. Create a fund first.</p>
        <Link href={`${basePath}/portfolio`} className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Create Fund
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-3">
      <h2 className="text-lg font-semibold">Waterfalls</h2>
      <p className="text-sm text-bm-muted2">Fund selector is required before running distributions and locks.</p>

      <select
        value={selectedFundId}
        onChange={(e) => setSelectedFundId(e.target.value)}
        className="w-full md:w-96 rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
      >
        {funds.map((fund) => (
          <option key={fund.fund_id} value={fund.fund_id}>{fund.name}</option>
        ))}
      </select>

      <div className="rounded-lg border border-bm-border/70 bg-bm-surface/20 p-3 space-y-2">
        <p className="text-sm text-bm-muted2">Execution engine currently uses the existing waterfall runner; the fund context above is enforced here.</p>
        <Link href="/app/finance/repe" className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Run New Waterfall
        </Link>
      </div>
    </section>
  );
}
