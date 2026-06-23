"use client";

// Overview — the opening-argument page. A dominant thesis header states the idea once, then the
// Spaceflight Bottleneck Map carries it as one large tabbed story module (Bottleneck Map / Cost to
// LEO / Who Flies), with an editorial "Big Numbers" band and the Terran 1 event record. Static
// public-data context module — no serving API, no KPI dashboard strip, no lineage CTA here.

import { C, DisclosureFooter } from "./primitives";
import BottleneckMap from "./context/BottleneckMap/BottleneckMap";

export default function TelemetryOverview() {
  return (
    <>
      {/* Thesis header — dominant; states the argument once. */}
      <header style={{ marginBottom: 26, maxWidth: 880 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span aria-hidden style={{ width: 18, height: 2, borderRadius: 2, background: C.cyan, boxShadow: `0 0 8px ${C.cyan}aa` }} />
          <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.16em", color: C.cyan, textTransform: "uppercase" }}>Overview</span>
        </div>
        <h1 style={{ fontFamily: C.sans, fontSize: 42, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05, color: C.text, marginTop: 12 }}>
          Why launch became a data problem
        </h1>
        <p style={{ fontFamily: C.sans, fontSize: 16, color: C.dim, lineHeight: 1.65, marginTop: 16 }}>
          Spaceflight moves by breaking what holds it back. First, reaching orbit. Then lowering the cost. Then
          flying again. Then building at scale. Now the hard part is speed of judgment: reading the telemetry,
          trusting the model, tracing the source, and acting before delay becomes risk.
        </p>
      </header>

      <BottleneckMap />

      <DisclosureFooter />
    </>
  );
}
