"use client";

import React from "react";
import { C, Panel, DegradedNote } from "./cockpit/primitives";

// Calibration data exists in the database but is not yet exposed via API.
// This component is the honest planned-not-available state: it names exactly
// what exists (hr_agent_calibration.rolling_90d_brier, weights;
// hr_predictions.brier_score) and the missing endpoint
// (GET /api/hr/v1/calibration/summary) with no fabricated values.

interface DataField {
  label: string;
  table: string;
  column: string;
  status: "available_in_db" | "not_exposed";
}

const CALIBRATION_FIELDS: DataField[] = [
  {
    label: "Rolling 90-day Brier score",
    table: "hr_agent_calibration",
    column: "rolling_90d_brier",
    status: "available_in_db",
  },
  {
    label: "Agent calibration weights",
    table: "hr_agent_calibration",
    column: "weights (jsonb)",
    status: "available_in_db",
  },
  {
    label: "Per-prediction Brier score",
    table: "hr_predictions",
    column: "brier_score",
    status: "available_in_db",
  },
];

export function CalibrationStatus() {
  return (
    <div data-testid="hr-calibration-status">
      <DegradedNote
        reason="calibration endpoint not yet implemented"
        refusal={
          "GET /api/hr/v1/calibration/summary is not live. " +
          "The underlying data exists in the database and is listed below. " +
          "The system refuses to fabricate or approximate calibration metrics."
        }
      />

      <div style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.13em",
          color: C.faint, textTransform: "uppercase", margin: "0 0 10px" }}>
          Data available in database
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CALIBRATION_FIELDS.map((f) => (
            <div key={f.column}
              style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px",
                display: "grid", gridTemplateColumns: "1fr auto" }}>
              <div>
                <div style={{ fontFamily: C.sans, fontSize: 13, color: C.text }}>{f.label}</div>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 4 }}>
                  {f.table}.{f.column}
                </div>
              </div>
              <span style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                color: C.green, background: C.green + "16", border: `1px solid ${C.green}38`,
                borderRadius: 4, padding: "2px 6px", alignSelf: "center" }}>
                in db
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.13em",
          color: C.faint, textTransform: "uppercase", margin: "0 0 10px" }}>
          Missing API surface
        </h2>
        <Panel style={{ fontFamily: C.mono, fontSize: 12, padding: 14 }}>
          <div style={{ color: C.amber }}>GET /api/hr/v1/calibration/summary</div>
          <div style={{ color: C.faint, marginTop: 8, fontSize: 11, lineHeight: 1.6 }}>
            Not implemented. Would expose: rolling_90d_brier, weights breakdown,
            per-signal calibration error, reliability diagram data.
            Approve a separate backend story to build this endpoint.
          </div>
        </Panel>
      </div>
    </div>
  );
}
