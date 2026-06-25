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

import RelationshipsLineage from "./RelationshipsLineage";

// A graph with NO declared FK/grain on the references edge → must not produce a "safe" verdict, and
// the Stargate scenario nodes are absent → scenario must fail closed.
const thinGraph = {
  generated_at: "2026-06-24T00:00:00Z",
  status: "ok",
  warnings: [],
  nodes: [
    { id: "a", label: "Table A", kind: "table", layer: "silver", object_name: "a", confidence: "explicit", status: "fresh", metadata: {} },
    { id: "b", label: "Table B", kind: "table", layer: "silver", object_name: "b", confidence: "explicit", status: "fresh", metadata: {} },
  ],
  edges: [
    { id: "e1", source: "a", target: "b", relationship: "references", confidence: "explicit", metadata: {} },
  ],
  stats: { source_count: 0, bronze_count: 0, silver_count: 2, gold_count: 0, metric_count: 0, model_count: 0, dashboard_count: 0, edge_count: 1, unavailable_count: 0 },
};

describe("RelationshipsLineage (Phase 2A safety)", () => {
  beforeEach(() => getMetadataGraph.mockReset());

  it("renders the safety summary and a verdict that is NOT 'safe' when metadata is insufficient", async () => {
    getMetadataGraph.mockResolvedValue(thinGraph);
    render(<RelationshipsLineage envId="env-1" />);
    // Summary cards present (label also appears in the verdict filter <option>, so allow >1).
    expect((await screen.findAllByText("Bridge required")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unverifiable").length).toBeGreaterThan(0);
    // The single references-edge-with-no-evidence row must read Unverifiable, never Safe.
    // (Card label "Unverifiable" + the row chip "Unverifiable" both render; "Safe" appears only as a
    // summary card label, never as a row verdict here.)
    const rowButton = screen.getByRole("button", { name: /Table A.*Table B|Table A → Table B/i });
    expect(rowButton.textContent).toContain("Unverifiable");
    expect(rowButton.textContent).not.toContain("Safe");
  });

  it("fails the guided scenario closed when the Stargate catalog nodes are absent", async () => {
    getMetadataGraph.mockResolvedValue(thinGraph);
    render(<RelationshipsLineage envId="env-1" />);
    expect(await screen.findByText("Scenario sources not found in catalog")).toBeInTheDocument();
  });

  it("fails closed at the page level when the metadata graph is unavailable", async () => {
    getMetadataGraph.mockResolvedValue(null);
    render(<RelationshipsLineage envId="env-1" />);
    expect(await screen.findByText(/Metadata catalog unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/metadata_graph_unreachable/)).toBeInTheDocument();
  });
});
