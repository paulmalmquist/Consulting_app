"use client";

import type { RhymesMatchResponse, TopAnalog } from "@/lib/historyrhymes/rhymesClient";
import { C, Tag, DegradedNote, CockpitEmptyState, Loading } from "./primitives";

// Zone 3 — the historical analog timeline, the cockpit's centerpiece.
// Each analog renders as a horizontal track: rank, episode name, a start-year
// marker on a shared year axis, the rhyme-score bar, and the score components
// in mono microtext. Honesty anchors: is_non_event renders explicitly,
// dtw renders "n/a (v1)" not blank, and an empty analog list shows the
// backend degraded_reason verbatim plus the refusal line.

const AXIS_START = 1900;

export const REFUSAL_LINE = "The system refuses to force a rhyme.";

export interface AnalogTimelineProps {
  match: RhymesMatchResponse | null;
  loading?: boolean;
  onOpenEvidence?: (analog: TopAnalog) => void;
}

function yearPercent(year: number): number {
  const now = new Date().getFullYear();
  const clamped = Math.min(now, Math.max(AXIS_START, year));
  return ((clamped - AXIS_START) / (now - AXIS_START)) * 100;
}

function AnalogTrack({ analog, onOpenEvidence }: { analog: TopAnalog; onOpenEvidence?: (a: TopAnalog) => void }) {
  const pct = yearPercent(analog.episode_start_year);
  return (
    <button
      type="button"
      data-testid={`hr-analog-track-${analog.rank}`}
      onClick={onOpenEvidence ? () => onOpenEvidence(analog) : undefined}
      style={{ display: "block", width: "100%", textAlign: "left", background: C.panel,
        border: `1px solid ${C.border}`, borderRadius: 9, padding: "12px 14px",
        cursor: onOpenEvidence ? "pointer" : "default" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>#{analog.rank}</span>
          <span style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 600, color: C.text }}>
            {analog.episode_name}
          </span>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.accent }}>{analog.episode_start_year}</span>
          {analog.is_non_event && <Tag color={C.dim}>non-event</Tag>}
        </div>
        <span data-testid={`hr-rhyme-score-${analog.rank}`}
          style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.accent }}>
          rhyme {analog.rhyme_score.toFixed(4)}
        </span>
      </div>

      {/* Shared year axis with the episode's start-year marker. */}
      <div style={{ position: "relative", height: 6, background: C.panelHi, borderRadius: 3, margin: "10px 0 6px" }}>
        <span style={{ position: "absolute", left: `${pct}%`, top: -2, width: 10, height: 10,
          marginLeft: -5, borderRadius: 999, background: C.accent, boxShadow: `0 0 8px ${C.accent}66` }} />
        {/* Rhyme-score bar under the axis, width = score. */}
        <span style={{ position: "absolute", left: 0, top: 0, height: 6, borderRadius: 3,
          width: `${Math.min(100, Math.max(0, analog.rhyme_score * 100))}%`,
          background: `${C.accent}33`, border: `1px solid ${C.accent}55` }} />
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontFamily: C.mono, fontSize: 10, color: C.dim }}>
        <span>cosine {analog.cosine.toFixed(3)}</span>
        <span data-testid={`hr-analog-dtw-${analog.rank}`}>
          dtw {analog.dtw == null ? "n/a (v1)" : analog.dtw.toFixed(3)}
        </span>
        <span>categorical {analog.categorical.toFixed(2)}</span>
        <span>era ×{analog.era_discount.toFixed(2)}</span>
        <span>hoyt ×{analog.hoyt_amplification.toFixed(2)}</span>
      </div>

      {analog.tags.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
          {analog.tags.map((t) => (
            <span key={t} style={{ fontFamily: C.mono, fontSize: 9, padding: "1px 6px", borderRadius: 4,
              background: C.panelHi, color: C.faint, border: `1px solid ${C.border}` }}>
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export function AnalogTimeline({ match, loading = false, onOpenEvidence }: AnalogTimelineProps) {
  return (
    <section aria-label="Historical analog timeline" data-testid="hr-analog-timeline" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.13em", color: C.faint, textTransform: "uppercase", margin: 0 }}>
          Historical analog timeline
        </h2>
        {match && (
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>
            as of {match.as_of_date} · {match.latency_ms}ms · {match.request_id}
          </span>
        )}
      </div>

      {loading ? (
        <Loading label="Matching against the episode library…" />
      ) : match === null ? (
        <CockpitEmptyState
          zone="analogs"
          reason="match request failed or backend unreachable"
          hint="POST /api/v1/rhymes/match returned no usable response — the cockpit will not invent analogs"
        />
      ) : match.top_analogs.length === 0 ? (
        <DegradedNote
          reason={match.confidence_meta.degraded_reason ?? "no analogs returned"}
          refusal={`${REFUSAL_LINE} No episode cleared the similarity bar with the current inputs — that is a finding, not a failure.`}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {match.top_analogs.map((a) => (
            <AnalogTrack key={a.episode_id} analog={a} onOpenEvidence={onOpenEvidence} />
          ))}
        </div>
      )}
    </section>
  );
}
