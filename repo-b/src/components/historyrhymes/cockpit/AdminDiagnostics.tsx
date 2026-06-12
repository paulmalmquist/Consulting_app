"use client";

import { useEffect, useState } from "react";
import {
  fetchHrState,
  fetchLatestDecision,
  fetchLatestBrief,
  fetchStreamHealth,
  type StreamHealth,
} from "@/lib/historyrhymes/client";
import { C, Panel, Tag } from "./primitives";

// Admin surface: raw stream-health JSON plus an ok/null probe table over the
// cockpit's client functions. Diagnostics, not dashboards — every value here
// is exactly what the API returned.

type ProbeState = "pending" | "ok" | "null";

const PROBES: { name: string; run: () => Promise<unknown | null> }[] = [
  { name: "GET /api/hr/v1/state", run: fetchHrState },
  { name: "GET /api/hr/v1/decisions/latest", run: fetchLatestDecision },
  { name: "GET /api/hr/v1/briefs/latest", run: fetchLatestBrief },
  { name: "GET /api/hr/v1/stream/health", run: fetchStreamHealth },
];

export default function AdminDiagnostics() {
  const [health, setHealth] = useState<StreamHealth | null | "pending">("pending");
  const [probes, setProbes] = useState<Record<string, ProbeState>>(
    Object.fromEntries(PROBES.map((p) => [p.name, "pending" as ProbeState])),
  );

  useEffect(() => {
    let cancelled = false;
    fetchStreamHealth().then((h) => { if (!cancelled) setHealth(h); });
    for (const probe of PROBES) {
      probe.run().then((result) => {
        if (cancelled) return;
        setProbes((prev) => ({ ...prev, [probe.name]: result === null ? "null" : "ok" }));
      });
    }
    return () => { cancelled = true; };
  }, []);

  return (
    <div data-testid="hr-admin-page">
      <h1 style={{ fontFamily: C.sans, fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
        Admin diagnostics
      </h1>
      <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, margin: "0 0 18px" }}>
        Raw API state for the cockpit&apos;s data sources. A <em>null</em> probe means the
        endpoint returned 404 or failed — the cockpit fails closed on it.
      </p>

      <Panel title="Endpoint probes" style={{ marginBottom: 16 }}>
        <table data-testid="hr-admin-probes" style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {PROBES.map((p) => {
              const state = probes[p.name];
              const color = state === "ok" ? C.green : state === "null" ? C.amber : C.faint;
              return (
                <tr key={p.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, padding: "8px 0" }}>{p.name}</td>
                  <td style={{ padding: "8px 0", textAlign: "right" }}><Tag color={color}>{state}</Tag></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel title="Stream health (raw)">
        {health === "pending" ? (
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Loading…</span>
        ) : health === null ? (
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.red }}>
            health endpoint unreachable (fetch returned null)
          </span>
        ) : (
          <pre data-testid="hr-admin-health-json"
            style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {JSON.stringify(health, null, 2)}
          </pre>
        )}
      </Panel>
    </div>
  );
}
