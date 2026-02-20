"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getRepeFund, RepeFundDetail } from "@/lib/bos-api";

export default function RepeFundDetailPage({ params }: { params: { fundId: string } }) {
  const [detail, setDetail] = useState<RepeFundDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRepeFund(params.fundId)
      .then((out) => {
        if (cancelled) return;
        setDetail(out);
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(null);
      });

    return () => {
      cancelled = true;
    };
  }, [params.fundId]);

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-3" data-testid="repe-fund-detail">
      <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Fund Detail</p>
      <h2 className="text-xl font-semibold">{detail?.fund.name || "Fund"}</h2>
      <p className="text-sm text-bm-muted2">
        {detail?.fund.strategy?.toUpperCase() || "N/A"} · Vintage {detail?.fund.vintage_year || "N/A"}
      </p>
      <p className="text-xs text-bm-muted2">
        Terms versions: {detail?.terms.length || 0}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/app/repe/deals" className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Go to Deals
        </Link>
        <Link href="/app/repe/assets" className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Go to Assets
        </Link>
        <Link href="/app/repe/waterfalls" className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Go to Waterfalls
        </Link>
      </div>
    </section>
  );
}
