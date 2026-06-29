import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Stub the heavy Bottleneck Map (recharts) — its own tests cover its behavior. The stub exposes a button
// that mimics the real map: it reports the clicked node up via onSelectNode AND surfaces a full resolved
// event via onSelectedEventChange, so both the Overview→backdrop wiring (Phase 9B) and the new
// selected-node hero are testable here. (The real presenter→hero path is covered in the .presenter test.)
vi.mock("./context/BottleneckMap/BottleneckMap", () => ({
  default: ({ onSelectedEventChange, onSelectNode, onPresentingChange }: {
    onSelectedEventChange?: (e: unknown) => void;
    onSelectNode?: (id: string | null) => void;
    onPresentingChange?: (p: boolean) => void;
  }) => {
    const sample = {
      id: "sputnik", name: "Sputnik 1", date: "1957-10-04",
      vehicle: "R-7 / Sputnik 8K71PS (USSR)", type: "mission",
      caption: "Orbit access itself is the achievement.",
      metrics: [["Payload", "83.6 kg"], ["Telemetry", "~2 analog channels"], ["Orbit lifetime", "92 days"], ["World launches that year", "3"]],
      bottleneckSolved: "Reaching orbit at all",
      bottleneckCreated: "Doing anything useful once there",
      dataProduct: "Doppler tracking as the first orbital data pipeline",
      color: "#6CA8F0", dimLabel: "Mission achievement",
    };
    return (
      <div data-testid="bottleneck-map">
        charts
        <button type="button" onClick={() => { onSelectNode?.("sputnik"); onSelectedEventChange?.(sample); }}>
          select mission event
        </button>
        {/* mimic the real map reporting walkthrough state up so the hero can render Play vs Stop */}
        <button type="button" onClick={() => onPresentingChange?.(true)}>mock start presenting</button>
      </div>
    );
  },
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
    expect(screen.queryByTestId("overview-backdrop-theme")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /select mission event/i }));
    // The selected node's era backdrop appears, labeled honestly as illustrative (curated era photo or
    // generative motif — wording varies by asset, so assert the honest framing, not a specific credit).
    expect(screen.getByTestId("overview-backdrop-theme")).toBeInTheDocument();
    expect(screen.getByText(/illustrative/i)).toBeInTheDocument();
  });

  it("shows an icon-only Play control in the hero (no 'Play the story' text) and swaps to Stop while presenting", () => {
    render(<TelemetryOverview />);
    // Not presenting: an icon-only Play control with an accessible label, no visible Play/Stop text.
    expect(screen.getByRole("button", { name: "Play story" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop story" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Play the story/i)).not.toBeInTheDocument();
    // Map reports the walkthrough started → the control flips to Stop.
    fireEvent.click(screen.getByRole("button", { name: /mock start presenting/i }));
    expect(screen.getByRole("button", { name: "Stop story" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play story" })).not.toBeInTheDocument();
  });

  it("does not render the serving KPI strip, the Trace-lineage CTA, or Mission Summary scaffolding", () => {
    render(<TelemetryOverview />);
    expect(screen.queryByText("Promoted models")).not.toBeInTheDocument();
    expect(screen.queryByText(/Trace lineage/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Mission readiness")).not.toBeInTheDocument();
  });

  it("shows the overview hero (not a node hero) on first load", () => {
    render(<TelemetryOverview />);
    expect(screen.getByRole("heading", { name: "Why Launch Became A Data Problem" })).toBeInTheDocument();
    // No node is pre-selected: the selected-node hero and its Back affordance are absent.
    expect(screen.queryByRole("button", { name: "Back to overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sputnik 1" })).not.toBeInTheDocument();
  });

  it("swaps the hero to the selected node and replaces the Big Numbers row", () => {
    render(<TelemetryOverview />);
    fireEvent.click(screen.getByRole("button", { name: /select mission event/i }));

    // The hero now IS the node: title, caption, the node's KPIs, an explanation card, and the CTA.
    expect(screen.getByRole("heading", { name: "Sputnik 1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Why Launch Became A Data Problem" })).not.toBeInTheDocument();
    // "83.6 kg" appears in the hero KPI card AND as a faint backdrop fact mark — assert ≥1.
    expect(screen.getAllByText("83.6 kg").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Reaching orbit at all")).toBeInTheDocument();
    // The hero CTA anchor reads "Mission Control →" (the demo bridge link below reads "Mission Control").
    expect(screen.getByText("Mission Control →").closest("a")).toHaveAttribute("href", "/lab/env/env-test/telemetry/stream");
    // The historical Big Numbers band is replaced by the node KPIs, not duplicated.
    expect(screen.queryByText("Launch attempts")).not.toBeInTheDocument();
  });

  it("returns to the overview hero from Back to overview", () => {
    render(<TelemetryOverview />);
    fireEvent.click(screen.getByRole("button", { name: /select mission event/i }));
    expect(screen.getByRole("heading", { name: "Sputnik 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));
    expect(screen.getByRole("heading", { name: "Why Launch Became A Data Problem" })).toBeInTheDocument();
    expect(screen.getByText("Launch attempts")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sputnik 1" })).not.toBeInTheDocument();
  });
});
