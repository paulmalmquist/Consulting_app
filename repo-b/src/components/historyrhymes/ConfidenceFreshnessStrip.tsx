"use client";

import React from "react";
import type { MorningBookData } from "@/lib/historyrhymes/client";

const CONF_CLASS: Record<string, string> = {
  improving: "text-emerald-400",
  stable: "text-neutral-300",
  deteriorating: "text-red-400",
  unknown: "text-neutral-500",
};

const FRESH_CLASS: Record<string, string> = {
  fresh: "text-emerald-400",
  stale: "text-amber-400",
  very_stale: "text-red-400",
  unknown: "text-neutral-500",
};

function fmt(n: number | null): string {
  return n === null || n === undefined ? "—" : String(n);
}

interface Props {
  confidence: MorningBookData["confidence"];
  freshness: MorningBookData["freshness"];
}

export function ConfidenceFreshnessStrip({ confidence, freshness }: Props) {
  const deltaText =
    confidence.delta === null
      ? ""
      : ` (${confidence.delta > 0 ? "+" : ""}${confidence.delta})`;

  return (
    <section
      className="grid grid-cols-2 gap-3"
      data-testid="hr-confidence-freshness"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500">
          Confidence
        </div>
        <div className="text-sm text-neutral-200">
          {fmt(confidence.previous)} → {fmt(confidence.current)}
          {deltaText}
        </div>
        <div className={`text-xs ${CONF_CLASS[confidence.status] ?? CONF_CLASS.unknown}`}>
          {confidence.status}
        </div>
      </div>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500">
          Freshness
        </div>
        <div className="text-sm text-neutral-200">
          {freshness.latest_brief_date ?? "—"}
        </div>
        <div className={`text-xs ${FRESH_CLASS[freshness.status] ?? FRESH_CLASS.unknown}`}>
          {freshness.status}
        </div>
      </div>
    </section>
  );
}
