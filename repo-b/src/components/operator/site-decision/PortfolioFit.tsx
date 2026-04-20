"use client";

import type { OperatorSiteDecisionPortfolioFit } from "@/lib/bos-api";

export function PortfolioFit({
  fit,
  siteId,
}: {
  fit: OperatorSiteDecisionPortfolioFit;
  siteId: string;
}) {
  const maxIrr = Math.max(0.1, ...fit.peers.map((p) => p.irr));
  const maxFriction = Math.max(0.1, ...fit.peers.map((p) => p.friction));

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-bm-muted2">
        Portfolio fit
      </h3>
      <p className="mt-2 text-base text-bm-text">{fit.headline}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase text-bm-muted2">IRR rank</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">
            {fit.rank_by_irr.rank}
            <span className="text-sm text-bm-muted2"> / {fit.rank_by_irr.of}</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase text-bm-muted2">Timeline rank</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">
            {fit.rank_by_timeline.rank}
            <span className="text-sm text-bm-muted2"> / {fit.rank_by_timeline.of}</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase text-bm-muted2">Friction rank</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">
            {fit.rank_by_friction.rank}
            <span className="text-sm text-bm-muted2"> / {fit.rank_by_friction.of}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <div className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
          Portfolio IRR comparison
        </div>
        {fit.peers.map((p) => {
          const pct = Math.max(2, (p.irr / maxIrr) * 100);
          const isSelf = p.site_id === siteId;
          return (
            <div key={p.site_id || p.name || "unknown"} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={isSelf ? "font-semibold text-bm-text" : "text-bm-muted2"}>
                  {p.name || p.site_id}
                  {isSelf ? " · this deal" : ""}
                </span>
                <span className="tabular-nums text-bm-text">{p.irr.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full ${
                    isSelf ? "bg-emerald-400/80" : "bg-white/20"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <div className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
          Municipality friction comparison
        </div>
        {fit.peers.map((p) => {
          const pct = Math.max(2, (p.friction / maxFriction) * 100);
          const isSelf = p.site_id === siteId;
          return (
            <div key={`f-${p.site_id}`} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={isSelf ? "font-semibold text-bm-text" : "text-bm-muted2"}>
                  {p.name || p.site_id}
                </span>
                <span className="tabular-nums text-bm-text">{Math.round(p.friction)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full ${isSelf ? "bg-red-400/80" : "bg-white/20"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
