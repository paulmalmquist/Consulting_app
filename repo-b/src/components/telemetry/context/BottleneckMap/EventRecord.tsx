"use client";

// Panel 4: the pinned event record. Re-keyed by event id so each pin fades in; minHeight damps
// layout shift while presenter mode steps through events of varying detail length.
import React from "react";

import { RS, RS_MONO } from "../../rsTokens";
import styles from "./BottleneckMap.module.css";
import type { DecoratedEvent, FocusPanelKey } from "./types";

function RecordCell({ heading, color, children, style }: {
  heading: string; color: string; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={{ background: RS.panelAlt, border: `1px solid ${RS.line}`, borderRadius: 6,
      padding: "10px 12px", ...style }}>
      <div style={{ fontFamily: RS_MONO, fontSize: 9, color, letterSpacing: 1, textTransform: "uppercase" }}>{heading}</div>
      <div style={{ fontSize: 12.5, marginTop: 3 }}>{children}</div>
    </div>
  );
}

export default function EventRecord({ event, presenting, focusPanel }: {
  event: DecoratedEvent;
  presenting: boolean;
  focusPanel: FocusPanelKey | null;
}) {
  return (
    <div key={event.id} className={`${styles.fade} grid grid-cols-1 lg:grid-cols-2 gap-5`} style={{
      background: RS.panel, border: `1px solid ${event.color}33`,
      borderLeft: `3px solid ${event.color}`,
      borderRadius: 6, padding: 20, marginTop: 10, minHeight: 320,
      opacity: presenting && focusPanel !== "map" ? 0.95 : 1,
    }}>
      <div>
        <div style={{ fontFamily: RS_MONO, fontSize: 10, letterSpacing: 1.5, color: event.color, textTransform: "uppercase" }}>
          {event.date} · {event.vehicle} · {event.dimLabel}
        </div>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: "6px 0 8px", color: RS.text }}>{event.name}</h2>
        <p style={{ color: RS.dim, fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>{event.detail}</p>
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {event.metrics.map(([k, v]) => (
            <div key={k} style={{ background: RS.panelAlt, border: `1px solid ${RS.line}`, borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ fontFamily: RS_MONO, fontSize: 9, color: RS.faint, letterSpacing: 1, textTransform: "uppercase" }}>{k}</div>
              <div style={{ fontSize: 12, color: RS.text, marginTop: 2, fontFamily: RS_MONO }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <RecordCell heading="Bottleneck solved" color={RS.green}>{event.bottleneckSolved}</RecordCell>
        <RecordCell heading="New bottleneck created" color={RS.amber}>{event.bottleneckCreated}</RecordCell>
        <RecordCell heading="Data product implied" color={RS.blue}>{event.dataProduct}</RecordCell>
        <RecordCell heading="What this rhymes with" color={event.color}
          style={{ background: `${event.color}10`, border: `1px solid ${event.color}30` }}>
          <span style={{ fontStyle: "italic", color: RS.text }}>{event.rhyme}</span>
        </RecordCell>
      </div>
    </div>
  );
}
