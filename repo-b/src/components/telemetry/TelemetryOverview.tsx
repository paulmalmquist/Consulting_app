"use client";

// Overview — the opening-argument page. A dominant editorial hero header states the idea once, then a
// large "Big Numbers" band of historical anchors, then the Spaceflight Bottleneck Map as ONE integrated
// thesis chart (hardware limits → data limits, with the commercial-share wave folded in as a contextual
// underlay). Closes with a source-honesty strip and a bridge into the rest of the demo. Static
// public-data context module — no serving API, no KPI dashboard strip, no lineage CTA here.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { C, TelemetryPageShell } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";
import { MetricInspectorDrawer } from "./drawerPrimitives";
import { SourceRowsTable } from "./drill";
import { telemetryHref } from "./telemetryNav";
import BottleneckMap from "./context/BottleneckMap/BottleneckMap";
import LaunchEventHero from "./LaunchEventHero";
import OverviewBackdrop from "./OverviewBackdrop";
import PresenterToggleButton from "./PresenterToggleButton";
import { computeBigNumbers, type BigNumber, type BigNumberAccent } from "./context/BottleneckMap/data";
import type { DecoratedEvent } from "./context/BottleneckMap/types";

// Big Numbers accent → C palette. Rendered locally (not via the shared header metric row) so the
// numerals can be materially larger narrative anchors without touching the shared header component.
function accentColor(a: BigNumberAccent): string {
  return a === "share" ? C.green : a === "cost" ? C.amber : C.text;
}

// Large editorial Big Numbers — historical context anchors, not operating KPIs. Bigger numerals +
// cleaner uppercase labels than the old inline header metric row.
function BigNumbersBand({ onDrill }: { onDrill: (b: BigNumber) => void }) {
  const numbers = computeBigNumbers();
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: "20px 40px", margin: "4px 0 30px",
      borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "22px 0",
    }}>
      {numbers.map((b) => (
        <button key={b.label} type="button" onClick={() => onDrill(b)}
          aria-label={`${b.label}: ${b.value} — inspect source`}
          style={{ display: "block", textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.faint, marginBottom: 8 }}>
            {b.label} <span aria-hidden style={{ color: C.faint, fontSize: 12 }}>›</span>
          </div>
          <div style={{ fontFamily: C.mono, fontWeight: 700, fontSize: "clamp(2rem, 4.4vw, 2.85rem)", lineHeight: 1, letterSpacing: "-0.02em", color: accentColor(b.accent) }}>
            {b.value}
          </div>
          {b.sub && <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 7 }}>{b.sub}</div>}
        </button>
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
  { slug: "stream", label: "Mission Control", blurb: "Live channel strips, anomalies, and the GO / REVIEW / NO-GO verdict" },
  { slug: "replay", label: "Replay", blurb: "Model score → ranked channels → GO / REVIEW / NO-GO" },
  { slug: "evidence", label: "Evidence", blurb: "The ML findings, each backed by a reproducible artifact" },
  { slug: "metric-lineage", label: "Metric Lineage", blurb: "Where every number comes from — the governed metric catalog" },
  { slug: "model-performance", label: "Model Performance", blurb: "Champions, honest metrics, and the promotion gate" },
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
  const [drillNum, setDrillNum] = useState<BigNumber | null>(null);
  // Selection state lives on the page (the map is a controlled selector). State invariant:
  //   - `selectedEvent` is the resolved display event — it drives BOTH the hero and the backdrop, so it
  //     tracks clicks AND presenter steps. The hero branches on this, never on `selectedId`.
  //   - `selectedId` is the clicked-node control value passed down to the map (default null → overview).
  //   - `resetSignal` is a command channel: bumping it tells the map to stop the walkthrough AND clear
  //     its selection, so "Back to overview" works even mid-walkthrough.
  const [selectedEvent, setSelectedEvent] = useState<DecoratedEvent | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  // Presenter (guided walkthrough) is owned by the map; the hero header renders the icon-only Play/Stop.
  //   - `presenting` (mirrored up via onPresentingChange) chooses the Play vs Stop icon.
  //   - bumping `presenterToggleSignal` flips the walkthrough on/off in the map.
  const [presenting, setPresenting] = useState(false);
  const [presenterToggleSignal, setPresenterToggleSignal] = useState(0);
  const togglePresenter = () => setPresenterToggleSignal((s) => s + 1);

  // Back to overview: clear the hero immediately (deterministic) and signal the map to stop presenter +
  // deselect, so it cannot re-emit a presenter event back into the hero.
  const handleBack = () => {
    setSelectedId(null);
    setSelectedEvent(null);
    setResetSignal((s) => s + 1);
  };

  // Two-mode hero. Overview: the thesis states the argument once (Big Numbers render below as larger
  // anchors). Selected: the hero ADAPTS to the chosen launch event (the map is the selector).
  const heading = selectedEvent ? (
    <LaunchEventHero event={selectedEvent} envId={envId} onBack={handleBack}
      presenting={presenting} onTogglePresenter={togglePresenter} />
  ) : (
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
      actions={<PresenterToggleButton presenting={presenting} onToggle={togglePresenter} />}
    />
  );

  return (
    <div style={{ position: "relative" }}>
      {/* Era backdrop sits behind the hero band only; the scrim fades to C.bg before the chart. */}
      <OverviewBackdrop event={selectedEvent} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <TelemetryPageShell heading={heading}>
          {/* Historical Big Numbers anchor the overview; in selected mode the node's own KPIs live in the
              hero, so this row is replaced rather than duplicated. */}
          {!selectedEvent && <BigNumbersBand onDrill={setDrillNum} />}
          <BottleneckMap envId={envId} onSelectedEventChange={setSelectedEvent}
            selectedId={selectedId} onSelectNode={setSelectedId} resetSignal={resetSignal}
            onPresentingChange={setPresenting} presenterToggleSignal={presenterToggleSignal} />
          <SourceHonestyStrip />
          {envId && <DemoBridge envId={envId} />}
          <MetricInspectorDrawer
        open={drillNum !== null}
        onClose={() => setDrillNum(null)}
        title={drillNum?.label ?? ""}
        description={drillNum ? `${drillNum.value} — a curated public-data anchor, not operational telemetry.` : ""}
        fields={drillNum ? [
          { label: "Value", value: drillNum.value },
          { label: "Source kind", value: "fixture — curated public data" },
          { label: "Source", value: drillNum.drill.sourceLabel },
          { label: "Note", value: drillNum.drill.note },
        ] : []}
      >
        {drillNum && (
          <div style={{ marginTop: 14 }}>
            <SourceRowsTable
              kind={drillNum.drill.sourceKind}
              columns={drillNum.drill.columns}
              rows={drillNum.drill.rows}
              sourceLabel={drillNum.drill.sourceLabel}
              nullReason={drillNum.drill.nullReason}
              exportName={`telemetry_overview_${drillNum.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`}
            />
          </div>
        )}
      </MetricInspectorDrawer>
        </TelemetryPageShell>
      </div>
    </div>
  );
}
