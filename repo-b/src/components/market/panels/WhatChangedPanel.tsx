"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { RealitySignal, DataSignal } from "@/lib/trading-lab/decision-engine-types";

interface WhatChangedPanelProps {
  realitySignals: RealitySignal[];
  dataSignals: DataSignal[];
}

interface Delta {
  signal: string;
  previous: string;
  current: string;
  delta: string;
  impact: string;
  direction: "bullish" | "bearish" | "neutral";
}

function buildDeltas(
  realitySignals: RealitySignal[],
  dataSignals: DataSignal[]
): Delta[] {
  const deltas: Delta[] = [];

  // Reality signals with significant acceleration = "changed today"
  for (const s of realitySignals) {
    if (Math.abs(s.accel) > 2) {
      const prevValue = s.value - s.accel;
      deltas.push({
        signal: s.signal,
        previous: `${prevValue > 0 ? "+" : ""}${prevValue.toFixed(1)}%`,
        current: `${s.value > 0 ? "+" : ""}${s.value}%`,
        delta: `${s.accel > 0 ? "+" : ""}${s.accel.toFixed(1)}`,
        impact: Math.abs(s.accel) > 4 ? "High" : "Medium",
        direction: s.accel > 0 && s.value > 0
          ? "bullish"
          : s.accel < 0 && s.value < 0
            ? "bearish"
            : "neutral",
      });
    }
  }

  // Data signals with surprises
  for (const d of dataSignals) {
    if (d.surprise !== 0) {
      deltas.push({
        signal: d.metric,
        previous: `${d.expected} (exp)`,
        current: `${d.reported}`,
        delta: `${d.surprise > 0 ? "+" : ""}${d.surprise}`,
        impact: Math.abs(d.surprise) > 0.3
          ? "Increases bear probability"
          : "Marginal",
        direction: d.surprise > 0 ? "bearish" : "bullish",
      });
    }
  }

  return deltas;
}

export function WhatChangedPanel({ realitySignals, dataSignals }: WhatChangedPanelProps) {
  const deltas = buildDeltas(realitySignals, dataSignals);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          What Changed Today
        </p>
        <Badge>{deltas.length} DELTAS</Badge>
      </div>

      {deltas.length === 0 ? (
        <p className="text-xs text-bm-muted2">No material changes.</p>
      ) : (
        <div className="space-y-1.5">
          {deltas.map((d) => {
            const dirColor =
              d.direction === "bullish"
                ? "text-emerald-400"
                : d.direction === "bearish"
                  ? "text-red-400"
                  : "text-bm-muted";
            const arrow =
              d.direction === "bullish" ? "+" : d.direction === "bearish" ? "-" : "~";

            return (
              <div
                key={d.signal}
                className="flex items-center gap-3 rounded-lg bg-bm-surface/20 border border-bm-border/30 p-2.5"
              >
                <span
                  className={`text-lg font-mono font-bold w-5 text-center ${dirColor}`}
                >
                  {arrow}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-bm-text truncate">
                    {d.signal}
                  </p>
                  <p className="text-[10px] text-bm-muted2">
                    {d.previous} &rarr; {d.current}{" "}
                    <span className={`font-mono ${dirColor}`}>
                      ({d.delta})
                    </span>
                  </p>
                </div>
                <p className="text-[10px] text-bm-muted2 text-right shrink-0 max-w-[120px]">
                  {d.impact}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
