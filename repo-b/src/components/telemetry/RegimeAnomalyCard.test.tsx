import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RegimeAnomalyCard from "./RegimeAnomalyCard";
import evidence from "@/lib/telemetry/regimeAnomalyEvidence.json";

// Renders a committed, computed evidence artifact (real FD004 regime run). Assertions track
// the artifact's structure + the headline finding, not hand-typed numbers.
describe("RegimeAnomalyCard", () => {
  it("renders the regime false-positive comparison and the global-vs-conditioned finding", () => {
    render(<RegimeAnomalyCard />);
    expect(screen.getByText(/operating condition, not the fault/i)).toBeInTheDocument();
    // computed-artifact label (never claims live serving)
    expect(screen.getByText(/not live serving/i)).toBeInTheDocument();
    // the worst-regime FP reduction headline
    expect(
      screen.getAllByText(new RegExp(`${evidence.metrics.worst_regime_fp_reduction_pct}% reduction`)).length,
    ).toBeGreaterThan(0);
    // a per-regime row renders (regime #0)
    expect(screen.getByText("#0")).toBeInTheDocument();
    // the finding prose is present (unique phrasing)
    expect(screen.getByText(/false-alarms on the others/i)).toBeInTheDocument();
  });
});
