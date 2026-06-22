"use client";

import type { StreamHealth } from "@/lib/historyrhymes/client";
import { C } from "./primitives";

// Rail-footer stream status. Six states: the five backend statuses plus
// "unreachable" when the health fetch itself returned null. The label always
// names the state — a dim dot with no words is exactly the silent ambiguity
// the cockpit exists to avoid.

const STATE_STYLE: Record<string, { color: string; label: (h: StreamHealth | null) => string }> = {
  connected: { color: C.green, label: (h) => `stream: ${h!.mode}` },
  delayed: { color: C.amber, label: (h) => `stream: ${h!.mode} · delayed` },
  replaying: { color: C.amber, label: () => "stream: replaying" },
  disconnected: { color: C.red, label: (h) => `stream: ${h!.mode} · disconnected` },
  not_configured: { color: C.faint, label: () => "stream: not configured" },
  unreachable: { color: C.red, label: () => "stream health: unreachable" },
};

export function StreamHealthChip({ health }: { health: StreamHealth | null }) {
  const key = health === null ? "unreachable" : health.status;
  const style = STATE_STYLE[key] ?? STATE_STYLE.disconnected;
  return (
    <div data-testid="hr-stream-chip" data-state={key}
      title={health?.degraded_reason ?? undefined}
      style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: style.color,
          boxShadow: style.color === C.faint ? "none" : `0 0 8px ${style.color}` }} />
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>{style.label(health)}</span>
      </div>
      {health?.degraded_reason && (
        <span data-testid="hr-stream-chip-reason"
          style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, lineHeight: 1.4 }}>
          {health.degraded_reason}
        </span>
      )}
    </div>
  );
}
