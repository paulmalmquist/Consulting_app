"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PaperPortfolioSurface } from "@/components/market/PortfolioSurface";
import {
  useTradePortfolioReadModel,
  type PortfolioRangeKey,
} from "@/components/market/hooks/useTradePortfolioReadModel";
import { useBusinessContext } from "@/lib/business-context";

export default function PaperPortfolioPage() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId ?? "";
  const { businessId } = useBusinessContext();
  const [rangeKey, setRangeKey] = useState<PortfolioRangeKey>("3M");
  const portfolio = useTradePortfolioReadModel(businessId, rangeKey, "paper");

  if (!businessId) {
    return (
      <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_55%,_#111827_100%)] px-6 py-8 text-slate-100">
        <div className="mx-auto max-w-5xl rounded-[32px] border border-white/10 bg-slate-950/70 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="text-xs uppercase tracking-[0.32em] text-emerald-200/80">Paper Portfolio</div>
          <h1 className="mt-3 font-serif text-4xl tracking-tight text-white">The paper account cannot load until a BOS business is selected.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            This account page is driven entirely by the BOS paper-account layer and the new portfolio snapshot model.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/lab/env/${envId}/markets`} className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
              Back to Markets Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#0f172a_55%,_#111827_100%)] px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Link href={`/lab/env/${envId}/markets`} className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
            Back to Markets Home
          </Link>
          <Link href={`/lab/env/${envId}/markets/execution`} className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/20">
            Execution Workspace
          </Link>
        </div>

        <PaperPortfolioSurface
          overview={portfolio.overview}
          history={portfolio.history}
          openPositions={portfolio.openPositions}
          closedPositions={portfolio.closedPositions}
          attribution={portfolio.attribution}
          loading={portfolio.loading}
          error={portfolio.error}
          rangeKey={rangeKey}
          onRangeChange={setRangeKey}
        />
      </div>
    </div>
  );
}
