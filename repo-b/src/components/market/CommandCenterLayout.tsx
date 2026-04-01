"use client";

import React, { useState } from "react";
import type { AssetScope } from "@/lib/trading-lab/decision-engine-types";
import type { DecisionEngineResult } from "@/components/market/hooks/useDecisionEngine";
import { useAssetScopedData } from "@/components/market/hooks/useAssetScopedData";
import { SignalStack } from "@/components/market/HistoryRhymesTab";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  DecisionNarrativeCard,
  ModelTransparencyPanel,
  TrapDetectionPanel,
  WhatChangedPanel,
  TopAnalogCard,
} from "@/components/market/panels";

interface CommandCenterLayoutProps {
  assetScope: AssetScope;
  decisionEngine?: DecisionEngineResult;
  showDebug?: boolean;
}

export function CommandCenterLayout({
  assetScope,
  decisionEngine,
  showDebug = false,
}: CommandCenterLayoutProps) {
  const fallbackData = useAssetScopedData(assetScope);
  const data = decisionEngine && !decisionEngine.loading ? decisionEngine : fallbackData;

  const [ingredientsExpanded, setIngredientsExpanded] = useState(false);

  // Build agent reasoning map from API data
  const agentReasoning = decisionEngine?.raw?.agents.calibration.reduce(
    (acc, a) => {
      if (a.reasoning) acc[a.agent_name] = a.reasoning;
      return acc;
    },
    {} as Record<string, string>,
  );

  // Top analog info
  const topMatch = decisionEngine?.raw?.analogs.topMatch;
  const topAnalog = topMatch?.matches?.[0];

  // Top trap risks
  const activeTraps = data.trapChecks.filter(
    (t) => t.variant === "warning" || t.variant === "danger",
  );

  // Top 3 signals driving decision (highest abs acceleration)
  const topSignals = [...data.realitySignals]
    .sort((a, b) => Math.abs(b.accel) - Math.abs(a.accel))
    .slice(0, 3);

  return (
    <div className="space-y-4" data-testid="command-center">
      {/* TOP: Decision Narrative (full width) */}
      <DecisionNarrativeCard
        agentData={data.agentData}
        narrativeState={data.narrativeState}
        realitySignals={data.realitySignals}
        mismatchData={data.mismatchData}
        silenceEvents={data.silenceEvents}
        assetScope={assetScope}
        forecast={decisionEngine?.raw?.forecasts.current ?? null}
        trapChecks={data.trapChecks}
      />

      {/* ROW 2: Left (60%) + Right (40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        {/* Left column */}
        <div className="space-y-4">
          <TopAnalogCard
            analogOverlay={data.analogOverlay}
            radarDims={data.radarDims}
            topMatch={topMatch ?? null}
            episodes={decisionEngine?.raw?.analogs.episodeLibrary}
          />
          <WhatChangedPanel
            realitySignals={data.realitySignals}
            dataSignals={data.dataSignals}
          />
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <TrapDetectionPanel
            trapChecks={data.trapChecks}
            positioningData={data.positioningData}
          />
          <ModelTransparencyPanel
            agentData={data.agentData}
            brierHist={data.brierHist}
            agentReasoning={agentReasoning}
          />
        </div>
      </div>

      {/* WHY THIS — causal chain explaining the recommended action */}
      {topAnalog && (
        <Card className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-3">
            WHY THIS RECOMMENDATION
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-lg border border-bm-border/50 bg-bm-surface/20 p-3">
              <p className="text-[9px] text-bm-muted2 uppercase mb-1">Top Analog</p>
              <p className="text-sm font-semibold text-bm-accent">{topAnalog.episode_name}</p>
              <p className="text-xs text-bm-muted mt-1">Rhyme: {topAnalog.rhyme_score?.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-bm-border/50 bg-bm-surface/20 p-3">
              <p className="text-[9px] text-bm-muted2 uppercase mb-1">Top Divergence</p>
              <p className="text-sm text-bm-text">{topAnalog.key_divergence}</p>
            </div>
            <div className="rounded-lg border border-bm-border/50 bg-bm-surface/20 p-3">
              <p className="text-[9px] text-bm-muted2 uppercase mb-1">Top 3 Signals</p>
              <div className="space-y-1">
                {topSignals.map((s) => (
                  <p key={s.signal} className="text-xs text-bm-muted">
                    <span className={s.accel < 0 ? "text-red-400" : "text-emerald-400"}>
                      {s.accel > 0 ? "+" : ""}{s.accel.toFixed(1)}
                    </span>{" "}
                    {s.signal}
                  </p>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-bm-border/50 bg-bm-surface/20 p-3">
              <p className="text-[9px] text-bm-muted2 uppercase mb-1">Active Traps</p>
              {activeTraps.length === 0 ? (
                <p className="text-xs text-emerald-400">No active traps</p>
              ) : (
                <div className="space-y-1">
                  {activeTraps.map((t) => (
                    <div key={t.check} className="flex items-center gap-1.5">
                      <Badge variant={t.variant} className="text-[8px] px-1 py-0">
                        {t.status}
                      </Badge>
                      <span className="text-xs text-bm-muted">{t.check}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* INGREDIENTS — expandable signal table */}
      <Card className="p-5">
        <button
          onClick={() => setIngredientsExpanded(!ingredientsExpanded)}
          className="w-full flex items-center justify-between"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
            INGREDIENTS ({data.realitySignals.length + data.dataSignals.length} signals)
          </p>
          <span className="text-bm-muted2 text-xs">{ingredientsExpanded ? "▲" : "▼"}</span>
        </button>
        {ingredientsExpanded && (
          <div className="mt-3 overflow-auto max-h-80">
            <table className="w-full text-xs font-mono">
              <thead className="border-b border-bm-border/30">
                <tr>
                  <th className="text-left py-1.5 text-[9px] text-bm-muted2 uppercase">Signal</th>
                  <th className="text-right py-1.5 text-[9px] text-bm-muted2 uppercase">Current</th>
                  <th className="text-right py-1.5 text-[9px] text-bm-muted2 uppercase">Accel/Surprise</th>
                  <th className="text-left py-1.5 text-[9px] text-bm-muted2 uppercase">Trend</th>
                  <th className="text-left py-1.5 text-[9px] text-bm-muted2 uppercase">Layer</th>
                </tr>
              </thead>
              <tbody>
                {data.realitySignals.map((s) => (
                  <tr key={s.signal} className="border-b border-bm-border/20">
                    <td className="py-1.5 text-bm-text">{s.signal}</td>
                    <td className="py-1.5 text-right text-bm-text">{s.value}%</td>
                    <td className={`py-1.5 text-right ${s.accel < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {s.accel > 0 ? "+" : ""}{s.accel.toFixed(1)}
                    </td>
                    <td className="py-1.5 text-bm-muted">{s.trend}</td>
                    <td className="py-1.5"><span className="text-emerald-500 text-[9px]">Reality</span></td>
                  </tr>
                ))}
                {data.dataSignals.map((s) => (
                  <tr key={s.metric} className="border-b border-bm-border/20">
                    <td className="py-1.5 text-bm-text">{s.metric}</td>
                    <td className="py-1.5 text-right text-bm-text">{s.reported}</td>
                    <td className={`py-1.5 text-right ${s.surprise > 0 ? "text-amber-400" : s.surprise < 0 ? "text-red-400" : "text-bm-muted"}`}>
                      {s.surprise > 0 ? "+" : ""}{s.surprise}
                    </td>
                    <td className="py-1.5 text-bm-muted">{s.trend}</td>
                    <td className="py-1.5"><span className="text-sky-400 text-[9px]">Data</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* BOTTOM: Signal layers (collapsed) */}
      <SignalStack
        realitySignals={data.realitySignals}
        dataSignals={data.dataSignals}
        narrativeState={data.narrativeState}
      />
    </div>
  );
}
