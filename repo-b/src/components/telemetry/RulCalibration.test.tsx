import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import RulCalibration from "./RulCalibration";
import { CALIBRATION_TRAJECTORY } from "@/lib/telemetry/calibrationEvidence";

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
});
