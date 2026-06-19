"use client";

import React from "react";
import type { FreshnessVerdict, Regime } from "@/lib/historyrhymes/client";

const REGIME_LABELS: Record<Regime, string> = {
  expansion: "Expansion",
  late_cycle: "Late Cycle",
  stagflation: "Stagflation",
  crisis: "Crisis",
  recovery: "Recovery",
  unknown: "Unknown",
};

const FRESHNESS_LABELS: Record<FreshnessVerdict, { label: string; dot: string; text: string }> = {
  fresh:           { label: "FRESH",          dot: "bg-emerald-500", text: "text-emerald-500" },
  stale_snapshot:  { label: "STALE SNAPSHOT", dot: "bg-amber-500",   text: "text-amber-500" },
  stale_brief:     { label: "STALE BRIEF",    dot: "bg-amber-500",   text: "text-amber-500" },
  no_brief:        { label: "NO BRIEF",       dot: "bg-red-500",     text: "text-red-500" },
  no_snapshot:     { label: "NO SNAPSHOT",    dot: "bg-red-500",     text: "text-red-500" },
};

interface Props {
  regime: Regime | null;
  confidence: number | null;
  latestDecisionAt: string | null;
  freshness: FreshnessVerdict;
}

export function RoutineHeader({ regime, confidence, latestDecisionAt, freshness }: Props) {
  const isLow = freshness !== "fresh" || (confidence !== null && confidence < 0.4);
  const freshnessStyle = FRESHNESS_LABELS[freshness];

  return (
    <header
      className={`rounded-lg border p-6 mb-4 ${
        isLow
          ? "bg-neutral-900/40 border-neutral-700 opacity-80"
          : "bg-neutral-900 border-neutral-700"
      }`}
      data-testid="hr-routine-header"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-400 mb-1">
            Current regime
            {isLow && (
              <span className="ml-2 text-red-400 font-semibold">· LOW CONVICTION</span>
            )}
          </div>
          <div className="text-3xl font-semibold text-neutral-100">
            {regime ? REGIME_LABELS[regime] : "—"}
          </div>
          <div className="text-sm text-neutral-400 mt-1">
            Confidence: {confidence !== null ? confidence.toFixed(2) : "—"}
            {latestDecisionAt && (
              <>
                {" · "}Last decision: {new Date(latestDecisionAt).toLocaleString()}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-block w-2 h-2 rounded-full ${freshnessStyle.dot}`} />
          <span className={`text-xs font-semibold ${freshnessStyle.text}`}>
            {freshnessStyle.label}
          </span>
        </div>
      </div>
    </header>
  );
}
