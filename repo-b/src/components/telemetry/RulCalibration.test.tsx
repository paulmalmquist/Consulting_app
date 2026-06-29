import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import RulCalibration from "./RulCalibration";
import { CALIBRATION_TRAJECTORY } from "@/lib/telemetry/calibrationEvidence";
import { buildRulChartPointDrawerTarget } from "@/lib/telemetry/rulCalibrationEvidence";

describe("RulCalibration", () => {
  it("renders the champion header and required status chips", () => {
    render(<RulCalibration />);
    expect(screen.getByRole("heading", { name: "RUL Calibration" })).toBeInTheDocument();
    expect(screen.getByText("Champion: CNN-LSTM")).toBeInTheDocument();
    expect(screen.getByText("Gate: Passed")).toBeInTheDocument();
    // honesty: must say not-SOTA and label the data source
    expect(screen.getByText("Not SOTA")).toBeInTheDocument();
    expect(screen.getByText("Replay / evidence artifact")).toBeInTheDocument();
  });

  it("renders the hero evidence-contract strip", () => {
    render(<RulCalibration />);
    // evidence contract: dataset / model / calibration / serving / gate / claim
    expect(screen.getByText("C-MAPSS FD001")).toBeInTheDocument();
    expect(screen.getByText("CNN-LSTM champion")).toBeInTheDocument();
    expect(screen.getByText("split conformal")).toBeInTheDocument();
    expect(screen.getByText("replay artifact")).toBeInTheDocument();
    expect(screen.getByText("coverage ±0.03 passed")).toBeInTheDocument();
    // why-this-page-exists caveat is on the page, not tooltip-only
    expect(screen.getByText(/not claiming the best possible RUL model/i)).toBeInTheDocument();
  });

  it("shows CNN-LSTM metrics with the GBM baseline comparison", () => {
    render(<RulCalibration />);
    expect(screen.getByText("17.33")).toBeInTheDocument(); // CNN-LSTM RMSE
    expect(screen.getByText("742")).toBeInTheDocument();   // CNN-LSTM PHM08
    expect(screen.getByText(/GBM 20\.32/)).toBeInTheDocument();
    expect(screen.getByText(/GBM 1423/)).toBeInTheDocument();
  });

  it("shows 80% and 90% conformal coverage", () => {
    render(<RulCalibration />);
    expect(screen.getByText(/77\.8% observed/)).toBeInTheDocument();
    expect(screen.getByText(/90\.3% observed/)).toBeInTheDocument();
    expect(screen.getByText(/honest calibration, not a SOTA claim/i)).toBeInTheDocument();
  });

  it("includes the negative-result bridge and does NOT revive embedding-distance trust as a claim", () => {
    render(<RulCalibration />);
    expect(screen.getByText(/killed by Gate 0/i)).toBeInTheDocument();
    expect(screen.getByText(/does not revive that claim/i)).toBeInTheDocument();
    // the only mention of distance/embedding trust is the kill context — never as a live feature
    const body = document.body.textContent || "";
    expect(body).not.toMatch(/SupCon|analog retrieval|pgvector|novelty distance/i);
  });

  it("drills to per-cycle unit-level rows (fixture) with coverage + CSV export (8E)", () => {
    render(<RulCalibration />);
    // source-kind is labeled on the page
    expect(screen.getByText(/computed evidence artifact/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Inspect the unit-level calibration rows and export/i }));
    // the drawer labels the source kind honestly + exposes the unit-level columns
    expect(screen.getByText(/computed-artifact \(conformal bands\)/i)).toBeInTheDocument();
    expect(screen.getByText("covered_90")).toBeInTheDocument();
    // flip/gate is honestly marked not-applicable here (the 100-unit aggregate lives on Evidence)
    expect(screen.getByText(/100-unit gate-flip aggregate is on the Evidence/i)).toBeInTheDocument();
    // CSV export of the displayed unit rows is enabled (fixture rows present)
    expect(screen.getByRole("button", { name: /Export CSV/i })).not.toBeDisabled();
  });

  it("opens the evidence drawer from a metric card (RMSE) with provenance + formula", () => {
    render(<RulCalibration />);
    fireEvent.click(screen.getByRole("button", { name: /Inspect the RMSE evidence/i }));
    const drawer = screen.getByRole("dialog");
    // drawer shows the real RMSE formula + a provenance section
    expect(within(drawer).getByText(/RMSE = sqrt/i)).toBeInTheDocument();
    expect(within(drawer).getByText(/Source \/ provenance/i)).toBeInTheDocument();
    // known provenance: the challenger run id is surfaced, not faked
    expect(within(drawer).getByText("1000196687230771")).toBeInTheDocument();
  });

  it("opens the evidence drawer from an artifact card and renders a specific null reason for a missing id", () => {
    render(<RulCalibration />);
    // the dataset step has no stored snapshot id — it must render a specific null reason, not a fake id
    fireEvent.click(screen.getByRole("button", { name: /Inspect the Dataset snapshot artifact/i }));
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByText(/snapshot id not stored in current fixture/i)).toBeInTheDocument();
  });

  it("opens the evidence drawer from a reliability bin with its sample-count null reason", () => {
    render(<RulCalibration />);
    fireEvent.click(screen.getByRole("button", { name: /Inspect the 80% reliability bin/i }));
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByText(/sample count not included in current static evidence artifact/i)).toBeInTheDocument();
  });

  it("closes the evidence drawer with the Escape key", () => {
    render(<RulCalibration />);
    fireEvent.click(screen.getByRole("button", { name: /Inspect the RMSE evidence/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("builds a deterministic trajectory with monotone non-increasing true RUL ending at 0", () => {
    const t = CALIBRATION_TRAJECTORY;
    expect(t.length).toBeGreaterThan(10);
    expect(t[t.length - 1].trueRul).toBe(0);
    for (let i = 1; i < t.length; i += 1) {
      expect(t[i].trueRul).toBeLessThanOrEqual(t[i - 1].trueRul);
      // interval ordering is honest: 90% band contains the 80% band
      expect(t[i].lo90).toBeLessThanOrEqual(t[i].lo80 + 1e-6);
      expect(t[i].hi90).toBeGreaterThanOrEqual(t[i].hi80 - 1e-6);
    }
  });

  it("builds a chart-point drawer target via the pure helper (the tested click seam)", () => {
    // a late prediction near failure: true small, predicted larger
    const late = buildRulChartPointDrawerTarget({ cycle: 198, trueRul: 2, predRul: 12, lo80: 0, hi80: 26, lo90: 0, hi90: 30 });
    expect(late.kind).toBe("chart-point");
    expect(late.error).toBe(10);
    expect(late.absError).toBe(10);
    expect(late.late).toBe(true);
    expect(late.lateRisk).toBe(true); // late AND near failure (true RUL <= 15)
    expect(late.inside80).toBe(true);
    expect(late.provenance.sourceKind).toBe("replay_fixture");

    // an early prediction is not late-risk
    const early = buildRulChartPointDrawerTarget({ cycle: 176, trueRul: 24, predRul: 18, lo80: 0, hi80: 32, lo90: 0, hi90: 36 });
    expect(early.late).toBe(false);
    expect(early.lateRisk).toBe(false);
  });
});
