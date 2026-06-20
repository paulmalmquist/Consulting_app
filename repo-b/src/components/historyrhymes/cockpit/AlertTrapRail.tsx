"use client";

import { useState } from "react";
import type { Alert } from "@/lib/historyrhymes/client";
import type { StructuralAlert, TrapDetector } from "@/lib/historyrhymes/rhymesClient";
import { C, Tag, Panel } from "./primitives";

// Zone 4 — alert and trap rail. Three sections: structural alerts (from
// /api/v1/rhymes/alerts, acknowledgeable), decision alerts (from the latest
// decision), and the trap detector panel.
//
// Null vs empty is structural, not cosmetic: null means the feed is
// unreachable (red), [] means the feed answered and holds nothing. And "no
// unacknowledged alerts" is a statement about the alert feed — it is not a
// claim that conditions are safe.

const SEVERITY_COLOR: Record<StructuralAlert["severity"], string> = {
  info: C.cyan, warning: C.amber, critical: C.red,
};

// Ported from the legacy AlertBanner's type→style mapping.
const DECISION_ALERT_COLOR: Record<Alert["type"], string> = {
  honeypot: C.red, crowding: C.amber, divergence: C.amber, data_quality: C.cyan,
};

export interface AlertTrapRailProps {
  /** null = alerts fetch failed; [] = feed healthy, nothing unacknowledged. */
  structuralAlerts: StructuralAlert[] | null;
  /** Alerts from the latest decision; null when there is no decision. */
  decisionAlerts: Alert[] | null;
  trap: TrapDetector | null;
  trapSummary: string | null;
  /** Resolves true on success; false reverts the optimistic removal. */
  onAcknowledge?: (id: string) => Promise<boolean>;
  /** Opens the alert evidence drawer (PR 10). */
  onOpenEvidence?: (alert: StructuralAlert) => void;
}

function StructuralAlertCard({ alert, onAcknowledge, onOpenEvidence }: {
  alert: StructuralAlert;
  onAcknowledge?: (id: string) => Promise<boolean>;
  onOpenEvidence?: (alert: StructuralAlert) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const color = SEVERITY_COLOR[alert.severity];

  if (hidden) return null;

  const ack = async () => {
    if (!onAcknowledge || busy) return;
    setBusy(true);
    setError(null);
    setHidden(true); // optimistic — reverted below on failure
    const ok = await onAcknowledge(alert.id);
    if (!ok) {
      setHidden(false);
      setError("acknowledge failed — alert may already be acknowledged or the feed is down");
    }
    setBusy(false);
  };

  return (
    <div data-testid="hr-structural-alert" data-severity={alert.severity}
      style={{ border: `1px solid ${color}45`, background: color + "0a", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Tag color={color}>{alert.severity}</Tag>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text }}>{alert.alert_type}</span>
        </div>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>{alert.alert_date}</span>
      </div>
      {alert.narrative && (
        <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, margin: "8px 0 0", lineHeight: 1.5 }}>{alert.narrative}</p>
      )}
      {alert.hoyt_position != null && (
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 6 }}>
          hoyt position: {alert.hoyt_position}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {onAcknowledge && (
          <button type="button" data-testid={`hr-ack-${alert.id}`} onClick={ack} disabled={busy}
            style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, background: C.panelHi,
              border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>
            acknowledge
          </button>
        )}
        {onOpenEvidence && (
          <button type="button" data-testid={`hr-alert-evidence-${alert.id}`} onClick={() => onOpenEvidence(alert)}
            style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, background: "transparent",
              border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>
            evidence
          </button>
        )}
      </div>
      {error && (
        <div data-testid="hr-ack-error" style={{ fontFamily: C.mono, fontSize: 10, color: C.red, marginTop: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}

export function AlertTrapRail({ structuralAlerts, decisionAlerts, trap, trapSummary, onAcknowledge, onOpenEvidence }: AlertTrapRailProps) {
  return (
    <aside aria-label="Alerts and trap detector" data-testid="hr-alert-rail"
      style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Panel title="Structural alerts" pad={12}>
        {structuralAlerts === null ? (
          <div data-testid="hr-alerts-unreachable"
            style={{ fontFamily: C.mono, fontSize: 11, color: C.red }}>
            alert feed unreachable — GET /api/v1/rhymes/alerts failed
          </div>
        ) : structuralAlerts.length === 0 ? (
          <div data-testid="hr-alerts-clear" style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
            no unacknowledged structural alerts
            <span style={{ display: "block", color: C.faint, marginTop: 4, lineHeight: 1.4 }}>
              a quiet feed is not a safety claim — it means no rule has fired
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {structuralAlerts.map((a) => (
              <StructuralAlertCard key={a.id} alert={a} onAcknowledge={onAcknowledge} onOpenEvidence={onOpenEvidence} />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Decision alerts" pad={12}>
        {decisionAlerts === null ? (
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.amber }}>
            no decision on record — decision alerts unavailable
          </div>
        ) : decisionAlerts.length === 0 ? (
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
            latest decision carries no alerts
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {decisionAlerts.map((a, i) => {
              const color = DECISION_ALERT_COLOR[a.type] ?? C.dim;
              return (
                <div key={`${a.type}-${i}`} data-testid="hr-decision-alert"
                  style={{ border: `1px solid ${color}45`, background: color + "0a", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Tag color={color}>{a.type}</Tag>
                    <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, textTransform: "uppercase" }}>
                      action: {a.action}
                    </span>
                  </div>
                  <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, margin: "7px 0 0", lineHeight: 1.5 }}>{a.message}</p>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Trap detector" pad={12}>
        <div data-testid="hr-trap-panel" style={{ fontFamily: C.mono, fontSize: 11, color: trap?.trap_flag ? C.red : C.dim }}>
          {trapSummary ?? "trap detector unavailable — match request failed"}
        </div>
        {trap && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginTop: 8 }}>
            {[
              ["honeypot", trap.honeypot_match],
              ["crowding", trap.crowding_score],
              ["divergence", trap.consensus_divergence],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>
                {label}: <span style={{ color: value == null ? C.faint : C.dim }}>
                  {value == null ? "not computed (v1)" : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </aside>
  );
}
