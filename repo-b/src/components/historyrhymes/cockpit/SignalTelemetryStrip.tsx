"use client";

import type { HrBrief } from "@/lib/historyrhymes/client";
import { parseBriefSignals, type NormalizedSignal, type SignalKey } from "@/lib/historyrhymes/signals";
import { C, CockpitEmptyState } from "./primitives";
import { SignalTelemetryTile } from "./SignalTelemetryTile";

// Zone 2 — the eight-signal telemetry strip. All eight tiles always render;
// a missing key is an explicit missing tile with its null reason, never a
// dropped tile. The header names the data source honestly — until the stream
// lands (PR 13) these values come from the weekly brief and say so.
export interface SignalTelemetryStripProps {
  brief: HrBrief | null;
  /** Latest per-key stream values; merged in PR 13. */
  streamSignals?: NormalizedSignal[] | null;
  /** Active stream mode label for the source tag; PR 13. */
  streamMode?: string | null;
  onOpenEvidence?: (key: SignalKey) => void;
}

export function SignalTelemetryStrip({ brief, streamSignals, streamMode, onOpenEvidence }: SignalTelemetryStripProps) {
  const signals = streamSignals ?? parseBriefSignals(brief);
  const sourceLabel = streamSignals
    ? `source: stream · ${streamMode ?? "unknown mode"}`
    : "source: weekly brief (static)";

  return (
    <section aria-label="Signal telemetry" data-testid="hr-signal-strip" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.13em", color: C.faint, textTransform: "uppercase", margin: 0 }}>
          Signal telemetry
        </h2>
        <span data-testid="hr-signal-source" style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>
          {sourceLabel}
        </span>
      </div>
      {brief === null && !streamSignals ? (
        <CockpitEmptyState
          zone="signals"
          reason="no weekly brief on record"
          hint="ingest a weekly brief (POST /api/hr/v1/research/briefs) or wait for the stream (PR 13)"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
          {signals.map((s) => (
            <SignalTelemetryTile key={s.key} signal={s} onOpenEvidence={onOpenEvidence} />
          ))}
        </div>
      )}
    </section>
  );
}
