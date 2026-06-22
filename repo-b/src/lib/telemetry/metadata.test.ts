import {
  deterministicNodePositions,
  filterMetadataGraph,
  getUpstreamTrace,
  type MetadataFilters,
  type TelemetryMetadataGraph,
} from "./metadata";

const graph: TelemetryMetadataGraph = {
  generated_at: "2026-06-12T12:00:00Z",
  environment: "telemetry-demo",
  status: "ok",
  warnings: [],
  nodes: [
    { id: "src", label: "ISS stream", kind: "stream", layer: "source", status: "fresh", confidence: "explicit", metadata: { feed_type: "streaming" } },
    { id: "bronze", label: "tel_stream_readings_bronze", kind: "table", layer: "bronze", status: "fresh", confidence: "explicit" },
    { id: "silver", label: "tel_stream_readings", kind: "table", layer: "silver", status: "fresh", confidence: "explicit" },
    { id: "gold", label: "tel_stream_minute_agg", kind: "table", layer: "gold", status: "stale", confidence: "explicit" },
    { id: "metric", label: "Anomaly rate", kind: "metric", layer: "metric", status: "unknown", confidence: "inferred", metadata: { owner: "Telemetry Platform" } },
  ],
  edges: [
    { id: "e1", source: "src", target: "bronze", relationship: "streamed_from", confidence: "explicit" },
    { id: "e2", source: "bronze", target: "silver", relationship: "cleans_to", confidence: "explicit" },
    { id: "e3", source: "silver", target: "gold", relationship: "aggregates_to", confidence: "explicit" },
    { id: "e4", source: "gold", target: "metric", relationship: "defines_metric", confidence: "inferred" },
  ],
  stats: {
    source_count: 1,
    bronze_count: 1,
    silver_count: 1,
    gold_count: 1,
    metric_count: 1,
    model_count: 0,
    dashboard_count: 0,
    edge_count: 4,
    unavailable_count: 0,
  },
};

const emptyFilters: MetadataFilters = {
  search: "",
  layer: "",
  objectType: "",
  feedType: "",
  status: "",
};

describe("telemetry metadata graph helpers", () => {
  it("filters by search, layer aliases, feed type, and status while pruning edges", () => {
    expect(filterMetadataGraph(graph, { ...emptyFilters, search: "owner" }).nodes.map((n) => n.id)).toEqual(["metric"]);
    expect(filterMetadataGraph(graph, { ...emptyFilters, layer: "stream" }).nodes.map((n) => n.id)).toEqual(["src"]);
    expect(filterMetadataGraph(graph, { ...emptyFilters, feedType: "streaming" }).nodes.map((n) => n.id)).toEqual(["src"]);
    const stale = filterMetadataGraph(graph, { ...emptyFilters, status: "stale" });
    expect(stale.nodes.map((n) => n.id)).toEqual(["gold"]);
    expect(stale.edges).toEqual([]);
  });

  it("returns the complete upstream chain without following downstream branches", () => {
    const trace = getUpstreamTrace("metric", graph.edges);
    expect([...trace.nodeIds]).toEqual(expect.arrayContaining(["metric", "gold", "silver", "bronze", "src"]));
    expect([...trace.edgeIds]).toEqual(expect.arrayContaining(["e1", "e2", "e3", "e4"]));
  });

  it("assigns stable layer columns and label-sorted rows", () => {
    const positions = deterministicNodePositions([...graph.nodes].reverse());
    expect(positions.get("src")?.x).toBe(0);
    expect(positions.get("bronze")?.x).toBe(270);
    expect(positions.get("metric")?.x).toBe(1080);
  });
});
