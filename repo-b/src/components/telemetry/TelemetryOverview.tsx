"use client";

// Overview — the opening-argument page. A dominant thesis header states the idea once, then the
// Spaceflight Bottleneck Map carries it as one large tabbed story module (Bottleneck Map / Cost to
// LEO / Who Flies), with an editorial "Big Numbers" band and the Terran 1 event record. Static
// public-data context module — no serving API, no KPI dashboard strip, no lineage CTA here.

import { C, TelemetryPageShell, TelemetryThesisHeading } from "./primitives";
import BottleneckMap from "./context/BottleneckMap/BottleneckMap";
import { computeBigNumbers } from "./context/BottleneckMap/data";

// Brand fluorescent purple (--nv-purple-hot "wet reflect"); the marketing CSS var is
// out of scope in the telemetry env, so the hex is inlined.
const NV_PURPLE = "#B040FF";

// Editorial "Big Numbers" band — inline stats under the thesis, not a card dashboard.
function BigNumbers() {
  return (
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
  );
}

export default function TelemetryOverview() {
  // Thesis-first: the dominant header states the argument once, Big Numbers sit under it, then the
  // Spaceflight Bottleneck Map carries the story. Same copy and editorial layout as before.
  const heading = (
    <TelemetryThesisHeading
      eyebrow="Overview"
      size={48}
      title={
        <>
          Why <span style={{ color: NV_PURPLE, textShadow: `0 0 18px ${NV_PURPLE}99` }}>Launch</span> Became A{" "}
          <span style={{ color: NV_PURPLE, textShadow: `0 0 18px ${NV_PURPLE}99` }}>Data</span> Problem
        </>
      }
      blurb="Spaceflight moves by breaking what holds it back. First, reaching orbit. Then lowering the cost. Then flying again. Then building at scale. Now the hard part is speed of judgment: reading the telemetry, trusting the model, tracing the source, and acting before delay becomes risk."
    >
      <BigNumbers />
    </TelemetryThesisHeading>
  );

  return (
    <TelemetryPageShell heading={heading}>
      <BottleneckMap />
    </TelemetryPageShell>
  );
}
