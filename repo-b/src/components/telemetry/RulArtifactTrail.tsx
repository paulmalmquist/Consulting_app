"use client";

import { C, Tag } from "./primitives";
import { RulInfoTooltip } from "./RulInfoTooltip";
import { SOURCE_KIND_TAG } from "./drill/sourceKind";
import type { RulArtifactStep } from "@/lib/telemetry/rulCalibrationEvidence";

// Evidence artifact trail — the chain of artifacts behind the headline numbers, framed as an
// EVIDENCE trail (dataset → model → evaluation → calibration → replay), NOT a live pipeline. Each
// card is a button that opens the evidence drawer with that artifact's provenance + null reasons.

const ARTIFACT_TOOLTIP =
  "An evidence trail, not a live pipeline: each step is a stored artifact (dataset, checkpoint, eval, calibration, replay). Click to inspect its provenance — known ids are shown; unavailable ids carry a specific reason.";

function statusColor(status: RulArtifactStep["status"]): string {
  if (status === "available") return C.green;
  if (status === "unavailable") return C.red;
  return C.amber; // computed | fixture
}

// Map our evidence status onto the shared source-kind tag vocabulary where it lines up,
// else fall back to the step's own honesty tag.
function chipText(step: RulArtifactStep): string {
  if (step.status === "computed") return SOURCE_KIND_TAG["computed-artifact"];
  if (step.status === "fixture") return SOURCE_KIND_TAG.fixture;
  return step.statusTag;
}

export function RulArtifactTrail({
  steps,
  onOpen,
}: {
  steps: RulArtifactStep[];
  onOpen: (step: RulArtifactStep) => void;
}) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", color: C.dim, textTransform: "uppercase" }}>
          Evidence artifact trail
        </span>
        <RulInfoTooltip label={ARTIFACT_TOOLTIP} triggerLabel="About the evidence trail" />
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>dataset → model → evaluation → calibration → replay</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        {steps.map((step) => (
          <button
            key={step.id}
            type="button"
            onClick={() => onOpen(step)}
            aria-label={`Inspect the ${step.label} artifact`}
            style={{
              textAlign: "left",
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 9,
              padding: 12,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint }}>
                {step.index}. {step.kind}
              </span>
              <span aria-hidden style={{ color: C.faint, fontSize: 13, lineHeight: 1 }}>›</span>
            </div>
            <span style={{ fontFamily: C.sans, fontSize: 13.5, fontWeight: 600, color: C.text }}>{step.label}</span>
            <span style={{ fontFamily: C.sans, fontSize: 11.5, color: C.dim, lineHeight: 1.45 }}>{step.summary}</span>
            <span style={{ marginTop: 2 }}>
              <Tag color={statusColor(step.status)}>{chipText(step)}</Tag>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
