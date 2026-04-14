import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DecisionStrip from "@/components/repe/workspace/DecisionStrip";
import type { DecisionStripData } from "@/components/repe/workspace/buildDecisionStrip";

function makeData(overrides: Partial<DecisionStripData> = {}): DecisionStripData {
  return {
    issues: [],
    drivers: [],
    recommendation: null,
    recommendationRejectionReason: null,
    ...overrides,
  };
}

describe("DecisionStrip", () => {
  it("renders three columns: Issues, Drivers, Recommendation", () => {
    render(<DecisionStrip data={makeData()} />);
    expect(screen.getByText("Issues")).toBeInTheDocument();
    expect(screen.getByText("Drivers")).toBeInTheDocument();
    expect(screen.getByText("Recommendation")).toBeInTheDocument();
  });

  it("renders issue bullets with severity dots", () => {
    const data = makeData({
      issues: [
        {
          key: "i1",
          headline: "Suburban Office Park IRR at -12.0%",
          severity: "high",
        },
      ],
    });
    render(<DecisionStrip data={data} />);
    expect(screen.getByText("Suburban Office Park IRR at -12.0%")).toBeInTheDocument();
  });

  it("renders the recommendation headline and action when present", () => {
    const data = makeData({
      recommendation: {
        headline: "Model exit or recap for Suburban Office Park",
        action: "Model exit or recap path for Suburban Office Park",
        severity: "high",
      },
    });
    render(<DecisionStrip data={data} />);
    expect(
      screen.getByText("Model exit or recap for Suburban Office Park")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Model exit or recap path for Suburban Office Park")
    ).toBeInTheDocument();
  });

  it("anti-restate fallback renders 'Awaiting recommendation' (not blank or engineering text)", () => {
    const data = makeData({
      issues: [{ key: "i1", headline: "Issue", severity: "high" }],
      recommendation: null,
      recommendationRejectionReason: "restate_of_top_issue",
    });
    render(<DecisionStrip data={data} />);
    expect(screen.getByText("Awaiting recommendation")).toBeInTheDocument();
    // Placeholder discipline: no engineering-state vocabulary.
    expect(screen.queryByText(/no data|pending|n\/a/i)).toBeNull();
  });

  it("surfaces snapshot version for audit provenance", () => {
    render(<DecisionStrip data={makeData()} snapshotVersion="v2025.12.31" />);
    expect(screen.getByText("v2025.12.31")).toBeInTheDocument();
  });

  it("emits portfolio variant marker for caller styling", () => {
    const { container } = render(<DecisionStrip data={makeData()} variant="portfolio" />);
    expect(container.querySelector('[data-variant="portfolio"]')).not.toBeNull();
  });
});
