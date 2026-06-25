import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Stub the heavy Bottleneck Map (recharts) — its own tests cover its behavior.
vi.mock("./context/BottleneckMap/BottleneckMap", () => ({ default: () => <div data-testid="bottleneck-map">charts</div> }));
// The Overview reads envId from the route to build the demo bridge links.
vi.mock("next/navigation", () => ({ useParams: () => ({ envId: "env-test" }) }));

import TelemetryOverview from "./TelemetryOverview";

describe("TelemetryOverview — thesis-led Overview", () => {
  it("renders the dominant thesis header, the integrated Bottleneck Map, and the larger Big Numbers band", () => {
    render(<TelemetryOverview />);
    expect(screen.getByRole("heading", { name: "Why Launch Became A Data Problem" })).toBeInTheDocument();
    expect(screen.getByText(/Spaceflight moves by breaking what holds it back/i)).toBeInTheDocument();
    expect(screen.getByTestId("bottleneck-map")).toBeInTheDocument();
    // Big Numbers presented as larger inline anchors under the thesis (rendered locally, not in the header).
    expect(screen.getByText("Launch attempts")).toBeInTheDocument();
    expect(screen.getByText("7,173")).toBeInTheDocument();
    expect(screen.getByText("full range")).toBeInTheDocument();
    expect(screen.getByText("Commercial share")).toBeInTheDocument();
  });

  it("states source honesty and bridges into the rest of the demo", () => {
    render(<TelemetryOverview />);
    expect(screen.getByText(/Source status:/)).toBeInTheDocument();
    expect(screen.getByText(/Launch source ETL not connected/i)).toBeInTheDocument();
    expect(screen.getByText("Continue the demo")).toBeInTheDocument();
    expect(screen.getByText("Stargate Live").closest("a")).toHaveAttribute("href", "/lab/env/env-test/telemetry/stargate");
    expect(screen.getByText("Resume Evidence").closest("a")).toHaveAttribute("href", "/lab/env/env-test/telemetry/evidence");
  });

  it("does not render the serving KPI strip, the Trace-lineage CTA, or Mission Summary scaffolding", () => {
    render(<TelemetryOverview />);
    expect(screen.queryByText("Promoted models")).not.toBeInTheDocument();
    expect(screen.queryByText(/Trace lineage/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Mission readiness")).not.toBeInTheDocument();
  });
});
