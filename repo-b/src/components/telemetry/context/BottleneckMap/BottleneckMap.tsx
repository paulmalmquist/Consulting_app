"use client";

// The Spaceflight Bottleneck Map: narrative on-ramp for the telemetry environment. Every era of
// spaceflight solved the previous bottleneck and exposed a new one; the current bottleneck is
// decision velocity, a data platform problem. Four linked panels derive from one event model.
// This is a context module, not an operational view: static public data, no network calls.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { RS, RS_MONO, RS_SANS } from "../../rsTokens";
import { telemetryHref } from "../../telemetryNav";
import styles from "./BottleneckMap.module.css";
import {
  COLOR_DIMENSIONS, EVENT_NARRATIVE, EVENTS, EVENTS_CHRONO, SIZE_MODES,
  eventDimension, eventDimensionKey,
} from "./data";
import EventRecord from "./EventRecord";
import MapPanel from "./MapPanel";
import PresenterBanner from "./PresenterBanner";
import type {
  ColorByKey, DecoratedEvent, LaunchEvent, SizeModeKey,
} from "./types";

// One integrated thesis chart. The standalone "Cost to LEO" and "Who Flies" tabs were retired: cost
// lives as a Big Number on the Overview, and the commercial-share wave is folded into the Bottleneck
// Map as a contextual underlay. A single hero chart reads as one argument, not three widgets.
// TODO(P2 backlog): deep-link state (selected event and toggles) into the URL query string for
// shareable demo states.

function decorate(e: LaunchEvent, colorBy: ColorByKey, sizeMode: SizeModeKey): DecoratedEvent {
  const d = eventDimension(e, colorBy);
  return {
    ...e,
    sizeValue: sizeMode === "payload" ? Math.max(2, e.payloadT) : e.scale,
    color: d.color,
    dimLabel: d.label,
  };
}

// One framing line in the selected-event narrative strip.
function NarrLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: RS_MONO, fontSize: 8.5, letterSpacing: 0.6, textTransform: "uppercase", color: RS.faint, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontFamily: RS_SANS, fontSize: 12.5, color: RS.text, lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}

