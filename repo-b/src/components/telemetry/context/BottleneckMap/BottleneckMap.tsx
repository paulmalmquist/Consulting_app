"use client";

// The Spaceflight Bottleneck Map: narrative on-ramp for the telemetry environment. Every era of
// spaceflight solved the previous bottleneck and exposed a new one; the current bottleneck is
// decision velocity, a data platform problem. Four linked panels derive from one event model.
// This is a context module, not an operational view: static public data, no network calls.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RS, RS_MONO, RS_SANS } from "../../rsTokens";
import styles from "./BottleneckMap.module.css";
import {
  COLOR_DIMENSIONS, EVENTS, EVENTS_CHRONO, SIZE_MODES,
  eventDimension, eventDimensionKey,
} from "./data";
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

export default function BottleneckMap(
  { envId, onSelectedEventChange, selectedId: selectedIdProp, onSelectNode, resetSignal,
    onPresentingChange, presenterToggleSignal }: {
    envId?: string;
    /** Phase 9B: surface the selected/presented event so the Overview can drive its hero backdrop. */
    onSelectedEventChange?: (e: DecoratedEvent | null) => void;
    /** Controlled clicked-node selection (lifted to the Overview page). */
    selectedId?: string | null;
    /** Set the clicked-node selection (null clears). Presence of this makes the map controlled. */
    onSelectNode?: (id: string | null) => void;
    /** Bump this from the parent to fully reset — stops the walkthrough AND clears the selection. */
    resetSignal?: number;
    /** Emits whether the guided walkthrough is running, so the parent can render Play vs Stop. */
    onPresentingChange?: (presenting: boolean) => void;
    /** Bump from the parent to toggle the walkthrough on/off (the map owns the step index). */
    presenterToggleSignal?: number;
  } = {},
) {
  // Hybrid controlled/uncontrolled: when the parent passes `onSelectNode` the page owns selection (and may
  // pass null → overview, with NO terran1 fallback); standalone the module keeps its own default pin.
  const isControlled = onSelectNode !== undefined;
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>("terran1");
  const selectedId = isControlled ? (selectedIdProp ?? null) : internalSelectedId;
  const [chipFilter, setChipFilter] = useState<string | null>(null);
  const [sizeMode, setSizeMode] = useState<SizeModeKey>("scale");
  const [colorBy, setColorBy] = useState<ColorByKey>("type");
  const [presenterIdx, setPresenterIdx] = useState<number | null>(null);

  const setSelected = useCallback((id: string | null) => {
    if (isControlled) onSelectNode!(id);
    else setInternalSelectedId(id);
  }, [isControlled, onSelectNode]);

  // The single full reset: stop the presenter walkthrough AND clear the clicked selection. After this the
  // resolved `selected` becomes null and onSelectedEventChange emits null exactly once — the presenter
  // event is never re-emitted into the hero.
  const clearAll = useCallback(() => {
    setPresenterIdx(null);
    setSelected(null);
  }, [setSelected]);

  // Parent-driven reset (e.g. the hero's "Back to overview"). Fire only on an actual change of resetSignal
  // so a stable-deps re-render can never clobber a fresh selection.
  const prevResetSignal = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal !== prevResetSignal.current) {
      prevResetSignal.current = resetSignal;
      clearAll();
    }
  }, [resetSignal, clearAll]);

  const presenting = presenterIdx !== null;

  // Lifted presenter control. The map owns the step index; the parent renders the icon-only Play/Stop in
  // the hero header and drives it through two thin channels (mirrors the resetSignal pattern):
  //   - onPresentingChange tells the parent which icon to show.
  //   - presenterToggleSignal (a bumped counter) flips the walkthrough on/off here.
  useEffect(() => { onPresentingChange?.(presenting); }, [presenting, onPresentingChange]);
  const prevToggleSignal = useRef(presenterToggleSignal);
  useEffect(() => {
    if (presenterToggleSignal !== prevToggleSignal.current) {
      prevToggleSignal.current = presenterToggleSignal;
      setPresenterIdx((i) => (i === null ? 0 : null));
    }
  }, [presenterToggleSignal]);

  const presenterEvent = presenterIdx !== null ? EVENTS_CHRONO[presenterIdx] : null;
  const presenterYear = presenterEvent ? presenterEvent.year : Infinity;
  const revealedIds = useMemo<ReadonlySet<string>>(
    () => new Set(presenting && presenterIdx !== null
      ? EVENTS_CHRONO.slice(0, presenterIdx + 1).map((e) => e.id) : []),
    [presenting, presenterIdx],
  );
  // Presenter still steps event-by-event (the guided walkthrough), but every step lands on the one
  // integrated chart now — there is no per-step panel switch.

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

  // Surface the active event to the parent (Overview hero backdrop). Additive and optional — fires on
  // mount and on every click/presenter change.
  useEffect(() => { onSelectedEventChange?.(selected); }, [selected, onSelectedEventChange]);


  // Presenter keyboard controls. Never captures keys when focus is inside a form field, and never
  // shadows browser shortcuts (Cmd/Ctrl+P print).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((ev.key === "p" || ev.key === "P") && !presenting) { setPresenterIdx(0); return; }
      // Escape clears a click-selection back to overview (the presenter Escape path is below).
      if (ev.key === "Escape" && !presenting) { if (selectedId) setSelected(null); return; }
      if (!presenting) return;
      if (ev.key === "ArrowRight") setPresenterIdx((i) => Math.min((i ?? 0) + 1, EVENTS_CHRONO.length - 1));
      if (ev.key === "ArrowLeft") setPresenterIdx((i) => Math.max((i ?? 0) - 1, 0));
      if (ev.key === "Escape") setPresenterIdx(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, selectedId, setSelected]);

  // Clicking the already-selected node toggles back to overview.
  const onSelect = useCallback((id: string) => setSelected(selectedId === id ? null : id), [selectedId, setSelected]);

  const presenterAccent = presenterEvent ? eventDimension(presenterEvent, colorBy).color : RS.blue;

  return (
    <div style={{ fontFamily: RS_SANS, color: RS.text, background: "#000", borderRadius: 10, padding: "12px 14px" }}>
      {/* Play/Stop now lives as an icon-only control in the page hero header (lifted to TelemetryOverview);
          the map just owns the step index. Keyboard P/←/→/Esc still drive the walkthrough. */}

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
          timeWindow={null}
          sizeModeLabel={SIZE_MODES.find((m) => m.key === sizeMode)?.label ?? ""}
          focused dimmed={false}
          onSelect={onSelect} />
      </div>

      {/* The selected node's full story + "Back to overview" live in the page hero above; no duplicate
          orientation strip here. */}

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
