"use client";

import React from "react";

const SIGNAL_KEYS = [
  { key: "mvrv_z", label: "MVRV Z" },
  { key: "yc_10y2y", label: "10Y–2Y" },
  { key: "vix_term", label: "VIX Term" },
  { key: "housing", label: "Housing" },
  { key: "cmbs_delinq", label: "CMBS Delinq" },
  { key: "fed_tone", label: "Fed Tone" },
  { key: "crypto_flow", label: "Crypto Flow" },
  { key: "macro_surprise", label: "Macro Surprise" },
] as const;

interface Props {
  signalsJson: Record<string, unknown> | null;
  previousSignalsJson?: Record<string, unknown> | null;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toString() : v.toFixed(2);
  }
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    // housing is an object; show key metric if present
    const obj = v as Record<string, unknown>;
    if (typeof obj.price_yoy === "number") return `${(obj.price_yoy as number).toFixed(1)}% YoY`;
    return JSON.stringify(v).slice(0, 16);
  }
  return String(v);
}

function computeDelta(current: unknown, previous: unknown): string {
  if (typeof current !== "number" || typeof previous !== "number") return "";
  const delta = current - previous;
  if (Math.abs(delta) < 0.001) return "±0";
  return delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
}

function freshnessDot(freshnessValue: unknown): string {
  const str = String(freshnessValue || "").toLowerCase();
  if (str === "fresh" || str === "0d") return "bg-emerald-500";
  if (str.endsWith("d") || str === "stale") {
    const days = parseInt(str, 10);
    if (!Number.isNaN(days) && days <= 1) return "bg-emerald-500";
    if (!Number.isNaN(days) && days <= 3) return "bg-amber-500";
    return "bg-red-500";
  }
  return "bg-neutral-500";
}

export function PulseStrip({ signalsJson, previousSignalsJson }: Props) {
  const perSignalFreshness =
    (signalsJson?.per_signal_freshness as Record<string, unknown> | undefined) || {};

  return (
    <section
      aria-label="Signal pulse"
      className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-4"
      data-testid="hr-pulse-strip"
    >
      {SIGNAL_KEYS.map(({ key, label }) => {
        const value = signalsJson?.[key];
        const prev = previousSignalsJson?.[key];
        const delta = computeDelta(value, prev);
        const dotClass = freshnessDot(perSignalFreshness[key]);
        return (
          <div
            key={key}
            className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
          >
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                {label}
              </span>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} />
            </div>
            <div className="text-sm font-semibold text-neutral-100">
              {formatValue(value)}
            </div>
            {delta && (
              <div
                className={`text-[10px] ${
                  delta.startsWith("+") ? "text-emerald-400" :
                  delta.startsWith("-") ? "text-red-400" :
                  "text-neutral-500"
                }`}
              >
                {delta}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
