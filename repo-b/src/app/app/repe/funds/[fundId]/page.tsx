"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FinFund, listFinFunds, listFinPartitions } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";

export default function RepeFundDetailPage({ params }: { params: { fundId: string } }) {
  const { businessId } = useRepeContext();
  const [fund, setFund] = useState<FinFund | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!businessId) return;
    const resolvedBusinessId = businessId;

    async function loadFund() {
      const partitions = await listFinPartitions(resolvedBusinessId);
      const liveId = partitions.find((row) => row.partition_type === "live")?.partition_id || partitions[0]?.partition_id;
      if (!liveId) return;
      const rows = await listFinFunds(resolvedBusinessId, liveId);
      if (cancelled) return;
      setFund(rows.find((row) => row.fin_fund_id === params.fundId) || null);
    }

    loadFund().catch(() => setFund(null));
    return () => {
      cancelled = true;
    };
  }, [businessId, params.fundId]);

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-3" data-testid="repe-fund-detail">
      <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Fund Detail</p>
      <h2 className="text-xl font-semibold">{fund?.name || "Fund"}</h2>
      <p className="text-sm text-bm-muted2">{fund?.fund_code || params.fundId}</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/app/finance/repe" className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Open Fund Operations
        </Link>
        <Link href="/app/repe/deals" className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Go to Deals
        </Link>
      </div>
    </section>
  );
}
