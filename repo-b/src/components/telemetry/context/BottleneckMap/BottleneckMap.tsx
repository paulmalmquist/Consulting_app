"use client";

// The Spaceflight Bottleneck Map: narrative on-ramp for the telemetry environment. Every era of
// spaceflight solved the previous bottleneck and exposed a new one; the current bottleneck is
// decision velocity, a data platform problem. Four linked panels derive from one event model.
// This is a context module, not an operational view: static public data, no network calls.
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { RS, RS_MONO, RS_SANS } from "../../rsTokens";
import styles from "./BottleneckMap.module.css";
import CostPanel from "./CostPanel";
import {
  COLOR_DIMENSIONS, EVENTS, EVENTS_CHRONO, FULL_WINDOW, SIZE_MODES, YEAR_SERIES,
  eventDimension, eventDimensionKey, fmtCost,
} from "./data";
import EventRecord from "./EventRecord";
import KpiStrip from "./KpiStrip";
import MapPanel from "./MapPanel";
import MixPanel from "./MixPanel";
import PresenterBanner from "./PresenterBanner";
import type {
  ColorByKey, DecoratedEvent, FocusPanelKey, KpiSummary, LaunchEvent, SizeModeKey, TimeWindow,
} from "./types";

// The three story tabs. Keys reuse FocusPanelKey so presenter-mode dimming math stays trivial.
const TABS: { key: FocusPanelKey; label: string; accent: string }[] = [
  { key: "map", label: "Bottleneck Map", accent: RS.blue },
  { key: "cost", label: "Cost to LEO", accent: RS.amber },
  { key: "mix", label: "Who Flies: Commercial vs Government", accent: RS.green },
];

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

