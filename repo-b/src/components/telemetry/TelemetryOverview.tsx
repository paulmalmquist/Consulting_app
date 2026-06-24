"use client";

// Overview — the opening-argument page. A dominant thesis header states the idea once, then the
// Spaceflight Bottleneck Map carries it as one large tabbed story module (Bottleneck Map / Cost to
// LEO / Who Flies), with an editorial "Big Numbers" band and the Terran 1 event record. Static
// public-data context module — no serving API, no KPI dashboard strip, no lineage CTA here.

import { C, DisclosureFooter } from "./primitives";
import BottleneckMap from "./context/BottleneckMap/BottleneckMap";
import { computeBigNumbers } from "./context/BottleneckMap/data";

// Brand fluorescent purple (--nv-purple-hot "wet reflect"); the marketing CSS var is
// out of scope in the telemetry env, so the hex is inlined.
const NV_PURPLE = "#B040FF";

export default function TelemetryOverview() {
  return (
    <>
      {/* Thesis header — dominant; states the argument once. */}
      <header style={{ marginBottom: 26, maxWidth: 880 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span aria-hidden style={{ width: 18, height: 2, borderRadius: 2, background: C.cyan, boxShadow: `0 0 8px ${C.cyan}aa` }} />
          <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.16em", color: C.cyan, textTransform: "uppercase" }}>Overview</span>
        </div>
        <h1 style={{ fontFamily: C.mono, fontSize: 48, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.08, color: C.text, marginTop: 12 }}>
          Why <span style={{ color: NV_PURPLE, textShadow: `0 0 18px ${NV_PURPLE}99` }}>Launch</span> Became A{" "}
          <span style={{ color: NV_PURPLE, textShadow: `0 0 18px ${NV_PURPLE}99` }}>Data</span> Problem
        </h1>
        <p style={{ fontFamily: C.sans, fontSize: 16, color: C.dim, lineHeight: 1.65, marginTop: 16 }}>
          Spaceflight moves by breaking what holds it back. First, reaching orbit. Then lowering the cost. Then
          flying again. Then building at scale. Now the hard part is speed of judgment: reading the telemetry,
          trusting the model, tracing the source, and acting before delay becomes risk.
        </p>

        {/* Big Numbers — inline editorial stats under the thesis, not a card dashboard. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "26px 48px", marginTop: 24 }}>
          {computeBigNumbers().map((b) => (
            <div key={b.label}>
              <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: C.faint, marginBottom: 5 }}>
                {b.label}
              </div>
              <div style={{ fontFamily: C.mono, fontSize: 25, fontWeight: 700, letterSpacing: "-0.01em",
                color: b.accent === "share" ? C.green : b.accent === "cost" ? C.amber : C.text }}>
                {b.value}
              </div>
              <div style={{ fontFamily: C.sans, fontSize: 11.5, color: C.dim, marginTop: 3 }}>{b.sub}</div>
            </div>
          ))}
        </div>
      </header>

      <BottleneckMap />

      <DisclosureFooter />
    </>
  );
}
