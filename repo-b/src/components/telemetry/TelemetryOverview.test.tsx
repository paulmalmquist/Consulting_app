import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Stub the heavy Bottleneck Map (recharts) — its own tests cover its behavior.
vi.mock("./context/BottleneckMap/BottleneckMap", () => ({ default: () => <div data-testid="bottleneck-map">charts</div> }));

import TelemetryOverview from "./TelemetryOverview";

describe("TelemetryOverview — charts-led Overview", () => {
  it("renders the Overview heading and the launch-history Bottleneck Map charts", () => {
    render(<TelemetryOverview envId="env-1" />);
    expect(screen.getByText("Why launch became a data problem")).toBeInTheDocument();
    expect(screen.getByTestId("bottleneck-map")).toBeInTheDocument();
    expect(screen.getByText(/Context · why launch became a data problem/i)).toBeInTheDocument();
  });

  it("does not render the KPI strip or the executive Mission Summary scaffolding", () => {
    render(<TelemetryOverview envId="env-1" />);
    expect(screen.queryByText("Promoted models")).not.toBeInTheDocument();
    expect(screen.queryByText("Anomaly F1")).not.toBeInTheDocument();
    expect(screen.queryByText("Mission readiness")).not.toBeInTheDocument();
    expect(screen.queryByText("Continue the demo")).not.toBeInTheDocument();
  });
});
