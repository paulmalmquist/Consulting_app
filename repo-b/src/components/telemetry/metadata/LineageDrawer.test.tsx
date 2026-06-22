import { render, screen } from "@testing-library/react";
import LineageDrawer from "./LineageDrawer";
import type {
  TelemetryMetadataEdge,
  TelemetryMetadataNode,
} from "@/lib/telemetry/metadata";

// A metric with a real upstream chain: source -> bronze -> silver -> gold -> metric.
const chainNodes: TelemetryMetadataNode[] = [
  { id: "src", label: "GCP Pub/Sub", kind: "source", layer: "source", confidence: "explicit", status: "fresh" },
  { id: "bronze", label: "bronze_raw", kind: "table", layer: "bronze", confidence: "explicit", status: "fresh" },
  { id: "silver", label: "silver_clean", kind: "table", layer: "silver", confidence: "explicit", status: "fresh" },
  { id: "gold", label: "gold_daily", kind: "table", layer: "gold", confidence: "explicit", status: "fresh" },
  {
    id: "m1",
    label: "Flight Readiness",
    kind: "metric",
    layer: "metric",
    confidence: "explicit",
    status: "fresh",
    metadata: { formula: "weighted sub-indices", owner: "Test Operations", freshness_as_of: "2026-06-22T00:00:00Z" },
  },
];
const chainEdges: TelemetryMetadataEdge[] = [
  { id: "e1", source: "src", target: "bronze", relationship: "ingests_to", confidence: "explicit" },
  { id: "e2", source: "bronze", target: "silver", relationship: "cleans_to", confidence: "explicit" },
  { id: "e3", source: "silver", target: "gold", relationship: "aggregates_to", confidence: "explicit" },
  { id: "e4", source: "gold", target: "m1", relationship: "defines_metric", confidence: "explicit" },
];

// A metric with NO upstream edge — must fail closed.
const orphanNode: TelemetryMetadataNode = {
  id: "m2",
  label: "Orphan Metric",
  kind: "metric",
  layer: "metric",
  confidence: "inferred",
  status: "unknown",
};

describe("LineageDrawer — reusable lineage chain", () => {
  it("renders the full upstream chain grouped by layer for a metric with lineage", () => {
    render(
      <LineageDrawer
        node={chainNodes[4]}
        nodes={chainNodes}
        edges={chainEdges}
        generatedAt="2026-06-22T00:00:00Z"
        onClose={() => {}}
      />,
    );
    // Lane headers for each upstream layer present in the trace.
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Bronze")).toBeInTheDocument();
    expect(screen.getByText("Silver")).toBeInTheDocument();
    expect(screen.getByText("Gold")).toBeInTheDocument();
    // Upstream node labels render.
    expect(screen.getByText("GCP Pub/Sub")).toBeInTheDocument();
    expect(screen.getByText("gold_daily")).toBeInTheDocument();
    // Focus-node detail fields render real metadata (not "Not available").
    expect(screen.getByText("weighted sub-indices")).toBeInTheDocument();
    expect(screen.getByText("Test Operations")).toBeInTheDocument();
    // Does NOT show the no-lineage fail-closed state.
    expect(screen.queryByText("No lineage yet")).not.toBeInTheDocument();
  });

  it("fails closed with 'No lineage yet' for a metric with no upstream edge", () => {
    render(
      <LineageDrawer node={orphanNode} nodes={[orphanNode]} edges={[]} onClose={() => {}} />,
    );
    expect(screen.getByText("No lineage yet")).toBeInTheDocument();
    expect(screen.getByText(/no_upstream_edges_in_catalog/)).toBeInTheDocument();
  });

  it("renders nothing when no node is focused", () => {
    const { container } = render(
      <LineageDrawer node={null} nodes={chainNodes} edges={chainEdges} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
