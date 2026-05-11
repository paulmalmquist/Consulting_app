"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { MarketsHomeSurface } from "@/components/market/PortfolioSurface";
import { useDecisionEngine } from "@/components/market/hooks/useDecisionEngine";
import {
  useTradePortfolioReadModel,
  type PortfolioRangeKey,
} from "@/components/market/hooks/useTradePortfolioReadModel";
import { useBusinessContext } from "@/lib/business-context";

export default function MarketsHomePage() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId ?? "";
  const { businessId } = useBusinessContext();
  const [rangeKey, setRangeKey] = useState<PortfolioRangeKey>("1M");
  const portfolio = useTradePortfolioReadModel(businessId, rangeKey, "paper");
  const decisionEngine = useDecisionEngine(envId, "global");

  if (!businessId) {
    return (
      <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_55%,_#111827_100%)] px-6 py-8 text-slate-100">
        <div className="mx-auto max-w-5xl rounded-[32px] border border-white/10 bg-slate-950/70 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="text-xs uppercase tracking-[0.32em] text-emerald-200/80">Markets Home</div>
          <h1 className="mt-3 font-serif text-4xl tracking-tight text-white">A business must be selected before the portfolio decision engine can load.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            This page now reads only from the BOS paper-account layer. Select the Trading Platform business so Winston can load the canonical positions, snapshots, quote provenance, and accountability state.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/lab/env/${envId}/trading`} className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20">
              Energy Trading Command Center
            </Link>
            <Link href={`/lab/env/${envId}/markets/execution`} className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/20">
              Open Execution Workspace
            </Link>
            <Link href={`/lab/env/${envId}/markets/podcast-intel`} className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-500/20">
              Podcast Intelligence (no business required)
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#0f172a_55%,_#111827_100%)] px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <MarketsHomeSurface
          envId={envId}
          overview={portfolio.overview}
          history={portfolio.history}
          openPositions={portfolio.openPositions}
          attribution={portfolio.attribution}
          decisionEngine={decisionEngine}
          loading={portfolio.loading || decisionEngine.loading}
          error={portfolio.error || decisionEngine.error}
          rangeKey={rangeKey}
          onRangeChange={setRangeKey}
        />
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <Link href={`/lab/env/${envId}/trading`} className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20">
            Energy Trading Command Center
          </Link>
        </div>
      </div>
    </div>
  );
}
