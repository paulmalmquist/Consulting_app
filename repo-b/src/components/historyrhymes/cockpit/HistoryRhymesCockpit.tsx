"use client";

import { useEffect, useState } from "react";
import {
  fetchHrState,
  fetchLatestDecision,
  fetchLatestBrief,
  fetchStreamHealth,
  fetchStreamSignals,
  type HrState,
  type HrDecision,
  type HrBrief,
  type Position,
  type StreamHealth,
  type StreamSignal,
} from "@/lib/historyrhymes/client";
import {
  postRhymesMatch,
  fetchRhymesAlerts,
  acknowledgeRhymesAlert,
  type RhymesMatchResponse,
  type StructuralAlert,
  type TrapDetector,
} from "@/lib/historyrhymes/rhymesClient";
import { parseBriefSignals, mergeStreamIntoBrief } from "@/lib/historyrhymes/signals";
import {
  signalEvidence,
  analogEvidence,
  alertEvidence,
  scenarioEvidence,
  regimeEvidence,
  briefEvidence,
  type EvidencePayload,
} from "@/lib/historyrhymes/evidence";
import { C, Loading, CockpitEmptyState, SplitGrid } from "./primitives";
import { RegimeStatusHeader } from "./RegimeStatusHeader";
import { ImplicationCard } from "./ImplicationCard";
import { SignalTelemetryStrip } from "./SignalTelemetryStrip";
import { AnalogTimeline } from "./AnalogTimeline";
import { AlertTrapRail } from "./AlertTrapRail";
import { ScenarioPressurePanel, isPlaceholderScenarios } from "./ScenarioPressurePanel";
import { EvidenceDrawer } from "./EvidenceDrawer";

// Trap summary string for the regime header. v1 of the trap detector returns
// trap_flag=false with every field null — that is "not computing", which is a
// different statement from "computed and found nothing".
export function trapSummary(trap: TrapDetector | null | undefined): string | null {
  if (!trap) return null;
  if (trap.trap_flag) return `TRAP: ${trap.trap_reason ?? "flagged without reason"}`;
  const computing =
    trap.trap_reason !== null || trap.honeypot_match !== null ||
    trap.crowding_score !== null || trap.consensus_divergence !== null;
  return computing ? "no trap flagged" : "v1 — not computing";
}

// The default History Rhymes surface: a telemetry-style regime cockpit.
// This component owns ALL cockpit data fetching; zones are presentational.
// PR 2 ships Z1 (regime header) + Z7 (implications) + the evidence footer.
// Z2 signal strip (PR 3), Z3 analog timeline (PR 7), Z4 alert rail (PR 8),
// Z5 scenario pressure (PR 9), Z6 evidence drawer (PR 10) mount between them.
//
// Fail-closed by construction: every client function resolves to null on
// 404/error, and every zone renders an explicit state for null.

const TOP_IMPLICATION_LIMIT = 3;

export interface HistoryRhymesCockpitProps {
  /** Override for compatibility aliases (/routine uses "hr-routine-page"). */
  rootTestId?: string;
}

// Stream status codes that drive signal polling.
const STREAM_LIVE_STATUSES = new Set(["connected", "delayed", "replaying"]);

