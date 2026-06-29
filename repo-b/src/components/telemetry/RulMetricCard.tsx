"use client";

import { C } from "./primitives";
import { RulInfoTooltip } from "./RulInfoTooltip";
import type { RulMetricEvidence } from "@/lib/telemetry/rulCalibrationEvidence";

// Clickable metric card for the RUL evidence surface. Same visual weight as the shared MetricCard
// (label / big value / baseline sub) but adds an info-tooltip on the label and opens the evidence
// drawer on click. The value and baseline sub render as standalone text nodes so the locked test
// assertions (getByText("17.33"), /GBM 20.32/, …) keep matching exactly.

const ACCENT: Record<string, string> = { cyan: C.cyan, green: C.green, amber: C.amber, red: C.red };

export function RulMetricCard({ metric, onOpen }: { metric: RulMetricEvidence; onOpen: () => void }) {
  const valueColor = metric.accent ? ACCENT[metric.accent] ?? C.text : C.text;
  return (
    <div
      style={{
        position: "relative",
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 9,
        padding: 15,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.11em", color: C.dim, textTransform: "uppercase" }}>
          {metric.label}
        </span>
        <RulInfoTooltip label={metric.tooltip} triggerLabel={`What ${metric.label} means`} />
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Inspect the ${metric.label} evidence`}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
          padding: 0,
          marginTop: 8,
          cursor: "pointer",
        }}
      >
        <span style={{ fontFamily: C.sans, fontSize: 30, fontWeight: 600, color: valueColor, lineHeight: 1, display: "block" }}>
          {metric.value}
        </span>
        {metric.baselineSub && (
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 7, display: "block" }}>
            {metric.baselineSub}
          </span>
        )}
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5 }}>
          inspect <span aria-hidden>›</span>
        </span>
      </button>
    </div>
  );
}
