"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  TELEMETRY_DEMO_BUSINESS_ID,
  TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  deterministicNodePositions,
  filterMetadataGraph,
  getMetadataGraph,
  getUpstreamTrace,
  metadataVisualLane,
  type MetadataFilters,
  type TelemetryMetadataGraph,
  type TelemetryMetadataNode,
} from "@/lib/telemetry/metadata";
import { C, EmptyState, Panel, Tag } from "../primitives";
import { TelemetryPageHeader } from "../TelemetryPageHeader";
import MetadataDetailDrawer from "./MetadataDetailDrawer";
import MetadataGraphNode, {
  type MetadataFlowNode,
} from "./MetadataGraphNode";

const NODE_TYPES: NodeTypes = {
  metadataNode: MetadataGraphNode,
};

const EMPTY_FILTERS: MetadataFilters = {
  search: "",
  layer: "",
  objectType: "",
  feedType: "",
  status: "",
};

const LAYER_OPTIONS = [
  ["", "All layers"],
  ["source", "Source"],
  ["bronze", "Bronze"],
  ["silver", "Silver"],
  ["gold", "Gold"],
  ["metric", "Metric"],
  ["dashboard", "Dashboard"],
  ["model", "Model"],
  ["ai", "AI"],
  ["stream", "Stream"],
];

const OBJECT_OPTIONS = [
  ["", "All object types"],
  ["table", "Table"],
  ["view", "View"],
  ["pipeline", "Pipeline"],
  ["stream", "Stream"],
  ["metric", "Metric"],
  ["report", "Report"],
  ["model", "Model"],
  ["api", "API"],
];

const FEED_OPTIONS = [
  ["", "All feed types"],
  ["batch", "Batch"],
  ["streaming", "Streaming"],
  ["seeded", "Seeded"],
  ["api_write", "API write"],
  ["simulated", "Simulated"],
  ["derived", "Derived"],
];

const STATUS_OPTIONS = [
  ["", "All statuses"],
  ["fresh", "Fresh"],
  ["stale", "Stale"],
  ["missing", "Missing"],
  ["quarantined", "Quarantined"],
  ["unknown", "Unknown"],
];

const EXPLORER_GROUPS = [
  "Sources / simulators",
  "Bronze",
  "Silver",
  "Gold",
  "Metric registry",
  "Consumers",
  "Models",
  "Runtime / AI",
] as const;

function explorerGroup(node: TelemetryMetadataNode): (typeof EXPLORER_GROUPS)[number] {
  const lane = metadataVisualLane(node);
  if (lane === "source") return "Sources / simulators";
  if (lane === "bronze") return "Bronze";
  if (lane === "silver") return "Silver";
  if (lane === "gold") return "Gold";
  if (lane === "metric") return "Metric registry";
  if (lane === "consumer") return "Consumers";
  if (lane === "model") return "Models";
  return "Runtime / AI";
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

function freshnessSummary(graph: TelemetryMetadataGraph) {
  if (graph.nodes.some((node) => node.status === "missing")) return "missing metadata";
  if (graph.nodes.some((node) => node.status === "quarantined")) return "quarantined assets";
  if (graph.nodes.some((node) => node.status === "stale")) return "stale assets";
  if (graph.nodes.some((node) => node.status === "fresh")) return "fresh";
  return "unknown";
}

function StatusPill({ graph }: { graph: TelemetryMetadataGraph }) {
  const color = graph.status === "ok" ? C.green : graph.status === "partial" ? C.amber : C.red;
  return <Tag color={color}>{graph.status}</Tag>;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span
        style={{
          color: C.faint,
          fontFamily: C.mono,
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          minHeight: 38,
          borderRadius: 7,
          border: `1px solid ${C.borderHi}`,
          background: C.panelHi,
          color: C.text,
          fontFamily: C.mono,
          fontSize: 11,
          padding: "0 30px 0 10px",
        }}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue || "all"} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function LoadingState() {
  return (
    <div aria-label="Loading telemetry metadata" style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          height: 118,
          borderRadius: 10,
          background: `linear-gradient(90deg, ${C.panel}, ${C.panelHi}, ${C.panel})`,
        }}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <div style={{ height: 520, borderRadius: 10, background: C.panel }} />
        <div style={{ height: 520, borderRadius: 10, background: C.panel }} />
      </div>
      <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11 }}>
        Loading reviewed catalog and optional runtime metadata...
      </span>
    </div>
  );
}

