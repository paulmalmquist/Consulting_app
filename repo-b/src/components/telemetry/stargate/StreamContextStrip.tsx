"use client";

// In-flight streaming context: the windowed-aggregation engine, the most recent aggregation window, and
// stream freshness. Every value comes from the bridge health frame (BridgeHealth) and the latest AggRow -
// nothing is fabricated. Each field fails closed to "not available" with a reason when the bridge frame
// has not carried it yet, so the strip never shows a zero that looks like real data.

import { C } from "../primitives";
import type { AggRow, BridgeHealth } from "@/lib/lab/stargateStream";

function Field({ label, value, reason, accent }: {
  label: string; value?: React.ReactNode; reason?: string; accent?: string;
}) {
  const available = value !== undefined && value !== null && value !== "";
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase",
        color: C.faint }}>
        {label}
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 13, color: available ? (accent || C.text) : C.faint, marginTop: 3 }}>
        {available ? value : `not available — ${reason ?? "no frame yet"}`}
      </div>
    </div>
  );
}

function ageLabel(ms: number | null): string | undefined {
  if (ms == null) return undefined;
  if (ms < 1500) return "live (<1.5s)";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s ago`;
  return `${Math.round(ms / 60_000)}m ago`;
}

export default function StreamContextStrip({ health, latestAgg }: {
  health: BridgeHealth | null | undefined;
  latestAgg: AggRow | null | undefined;
}) {
  const windowMs = latestAgg ? latestAgg.window_end_ms - latestAgg.window_start_ms : null;
  const ageMs = health?.last_message_age_ms ?? null;
  const fresh = ageMs != null && ageMs < 1500;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14,
      padding: "12px 14px", marginBottom: 16, borderRadius: 9,
      background: C.panel, border: `1px solid ${C.border}` }}>
      <Field label="Aggregation engine" reason="health not reported"
        value={health?.aggregation_source} />
      <Field label="In-flight window" reason="no aggregation window yet"
        value={windowMs != null ? `${(windowMs / 1000).toFixed(1)}s · ${latestAgg!.n} msg` : undefined} />
      <Field label="Window avg temp" reason="no aggregation window yet"
        value={latestAgg ? `${latestAgg.avg_temp_c.toFixed(0)}°C` : undefined}
        accent={latestAgg && latestAgg.avg_temp_c < 1400 ? C.amber : undefined} />
      <Field label="Window max vibration" reason="no aggregation window yet"
        value={latestAgg ? `${latestAgg.max_vibration_g.toFixed(3)}g` : undefined} />
      <Field label="Last message" reason="no frame yet"
        value={ageLabel(ageMs)} accent={fresh ? C.green : C.amber} />
      <Field label="Consumer" reason="health not reported"
        value={health ? (health.consumer_alive ? "alive" : "down") : undefined}
        accent={health?.consumer_alive ? C.green : C.red} />
      <Field label="Uptime" reason="health not reported"
        value={health ? `${Math.floor(health.uptime_s / 60)}m ${Math.round(health.uptime_s % 60)}s` : undefined} />
    </div>
  );
}
