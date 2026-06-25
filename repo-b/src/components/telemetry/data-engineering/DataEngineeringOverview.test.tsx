import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/telemetry/api", () => ({
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "biz-1",
}));

const getMetadataGraph = vi.fn();
vi.mock("@/lib/telemetry/metadata", async (orig) => ({
  ...(await orig<typeof import("@/lib/telemetry/metadata")>()),
  getMetadataGraph: (...args: unknown[]) => getMetadataGraph(...args),
}));

const getSkillRegistry = vi.fn(() => Promise.resolve({ tools: [], modules: [], null_reason: null }));
const getReceipts = vi.fn(() => Promise.resolve({ runs: [], null_reason: null }));
vi.mock("@/lib/automated-data-engineering/api", () => ({
  getSkillRegistry: () => getSkillRegistry(),
  getReceipts: () => getReceipts(),
}));

import DataEngineeringOverview from "./DataEngineeringOverview";

const graph = {
  generated_at: "2026-06-24T00:00:00Z",
  status: "ok",
  warnings: [],
  nodes: [
    { id: "s1", label: "Sensor readings", kind: "table", layer: "source", confidence: "explicit", status: "fresh", metadata: { grain: "ts x channel x run" } },
  ],
  edges: [],
  stats: { source_count: 1, bronze_count: 0, silver_count: 0, gold_count: 0, metric_count: 0, model_count: 0, dashboard_count: 0, edge_count: 0, unavailable_count: 0 },
};

describe("DataEngineeringOverview", () => {
  beforeEach(() => getMetadataGraph.mockReset());

  it("names the two operating modes once the catalog loads", async () => {
    getMetadataGraph.mockResolvedValue(graph);
    render(<DataEngineeringOverview envId="env-1" />);
    expect(await screen.findByText("Agent Workbench")).toBeInTheDocument();
    expect(screen.getByText("Run Autopsy")).toBeInTheDocument();
    expect(screen.getByText("Tables with grain")).toBeInTheDocument();
  });

  it("fails closed (no substitute counts) when the metadata catalog is unavailable", async () => {
    // Same render branch as a 404 from the endpoint: no usable graph -> fail-closed banner,
    // not a substitute number. (Resolve-null mirrors the proven MetricLineageExplorer pattern.)
    getMetadataGraph.mockResolvedValue(null);
    render(<DataEngineeringOverview envId="env-1" />);
    expect(await screen.findByText(/Metadata catalog unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/metadata_graph_unreachable/)).toBeInTheDocument();
  });
});
