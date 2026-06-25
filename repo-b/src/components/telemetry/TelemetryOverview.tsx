"use client";

// Overview — the opening-argument page. A dominant editorial hero header states the idea once, then
// the Spaceflight Bottleneck Map carries it as one large tabbed story module (Bottleneck Map / Cost to
// LEO / Who Flies), with an editorial "Big Numbers" band and the Terran 1 event record. Static
// public-data context module — no serving API, no KPI dashboard strip, no lineage CTA here.

import { C, TelemetryPageShell } from "./primitives";
import { TelemetryPageHeader, type HeaderMetric } from "./TelemetryPageHeader";
import BottleneckMap from "./context/BottleneckMap/BottleneckMap";
import { computeBigNumbers } from "./context/BottleneckMap/data";

// Big Numbers → header metric row; accent strings map to the C palette (share=green, cost=amber).
function bigNumberMetrics(): HeaderMetric[] {
  return computeBigNumbers().map((b) => ({
    label: b.label,
    value: b.value,
    sub: b.sub,
    accent: b.accent === "share" ? C.green : b.accent === "cost" ? C.amber : C.text,
  }));
}

export default function TelemetryOverview() {
  // Thesis-first: the dominant hero states the argument once, Big Numbers sit under it, then the
  // Spaceflight Bottleneck Map carries the story. Same copy and real Big Numbers as before — only the
  // header now uses the shared editorial hero (Cormorant), with gradient on "Launch"/"Data".
  const heading = (
    <TelemetryPageHeader
      variant="hero"
      eyebrow="Overview"
      title={[
        { text: "Why " },
        { text: "Launch", gradient: true },
        { text: " Became A " },
        { text: "Data", gradient: true },
        { text: " Problem" },
      ]}
      description="Spaceflight moves by breaking what holds it back. First, reaching orbit. Then lowering the cost. Then flying again. Then building at scale. Now the hard part is speed of judgment: reading the telemetry, trusting the model, tracing the source, and acting before delay becomes risk."
      metrics={bigNumberMetrics()}
    />
  );

  return (
    <TelemetryPageShell heading={heading}>
      <BottleneckMap />
    </TelemetryPageShell>
  );
}
