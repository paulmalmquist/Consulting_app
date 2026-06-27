import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MlProvenanceDrawer, type MlProvenanceSelection } from "./MlProvenanceDrawer";

const SEL: MlProvenanceSelection = {
  title: "Replay anomaly — D-4 @ t=120",
  signal: [
    { label: "Verdict", value: "NO_GO (model_pred=1)" },
    { label: "Channel", value: "D-4" },
  ],
  featureVector: { columns: ["t", "residual"], rows: [{ t: 120, residual: 0.5 }], sourceLabel: "gold_replay_feed" },
  math: [
    { label: "MAD_K", value: 4 },
    { label: "Detector threshold", value: "0.1355" },
  ],
  reconciliationCaveat: "The serving global-scale fallback threshold does NOT reproduce the champion's D-4 firing.",
  mlflowRunId: "run-abc",
  modelName: "tel_anomaly_detector",
  gate: [{ label: "Promotion gate", value: "honest gate" }],
  deltaTable: "novendor_1.telemetry.gold_replay_feed",
};

describe("MlProvenanceDrawer", () => {
  it("renders the five-rung drill with signal, math, run link, and gate", () => {
    render(<MlProvenanceDrawer open onClose={() => {}} selection={SEL} />);
    expect(screen.getByText("NO_GO (model_pred=1)")).toBeInTheDocument();   // rung 1 signal
    expect(screen.getByText("MAD_K")).toBeInTheDocument();                   // rung 3 math
    expect(screen.getByText("Promotion gate")).toBeInTheDocument();          // rung 5 gate
    expect(screen.getByRole("link", { name: /MLflow Run/i })).toBeInTheDocument(); // rung 4 run link
  });

  it("surfaces the scoring-reconciliation caveat when serving ≠ replay", () => {
    render(<MlProvenanceDrawer open onClose={() => {}} selection={SEL} />);
    expect(screen.getByText("scoring reconciliation")).toBeInTheDocument();
    expect(screen.getByText(/does NOT reproduce/i)).toBeInTheDocument();
  });

  it("fails closed on the feature-vector rung when no window is attached", () => {
    render(<MlProvenanceDrawer open onClose={() => {}} selection={{ ...SEL, featureVector: null }} />);
    expect(screen.getByText(/Feature window not attached/i)).toBeInTheDocument();
  });
});
