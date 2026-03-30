"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { DecisionEngineData } from "@/components/market/hooks/useDecisionEngine";

interface DebugPanelProps {
  data: DecisionEngineData;
}

export function DebugPanel({ data }: DebugPanelProps) {
  const p = data.provenance;

  return (
    <Card className="p-5 border-amber-400/30 bg-amber-500/5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
          System Internals
        </p>
        <Badge variant="warning">DEBUG</Badge>
      </div>

      {/* Data Freshness */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg bg-bm-surface/20 p-3">
          <p className="text-[9px] text-bm-muted2 uppercase">API Response</p>
          <p className="text-lg font-mono font-bold text-bm-text">{p.apiTimeMs}ms</p>
        </div>
        <div className="rounded-lg bg-bm-surface/20 p-3">
          <p className="text-[9px] text-bm-muted2 uppercase">Seed Data %</p>
          <p className={`text-lg font-mono font-bold ${p.seedDataPct > 50 ? "text-amber-400" : "text-emerald-400"}`}>
            {p.seedDataPct}%
          </p>
        </div>
        <div className="rounded-lg bg-bm-surface/20 p-3">
          <p className="text-[9px] text-bm-muted2 uppercase">Signal Rows</p>
          <p className="text-lg font-mono font-bold text-bm-text">{p.totalSignalRows}</p>
        </div>
        <div className="rounded-lg bg-bm-surface/20 p-3">
          <p className="text-[9px] text-bm-muted2 uppercase">Data Freshness</p>
          <p className="text-sm font-mono text-bm-muted">{p.dataFreshness ?? "—"}</p>
        </div>
      </div>

      {/* Layer counts */}
      <p className="text-[9px] text-bm-muted2 uppercase mb-2">Layer Row Counts</p>
      <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mb-4">
        {[
          { label: "Reality", count: data.signals.reality.length, color: "text-emerald-400" },
          { label: "Data", count: data.signals.data.length, color: "text-sky-400" },
          { label: "Narrative", count: data.signals.narrative.length, color: "text-amber-400" },
          { label: "Positioning", count: data.signals.positioning.length, color: "text-violet-400" },
          { label: "Silence", count: data.signals.silence.length, color: "text-pink-400" },
          { label: "Meta", count: data.signals.meta.length, color: "text-red-400" },
          { label: "Episodes", count: data.analogs.episodeLibrary.length, color: "text-bm-accent" },
        ].map((l) => (
          <div key={l.label} className="rounded bg-bm-surface/30 px-2 py-1.5 text-center">
            <p className="text-[8px] text-bm-muted2">{l.label}</p>
            <p className={`font-mono text-sm font-bold ${l.color}`}>{l.count}</p>
          </div>
        ))}
      </div>

      {/* Agents */}
      <p className="text-[9px] text-bm-muted2 uppercase mb-2">Agent Calibration</p>
      <div className="overflow-auto mb-4">
        <table className="w-full text-[10px] font-mono">
          <thead className="border-b border-bm-border/30">
            <tr>
              <th className="text-left py-1 text-bm-muted2">Agent</th>
              <th className="text-left py-1 text-bm-muted2">Dir</th>
              <th className="text-right py-1 text-bm-muted2">Conf</th>
              <th className="text-right py-1 text-bm-muted2">Brier</th>
              <th className="text-right py-1 text-bm-muted2">Weight</th>
              <th className="text-right py-1 text-bm-muted2">Preds</th>
              <th className="text-left py-1 text-bm-muted2">Source</th>
            </tr>
          </thead>
          <tbody>
            {data.agents.calibration.map((a) => (
              <tr key={a.agent_name} className="border-b border-bm-border/20">
                <td className="py-1 text-bm-text">{a.agent_name}</td>
                <td className={`py-1 ${a.direction === "Bearish" ? "text-red-400" : a.direction === "Bullish" ? "text-emerald-400" : "text-amber-400"}`}>
                  {a.direction}
                </td>
                <td className="py-1 text-right text-bm-text">{a.confidence}%</td>
                <td className="py-1 text-right text-bm-text">{a.rolling_90d_brier?.toFixed(3)}</td>
                <td className="py-1 text-right text-bm-text">{(a.current_weight * 100).toFixed(0)}%</td>
                <td className="py-1 text-right text-bm-muted">{a.prediction_count}</td>
                <td className="py-1 text-bm-muted2">{a.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ensemble */}
      <p className="text-[9px] text-bm-muted2 uppercase mb-2">Ensemble Output</p>
      <div className="rounded bg-bm-surface/20 p-3 mb-4 font-mono text-[10px] text-bm-muted">
        <pre className="whitespace-pre-wrap">{JSON.stringify(data.agents.ensemble, null, 2)}</pre>
      </div>

      {/* Top Match */}
      {data.analogs.topMatch && (
        <>
          <p className="text-[9px] text-bm-muted2 uppercase mb-2">Top Analog Match (raw)</p>
          <div className="rounded bg-bm-surface/20 p-3 mb-4 font-mono text-[10px] text-bm-muted overflow-auto max-h-40">
            <pre className="whitespace-pre-wrap">{JSON.stringify(data.analogs.topMatch.matches, null, 2)}</pre>
          </div>
        </>
      )}

      {/* Trap Checks */}
      <p className="text-[9px] text-bm-muted2 uppercase mb-2">Trap Checks (raw)</p>
      <div className="overflow-auto">
        <table className="w-full text-[10px] font-mono">
          <thead className="border-b border-bm-border/30">
            <tr>
              <th className="text-left py-1 text-bm-muted2">Check</th>
              <th className="text-left py-1 text-bm-muted2">Status</th>
              <th className="text-left py-1 text-bm-muted2">Value</th>
              <th className="text-left py-1 text-bm-muted2">Source</th>
            </tr>
          </thead>
          <tbody>
            {data.traps.checks.map((t) => (
              <tr key={t.check_name} className="border-b border-bm-border/20">
                <td className="py-1 text-bm-text">{t.check_name}</td>
                <td className="py-1">
                  <Badge variant={t.variant as "success" | "warning" | "danger" | "accent"}>{t.status}</Badge>
                </td>
                <td className="py-1 text-bm-muted">{t.value}</td>
                <td className="py-1 text-bm-muted2">{t.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[9px] text-bm-muted2 mt-4">
        Fetched at {p.fetchedAt} · {p.totalSignalRows} signal rows across 5 layers
      </p>
    </Card>
  );
}
