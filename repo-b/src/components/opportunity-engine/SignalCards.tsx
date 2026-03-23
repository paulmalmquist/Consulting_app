"use client";

import React from "react";
import type { OpportunitySignal } from "@/lib/bos-api";

function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return `${(value * 100).toFixed(1)}%`;
}

function fmtObservedAt(value?: string | null): string {
  if (!value) return "No timestamp";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export default function SignalCards({
  signals,
}: {
  signals: OpportunitySignal[];
}) {
  if (!signals.length) {
    return (
      <div className="rounded-xl border border-dashed border-bm-border/70 px-4 py-6 text-sm text-bm-muted2">
        No market signals are available for this run yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="opportunity-signal-cards">
      {signals.map((signal) => (
        <div
          key={signal.market_signal_id}
          className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
                {signal.canonical_topic.replaceAll("_", " ")}
              </p>
              <h3 className="text-sm font-semibold text-bm-text">{signal.signal_name}</h3>
            </div>
            <span className="rounded-full border border-bm-border/70 px-2 py-1 text-[11px] text-bm-muted2">
              {signal.signal_source}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-bm-surface/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Probability</p>
              <p className="mt-1 text-lg font-semibold text-bm-text">{fmtPct(signal.probability)}</p>
            </div>
            <div className="rounded-lg bg-bm-surface/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Signal Strength</p>
              <p className="mt-1 text-lg font-semibold text-bm-text">{fmtPct(signal.signal_strength)}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-bm-muted2">
            {signal.sector ? <span>{signal.sector}</span> : null}
            {signal.geography ? <span>{signal.geography}</span> : null}
            <span>{fmtObservedAt(signal.observed_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
