import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalibrationStatus } from "./CalibrationStatus";

describe("CalibrationStatus", () => {
  it("renders the planned-not-available degraded note", () => {
    render(<CalibrationStatus />);
    expect(screen.getByTestId("hr-calibration-status")).toBeTruthy();
    const note = screen.getByTestId("hr-degraded-note");
    expect(note).toBeTruthy();
    expect(note.textContent).toContain("calibration endpoint not yet implemented");
  });

  it("names the missing endpoint explicitly", () => {
    render(<CalibrationStatus />);
    const note = screen.getByTestId("hr-degraded-note");
    expect(note.textContent).toContain("GET /api/hr/v1/calibration/summary");
  });

  it("names all three known database fields", () => {
    render(<CalibrationStatus />);
    const page = screen.getByTestId("hr-calibration-status");
    expect(page.textContent).toContain("rolling_90d_brier");
    expect(page.textContent).toContain("hr_agent_calibration");
    expect(page.textContent).toContain("hr_predictions");
    expect(page.textContent).toContain("brier_score");
  });

  it("shows 'in db' status chips for all three fields", () => {
    render(<CalibrationStatus />);
    const chips = screen.getAllByText("in db");
    expect(chips.length).toBe(3);
  });

  it("includes the refusal statement against fabrication", () => {
    render(<CalibrationStatus />);
    const note = screen.getByTestId("hr-degraded-note");
    expect(note.textContent).toContain("refuses to fabricate");
  });
});
