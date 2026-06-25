"use client";

// Overview — the opening-argument page. A dominant editorial hero header states the idea once, then a
// large "Big Numbers" band of historical anchors, then the Spaceflight Bottleneck Map as ONE integrated
// thesis chart (hardware limits → data limits, with the commercial-share wave folded in as a contextual
// underlay). Closes with a source-honesty strip and a bridge into the rest of the demo. Static
// public-data context module — no serving API, no KPI dashboard strip, no lineage CTA here.

import Link from "next/link";
import { useParams } from "next/navigation";

import { C, TelemetryPageShell } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";
import { telemetryHref } from "./telemetryNav";
import BottleneckMap from "./context/BottleneckMap/BottleneckMap";
import { computeBigNumbers, type BigNumberAccent } from "./context/BottleneckMap/data";

// Big Numbers accent → C palette. Rendered locally (not via the shared header metric row) so the
// numerals can be materially larger narrative anchors without touching the shared header component.
function accentColor(a: BigNumberAccent): string {
  return a === "share" ? C.green : a === "cost" ? C.amber : C.text;
}

// Large editorial Big Numbers — historical context anchors, not operating KPIs. Bigger numerals +
// cleaner uppercase labels than the old inline header metric row.
function BigNumbersBand() {
  const numbers = computeBigNumbers();
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: "20px 40px", margin: "4px 0 30px",
      borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "22px 0",
    }}>
      {numbers.map((b) => (
        <div key={b.label}>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.faint, marginBottom: 8 }}>
            {b.label}
          </div>
          <div style={{ fontFamily: C.mono, fontWeight: 700, fontSize: "clamp(2rem, 4.4vw, 2.85rem)", lineHeight: 1, letterSpacing: "-0.02em", color: accentColor(b.accent) }}>
            {b.value}
          </div>
          {b.sub && <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 7 }}>{b.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// Source-honesty strip: the historical chart is curated/static public-data anchors, not a wired ETL.
// Stated plainly so the page never implies a live launch feed it does not have.
function SourceHonestyStrip() {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, margin: "6px 0 2px",
      border: `1px solid ${C.amber}33`, background: `${C.amber}0d`, borderRadius: 9, padding: "11px 14px",
    }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: C.amber, boxShadow: `0 0 8px ${C.amber}99`, marginTop: 5, flexShrink: 0 }} />
      <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.dim, lineHeight: 1.55 }}>
        <span style={{ color: C.amber }}>Source status:</span> Launch source ETL not connected — the
        historical chart uses curated/static public-data anchors (Wikipedia yearly spaceflight series /
        GCAT, company-stated figures) and editorial annotations. The rest of the demo (Stargate, Evidence,
        Replay, Trust) runs on real backfilled and replayed data, labeled where unavailable.
      </div>
    </div>
  );
}

// Bridge into the rest of the demo — the Overview's job is to make the other surfaces feel necessary.
const BRIDGE: { slug: string; label: string; blurb: string }[] = [
  { slug: "stargate", label: "Stargate Live", blurb: "Recorded test-stand capture, replayed through the real Kafka/SSE bridge" },
  { slug: "evidence", label: "Resume Evidence", blurb: "The ML findings, each backed by a reproducible artifact" },
  { slug: "replay", label: "Replay", blurb: "Model score → ranked channels → GO / REVIEW / NO-GO" },
  { slug: "governance", label: "Trust & Lineage", blurb: "Where every number comes from; refusals and audit" },
];

function DemoBridge({ envId }: { envId: string }) {
  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.faint, marginBottom: 12 }}>
        Continue the demo
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {BRIDGE.map((b) => (
          <Link key={b.slug} href={telemetryHref(envId, b.slug)}
            style={{
              display: "block", textDecoration: "none",
              background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px",
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 600, color: C.text }}>{b.label}</span>
              <span aria-hidden style={{ color: C.cyan, fontFamily: C.mono, fontSize: 14 }}>→</span>
            </div>
            <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>{b.blurb}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function TelemetryOverview() {
  const params = useParams();
  const envId = typeof params?.envId === "string"
    ? params.envId
    : Array.isArray(params?.envId) ? params.envId[0] : "";

  // Thesis-first: the dominant hero states the argument once (Big Numbers render below it as larger
  // narrative anchors, not in the header metric row), then the integrated Bottleneck Map carries it.
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
    />
  );

  return (
    <TelemetryPageShell heading={heading}>
      <BigNumbersBand />
      <BottleneckMap />
      <SourceHonestyStrip />
      {envId && <DemoBridge envId={envId} />}
    </TelemetryPageShell>
  );
}
