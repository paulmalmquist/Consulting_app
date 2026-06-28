"use client";

// Selected-node hero for the Overview page. When a Bottleneck Map node is selected (by click or by the
// "Play the story" walkthrough), the page hero ADAPTS to that launch event instead of staying on the
// generic thesis. The map becomes the selector; this hero is the single explanation surface — so the
// lower per-node panel (the old EventRecord) is gone and nothing is duplicated below the map.
//
// State invariant (owned by TelemetryOverview): the hero renders whenever `selectedEvent !== null`. This
// component never decides the mode; it just renders a resolved DecoratedEvent. Every value is read off
// the typed event + EVENT_NARRATIVE — nothing is invented here.

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { C, StatGrid, TelemetryActionButton } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";
import { RS, RS_MONO, RS_SANS } from "./rsTokens";
import { telemetryHref } from "./telemetryNav";
import { EVENT_NARRATIVE } from "./context/BottleneckMap/data";
import type { DecoratedEvent } from "./context/BottleneckMap/types";

// Generic, event-independent forward framing (same for every node) — the demo's through-line, not a
// per-event fact, so it lives as a constant rather than in the event data.
const DEMO_NEXT_QUESTION = "Can build, test & quality evidence connect fast enough to improve the next decision?";
const DEMO_NEXT_CHAIN = "Stargate Live → Resume Evidence → Replay → Trust & Lineage";

function HeroKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: RS.panelAlt, border: `1px solid ${RS.line}`, borderRadius: 8, padding: "11px 13px" }}>
      <div style={{ fontFamily: RS_MONO, fontSize: 9.5, color: RS.faint, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: RS_MONO, fontSize: 14, color: RS.text, marginTop: 5, lineHeight: 1.35 }}>{value}</div>
    </div>
  );
}

function RecordCell({ heading, color, children, style }: {
  heading: string; color: string; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <div style={{ background: RS.panelAlt, border: `1px solid ${RS.line}`, borderRadius: 6, padding: "11px 13px", ...style }}>
      <div style={{ fontFamily: RS_MONO, fontSize: 9, color, letterSpacing: 1, textTransform: "uppercase" }}>{heading}</div>
      <div style={{ fontSize: 12.5, marginTop: 4, color: RS.text, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export default function LaunchEventHero({ event, envId, onBack }: {
  event: DecoratedEvent;
  envId: string;
  onBack: () => void;
}) {
  const narrative = EVENT_NARRATIVE[event.id];
  return (
    <div>
      {/* Adaptive header: eyebrow (date · vehicle · dimension), the launch name as the hero title in the
          era color, the event caption as the body, and a Back-to-overview affordance in the actions slot. */}
      <TelemetryPageHeader
        variant="hero"
        accent={event.color}
        eyebrow={`${event.date} · ${event.vehicle} · ${event.dimLabel}`}
        title={event.name}
        description={event.caption}
        actions={
          <TelemetryActionButton variant="secondary" onClick={onBack} aria-label="Back to overview">
            ← Back to overview
          </TelemetryActionButton>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: -8, marginBottom: 28 }}>
        {/* KPI cards — the node's own metrics replace the historical Big Numbers row. */}
        <StatGrid cols={4}>
          {event.metrics.map(([label, value]) => (
            <HeroKpi key={label} label={label} value={value} />
          ))}
        </StatGrid>

        {/* The four explanation cards (moved up from the old EventRecord). */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <RecordCell heading="What changed · bottleneck solved" color={RS.green}>{event.bottleneckSolved}</RecordCell>
          <RecordCell heading="What got harder · operational question" color={RS.amber}>{event.bottleneckCreated}</RecordCell>
          <RecordCell heading="New data that had to be trusted" color={RS.blue}>{event.dataProduct}</RecordCell>
          <RecordCell heading="What this demo shows next" color={RS.violet}
            style={{ background: `${RS.violet}10`, border: `1px solid ${RS.violet}30` }}>
            {DEMO_NEXT_QUESTION}{" "}
            <span style={{ fontFamily: RS_MONO, fontSize: 11, color: RS.dim }}>{DEMO_NEXT_CHAIN}</span>
          </RecordCell>
        </div>

        {/* Forward framing: the operational question this era created + the page that proves the pattern
            next (the optional CTA, e.g. "Mission Control →"). Fails closed when envId is unavailable. */}
        <div style={{
          border: `1px solid ${event.color}33`, borderLeft: `2px solid ${event.color}`,
          borderRadius: 9, background: `${event.color}0a`, padding: "12px 15px",
          display: "grid", gridTemplateColumns: "minmax(220px, 2fr) minmax(180px, 1fr)", gap: "11px 22px", alignItems: "start",
        }}>
          <div>
            <div style={{ fontFamily: RS_MONO, fontSize: 8.5, letterSpacing: 0.6, textTransform: "uppercase", color: RS.faint, marginBottom: 4 }}>
              Question that got harder
            </div>
            <div style={{ fontFamily: RS_SANS, fontSize: 12.5, color: RS.text, lineHeight: 1.45 }}>
              {narrative?.harderQuestion ?? "—"}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: RS_MONO, fontSize: 8.5, letterSpacing: 0.6, textTransform: "uppercase", color: RS.faint, marginBottom: 6 }}>
              Proves the pattern next
            </div>
            {narrative && envId ? (
              <Link href={telemetryHref(envId, narrative.provesNextSlug)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none",
                  fontFamily: RS_MONO, fontSize: 11.5, color: C.cyan, border: `1px solid ${C.cyan}55`,
                  background: `${C.cyan}12`, borderRadius: 6, padding: "5px 11px" }}>
                {narrative.provesNextLabel} →
              </Link>
            ) : (
              <span style={{ fontFamily: RS_MONO, fontSize: 10.5, color: RS.faint }}>downstream link unavailable</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
