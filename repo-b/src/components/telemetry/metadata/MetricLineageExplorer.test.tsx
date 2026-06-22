import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/lib/telemetry/api", () => ({
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "biz-1",
}));

// Mock only getMetadataGraph; keep the real types/helpers (getUpstreamTrace etc.).
const getMetadataGraph = vi.fn();
vi.mock("@/lib/telemetry/metadata", async (orig) => ({
  ...(await orig<typeof import("@/lib/telemetry/metadata")>()),
  getMetadataGraph: (...args: unknown[]) => getMetadataGraph(...args),
}));

import MetricLineageExplorer from "./MetricLineageExplorer";

const graphWithOneMetric = {
  generated_at: "2026-06-22T00:00:00Z",
  status: "ok",
  warnings: [],
  nodes: [
    { id: "m1", label: "Flight Readiness", kind: "metric", layer: "metric", confidence: "explicit", status: "fresh",
      metadata: { formula: "weighted sub-indices", owner: "Test Operations" } },
  ],
  edges: [],
  stats: { source_count: 0, bronze_count: 0, silver_count: 0, gold_count: 1, metric_count: 1, model_count: 0, dashboard_count: 0, edge_count: 0, unavailable_count: 0 },
};

describe("MetricLineageExplorer", () => {
  beforeEach(() => getMetadataGraph.mockReset());

  it("fails closed gracefully when the metadata graph is unavailable (no catalog returned)", async () => {
    // Same render branch as a 404 from the endpoint: no usable graph -> dignified null state, not a raw error.
    getMetadataGraph.mockImplementation(() => Promise.resolve(null));
    render(<MetricLineageExplorer envId="env-1" />);
    expect(await screen.findByText("Lineage index unavailable")).toBeInTheDocument();
    expect(screen.getByText(/metadata_graph_unreachable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("lists governed metrics with a trace-source affordance when the catalog loads", async () => {
    getMetadataGraph.mockImplementation(() => Promise.resolve(graphWithOneMetric));
    render(<MetricLineageExplorer envId="env-1" />);
    expect(await screen.findByText("Flight Readiness")).toBeInTheDocument();
    expect(screen.getByText("Trace source →")).toBeInTheDocument();
  });
});