export default function BottleneckMap({ envId }: { envId?: string }) {
  const [selectedId, setSelectedId] = useState<string | null>("terran1");
  const [chipFilter, setChipFilter] = useState<string | null>(null);
  const [sizeMode, setSizeMode] = useState<SizeModeKey>("scale");
  const [colorBy, setColorBy] = useState<ColorByKey>("type");
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const [presenterIdx, setPresenterIdx] = useState<number | null>(null);

  const presenting = presenterIdx !== null;
  const presenterEvent = presenterIdx !== null ? EVENTS_CHRONO[presenterIdx] : null;
  const presenterYear = presenterEvent ? presenterEvent.year : Infinity;
  const revealedIds = useMemo<ReadonlySet<string>>(
    () => new Set(presenting && presenterIdx !== null
      ? EVENTS_CHRONO.slice(0, presenterIdx + 1).map((e) => e.id) : []),
    [presenting, presenterIdx],
  );
  // Presenter still steps event-by-event (the guided walkthrough), but every step lands on the one
  // integrated chart now — there is no per-step panel switch.
  const focusPanel = presenterEvent ? presenterEvent.focusPanel : null;

  const dimension = COLOR_DIMENSIONS[colorBy];

  // Bubbles: resolve color/label for the active dimension; chip filter applies outside presenter mode.
  const mapEvents = useMemo<DecoratedEvent[]>(() => {
    const evs = !presenting && chipFilter
      ? EVENTS.filter((e) => eventDimensionKey(e, colorBy) === chipFilter)
      : EVENTS;
    return evs.map((e) => decorate(e, colorBy, sizeMode));
  }, [chipFilter, colorBy, sizeMode, presenting]);

  const selected = useMemo<DecoratedEvent | null>(() => {
    const base = presenting ? presenterEvent : EVENTS.find((e) => e.id === selectedId) ?? null;
    return base ? decorate(base, colorBy, sizeMode) : null;
  }, [selectedId, presenting, presenterEvent, colorBy, sizeMode]);


  // Presenter keyboard controls. Never captures keys when focus is inside a form field, and never
  // shadows browser shortcuts (Cmd/Ctrl+P print).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((ev.key === "p" || ev.key === "P") && !presenting) { setPresenterIdx(0); return; }
      if (!presenting) return;
      if (ev.key === "ArrowRight") setPresenterIdx((i) => Math.min((i ?? 0) + 1, EVENTS_CHRONO.length - 1));
      if (ev.key === "ArrowLeft") setPresenterIdx((i) => Math.max((i ?? 0) - 1, 0));
      if (ev.key === "Escape") setPresenterIdx(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting]);

  const onHoverYear = useCallback((y: number | null) => setHoveredYear(y), []);
  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  const presenterAccent = presenterEvent ? eventDimension(presenterEvent, colorBy).color : RS.blue;

  return (
    <div style={{ fontFamily: RS_SANS, color: RS.text }}>
      {/* Play / Stop — a guided story walkthrough that steps through the eras (orbit proof → lower cost →
          reuse → manufacturing scale → telemetry/data operations → continue to Stargate/Evidence). The
          thesis itself lives once in the page header above. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <button type="button" className={styles.control}
          aria-label={presenting ? "Stop walkthrough" : "Play guided walkthrough"}
          aria-pressed={presenting}
          onClick={() => setPresenterIdx(presenting ? null : 0)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: presenting ? `${RS.red}22` : `${RS.green}1f`,
            border: `1px solid ${presenting ? RS.red : RS.green}`,
            color: presenting ? RS.red : RS.green,
            borderRadius: 999, padding: "8px 18px", cursor: "pointer",
            fontFamily: RS_MONO, fontSize: 11.5, letterSpacing: 0.6, whiteSpace: "nowrap",
          }}>
          <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>{presenting ? "■" : "▶"}</span>
          {presenting ? "Stop (Esc)" : "Play the story"}
        </button>
      </div>

      {/* presenter banner */}
      {presenting && presenterEvent && presenterIdx !== null && (
        <PresenterBanner event={presenterEvent} accent={presenterAccent}
          idx={presenterIdx} total={EVENTS_CHRONO.length}
          onPrev={() => setPresenterIdx((i) => Math.max((i ?? 0) - 1, 0))}
          onNext={() => setPresenterIdx((i) => Math.min((i ?? 0) + 1, EVENTS_CHRONO.length - 1))} />
      )}

      {/* single hero chart — map controls (chips + color/size toggles); hidden while the story plays */}
      {!presenting && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0 4px", alignItems: "center", minHeight: 32 }}>
          {Object.entries(dimension.lookup).map(([key, v]) => (
            <button key={key} type="button" className={styles.control}
              aria-pressed={chipFilter === key}
              onClick={() => setChipFilter(chipFilter === key ? null : key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: chipFilter === key ? `${v.color}22` : "transparent",
                border: `1px solid ${chipFilter === key ? v.color : RS.line}`,
                borderRadius: 999, padding: "4px 10px", cursor: "pointer",
                color: chipFilter === key ? v.color : RS.dim,
                fontFamily: RS_MONO, fontSize: 10, letterSpacing: 0.5,
                opacity: chipFilter && chipFilter !== key ? 0.45 : 1,
              }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.color }} />
              {v.label}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", border: `1px solid ${RS.line}`, borderRadius: 6, overflow: "hidden" }}>
              {(Object.keys(COLOR_DIMENSIONS) as ColorByKey[]).map((key) => (
                <button key={key} type="button" className={styles.control}
                  aria-pressed={colorBy === key}
                  onClick={() => { setColorBy(key); setChipFilter(null); }}
                  style={{
                    background: colorBy === key ? RS.barFill : "transparent",
                    color: colorBy === key ? RS.text : RS.faint,
                    border: "none", padding: "5px 10px", cursor: "pointer",
                    fontFamily: RS_MONO, fontSize: 9.5, letterSpacing: 0.3,
                  }}>
                  {COLOR_DIMENSIONS[key].label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", border: `1px solid ${RS.line}`, borderRadius: 6, overflow: "hidden" }}>
              {SIZE_MODES.map((m) => (
                <button key={m.key} type="button" className={styles.control} title={m.note}
                  aria-pressed={sizeMode === m.key}
                  onClick={() => setSizeMode(m.key)}
                  style={{
                    background: sizeMode === m.key ? RS.barFill : "transparent",
                    color: sizeMode === m.key ? RS.text : RS.faint,
                    border: "none", padding: "5px 10px", cursor: "pointer",
                    fontFamily: RS_MONO, fontSize: 9.5, letterSpacing: 0.3,
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* one large integrated hero chart — the Bottleneck Map with the commercial-share underlay */}
      <div style={{ marginTop: 12 }}>
        <MapPanel events={mapEvents} selectedId={selected?.id ?? null}
          presenting={presenting} revealedIds={revealedIds} presenterYear={presenterYear}
          timeWindow={null} hoveredYear={hoveredYear}
          sizeModeLabel={SIZE_MODES.find((m) => m.key === sizeMode)?.label ?? ""}
          focused dimmed={false}
          onHoverYear={onHoverYear} onSelect={onSelect} />
      </div>

      {/* selected-event framing strip: the two questions the record below does not answer — the
          operational question this era created, and which downstream page proves the pattern next. The
          bottleneck solved and the new data burden are in the event record (the relay cells) just below;
          this strip carries the forward-looking framing without repeating them. */}
      {selected && (() => {
        const n = EVENT_NARRATIVE[selected.id];
        return (
          <div style={{ marginTop: 14, border: `1px solid ${selected.color}33`, borderLeft: `2px solid ${selected.color}`,
            borderRadius: 9, background: `${selected.color}0a`, padding: "12px 15px" }}>
            <div style={{ fontFamily: RS_MONO, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase", color: RS.faint, marginBottom: 10 }}>
              {selected.name} — the operational question this era created
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) minmax(180px, 1fr)", gap: "11px 22px", alignItems: "start" }}>
              <NarrLine label="Question that got harder" value={n?.harderQuestion ?? "—"} />
              <div>
                <div style={{ fontFamily: RS_MONO, fontSize: 8.5, letterSpacing: 0.6, textTransform: "uppercase", color: RS.faint, marginBottom: 5 }}>
                  Proves the pattern next
                </div>
                {n && envId ? (
                  <Link href={telemetryHref(envId, n.provesNextSlug)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none",
                      fontFamily: RS_MONO, fontSize: 11.5, color: RS.cyan, border: `1px solid ${RS.cyan}55`,
                      background: `${RS.cyan}12`, borderRadius: 6, padding: "5px 11px" }}>
                    {n.provesNextLabel} →
                  </Link>
                ) : (
                  <span style={{ fontFamily: RS_MONO, fontSize: 10.5, color: RS.faint }}>downstream link unavailable</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* panel 4: pinned event record */}
      {selected && <EventRecord event={selected} presenting={presenting} focusPanel={focusPanel} />}

      {/* methodology footer (verbatim; the module makes no domain-expertise claims) */}
      <div style={{ marginTop: 12, fontFamily: RS_MONO, fontSize: 9.5, color: RS.faint, lineHeight: 1.6 }}>
        Cadence basis: annual orbital launch attempts (Wikipedia yearly spaceflight series / GCAT); pre-2000 values
        are close approximations, 2018-2025 are exact. Commercial share: 2022-2025 reported, earlier anchors are
        coarse estimates. Cost basis: per-launch sticker or marginal price divided by LEO capacity, one consistent
        basis; inflation adjustment uses approximate CPI multipliers to 2025 dollars. Shuttle program-averaged cost
        is ~3x its marginal figure. Terran R price point is a 2022 company statement and may not be current.
        Relativity Space figures are company-stated. This is a context and narrative module; it makes no
        domain-expertise claims.
      </div>
    </div>
  );
}
