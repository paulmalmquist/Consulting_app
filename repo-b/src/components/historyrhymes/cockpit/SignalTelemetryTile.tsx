"use client";

import type { NormalizedSignal } from "@/lib/historyrhymes/signals";
import { C, FreshnessDot, StatusChip } from "./primitives";

// Zone 2 — one telemetry sensor tile. Rendered as a button from day one so
// the evidence drawer (PR 10) can attach without relayout; until then the
// click is a no-op when no handler is passed.
export interface SignalTelemetryTileProps {
  signal: NormalizedSignal;
  onOpenEvidence?: (key: NormalizedSignal["key"]) => void;
}

export function SignalTelemetryTile({ signal, onOpenEvidence }: SignalTelemetryTileProps) {
  const missing = signal.status === "missing";
  return (
    <button
      type="button"
      data-testid={`hr-signal-tile-${signal.key}`}
      onClick={onOpenEvidence ? () => onOpenEvidence(signal.key) : undefined}
      title={signal.nullReason ?? `${signal.label} · source: ${signal.source}`}
      style={{
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9,
        padding: "10px 12px", textAlign: "left", width: "100%",
        cursor: onOpenEvidence ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
        <span style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {signal.label}
        </span>
        <FreshnessDot ageLabel={missing ? null : (signal.freshnessLabel ?? "fresh")} />
      </div>
      <div data-testid={`hr-signal-value-${signal.key}`}
        style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 600, color: missing ? C.faint : C.text, lineHeight: 1.1 }}>
        {signal.formatted}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 6, minHeight: 18 }}>
        {signal.delta != null ? (
          <span style={{ fontFamily: C.mono, fontSize: 10,
            color: signal.delta.startsWith("+") ? C.green : signal.delta.startsWith("-") ? C.red : C.faint }}>
            {signal.delta}
          </span>
        ) : <span />}
        <StatusChip status={signal.status} />
      </div>
      {missing && signal.nullReason && (
        <div data-testid={`hr-signal-nullreason-${signal.key}`}
          style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, marginTop: 5, lineHeight: 1.4 }}>
          {signal.nullReason}
        </div>
      )}
    </button>
  );
}
