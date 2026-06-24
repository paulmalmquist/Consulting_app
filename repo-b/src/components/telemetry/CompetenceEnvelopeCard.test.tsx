import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CompetenceEnvelopeCard from "./CompetenceEnvelopeCard";
import evidence from "@/lib/telemetry/competenceEnvelopeEvidence.json";

// Renders a committed, computed evidence artifact (real FD001->FD004 envelope run).
describe("CompetenceEnvelopeCard", () => {
  it("renders the in/out envelope rates, the gate, and both examples", () => {
    render(<CompetenceEnvelopeCard />);
    expect(screen.getByText(/inside the model's trained envelope/i)).toBeInTheDocument();
    expect(screen.getByText(/not live serving/i)).toBeInTheDocument();
    // FD004 out-of-envelope rate is shown as a percentage
    expect(
      screen.getAllByText(`${(evidence.metrics.fd004_out_of_envelope_rate * 100).toFixed(1)}%`).length,
    ).toBeGreaterThan(0);
    // both operational actions appear: a SCORE (in-envelope) and an ABSTAIN (out-of-envelope)
    expect(screen.getAllByText("SCORE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ABSTAIN").length).toBeGreaterThan(0);
    // honest framing: regime-shift stress test, not rocket hot-fire
    expect(screen.getAllByText(/regime shift/i).length).toBeGreaterThan(0);
  });
});
