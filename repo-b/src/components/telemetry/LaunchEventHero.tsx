"use client";

// Selected-node hero for the Overview page. When a Bottleneck Map node is selected (by click or by the
// guided walkthrough), the page hero ADAPTS to that launch event instead of staying on the generic
// thesis. The map becomes the selector; this hero is the single explanation surface — so the lower
// per-node panel (the old EventRecord) is gone and nothing is duplicated below the map.
//
// State invariant (owned by TelemetryOverview): the hero renders whenever `selectedEvent !== null`. This
// component never decides the mode; it just renders a resolved DecoratedEvent. Every value is read off
// the typed event + EVENT_NARRATIVE — nothing is invented here. Kept compact so it fits the first
// viewport: one headline (caption), the node's KPIs, three fact cards, one slim forward line.

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { C, StatGrid, TelemetryActionButton } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";
import PresenterToggleButton from "./PresenterToggleButton";
import { RS, RS_MONO } from "./rsTokens";
import { telemetryHref } from "./telemetryNav";
import { EVENT_NARRATIVE } from "./context/BottleneckMap/data";
import type { DecoratedEvent } from "./context/BottleneckMap/types";

// The demo's through-line (same for every node) — a constant, not a per-event fact.
const DEMO_NEXT_CHAIN = "Stargate → Evidence → Replay → Trust";

function HeroKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: RS.panelAlt, border: `1px solid ${RS.line}`, borderRadius: 8, padding: "9px 11px" }}>
      <div style={{ fontFamily: RS_MONO, fontSize: 9.5, color: RS.faint, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: RS_MONO, fontSize: 13.5, color: RS.text, marginTop: 4, lineHeight: 1.3 }}>{value}</div>
    </div>
  );
}

function RecordCell({ heading, color, children, style }: {
  heading: string; color: string; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <div style={{ background: RS.panelAlt, border: `1px solid ${RS.line}`, borderRadius: 6, padding: "9px 11px", ...style }}>
      <div style={{ fontFamily: RS_MONO, fontSize: 9, color, letterSpacing: 1, textTransform: "uppercase" }}>{heading}</div>
      <div style={{ fontSize: 12, marginTop: 4, color: RS.text, lineHeight: 1.45 }}>{children}</div>
    </div>
  );
}

export default function LaunchEventHero({ event, envId, onBack, presenting, onTogglePresenter }: {
  event: DecoratedEvent;
  envId: string;
  onBack: () => void;
  presenting: boolean;
  onTogglePresenter: () => void;
}) {
  const narrative = EVENT_NARRATIVE[event.id];
  return (
    <div>
      {/* Adaptive header: eyebrow (date · vehicle · dimension), the launch name as the hero title in the
          era color, the event caption as the one-line body, and the icon-only Play/Stop + Back affordances
          in the actions slot. */}
      <TelemetryPageHeader
        variant="hero"
        accent={event.color}
        eyebrow={`${event.date} · ${event.vehicle} · ${event.dimLabel}`}
        title={event.name}
        description={event.caption}
        actions={
          <>
            <PresenterToggleButton presenting={presenting} onToggle={onTogglePresenter} />
            <TelemetryActionButton variant="secondary" onClick={onBack} aria-label="Back to overview">
              ← Back to overview
            </TelemetryActionButton>
          </>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: -8, marginBottom: 18 }}>
        {/* KPI cards — the node's own metrics replace the historical Big Numbers row. */}
        <StatGrid cols={4}>
          {event.metrics.map(([label, value]) => (
            <HeroKpi key={label} label={label} value={value} />
          ))}
        </StatGrid>

        {/* Three fact cards: what the era solved, what got harder, and the new data that had to be
            trusted. Compact 3-up on desktop. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <RecordCell heading="Bottleneck solved" color={RS.green}>{event.bottleneckSolved}</RecordCell>
          <RecordCell heading="What got harder" color={RS.amber}>{event.bottleneckCreated}</RecordCell>
          <RecordCell heading="New data to trust" color={RS.blue}>{event.dataProduct}</RecordCell>
        </div>

        {/* One slim forward line: the page that proves the pattern next + the demo through-line. Fails
            closed when envId/narrative is unavailable. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          border: `1px solid ${event.color}33`, borderLeft: `2px solid ${event.color}`,
          borderRadius: 8, background: `${event.color}0a`, padding: "8px 13px",
        }}>
          <span style={{ fontFamily: RS_MONO, fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase", color: RS.faint }}>
            Proves the pattern next
          </span>
          {narrative && envId ? (
            <Link href={telemetryHref(envId, narrative.provesNextSlug)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none",
                fontFamily: RS_MONO, fontSize: 11.5, color: C.cyan, border: `1px solid ${C.cyan}55`,
                background: `${C.cyan}12`, borderRadius: 6, padding: "4px 10px" }}>
              {narrative.provesNextLabel} →
            </Link>
          ) : (
            <span style={{ fontFamily: RS_MONO, fontSize: 10.5, color: RS.faint }}>downstream link unavailable</span>
          )}
          <span style={{ marginLeft: "auto", fontFamily: RS_MONO, fontSize: 10, color: RS.dim }}>{DEMO_NEXT_CHAIN}</span>
        </div>
      </div>
    </div>
  );
}
