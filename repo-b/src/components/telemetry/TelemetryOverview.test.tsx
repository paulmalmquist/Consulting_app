import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Stub the heavy Bottleneck Map (recharts) — its own tests cover its behavior. The stub exposes a
// button that fires onSelectedEventChange so the Overview→backdrop wiring (Phase 9B) is testable.
vi.mock("./context/BottleneckMap/BottleneckMap", () => ({
  default: ({ onSelectedEventChange }: { onSelectedEventChange?: (e: unknown) => void }) => (
    <div data-testid="bottleneck-map">
      charts
      <button type="button" onClick={() => onSelectedEventChange?.({ type: "mission" })}>select mission event</button>
    </div>
  ),
}));
// The Overview reads envId from the route to build the demo bridge links; the page header reads the
// pathname to resolve its section (Overview → cyan) accent color.
vi.mock("next/navigation", () => ({
  useParams: () => ({ envId: "env-test" }),
  usePathname: () => "/lab/env/env-test/telemetry",
}));

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
    expect(screen.getByText("Evidence").closest("a")).toHaveAttribute("href", "/lab/env/env-test/telemetry/evidence");
    // 8B bridge additions: Mission Control, Metric Lineage, Model Performance (Governance dropped).
    expect(screen.getByText("Mission Control").closest("a")).toHaveAttribute("href", "/lab/env/env-test/telemetry/stream");
    expect(screen.getByText("Metric Lineage").closest("a")).toHaveAttribute("href", "/lab/env/env-test/telemetry/metric-lineage");
    expect(screen.getByText("Model Performance").closest("a")).toHaveAttribute("href", "/lab/env/env-test/telemetry/model-performance");
    expect(screen.queryByText("Trust & Lineage")).not.toBeInTheDocument();
  });

  it("makes a Big Number drillable to its honest fixture source (no live-rows claim)", () => {
    render(<TelemetryOverview />);
    fireEvent.click(screen.getByRole("button", { name: /Cost per kg to LEO.*inspect source/i }));
    // Drawer opens labeling the source kind honestly + shows an underlying public-data row.
    expect(screen.getByText(/fixture — curated public data/i)).toBeInTheDocument();
    expect(screen.getByText("Saturn V")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/i })).not.toBeDisabled();
  });

  it("renders a clear no-rows state for a derived Big Number rather than a dead click", () => {
    render(<TelemetryOverview />);
    fireEvent.click(screen.getByRole("button", { name: /Timeline.*inspect source/i }));
    // The null reason appears in the empty state and the disabled export reasons — good UX, multiple nodes.
    expect(screen.getAllByText(/Derived range/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Export CSV/i })).toBeDisabled();
  });

  it("drives the Overview era backdrop from the selected Bottleneck Map event (Phase 9B)", () => {
    render(<TelemetryOverview />);
    // No backdrop before any selection — the hero keeps its plain background.
    expect(screen.queryByText(/Backdrop: illustrative/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /select mission event/i }));
    // The mission-era backdrop appears, labeled honestly as illustrative/generative.
    expect(screen.getByText(/Backdrop: illustrative · generative asset/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /illustrative analog launch-pad/i })).toBeInTheDocument();
  });

  it("does not render the serving KPI strip, the Trace-lineage CTA, or Mission Summary scaffolding", () => {
    render(<TelemetryOverview />);
    expect(screen.queryByText("Promoted models")).not.toBeInTheDocument();
    expect(screen.queryByText(/Trace lineage/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Mission readiness")).not.toBeInTheDocument();
  });
});
