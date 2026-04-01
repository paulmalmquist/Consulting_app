"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { TrapCheckRaw, PositioningItem } from "@/lib/trading-lab/decision-engine-types";

const TRAP_EXPLANATIONS: Record<string, { explanation: string; actionAdjustment: string | null }> = {
  "Consensus Divergence": {
    explanation: "Measures agreement across the 5 forecasting agents. When 4+ agree, watch for groupthink.",
    actionAdjustment: null,
  },
  "Flow / Narrative": {
    explanation: "Compares what people say (bearish narrative) vs what they do (buying flows). Mismatch signals potential reversal.",
    actionAdjustment: "Bearish narrative but buying flows detected. Reduce conviction on short thesis.",
  },
  "Crowding Score": {
    explanation: "How concentrated positioning is. High crowding means the trade is popular and vulnerable to unwind.",
    actionAdjustment: "Office REIT shorts are crowded (0.68). Size down if short.",
  },
  "Honeypot Match": {
    explanation: "Nearest historical trap pattern. Higher score = current setup looks more like a past trap.",
    actionAdjustment: null,
  },
  "Info Provenance": {
    explanation: "Source quality of dominant narratives. Low-origin sources being amplified suggests manufactured consensus.",
    actionAdjustment: "3 low-origin sources amplified. Discount these narratives when making decisions.",
  },
  "Meta Level": {
    explanation: "How many layers of awareness exist. L1 = retail unaware. L2 = crowd-aware. L3 = institution-modeled.",
    actionAdjustment: null,
  },
};

interface TrapDetectionPanelProps {
  trapChecks: TrapCheckRaw[];
  positioningData: PositioningItem[];
}

export function TrapDetectionPanel({ trapChecks, positioningData }: TrapDetectionPanelProps) {
  const activeTraps = trapChecks.filter(
    (t) => t.variant === "warning" || t.variant === "danger"
  );

  // If no trap checks at all, don't render
  if (trapChecks.length === 0) return null;

  const extremePositions = positioningData.filter((p) => p.extreme);
  const avgCrowding = positioningData.length > 0
    ? positioningData.reduce((s, p) => s + p.crowding, 0) / positioningData.length
    : NaN;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Trap Detector
        </p>
        <Badge variant={activeTraps.length > 2 ? "danger" : activeTraps.length > 0 ? "warning" : "success"}>
          {activeTraps.length} ACTIVE
        </Badge>
      </div>

      {/* Summary strip — only if data exists */}
      {(Number.isFinite(avgCrowding) || extremePositions.length > 0) && (
        <div className="flex items-center gap-4 mb-4 pb-3 border-b border-bm-border/30">
          {Number.isFinite(avgCrowding) && (
            <div>
              <p className="text-[9px] text-bm-muted2 uppercase">Avg Crowding</p>
              <p
                className={`text-lg font-mono font-bold ${
                  avgCrowding > 65
                    ? "text-red-400"
                    : avgCrowding > 45
                      ? "text-amber-400"
                      : "text-emerald-400"
                }`}
              >
                {avgCrowding.toFixed(0)}
              </p>
            </div>
          )}
          <div>
            <p className="text-[9px] text-bm-muted2 uppercase">Extreme Positions</p>
            <p className="text-lg font-mono font-bold text-bm-text">
              {extremePositions.length}
            </p>
          </div>
        </div>
      )}

      {/* Trap checks — narrative output instead of raw values */}
      <div className="space-y-1">
        {trapChecks.map((t) => {
          const meta = TRAP_EXPLANATIONS[t.check];
          const isActive = t.variant === "warning" || t.variant === "danger";
          return (
            <div
              key={t.check}
              className="rounded-lg border border-bm-border/30 bg-bm-surface/10 p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-bm-text">
                  {t.check}
                </span>
                <Badge variant={t.variant}>{t.status}</Badge>
              </div>
              {/* Narrative reasoning instead of raw numeric values */}
              <p className="text-[10px] text-bm-muted leading-relaxed">
                {isActive && meta?.actionAdjustment
                  ? meta.actionAdjustment
                  : meta?.explanation ?? t.value}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
