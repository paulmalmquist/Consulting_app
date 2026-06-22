"use client";

import type { RhymesMatchResponse, ConfidenceMeta } from "@/lib/historyrhymes/rhymesClient";
import { C, Panel, CockpitEmptyState } from "./primitives";

// Zone 5 — scenario pressure. The honesty rule that owns this panel:
// v1 of the backend ships PLACEHOLDER scenarios (0.25/0.50/0.25 with the
// narrative "Awaiting multi-agent forecaster (Stage 5)."). Those must render
// as a pending state — dim outline bars, no filled probabilities — never as
// real numbers. Detection is belt-and-braces: the narrative marker is the
// primary check, the exact 0.25/0.50/0.25 triple the backup.

export const PLACEHOLDER_MARKER = "Awaiting multi-agent forecaster";

type Scenarios = RhymesMatchResponse["scenarios"];

export function isPlaceholderScenarios(s: Scenarios): boolean {
  const all = [s.bull, s.base, s.bear];
  if (all.some((x) => x.narrative.includes(PLACEHOLDER_MARKER))) return true;
  return s.bull.probability === 0.25 && s.base.probability === 0.5 && s.bear.probability === 0.25;
}

const SCENARIO_COLOR: Record<string, string> = { bull: C.green, base: C.dim, bear: C.red };

function MetaRow({ label, value, pending }: { label: string; value: string; pending?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
      <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", color: C.faint, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: pending ? C.faint : C.dim }}>{value}</span>
    </div>
  );
}

export interface ScenarioPressurePanelProps {
  scenarios: Scenarios | null;
  confidenceMeta: ConfidenceMeta | null;
  /** Opens the scenario evidence drawer (PR 10). */
  onOpenEvidence?: () => void;
}

export function ScenarioPressurePanel({ scenarios, confidenceMeta, onOpenEvidence }: ScenarioPressurePanelProps) {
  if (scenarios === null) {
    return (
      <section data-testid="hr-scenario-panel" style={{ marginTop: 16 }}>
        <CockpitEmptyState zone="scenarios" reason="match request failed — no scenario data"
          hint="scenario pressure renders only from a real match response" />
      </section>
    );
  }

  const pending = isPlaceholderScenarios(scenarios);
  const entries = Object.entries(scenarios) as [keyof Scenarios, Scenarios["bull"]][];

  return (
    <section data-testid="hr-scenario-panel" data-pending={pending} style={{ marginTop: 16 }}>
      <Panel title="Scenario pressure" pad={14}
        right={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {pending && (
              <span data-testid="hr-scenario-pending-tag" style={{ fontFamily: C.mono, fontSize: 10, color: C.amber }}>
                pending — engine not live
              </span>
            )}
            {onOpenEvidence && (
              <button type="button" data-testid="hr-scenario-evidence" onClick={onOpenEvidence}
                style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                  color: C.faint, background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 4, padding: "1px 6px", cursor: "pointer" }}>
                evidence
              </button>
            )}
          </span>
        }>
        {pending && (
          <p data-testid="hr-scenario-pending-note"
            style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, margin: "0 0 12px", lineHeight: 1.5 }}>
            Scenario engine pending — the multi-agent forecaster (Stage 5) is not yet live.
            The backend ships placeholder values; the cockpit will not draw them as probabilities.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {entries.map(([name, s]) => {
            const color = SCENARIO_COLOR[name];
            return (
              <div key={name} data-testid={`hr-scenario-${name}`}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: pending ? C.faint : color }}>
                    {name}
                  </span>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: pending ? C.faint : C.text }}>
                    {pending ? "—" : `${(s.probability * 100).toFixed(0)}%`}
                  </span>
                </div>
                <div style={{ position: "relative", height: 6, borderRadius: 3,
                  background: C.panelHi, border: pending ? `1px dashed ${C.borderHi}` : "none" }}>
                  {!pending && (
                    <span data-testid={`hr-scenario-bar-${name}`}
                      style={{ position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 3,
                        width: `${Math.min(100, Math.max(0, s.probability * 100))}%`,
                        background: `${color}55`, border: `1px solid ${color}` }} />
                  )}
                </div>
                {!pending && s.narrative && (
                  <div style={{ fontFamily: C.sans, fontSize: 11, color: C.dim, marginTop: 4, lineHeight: 1.4 }}>{s.narrative}</div>
                )}
              </div>
            );
          })}
        </div>

        <div data-testid="hr-confidence-meta" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          {confidenceMeta === null ? (
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.amber }}>confidence metadata unavailable</span>
          ) : (
            <>
              <MetaRow label="sample size" value={String(confidenceMeta.sample_size)} />
              <MetaRow label="data freshness"
                value={confidenceMeta.data_freshness_hours == null
                  ? "unavailable (degraded)"
                  : `${confidenceMeta.data_freshness_hours.toFixed(1)}h`}
                pending={confidenceMeta.data_freshness_hours == null} />
              <MetaRow label="freshness weight" value={`×${confidenceMeta.freshness_weight.toFixed(2)}`} />
              <MetaRow label="agent agreement"
                value={confidenceMeta.agent_agreement == null ? "not yet computed (v1)" : confidenceMeta.agent_agreement.toFixed(2)}
                pending={confidenceMeta.agent_agreement == null} />
              <MetaRow label="permutation p-value"
                value={confidenceMeta.permutation_p_value == null ? "not yet computed (v1)" : confidenceMeta.permutation_p_value.toFixed(4)}
                pending={confidenceMeta.permutation_p_value == null} />
            </>
          )}
        </div>
      </Panel>
    </section>
  );
}
