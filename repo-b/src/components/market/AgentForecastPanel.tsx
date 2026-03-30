"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { ApiAgentCalibration, ApiPrediction } from "@/components/market/hooks/useDecisionEngine";

interface AgentForecastPanelProps {
  agents: ApiAgentCalibration[];
  ensemble: {
    direction: string;
    confidence: number;
    bearishCount: number;
    bullishCount: number;
    trapCount: number;
    agreementScore: number;
  };
  forecast: ApiPrediction;
}

export function AgentForecastPanel({ agents, ensemble, forecast }: AgentForecastPanelProps) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Agent Forecast Panel
        </p>
        <Badge variant={forecast.source === "seed" ? "accent" : "success"}>
          {forecast.source === "seed" ? "SEED" : "LIVE"}
        </Badge>
      </div>

      {/* Ensemble summary */}
      <div className="flex flex-wrap items-center gap-6 mb-5 pb-4 border-b border-bm-border/30">
        <div>
          <p className="text-[9px] text-bm-muted2 uppercase">Ensemble Direction</p>
          <p className={`text-lg font-mono font-bold ${
            ensemble.direction === "Bearish" ? "text-red-400" :
            ensemble.direction === "Bullish" ? "text-emerald-400" :
            "text-amber-400"
          }`}>
            {ensemble.direction}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-bm-muted2 uppercase">Confidence</p>
          <p className="text-lg font-mono font-bold text-bm-text">{ensemble.confidence}%</p>
        </div>
        <div>
          <p className="text-[9px] text-bm-muted2 uppercase">Agreement</p>
          <p className="text-lg font-mono font-bold text-bm-text">{ensemble.agreementScore}%</p>
        </div>
        <div>
          <p className="text-[9px] text-bm-muted2 uppercase">Agents</p>
          <p className="text-sm font-mono text-bm-muted">
            {ensemble.bearishCount}B / {ensemble.bullishCount}L / {ensemble.trapCount}T
          </p>
        </div>
      </div>

      {/* Scenario probabilities */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "BULL", prob: forecast.scenario_bull_prob, variant: "success" as const },
          { label: "BASE", prob: forecast.scenario_base_prob, variant: "accent" as const },
          { label: "BEAR", prob: forecast.scenario_bear_prob, variant: "danger" as const },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-bm-border/50 bg-bm-surface/20 p-3 text-center">
            <Badge variant={s.variant} className="mb-1.5">{s.label}</Badge>
            <p className="text-2xl font-bold font-mono text-bm-text">
              {Math.round((s.prob ?? 0) * 100)}%
            </p>
          </div>
        ))}
      </div>

      {/* Individual agent outputs */}
      <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-3">
        Individual Agent Outputs
      </p>
      <div className="space-y-1">
        {agents.map((a) => {
          const isExpanded = expandedAgent === a.agent_name;
          const dirColor =
            a.direction === "Bullish" ? "text-emerald-400" :
            a.direction === "Bearish" ? "text-red-400" :
            a.direction === "TRAP" ? "text-amber-400" :
            "text-bm-muted";

          return (
            <div key={a.agent_name}>
              <button
                onClick={() => setExpandedAgent(isExpanded ? null : a.agent_name)}
                className="w-full grid grid-cols-[90px_65px_1fr_55px_55px] items-center py-2.5 border-b border-bm-border/30 hover:bg-bm-surface/20 transition-colors text-left"
              >
                <span className="text-xs font-semibold text-bm-text">{a.agent_name}</span>
                <span className={`text-[10px] font-bold ${dirColor}`}>{a.direction}</span>
                <div className="flex items-center gap-2 pr-2">
                  <div className="flex-1 h-2 rounded-full bg-bm-bg overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        a.direction === "Bullish" ? "bg-emerald-400/70" :
                        a.direction === "Bearish" ? "bg-red-400/70" :
                        "bg-amber-400/70"
                      }`}
                      style={{ width: `${a.confidence}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-bm-muted w-8 text-right">{a.confidence}%</span>
                </div>
                <span className={`font-mono text-[10px] text-center ${a.rolling_90d_brier < 0.2 ? "text-emerald-400" : "text-bm-muted"}`}>
                  {a.rolling_90d_brier?.toFixed(2)}
                </span>
                <span className="font-mono text-[10px] text-bm-muted2 text-center">
                  {Math.round((a.current_weight ?? 0) * 100)}%
                </span>
              </button>
              {isExpanded && a.reasoning && (
                <div className="px-3 py-3 bg-bm-surface/10 border-b border-bm-border/20">
                  <p className="text-[11px] text-bm-muted leading-relaxed">{a.reasoning}</p>
                  <div className="flex gap-4 mt-2 text-[9px] text-bm-muted2">
                    <span>90d Accuracy: {((a.rolling_90d_accuracy ?? 0) * 100).toFixed(0)}%</span>
                    <span>Predictions: {a.prediction_count}</span>
                    {a.source === "seed" && <Badge variant="accent" className="text-[7px]">SEED</Badge>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Forecast metadata */}
      {forecast.synthesis_narrative && (
        <div className="mt-4 p-3 rounded-lg bg-bm-surface/20 border border-bm-border/30">
          <p className="text-[9px] text-bm-muted2 uppercase mb-1">Synthesis</p>
          <p className="text-xs text-bm-muted leading-relaxed">{forecast.synthesis_narrative}</p>
        </div>
      )}

      {forecast.divergence_analysis && (
        <div className="mt-2 p-3 rounded-lg bg-amber-500/5 border border-amber-400/20">
          <p className="text-[9px] text-amber-300 uppercase mb-1">Divergence Analysis</p>
          <p className="text-xs text-bm-muted leading-relaxed">{forecast.divergence_analysis}</p>
        </div>
      )}
    </Card>
  );
}
