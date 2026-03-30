"use client";

import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { ApiEpisode } from "@/components/market/hooks/useDecisionEngine";

interface EpisodeLibraryProps {
  episodes: ApiEpisode[];
}

export function EpisodeLibrary({ episodes }: EpisodeLibraryProps) {
  const [filterAsset, setFilterAsset] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const assetClasses = useMemo(
    () => ["all", ...new Set(episodes.map((e) => e.asset_class))],
    [episodes],
  );
  const categories = useMemo(
    () => ["all", ...new Set(episodes.map((e) => e.category).filter(Boolean))],
    [episodes],
  );

  const filtered = useMemo(
    () =>
      episodes.filter(
        (e) =>
          (filterAsset === "all" || e.asset_class === filterAsset) &&
          (filterCategory === "all" || e.category === filterCategory),
      ),
    [episodes, filterAsset, filterCategory],
  );

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Episode Library ({episodes.length} episodes)
        </p>
        <div className="flex gap-2">
          <select
            value={filterAsset}
            onChange={(e) => setFilterAsset(e.target.value)}
            className="text-[10px] font-mono bg-bm-surface border border-bm-border/50 rounded px-2 py-1 text-bm-text"
          >
            {assetClasses.map((a) => (
              <option key={a} value={a}>
                {a === "all" ? "All Assets" : a}
              </option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-[10px] font-mono bg-bm-surface border border-bm-border/50 rounded px-2 py-1 text-bm-text"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All Categories" : c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-auto max-h-96">
        <table className="w-full text-xs font-mono">
          <thead className="border-b border-bm-border/30">
            <tr>
              <th className="text-left py-1.5 text-[9px] text-bm-muted2 uppercase">Episode</th>
              <th className="text-left py-1.5 text-[9px] text-bm-muted2 uppercase">Asset</th>
              <th className="text-left py-1.5 text-[9px] text-bm-muted2 uppercase">Category</th>
              <th className="text-left py-1.5 text-[9px] text-bm-muted2 uppercase">Start</th>
              <th className="text-right py-1.5 text-[9px] text-bm-muted2 uppercase">P→T %</th>
              <th className="text-right py-1.5 text-[9px] text-bm-muted2 uppercase">Recovery d</th>
              <th className="text-left py-1.5 text-[9px] text-bm-muted2 uppercase">Tags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ep) => (
              <React.Fragment key={ep.id}>
                <tr
                  className="border-b border-bm-border/20 hover:bg-bm-surface/20 cursor-pointer"
                  onClick={() => setExpanded(expanded === ep.id ? null : ep.id)}
                >
                  <td className="py-2 text-bm-accent font-semibold max-w-[200px] truncate">
                    {ep.name}
                    {ep.is_non_event && (
                      <Badge className="ml-1 text-[7px]">NON-EVENT</Badge>
                    )}
                  </td>
                  <td className="py-2 text-bm-muted">{ep.asset_class}</td>
                  <td className="py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] ${
                        ep.category === "crash"
                          ? "bg-red-500/20 text-red-400"
                          : ep.category === "contagion"
                            ? "bg-amber-500/20 text-amber-400"
                            : ep.category === "bubble"
                              ? "bg-violet-500/20 text-violet-400"
                              : "bg-bm-surface/40 text-bm-muted"
                      }`}
                    >
                      {ep.category}
                    </span>
                  </td>
                  <td className="py-2 text-bm-muted">{ep.start_date}</td>
                  <td className="py-2 text-right text-red-400">
                    {ep.peak_to_trough_pct?.toFixed(1)}%
                  </td>
                  <td className="py-2 text-right text-bm-muted">
                    {ep.recovery_duration_days ?? "—"}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1 flex-wrap max-w-[160px]">
                      {ep.tags?.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="bg-bm-surface/40 text-bm-muted2 px-1 py-0 rounded text-[8px]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
                {expanded === ep.id && (
                  <tr>
                    <td colSpan={7} className="py-3 px-2 bg-bm-surface/10 border-b border-bm-border/30">
                      <p className="text-xs text-bm-muted leading-relaxed mb-2">
                        {ep.modern_analog_thesis}
                      </p>
                      <div className="flex gap-4 text-[10px] text-bm-muted2">
                        <span>Regime: {ep.regime_type}</span>
                        <span>Dalio: {ep.dalio_cycle_stage}</span>
                        <span>Vol: {ep.volatility_regime}</span>
                        <span>Duration: {ep.duration_days}d</span>
                        {ep.source === "seed" && (
                          <Badge variant="accent" className="text-[7px]">SEED</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
