"use client";

import { apiFetch } from "@/lib/api";

export type MetadataStatus = "fresh" | "stale" | "missing" | "quarantined" | "unknown";
export type MetadataConfidence = "explicit" | "inferred" | "unknown";

export type TelemetryMetadataGraph = {
  generated_at: string;
  env_id?: string;
  environment?: string;
  status: "ok" | "partial" | "error";
  warnings: MetadataWarning[];
  nodes: TelemetryMetadataNode[];
  edges: TelemetryMetadataEdge[];
  stats: {
    source_count: number;
    bronze_count: number;
    silver_count: number;
    gold_count: number;
    metric_count: number;
    model_count: number;
    dashboard_count: number;
    edge_count: number;
    unavailable_count: number;
  };
};

export type TelemetryMetadataNode = {
  id: string;
  label: string;
  kind:
    | "source"
    | "stream"
    | "table"
    | "view"
    | "pipeline"
    | "metric"
    | "dashboard"
    | "report"
    | "model"
    | "ai_consumer"
    | "api";
  layer?:
    | "source"
    | "bronze"
    | "silver"
    | "gold"
    | "metric"
    | "consumer"
    | "model"
    | "runtime";
  schema?: string;
  object_name?: string;
  description?: string;
  status?: MetadataStatus;
  confidence: MetadataConfidence;
  metadata?: Record<string, unknown>;
};

export type TelemetryMetadataEdge = {
  id: string;
  source: string;
  target: string;
  relationship:
    | "ingests_to"
    | "cleans_to"
    | "aggregates_to"
    | "defines_metric"
    | "feeds_dashboard"
    | "feeds_model"
    | "used_by_ai"
    | "streamed_from"
    | "batch_loaded_from"
    | "quality_checked_by"
    | "quarantines_to"
    | "exports_to"
    | "references";
  confidence: MetadataConfidence;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type MetadataWarning = {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
};

export type MetadataFilters = {
  search: string;
  layer: string;
  objectType: string;
  feedType: string;
  status: string;
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export function metadataFeedType(node: TelemetryMetadataNode): string {
  return normalize(node.metadata?.feed_type);
}

export function nodeMatchesLayer(node: TelemetryMetadataNode, layer: string): boolean {
  if (!layer) return true;
  if (layer === "dashboard") return node.kind === "dashboard" || node.kind === "report";
  if (layer === "ai") return node.kind === "ai_consumer";
  if (layer === "stream") return node.kind === "stream";
  if (layer === "model") return node.kind === "model" || node.layer === "model";
  return node.layer === layer;
}

export function filterMetadataGraph(
  graph: TelemetryMetadataGraph,
  filters: MetadataFilters,
): Pick<TelemetryMetadataGraph, "nodes" | "edges"> {
  const search = filters.search.trim().toLowerCase();
  const nodes = graph.nodes.filter((node) => {
    const searchable = [
      node.label,
      node.kind,
      node.layer,
      node.schema,
      node.object_name,
      node.description,
      JSON.stringify(node.metadata ?? {}),
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!search || searchable.includes(search)) &&
      nodeMatchesLayer(node, filters.layer) &&
      (!filters.objectType || node.kind === filters.objectType) &&
      (!filters.feedType || metadataFeedType(node) === normalize(filters.feedType)) &&
      (!filters.status || (node.status ?? "unknown") === filters.status)
    );
  });
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  return { nodes, edges };
}

export function getUpstreamTrace(
  nodeId: string,
  edges: TelemetryMetadataEdge[],
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>([nodeId]);
  const edgeIds = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const target = queue.shift() as string;
    for (const edge of edges) {
      if (edge.target !== target || edgeIds.has(edge.id)) continue;
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.source)) {
        nodeIds.add(edge.source);
        queue.push(edge.source);
      }
    }
  }

  return { nodeIds, edgeIds };
}

export type MetadataVisualLane =
  | "source"
  | "bronze"
  | "silver"
  | "gold"
  | "metric"
  | "consumer"
  | "model"
  | "runtime";

export const METADATA_LANES: MetadataVisualLane[] = [
  "source",
  "bronze",
  "silver",
  "gold",
  "metric",
  "consumer",
  "model",
  "runtime",
];

export function metadataVisualLane(node: TelemetryMetadataNode): MetadataVisualLane {
  if (node.kind === "stream") return "source";
  if (node.kind === "dashboard" || node.kind === "report") return "consumer";
  if (node.kind === "model") return "model";
  if (node.kind === "ai_consumer" || node.kind === "api") return "runtime";
  if (node.layer && METADATA_LANES.includes(node.layer as MetadataVisualLane)) {
    return node.layer as MetadataVisualLane;
  }
  return "runtime";
}

export function deterministicNodePositions(nodes: TelemetryMetadataNode[]) {
  const laneRows = new Map<MetadataVisualLane, TelemetryMetadataNode[]>();
  for (const lane of METADATA_LANES) laneRows.set(lane, []);
  for (const node of nodes) laneRows.get(metadataVisualLane(node))?.push(node);

  const positions = new Map<string, { x: number; y: number }>();
  METADATA_LANES.forEach((lane, column) => {
    const rows = [...(laneRows.get(lane) ?? [])].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    rows.forEach((node, row) => {
      positions.set(node.id, { x: column * 270, y: row * 118 });
    });
  });
  return positions;
}

export function getMetadataGraph(
  servingEnvId: string,
  businessId: string,
  routeEnvId: string,
) {
  return apiFetch<TelemetryMetadataGraph>("/api/telemetry/metadata/graph", {
    params: { env_id: servingEnvId, business_id: businessId },
    headers: { "x-telemetry-route-env-id": routeEnvId },
  });
}