export default function BottleneckMap() {
  const [selectedId, setSelectedId] = useState<string | null>("terran1");
  const [chipFilter, setChipFilter] = useState<string | null>(null);
  const [sizeMode, setSizeMode] = useState<SizeModeKey>("scale");
  const [colorBy, setColorBy] = useState<ColorByKey>("type");
  const [inflationAdjusted, setInflationAdjusted] = useState(true);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(FULL_WINDOW);
  const [presenterIdx, setPresenterIdx] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<FocusPanelKey>("map");

  const presenting = presenterIdx !== null;
  const presenterEvent = presenterIdx !== null ? EVENTS_CHRONO[presenterIdx] : null;
  const presenterYear = presenterEvent ? presenterEvent.year : Infinity;
  const revealedIds = useMemo<ReadonlySet<string>>(
    () => new Set(presenting && presenterIdx !== null
      ? EVENTS_CHRONO.slice(0, presenterIdx + 1).map((e) => e.id) : []),
    [presenting, presenterIdx],
  );
  const focusPanel = presenterEvent ? presenterEvent.focusPanel : null;

  const dimension = COLOR_DIMENSIONS[colorBy];
  const windowed = timeWindow[0] !== FULL_WINDOW[0] || timeWindow[1] !== FULL_WINDOW[1];

  // While presenting, the visible tab follows the current step's focusPanel so each narration beat
  // shows its own chart; otherwise it's the user's selected tab. The tab bar hides while presenting.
  const effectiveTab: FocusPanelKey = presenting && focusPanel ? focusPanel : activeTab;

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

  // KPI strip, derived from the active window (full range while presenting).
  const kpi = useMemo<KpiSummary>(() => {
    const [y0, y1] = presenting ? FULL_WINDOW : timeWindow;
    const yrs = YEAR_SERIES.filter((d) => d.year >= y0 && d.year <= y1);
    const attempts = yrs.reduce((s, d) => s + (d.attempts || 0), 0);
    const lastReal = [...yrs].reverse().find((d) => d.commercialPct != null);
    const costYrs = yrs.filter((d) => d.costMeta);
    const key: "costAdj" | "costNominal" = inflationAdjusted ? "costAdj" : "costNominal";
    const events = EVENTS.filter((e) => e.year >= y0 && e.year <= y1 + 1).length;

    let cost = "n/a";
    let costLabel = "in window";
    if (costYrs.length > 0) {
      const first = costYrs[0];
      const last = costYrs[costYrs.length - 1];
      const firstVal = first[key];
      const lastVal = last[key];
      if (costYrs.length >= 2 && firstVal != null && lastVal != null) {
        cost = `${fmtCost(firstVal)} -> ${fmtCost(lastVal)}`;
        if (first.costMeta && last.costMeta) costLabel = `${first.costMeta.v} to ${last.costMeta.v}`;
      } else if (firstVal != null) {
        cost = fmtCost(firstVal);
      }
    }

    return {
      window: `${y0} - ${y1}`,
      attempts: attempts.toLocaleString(),
      share: lastReal?.commercialPct != null ? `${Math.round(lastReal.commercialPct)}%` : "n/a",
      shareYear: lastReal ? lastReal.year : null,
      cost, costLabel, events,
    };
  }, [timeWindow, inflationAdjusted, presenting]);

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
  const onBrush = useCallback(({ startIndex, endIndex }: { startIndex?: number; endIndex?: number }) => {
    if (startIndex == null || endIndex == null) return;
    const y0 = YEAR_SERIES[startIndex]?.year ?? FULL_WINDOW[0];
    const y1 = YEAR_SERIES[endIndex]?.year ?? FULL_WINDOW[1];
    setTimeWindow([y0, y1]);
  }, []);

  const presenterAccent = presenterEvent ? eventDimension(presenterEvent, colorBy).color : RS.blue;

  return (
    <div style={{ fontFamily: RS_SANS, color: RS.text }}>
      {/* presenter toggle — the thesis lives once in the page header above */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <button type="button" className={styles.control}
          aria-label={presenting ? "Exit presenter mode" : "Enter presenter mode"}
          aria-pressed={presenting}
          onClick={() => setPresenterIdx(presenting ? null : 0)}
          style={{
            background: presenting ? `${RS.red}22` : `${RS.blue}22`,
            border: `1px solid ${presenting ? RS.red : RS.blue}`,
            color: presenting ? RS.red : RS.blue,
            borderRadius: 6, padding: "8px 14px", cursor: "pointer",
            fontFamily: RS_MONO, fontSize: 11, letterSpacing: 0.5, whiteSpace: "nowrap",
          }}>
          {presenting ? "Exit (Esc)" : "Present (P)"}
        </button>
      </div>

      {/* presenter banner */}
      {presenting && presenterEvent && presenterIdx !== null && (
        <PresenterBanner event={presenterEvent} accent={presenterAccent}
          idx={presenterIdx} total={EVENTS_CHRONO.length}
          onPrev={() => setPresenterIdx((i) => Math.max((i ?? 0) - 1, 0))}
          onNext={() => setPresenterIdx((i) => Math.min((i ?? 0) + 1, EVENTS_CHRONO.length - 1))} />
      )}

      <KpiStrip kpi={kpi} presenting={presenting} windowed={windowed} inflationAdjusted={inflationAdjusted} />

      {/* tabbed story module: tab bar (hidden while presenting) + per-tab controls */}
      {!presenting && (
        <div style={{ marginTop: 16 }}>
          <div role="tablist" aria-label="Launch-history charts"
            style={{ display: "flex", gap: 0, borderBottom: `1px solid ${RS.line}`, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" className={styles.control}
                aria-selected={effectiveTab === t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  background: "transparent", border: "none",
                  borderBottom: `2px solid ${effectiveTab === t.key ? t.accent : "transparent"}`,
                  color: effectiveTab === t.key ? RS.text : RS.faint,
                  padding: "9px 16px", marginBottom: -1, cursor: "pointer", whiteSpace: "nowrap",
                  fontFamily: RS_MONO, fontSize: 11.5, letterSpacing: 0.4,
                }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 4px", alignItems: "center", minHeight: 32 }}>
            {effectiveTab === "map" && (
              <>
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
              </>
            )}
            {effectiveTab === "cost" && (
              <>
                <button type="button" className={styles.control}
                  aria-label="Emphasize inflation-adjusted cost"
                  aria-pressed={inflationAdjusted}
                  onClick={() => setInflationAdjusted(!inflationAdjusted)}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    background: inflationAdjusted ? `${RS.amber}18` : "transparent",
                    border: `1px solid ${inflationAdjusted ? RS.amber : RS.line}`,
                    borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                    color: inflationAdjusted ? RS.amber : RS.faint,
                    fontFamily: RS_MONO, fontSize: 9.5, letterSpacing: 0.3,
                  }}>
                  <span style={{ width: 22, height: 12, borderRadius: 999, position: "relative",
                    background: inflationAdjusted ? RS.amber : RS.line, transition: "background 0.15s" }}>
                    <span style={{ position: "absolute", top: 1.5, left: inflationAdjusted ? 11.5 : 1.5,
                      width: 9, height: 9, borderRadius: "50%", background: RS.bg, transition: "left 0.15s" }} />
                  </span>
                  Inflation adjusted (2025 $)
                </button>
                {windowed && (
                  <button type="button" className={styles.control}
                    onClick={() => setTimeWindow(FULL_WINDOW)}
                    style={{ background: "transparent", border: `1px solid ${RS.line}`, color: RS.dim,
                      borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: RS_MONO, fontSize: 9.5 }}>
                    Reset window
                  </button>
                )}
              </>
            )}
            {effectiveTab === "mix" && windowed && (
              <button type="button" className={styles.control}
                onClick={() => setTimeWindow(FULL_WINDOW)}
                style={{ background: "transparent", border: `1px solid ${RS.line}`, color: RS.dim,
                  borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: RS_MONO, fontSize: 9.5 }}>
                Reset window
              </button>
            )}
          </div>
        </div>
      )}

      {/* one large tabbed panel — only the active tab renders, full width + tall */}
      <div style={{ marginTop: 12 }}>
        {effectiveTab === "map" && (
          <MapPanel events={mapEvents} selectedId={selected?.id ?? null}
            presenting={presenting} revealedIds={revealedIds} presenterYear={presenterYear}
            timeWindow={windowed ? timeWindow : null} hoveredYear={hoveredYear}
            sizeModeLabel={SIZE_MODES.find((m) => m.key === sizeMode)?.label ?? ""}
            focused={focusPanel === "map"} dimmed={presenting && focusPanel !== "map"}
            onHoverYear={onHoverYear} onSelect={onSelect} />
        )}
        {effectiveTab === "cost" && (
          <CostPanel inflationAdjusted={inflationAdjusted} hoveredYear={hoveredYear}
            focused={focusPanel === "cost"} dimmed={presenting && focusPanel !== "cost"}
            onHoverYear={onHoverYear} />
        )}
        {effectiveTab === "mix" && (
          <MixPanel hoveredYear={hoveredYear}
            focused={focusPanel === "mix"} dimmed={presenting && focusPanel !== "mix"}
            onHoverYear={onHoverYear} onBrush={onBrush} />
        )}
      </div>

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