export default function TelemetryMetadataExplorer({ envId }: { envId: string }) {
  const [graph, setGraph] = useState<TelemetryMetadataGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MetadataFilters>(EMPTY_FILTERS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const nextGraph = await getMetadataGraph(
        TELEMETRY_DEMO_ENV_ID,
        TELEMETRY_DEMO_BUSINESS_ID,
        envId,
      );
      if (requestSequence.current === requestId) setGraph(nextGraph);
    } catch (reason) {
      if (requestSequence.current === requestId) {
        setError(reason instanceof Error ? reason.message : "Metadata graph unavailable.");
      }
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [envId]);

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  const filtered = useMemo(
    () => (graph ? filterMetadataGraph(graph, filters) : { nodes: [], edges: [] }),
    [filters, graph],
  );
  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const traceEligible = selectedNode?.kind === "metric" || selectedNode?.layer === "gold";
  const trace = useMemo(
    () =>
      selectedNodeId && graph && traceEligible
        ? getUpstreamTrace(selectedNodeId, graph.edges)
        : {
            nodeIds: new Set(selectedNodeId ? [selectedNodeId] : []),
            edgeIds: new Set<string>(),
          },
    [graph, selectedNodeId, traceEligible],
  );

  const flowElements = useMemo(() => {
    const positions = deterministicNodePositions(filtered.nodes);
    const nodes: MetadataFlowNode[] = filtered.nodes.map((node) => ({
      id: node.id,
      type: "metadataNode",
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: {
        node,
        selected: node.id === selectedNodeId,
        traced: trace.nodeIds.has(node.id),
      },
    }));
    const edges: Edge[] = filtered.edges.map((edge) => {
      const highlighted = trace.edgeIds.has(edge.id);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.relationship.replace(/_/g, " "),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: highlighted ? C.cyan : C.faint,
          width: 15,
          height: 15,
        },
        style: {
          stroke: highlighted ? C.cyan : edge.confidence === "inferred" ? C.amber : C.faint,
          strokeWidth: highlighted ? 2.4 : 1.3,
          strokeDasharray:
            edge.confidence === "inferred"
              ? "7 5"
              : edge.confidence === "unknown"
                ? "2 5"
                : undefined,
        },
        labelStyle: {
          fill: highlighted ? C.cyan : C.faint,
          fontSize: 8,
          fontFamily: C.mono,
        },
        labelBgStyle: { fill: C.bg, fillOpacity: 0.88 },
        labelBgPadding: [4, 2] as [number, number],
        animated: false,
      };
    });
    return { nodes, edges };
  }, [filtered, selectedNodeId, trace]);

  const updateFilter = (key: keyof MetadataFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  if (loading && !graph) return <LoadingState />;

  if (error && !graph) {
    return (
      <Panel style={{ borderColor: `${C.red}55` }}>
        <div style={{ color: C.red, fontFamily: C.mono, fontSize: 12 }}>
          Metadata graph unavailable
        </div>
        <div style={{ color: C.dim, fontSize: 12, marginTop: 7 }}>{error}</div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            marginTop: 14,
            minHeight: 38,
            borderRadius: 7,
            border: `1px solid ${C.borderHi}`,
            background: C.panelHi,
            color: C.text,
            padding: "0 14px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </Panel>
    );
  }

  if (!graph) {
    return <EmptyState label="No metadata catalog" hint="The telemetry metadata response was empty." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TelemetryPageHeader
        variant="evidence"
        eyebrow="RS Telemetry / Control Plane"
        title="Telemetry Metadata Explorer"
        description="Schemas, feeds, lineage, and consumers for the RS Telemetry environment"
        actions={
          <>
            <StatusPill graph={graph} />
            <Tag color={freshnessSummary(graph) === "fresh" ? C.green : C.amber}>
              {freshnessSummary(graph)}
            </Tag>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              style={{
                minHeight: 28,
                borderRadius: 6,
                border: `1px solid ${C.borderHi}`,
                background: C.panelHi,
                color: C.dim,
                fontFamily: C.mono,
                fontSize: 9,
                padding: "0 9px",
                cursor: loading ? "wait" : "pointer",
              }}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </>
        }
        metadata={
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              ["Route environment", envId],
              ["Serving data scope", graph.env_id ?? TELEMETRY_DEMO_ENV_ID],
              ["Generated", formatTimestamp(graph.generated_at)],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 7,
                  background: C.panelHi,
                  padding: "10px 11px",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    color: C.faint,
                    fontFamily: C.mono,
                    fontSize: 8,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    color: C.text,
                    fontFamily: C.mono,
                    fontSize: 11,
                    marginTop: 5,
                    overflowWrap: "anywhere",
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        }
      />

      <div
        style={{
          border: `1px solid ${C.border}`,
          background: C.panel,
          borderRadius: 11,
          padding: 18,
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(130px,0.55fr))_auto]" style={{ alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span
              style={{
                color: C.faint,
                fontFamily: C.mono,
                fontSize: 9,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Search
            </span>
            <input
              type="search"
              placeholder="Search schemas, tables, metrics, consumers..."
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              style={{
                minHeight: 38,
                borderRadius: 7,
                border: `1px solid ${C.borderHi}`,
                background: C.panelHi,
                color: C.text,
                padding: "0 11px",
                fontFamily: C.mono,
                fontSize: 11,
              }}
            />
          </label>
          <FilterSelect label="Layer" value={filters.layer} options={LAYER_OPTIONS} onChange={(value) => updateFilter("layer", value)} />
          <FilterSelect label="Object type" value={filters.objectType} options={OBJECT_OPTIONS} onChange={(value) => updateFilter("objectType", value)} />
          <FilterSelect label="Feed type" value={filters.feedType} options={FEED_OPTIONS} onChange={(value) => updateFilter("feedType", value)} />
          <FilterSelect label="Status" value={filters.status} options={STATUS_OPTIONS} onChange={(value) => updateFilter("status", value)} />
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            style={{
              minHeight: 38,
              borderRadius: 7,
              border: `1px solid ${C.borderHi}`,
              background: "transparent",
              color: C.dim,
              fontFamily: C.mono,
              fontSize: 10,
              padding: "0 12px",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {graph.warnings.length > 0 && (
        <Panel
          title={graph.status === "partial" ? "Partial metadata" : "Catalog notices"}
          style={{ borderColor: `${C.amber}55` }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {graph.warnings.map((warning) => (
              <div
                key={`${warning.code}-${warning.message}`}
                className="flex flex-col items-start gap-2 sm:flex-row"
              >
                <Tag color={warning.severity === "error" ? C.red : warning.severity === "warning" ? C.amber : C.cyan}>
                  {warning.code}
                </Tag>
                <span
                  style={{
                    color: C.dim,
                    fontFamily: C.mono,
                    fontSize: 11,
                    lineHeight: 1.5,
                    minWidth: 0,
                    overflowWrap: "anywhere",
                  }}
                >
                  {warning.message}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <Panel
          title="Explorer"
          right={
            <span style={{ color: C.faint, fontFamily: C.mono, fontSize: 9 }}>
              {filtered.nodes.length}/{graph.nodes.length}
            </span>
          }
          pad={10}
          style={{ alignSelf: "start" }}
        >
          <div className="max-h-[360px] overflow-y-auto lg:max-h-[680px]">
            {EXPLORER_GROUPS.map((group) => {
              const rows = filtered.nodes
                .filter((node) => explorerGroup(node) === group)
                .sort((a, b) => a.label.localeCompare(b.label));
              if (rows.length === 0) return null;
              return (
                <section key={group} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      color: C.faint,
                      fontFamily: C.mono,
                      fontSize: 8,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      padding: "4px 7px 6px",
                    }}
                  >
                    {group}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {rows.map((node) => {
                      const selected = node.id === selectedNodeId;
                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => setSelectedNodeId(node.id)}
                          aria-pressed={selected}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            minHeight: 38,
                            width: "100%",
                            textAlign: "left",
                            borderRadius: 6,
                            border: `1px solid ${selected ? C.cyan + "55" : "transparent"}`,
                            background: selected ? `${C.cyan}12` : "transparent",
                            color: selected ? C.text : C.dim,
                            padding: "7px 8px",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ fontFamily: C.mono, fontSize: 10, overflowWrap: "anywhere" }}>
                            {node.label}
                          </span>
                          <span style={{ color: C.faint, fontFamily: C.mono, fontSize: 8 }}>
                            {node.kind}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {filtered.nodes.length === 0 && (
              <EmptyState label="No matching objects" hint="Clear or adjust the metadata filters." />
            )}
          </div>
        </Panel>

        <Panel
          title="Lineage graph"
          right={
            <span style={{ display: "flex", alignItems: "center", gap: 9, color: C.faint, fontFamily: C.mono, fontSize: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 18, borderTop: `1px solid ${C.faint}` }} /> explicit
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 18, borderTop: `1px dashed ${C.amber}` }} /> inferred
              </span>
              <span>{traceEligible ? "trace active" : `${filtered.edges.length} edges`}</span>
            </span>
          }
          pad={0}
        >
          <div
            className="h-[520px] lg:h-[680px]"
            data-testid="telemetry-metadata-graph"
            style={{ position: "relative", minWidth: 0 }}
          >
            {filtered.nodes.length > 0 ? (
              <ReactFlow
                nodes={flowElements.nodes}
                edges={flowElements.edges}
                nodeTypes={NODE_TYPES}
                fitView
                fitViewOptions={{ padding: 0.12, minZoom: 0.25, maxZoom: 1 }}
                minZoom={0.18}
                maxZoom={1.6}
                nodesDraggable={false}
                nodesConnectable={false}
                zoomOnDoubleClick={false}
                proOptions={{ hideAttribution: true }}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1}
                  color="rgba(110,150,190,0.09)"
                />
                <Controls
                  showInteractive={false}
                  className="[&_button]:!border-slate-700 [&_button]:!bg-slate-950 [&_button]:!text-slate-300"
                />
              </ReactFlow>
            ) : (
              <div style={{ position: "absolute", inset: 18 }}>
                <EmptyState label="No graph results" hint="The current filters remove every catalog node." />
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {[
          ["Sources", graph.stats.source_count],
          ["Bronze", graph.stats.bronze_count],
          ["Silver", graph.stats.silver_count],
          ["Gold", graph.stats.gold_count],
          ["Metrics", graph.stats.metric_count],
          ["Models", graph.stats.model_count],
          ["Dashboards", graph.stats.dashboard_count],
          ["Unavailable", graph.stats.unavailable_count],
        ].map(([label, value]) => (
          <div key={label} style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 8, padding: 10 }}>
            <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 8, textTransform: "uppercase" }}>{label}</div>
            <div style={{ color: label === "Unavailable" && Number(value) > 0 ? C.amber : C.text, fontFamily: C.mono, fontSize: 18, marginTop: 5 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <MetadataDetailDrawer
        node={selectedNode}
        nodes={graph.nodes}
        edges={graph.edges}
        onClose={() => setSelectedNodeId(null)}
      />
    </div>
  );
}
