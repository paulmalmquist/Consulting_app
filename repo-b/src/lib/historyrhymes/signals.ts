/**
 * Pure parsing/formatting library for the eight History Rhymes signals.
 * Extracted from PulseStrip so the cockpit tiles (PR 3) and the stream merge
 * (PR 13) share one missing-safe implementation. No React, no fetch.
 *
 * The eight keys are the shipped contract of hr_signal_snapshots.signals_json
 * and brief.parsed_json.latest_signals — do not rename them.
 */

import type { HrBrief } from "./client";

export type SignalKey =
  | "mvrv_z"
  | "yc_10y2y"
  | "vix_term"
  | "housing"
  | "cmbs_delinq"
  | "fed_tone"
  | "crypto_flow"
  | "macro_surprise";

/** Cockpit-tile <-> streaming-topic domain crosswalk (dispatch record §streaming). */
export type SignalDomain =
  | "macro"
  | "market"
  | "crypto"
  | "credit"
  | "real_estate"
  | "sentiment"
  | "options";

export const SIGNAL_KEYS: { key: SignalKey; label: string; domain: SignalDomain }[] = [
  { key: "mvrv_z", label: "MVRV Z", domain: "crypto" },
  { key: "yc_10y2y", label: "10Y–2Y", domain: "macro" },
  { key: "vix_term", label: "VIX Term", domain: "options" },
  { key: "housing", label: "Housing", domain: "real_estate" },
  { key: "cmbs_delinq", label: "CMBS Delinq", domain: "credit" },
  { key: "fed_tone", label: "Fed Tone", domain: "sentiment" },
  { key: "crypto_flow", label: "Crypto Flow", domain: "crypto" },
  { key: "macro_surprise", label: "Macro Surprise", domain: "macro" },
];

export type SignalStatus = "fresh" | "stale" | "missing";

export interface NormalizedSignal {
  key: SignalKey;
  label: string;
  domain: SignalDomain;
  /** Raw value as found; null when absent or unparseable. */
  value: unknown;
  /** Display string; "—" when missing. */
  formatted: string;
  /** Signed delta string ("+0.06"), or null when not computable. */
  delta: string | null;
  /** Raw per-signal freshness label from the brief ("fresh", "2d", "stale"), if any. */
  freshnessLabel: string | null;
  status: SignalStatus;
  /** Why the value is unavailable; null when a value is present. */
  nullReason: string | null;
  source: "brief" | "stream";
}

/** Ported from PulseStrip.formatValue — handles null/number/string/object. */
export function formatSignalValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? v.toString() : v.toFixed(2);
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj.price_yoy === "number") return `${obj.price_yoy.toFixed(1)}% YoY`;
    return JSON.stringify(v).slice(0, 16);
  }
  return String(v);
}

/** Ported from PulseStrip.computeDelta — numbers only; null otherwise. */
export function computeDelta(current: unknown, previous: unknown): string | null {
  if (typeof current !== "number" || typeof previous !== "number") return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.001) return "±0";
  return delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
}

/**
 * Freshness label -> tile status, porting PulseStrip's dot mapping:
 * fresh/0d/1d -> fresh; 2d/3d -> stale; 4d+/"stale" -> stale; absent -> the
 * value's own presence decides (a value with no freshness label is not
 * invented to be fresh).
 */
export function freshnessToStatus(label: string | null, hasValue: boolean): SignalStatus {
  if (!hasValue) return "missing";
  if (label == null) return "fresh"; // value present, no per-signal label shipped
  const v = label.toLowerCase();
  if (v === "fresh" || v === "0d" || v === "1d") return "fresh";
  return "stale";
}

/**
 * Parse the eight signals out of a weekly brief. Always returns all eight
 * keys — an absent or malformed key becomes an explicit missing tile with a
 * null reason, never a dropped tile and never an invented value.
 */
export function parseBriefSignals(brief: HrBrief | null): NormalizedSignal[] {
  const latest = asRecord(brief?.parsed_json?.["latest_signals"]);
  const previous = asRecord(brief?.parsed_json?.["previous_signals"]);
  const freshness = asRecord(latest?.["per_signal_freshness"]);

  return SIGNAL_KEYS.map(({ key, label, domain }) => {
    const raw = latest?.[key];
    const hasValue = raw !== null && raw !== undefined;
    const freshnessLabel = freshness && freshness[key] != null ? String(freshness[key]) : null;
    return {
      key,
      label,
      domain,
      value: hasValue ? raw : null,
      formatted: formatSignalValue(raw),
      delta: computeDelta(raw, previous?.[key]),
      freshnessLabel,
      status: freshnessToStatus(freshnessLabel, hasValue),
      nullReason: hasValue
        ? null
        : latest === null
          ? brief === null
            ? "no weekly brief on record"
            : "brief has no latest_signals"
          : "not present in latest brief",
      source: "brief",
    };
  });
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
