import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RulConformalCard from "./RulConformalCard";
import evidence from "@/lib/telemetry/rulConformalEvidence.json";

// The card renders a committed, computed evidence artifact (real FD001 conformal run).
// These assertions track the artifact's structure + headline, not hand-typed numbers.
describe("RulConformalCard", () => {
  it("renders the conformal metrics and the lower-bound clearance headline", () => {
    render(<RulConformalCard />);
    expect(screen.getAllByText(/lower bound/i).length).toBeGreaterThan(0);
    // computed-artifact label (never claims live serving)
    expect(screen.getByText(/not live serving/i)).toBeInTheDocument();
    // measured PICP shown as a percentage
    const picp = `${(evidence.metrics.picp_two_sided * 100).toFixed(1)}%`;
    expect(screen.getAllByText(picp).length).toBeGreaterThan(0);
    // the point-vs-lower-bound flagged headline
    const flags = evidence.gate.point_go_but_lower_bound_flags;
    expect(screen.getAllByText(new RegExp(`${flags} of ${evidence.n_test_units}`)).length).toBeGreaterThan(0);
    // at least one example unit row (first example's unit id appears)
    expect(screen.getByText(String(evidence.examples[0].unit))).toBeInTheDocument();
  });
});
