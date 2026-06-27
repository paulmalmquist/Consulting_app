import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as metadataApi from "@/lib/telemetry/metadata";
import type { TelemetryMetadataGraph } from "@/lib/telemetry/metadata";
import TelemetryMetadataExplorer from "./TelemetryMetadataExplorer";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({
    nodes,
    edges,
    onNodeClick,
    children,
  }: {
    nodes: { id: string; data: { node: { label: string } } }[];
    edges: { id: string; style?: { strokeDasharray?: string } }[];
    onNodeClick?: (event: unknown, node: { id: string }) => void;
    children?: React.ReactNode;
  }) => (
    <div data-testid="mock-react-flow">
      {nodes.map((node) => (
        <button key={node.id} onClick={() => onNodeClick?.({}, node)}>
          {node.data.node.label}
        </button>
      ))}
      {edges.map((edge) => (
        <span
          key={edge.id}
          data-testid={`flow-edge-${edge.id}`}
          data-dash={edge.style?.strokeDasharray ?? ""}
        />
      ))}
      {children}
    </div>
  ),
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  MarkerType: { ArrowClosed: "arrowclosed" },
  BackgroundVariant: { Dots: "dots" },
}));

const graph: TelemetryMetadataGraph = {
  generated_at: "2026-06-12T12:00:00Z",
  env_id: "telemetry-demo",
  environment: "telemetry-demo",
  status: "partial",
  warnings: [
    {
      code: "POSTGRES_METADATA_UNAVAILABLE",
      message: "Runtime column enrichment is unavailable.",
      severity: "warning",
    },
  ],
  nodes: [
    {
      id: "iss",
      label: "ISS stream",
      kind: "stream",
      layer: "source",
      status: "fresh",
      confidence: "explicit",
      metadata: { feed_type: "streaming", frequency: "1 Hz" },
    },
    {
      id: "gold",
      label: "tel_stream_minute_agg",
      kind: "table",
      layer: "gold",
      schema: "public",
      object_name: "tel_stream_minute_agg",
      status: "stale",
      confidence: "explicit",
      metadata: {
        primary_key: ["env_id", "business_id", "bucket"],
        unavailable_reason: "No runtime database connection.",
      },
    },
    {
      id: "metric",
      label: "Anomaly rate",
      kind: "metric",
      layer: "metric",
      status: "unknown",
      confidence: "inferred",
      metadata: {
        definition: "Share of readings marked anomalous.",
        formula: "anomalous readings / total readings",
        owner: "Telemetry Platform",
        grain: "minute",
      },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "iss",
      target: "gold",
      relationship: "streamed_from",
      confidence: "explicit",
    },
    {
      id: "e2",
      source: "gold",
      target: "metric",
      relationship: "defines_metric",
      confidence: "inferred",
      description: "Metric source is inferred from the serving query.",
    },
  ],
  stats: {
    source_count: 1,
    bronze_count: 0,
    silver_count: 0,
    gold_count: 1,
    metric_count: 1,
    model_count: 0,
    dashboard_count: 0,
    edge_count: 2,
    unavailable_count: 1,
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TelemetryMetadataExplorer", () => {
  it("shows a loading state while the graph request is pending", () => {
    vi.spyOn(metadataApi, "getMetadataGraph").mockReturnValue(new Promise(() => {}));
    render(<TelemetryMetadataExplorer envId="route-env" />);
    expect(screen.getByLabelText("Loading telemetry metadata")).toBeInTheDocument();
  });

  it("renders partial status, separates scopes, and opens inferred lineage details", async () => {
    vi.spyOn(metadataApi, "getMetadataGraph").mockResolvedValue(graph);
    const user = userEvent.setup();
    render(<TelemetryMetadataExplorer envId="route-env" />);

    expect(await screen.findByRole("heading", { name: "Telemetry Metadata Explorer" })).toBeInTheDocument();
    expect(screen.getByText("route-env")).toBeInTheDocument();
    expect(screen.getByText("telemetry-demo")).toBeInTheDocument();
    expect(screen.getByText("Runtime column enrichment is unavailable.")).toBeInTheDocument();
    expect(screen.getByTestId("flow-edge-e2")).toHaveAttribute("data-dash", "7 5");

    await user.click(screen.getByRole("button", { name: /Anomaly rate metric/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Share of readings marked anomalous.")).toBeInTheDocument();
    expect(screen.getByText("Upstream feeds")).toBeInTheDocument();
    expect(screen.getAllByText("inferred").length).toBeGreaterThan(0);
  });

  it("filters the explorer and graph using search", async () => {
    vi.spyOn(metadataApi, "getMetadataGraph").mockResolvedValue(graph);
    const user = userEvent.setup();
    render(<TelemetryMetadataExplorer envId="route-env" />);
    await screen.findByRole("heading", { name: "Telemetry Metadata Explorer" });

    await user.type(
      screen.getByPlaceholderText("Search schemas, tables, metrics, consumers..."),
      "ISS",
    );
    expect(screen.getByRole("button", { name: /ISS stream stream/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Anomaly rate metric/i })).not.toBeInTheDocument();
  });

  it("shows an error with a working retry path", async () => {
    const request = vi
      .spyOn(metadataApi, "getMetadataGraph")
      .mockRejectedValueOnce(new Error("backend unavailable"))
      .mockResolvedValueOnce(graph);
    const user = userEvent.setup();
    render(<TelemetryMetadataExplorer envId="route-env" />);

    expect(await screen.findByText("Metadata graph unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: "Telemetry Metadata Explorer" })).toBeInTheDocument();
  });
});
