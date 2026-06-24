import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Stub the heavy Bottleneck Map (recharts) — its own tests cover its behavior.
vi.mock("./context/BottleneckMap/BottleneckMap", () => ({ default: () => <div data-testid="bottleneck-map">charts</div> }));

import TelemetryOverview from "./TelemetryOverview";

describe("TelemetryOverview — charts-led Overview", () => {
  it("renders the dominant thesis header and the Bottleneck Map story module", () => {
    render(<TelemetryOverview />);
    expect(screen.getByRole("heading", { name: "Why Launch Became A Data Problem" })).toBeInTheDocument();
    expect(screen.getByText(/Spaceflight moves by breaking what holds it back/i)).toBeInTheDocument();
    expect(screen.getByTestId("bottleneck-map")).toBeInTheDocument();
    // Big Numbers presented inline under the thesis (moved out of the Bottleneck Map cards).
    expect(screen.getByText("Launch attempts")).toBeInTheDocument();
    expect(screen.getByText("7,173")).toBeInTheDocument();
    expect(screen.getByText("full range")).toBeInTheDocument();
    expect(screen.getByText("Commercial share")).toBeInTheDocument();
  });

  it("does not render the serving KPI strip, the Trace-lineage CTA, or Mission Summary scaffolding", () => {
    render(<TelemetryOverview />);
    expect(screen.queryByText("Promoted models")).not.toBeInTheDocument();
    expect(screen.queryByText(/Trace lineage/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Mission readiness")).not.toBeInTheDocument();
    expect(screen.queryByText("Continue the demo")).not.toBeInTheDocument();
  });
});