export default function HistoryRhymesCockpit({ rootTestId = "hr-cockpit-page" }: HistoryRhymesCockpitProps) {
  const [state, setState] = useState<HrState | null>(null);
  const [decision, setDecision] = useState<HrDecision | null>(null);
  const [brief, setBrief] = useState<HrBrief | null>(null);
  const [match, setMatch] = useState<RhymesMatchResponse | null>(null);
  const [alerts, setAlerts] = useState<StructuralAlert[] | null>(null);
  const [evidence, setEvidence] = useState<EvidencePayload | null>(null);
  const [loading, setLoading] = useState(true);

  // Stream state: health polled every 30s, signals every 5s when live.
  const [streamHealth, setStreamHealth] = useState<StreamHealth | null>(null);
  const [streamSignals, setStreamSignals] = useState<StreamSignal[] | null>(null);
  // True when the stream WAS live but the last fetch returned null or non-live status.
  const [streamLost, setStreamLost] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, d, b, m, a] = await Promise.all([
        fetchHrState(),
        fetchLatestDecision(),
        fetchLatestBrief(),
        postRhymesMatch({ k: 5 }),
        fetchRhymesAlerts({ unacknowledged: true }),
      ]);
      if (cancelled) return;
      setState(s);
      setDecision(d);
      setBrief(b);
      setMatch(m);
      setAlerts(a === null ? null : a.alerts);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Health poll: 30s interval, always active after mount.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const h = await fetchStreamHealth();
      if (cancelled) return;
      setStreamHealth(h);
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Signal poll: 5s when stream is live, otherwise off.
  const streamIsLive = streamHealth !== null && STREAM_LIVE_STATUSES.has(streamHealth.status);
  useEffect(() => {
    if (!streamIsLive) return;
    let cancelled = false;
    const poll = async () => {
      const res = await fetchStreamSignals();
      if (cancelled) return;
      if (res === null) {
        // Fetch failed — mark stream lost if we previously had signals.
        setStreamLost((prev) => streamSignals !== null ? true : prev);
      } else {
        setStreamSignals(res.signals);
        setStreamLost(false);
      }
    };
    poll();
    const id = setInterval(poll, 5_000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamIsLive]);

  // Acknowledge: optimistic removal happens in the card; on success refetch
  // so the rail reflects the backend's view, on failure the card reverts.
  const handleAcknowledge = async (id: string): Promise<boolean> => {
    const receipt = await acknowledgeRhymesAlert(id, "cockpit");
    if (receipt === null) return false;
    const refreshed = await fetchRhymesAlerts({ unacknowledged: true });
    if (refreshed !== null) setAlerts(refreshed.alerts);
    return true;
  };

  if (loading) {
    return (
      <div data-testid={rootTestId}>
        <Loading label="Loading regime cockpit…" />
      </div>
    );
  }

  const positions: Position[] = decision?.positions ?? [];
  const topImplications = positions.slice(0, TOP_IMPLICATION_LIMIT);
  const restPositions = positions.slice(TOP_IMPLICATION_LIMIT);

  return (
    <div data-testid={rootTestId}>
      {/* Z1 — regime status, with trap summary + degraded reason from the match response. */}
      <RegimeStatusHeader
        state={state}
        decision={decision}
        trapSummary={trapSummary(match?.trap_detector)}
        degradedReason={match?.confidence_meta.degraded_reason ?? null}
        onOpenEvidence={() => setEvidence(regimeEvidence(state, decision, brief))}
      />

      {/* Stream-loss banner: stream was live but fetch failed — show stale brief values. */}
      {streamLost && (
        <div role="alert" data-testid="hr-stream-lost-banner"
          style={{ marginTop: 8, padding: "6px 12px", background: "rgba(243,177,74,0.12)",
            border: `1px solid ${C.amber}`, borderRadius: 4, fontFamily: C.mono,
            fontSize: 11, color: C.amber, letterSpacing: "0.08em" }}>
          stream lost — showing weekly brief values
        </div>
      )}

      {/* Z2 — signal telemetry strip. Stream signals merge over brief values when live;
          per-key source tag on each tile shows "brief" vs "stream · {mode}". */}
      {(() => {
        const briefSigs = parseBriefSignals(brief);
        const mergedSigs = streamIsLive && !streamLost && streamSignals
          ? mergeStreamIntoBrief(briefSigs, streamSignals, streamHealth?.mode ?? "stream")
          : null;
        return (
          <SignalTelemetryStrip
            brief={brief}
            streamSignals={mergedSigs}
            streamMode={streamHealth?.mode ?? null}
            onOpenEvidence={(key) => {
              const signal = (mergedSigs ?? briefSigs).find((s) => s.key === key);
              if (signal) setEvidence(signalEvidence(signal, brief));
            }}
          />
        );
      })()}

      {/* Z3 + Z4 — analog timeline (main) beside the alert/trap rail. */}
      <SplitGrid variant="two-one" style={{ marginTop: 16 }}>
        <AnalogTimeline
          match={match}
          onOpenEvidence={(analog) => { if (match) setEvidence(analogEvidence(analog, match)); }}
        />
        <AlertTrapRail
          structuralAlerts={alerts}
          decisionAlerts={decision === null ? null : decision.alerts}
          trap={match?.trap_detector ?? null}
          trapSummary={trapSummary(match?.trap_detector)}
          onAcknowledge={handleAcknowledge}
          onOpenEvidence={(alert) => setEvidence(alertEvidence(alert))}
        />
      </SplitGrid>

      {/* Z5 — scenario pressure (placeholder-honest: v1 values render pending). */}
      <ScenarioPressurePanel
        scenarios={match?.scenarios ?? null}
        confidenceMeta={match?.confidence_meta ?? null}
        onOpenEvidence={match ? () => setEvidence(scenarioEvidence(
          match.scenarios, match.confidence_meta, match.request_id, isPlaceholderScenarios(match.scenarios),
        )) : undefined}
      />

      {/* Z7 — implications. */}
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.13em", color: C.faint, textTransform: "uppercase", margin: "0 0 10px" }}>
          Implications
        </h2>
        {topImplications.length === 0 ? (
          <CockpitEmptyState
            zone="implications"
            reason={decision === null ? "no decision on record" : "decision has no positions this cycle"}
            hint={decision === null
              ? "run the decision runner or check GET /api/hr/v1/state"
              : `freshness verdict: ${state?.freshness_verdict ?? "unavailable"}`}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {topImplications.map((p, i) => (
              <ImplicationCard key={`${p.asset}-${i}`} position={p} tier="act" />
            ))}
          </div>
        )}
        {restPositions.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase", cursor: "pointer" }}>
              {restPositions.length} more (watch / research)
            </summary>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3" style={{ marginTop: 10 }}>
              {restPositions.map((p, i) => (
                <ImplicationCard key={`rest-${p.asset}-${i}`} position={p} tier="watch" />
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Evidence footer — the weekly brief is archive evidence, not the front door. */}
      <footer data-testid="hr-evidence-footer"
        style={{ marginTop: 28, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 11, color: C.faint,
          display: "flex", flexWrap: "wrap", gap: 14, alignItems: "baseline" }}>
        {brief ? (
          <button type="button" data-testid="hr-brief-evidence"
            onClick={() => setEvidence(briefEvidence(brief))}
            style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, textDecoration: "underline",
              background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
            weekly brief (archive evidence)
          </button>
        ) : (
          <span>no weekly brief on record</span>
        )}
        {state && (
          <span>
            input age: {state.worst_input_age_hours >= 9000 ? "no inputs on record" : `${state.worst_input_age_hours.toFixed(1)}h`}
            {" · "}verdict: {state.freshness_verdict}
          </span>
        )}
        {!state && <span style={{ color: C.amber }}>state endpoint unreachable — all panels fail closed</span>}
      </footer>

      {/* Z6 — evidence drawer. */}
      <EvidenceDrawer evidence={evidence} onClose={() => setEvidence(null)} />
    </div>
  );
}
