"use client";

import type { HrState, HrDecision } from "@/lib/historyrhymes/client";
import { C, Tag, regimeColor, freshnessVerdictColor, DegradedNote, StatusChip } from "./primitives";

// Zone 1 — regime status header. Above the fold, never blank: every field
// renders an explicit fallback string when its source is null. The 9999-hour
// sentinel from /api/hr/v1/state means "no inputs on record" and is rendered
// as that, never as a number pretending to be an age.

const NO_INPUT_AGE_SENTINEL = 9000; // backend uses 9999.0 when nothing exists

export interface RegimeStatusHeaderProps {
  state: HrState | null;
  decision: HrDecision | null;
  /** Trap detector summary; wired from the match response in PR 7. */
  trapSummary?: string | null;
  /** Backend degraded reason (from the match response in PR 7). */
  degradedReason?: string | null;
}

function fmtTimestamp(iso: string | null | undefined, label: string): string {
  if (!iso) return `no ${label} on record`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export function RegimeStatusHeader({ state, decision, trapSummary, degradedReason }: RegimeStatusHeaderProps) {
  const regime = decision?.regime ?? state?.latest_regime ?? null;
  const confidence = decision?.confidence ?? state?.latest_confidence ?? null;
  const verdict = state?.freshness_verdict ?? null;
  const age = state?.worst_input_age_hours ?? null;
  const rColor = regimeColor(regime);

  const ageText =
    age == null ? "unknown — state unavailable"
    : age >= NO_INPUT_AGE_SENTINEL ? "no inputs on record"
    : `${age.toFixed(1)}h`;

  const timestamps: { label: string; value: string }[] = [
    { label: "brief", value: fmtTimestamp(state?.latest_brief_at, "brief") },
    { label: "snapshot", value: fmtTimestamp(state?.latest_snapshot_at, "snapshot") },
    { label: "decision", value: fmtTimestamp(decision?.prediction_date ?? state?.latest_decision_at, "decision") },
  ];

  return (
    <header data-testid="hr-regime-header"
      style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.14em", color: C.faint, textTransform: "uppercase" }}>
            Regime
          </div>
          <div data-testid="hr-regime-value"
            style={{ fontFamily: C.sans, fontSize: 30, fontWeight: 700, color: rColor, lineHeight: 1.15, marginTop: 4 }}>
            {regime ? regime.replace("_", " ") : "unknown — no decision or brief on record"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <span data-testid="hr-confidence" style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>
              confidence: <span style={{ color: confidence != null ? C.text : C.faint }}>
                {confidence != null ? confidence.toFixed(2) : "unavailable"}
              </span>
            </span>
            {verdict ? (
              <Tag color={freshnessVerdictColor(verdict)}>{verdict.replace("_", " ")}</Tag>
            ) : (
              <Tag color={C.red}>state unavailable</Tag>
            )}
          </div>
        </div>

        <div style={{ minWidth: 220 }}>
          {timestamps.map((t) => (
            <div key={t.label} style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 4 }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", color: C.faint, textTransform: "uppercase" }}>{t.label}</span>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: t.value.startsWith("no ") ? C.amber : C.dim }}>{t.value}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", color: C.faint, textTransform: "uppercase" }}>worst input age</span>
            <span data-testid="hr-input-age" style={{ fontFamily: C.mono, fontSize: 11, color: ageText.startsWith("no ") || ageText.startsWith("unknown") ? C.amber : C.dim }}>
              {ageText}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginTop: 4 }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", color: C.faint, textTransform: "uppercase" }}>trap detector</span>
            <span data-testid="hr-trap-chip">
              {trapSummary != null
                ? <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{trapSummary}</span>
                : <StatusChip status="missing" />}
            </span>
          </div>
        </div>
      </div>

      {degradedReason && (
        <div style={{ marginTop: 14 }}>
          <DegradedNote reason={degradedReason} />
        </div>
      )}
    </header>
  );
}
