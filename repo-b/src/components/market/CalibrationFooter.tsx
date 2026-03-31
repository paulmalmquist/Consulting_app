"use client";

import React from "react";
import { Card } from "@/components/ui/Card";

interface CalibrationFooterProps {
  brierHistory: Array<{ avg_brier: number; prediction_count: number }>;
  agents: Array<{ agent_name: string; rolling_90d_brier: number }>;
  predictions: Array<{ resolved: boolean; brier_score: number | null }>;
}

export function CalibrationFooter({ brierHistory, agents, predictions }: CalibrationFooterProps) {
  const latestBrier = brierHistory.length > 0
    ? Number(brierHistory[brierHistory.length - 1].avg_brier)
    : null;

  const brier90 = brierHistory.length >= 12
    ? brierHistory.slice(-12).reduce((s, b) => s + Number(b.avg_brier), 0) / 12
    : latestBrier;

  const totalPredictions = predictions.length;
  const resolved = predictions.filter((p) => p.resolved).length;
  const winRate = resolved > 0
    ? predictions.filter(
        (p) => p.resolved && p.brier_score != null && p.brier_score < 0.2,
      ).length / resolved
    : 0;

  const bestAgent = agents.length > 0
    ? agents.reduce((best, a) =>
        (a.rolling_90d_brier ?? 1) < (best.rolling_90d_brier ?? 1) ? a : best,
      )
    : null;

  return (
    <Card className="p-3 mt-4 border-bm-border/30">
      <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
        <div>
          <span className="text-[9px] text-bm-muted2 uppercase block">30d Brier</span>
          <span className={`font-bold ${(latestBrier ?? 1) < 0.2 ? "text-emerald-400" : "text-amber-400"}`}>
            {latestBrier != null ? latestBrier.toFixed(3) : "—"}
          </span>
        </div>
        <div>
          <span className="text-[9px] text-bm-muted2 uppercase block">90d Brier</span>
          <span className={`font-bold ${(brier90 ?? 1) < 0.2 ? "text-emerald-400" : "text-amber-400"}`}>
            {brier90 != null ? brier90.toFixed(3) : "—"}
          </span>
        </div>
        <div>
          <span className="text-[9px] text-bm-muted2 uppercase block">Win Rate</span>
          <span className="font-bold text-bm-text">{(winRate * 100).toFixed(0)}%</span>
        </div>
        <div>
          <span className="text-[9px] text-bm-muted2 uppercase block">Forecasts</span>
          <span className="font-bold text-bm-text">{totalPredictions}</span>
        </div>
        <div>
          <span className="text-[9px] text-bm-muted2 uppercase block">Resolved</span>
          <span className="font-bold text-bm-text">{resolved}</span>
        </div>
        <div>
          <span className="text-[9px] text-bm-muted2 uppercase block">Abstain</span>
          <span className="font-bold text-bm-muted">0%</span>
        </div>
        {bestAgent && (
          <div className="ml-auto">
            <span className="text-[9px] text-bm-muted2 uppercase block">Best Agent</span>
            <span className="font-bold text-bm-accent">{bestAgent.agent_name}</span>
            <span className="text-bm-muted ml-1">({bestAgent.rolling_90d_brier?.toFixed(2)})</span>
          </div>
        )}
      </div>
    </Card>
  );
}
