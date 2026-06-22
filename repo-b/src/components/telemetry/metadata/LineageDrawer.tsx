"use client";

// Reusable, data-backed lineage drawer — the shared "where did this number come from?" standard.
// Given any catalog node + the full metadata graph, it renders the COMPLETE upstream chain
// (source -> bronze -> silver -> gold -> metric -> consumer/model) computed from getUpstreamTrace,
// plus the node's own definition/owner/freshness fields. Fail-closed: if a node has no cataloged
// upstream edge it renders "No lineage yet" with a null_reason rather than implying provenance.
//
// This is intentionally simple visually (RS polish is a later phase). It is built to be invoked
// from any surface (a Mission Summary KPI, a chart) — keep the props minimal and presentational.

import * as Dialog from "@radix-ui/react-dialog";

import { C, Tag } from "../primitives";
import {
  METADATA_LANES,
  getUpstreamTrace,
  metadataVisualLane,
  type MetadataVisualLane,
  type TelemetryMetadataEdge,
  type TelemetryMetadataNode,
} from "@/lib/telemetry/metadata";

const LANE_LABEL: Record<MetadataVisualLane, string> = {
  source: "Source",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  metric: "Metric",
  consumer: "Consumer",
  model: "Model",
  runtime: "Runtime / AI",
};

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

function isPresent(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

/** A field row that fails closed: missing values render "Not available", never blank. */
function Field({ label, value }: { label: string; value: unknown }) {
  const present = isPresent(value);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(96px,0.8fr) minmax(0,1.5fr)", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: present ? C.dim : C.faint, fontFamily: C.mono, fontSize: 11, lineHeight: 1.5, overflowWrap: "anywhere" }}>
        {present ? String(value) : "Not available"}
      </div>
    </div>
  );
}

/** Detail fields shown for the focused node; metric-aware, all fail-closed. */
function focusFields(node: TelemetryMetadataNode): { label: string; value: unknown }[] {
  const m = node.metadata ?? {};
  if (node.kind === "metric") {
    return [
      { label: "Definition", value: m.definition ?? node.description },
      { label: "Formula", value: m.formula },
      { label: "Owner", value: m.owner },
      { label: "Grain", value: m.grain },
      { label: "Direct source", value: m.source_model ?? m.source_table },
      { label: "Lineage query", value: m.lineage_sql_reference ?? m.query_reference },
      { label: "Freshness as of", value: m.freshness_as_of ?? m.last_updated_at ?? m.last_refreshed },
      { label: "Unavailable reason", value: m.unavailable_reason ?? m.null_reason },
    ];
  }
  return [
    { label: "Object", value: node.object_name ?? node.label },
    { label: "Schema", value: node.schema },
    { label: "Owner", value: m.owner },
    { label: "Freshness as of", value: m.freshness_as_of ?? m.last_updated_at ?? m.last_refreshed },
    { label: "Unavailable reason", value: m.unavailable_reason ?? m.null_reason },
  ];
}

export default function LineageDrawer({
  node,
  nodes,
  edges,
  generatedAt,
  onClose,
}: {
  node: TelemetryMetadataNode | null;
  nodes: TelemetryMetadataNode[];
  edges: TelemetryMetadataEdge[];
  /** graph.generated_at — shown as the lineage freshness/provenance stamp. */
  generatedAt?: string;
  onClose: () => void;
}) {
  // Compute the full upstream trace for the focused node.
  const trace = node ? getUpstreamTrace(node.id, edges) : { nodeIds: new Set<string>(), edgeIds: new Set<string>() };
  const hasLineage = node ? trace.edgeIds.size > 0 : false;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Group the traced nodes (excluding the focus node itself) by lane, ordered source -> consumer.
  const laneGroups: { lane: MetadataVisualLane; nodes: TelemetryMetadataNode[] }[] = [];
  if (node) {
    for (const lane of METADATA_LANES) {
      const laneNodes = [...trace.nodeIds]
        .filter((id) => id !== node.id)
        .map((id) => nodeMap.get(id))
        .filter((n): n is TelemetryMetadataNode => Boolean(n) && metadataVisualLane(n as TelemetryMetadataNode) === lane)
        .sort((a, b) => a.label.localeCompare(b.label));
      if (laneNodes.length) laneGroups.push({ lane, nodes: laneNodes });
    }
  }

  const tracedEdges = node ? edges.filter((e) => trace.edgeIds.has(e.id)) : [];

  return (
    <Dialog.Root open={Boolean(node)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.52)", zIndex: 70 }} />
        <Dialog.Content
          className="fixed bottom-0 left-0 right-0 z-[80] max-h-[86vh] rounded-t-xl lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:h-screen lg:max-h-none lg:w-[460px] lg:rounded-none lg:rounded-l-xl"
          style={{ background: C.rail, border: `1px solid ${C.borderHi}`, color: C.text, overflowY: "auto", padding: 20, boxShadow: "-18px 0 50px rgba(0,0,0,0.38)" }}
        >
          {node && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <Dialog.Title style={{ fontFamily: C.sans, fontSize: 19, fontWeight: 700, overflowWrap: "anywhere" }}>
                    {node.label}
                  </Dialog.Title>
                  <Dialog.Description style={{ color: C.dim, fontFamily: C.mono, fontSize: 10, lineHeight: 1.5, marginTop: 6 }}>
                    Lineage — where this value comes from.
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button type="button" aria-label="Close lineage" style={{ width: 36, height: 36, borderRadius: 7, border: `1px solid ${C.borderHi}`, background: C.panel, color: C.dim, cursor: "pointer", flexShrink: 0 }}>
                    x
                  </button>
                </Dialog.Close>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
                <Tag color={C.cyan}>{node.kind}</Tag>
                <Tag color={C.amber}>{node.layer ?? "runtime"}</Tag>
                <Tag color={node.status === "fresh" ? C.green : node.status === "missing" ? C.red : C.amber}>{node.status ?? "unknown"}</Tag>
                <Tag color={node.confidence === "inferred" ? C.amber : C.cyan}>{node.confidence}</Tag>
              </div>

              {/* Upstream lineage chain */}
              <section style={{ marginTop: 18 }} aria-label="Upstream lineage chain">
                <div style={{ fontFamily: C.mono, color: C.faint, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                  Upstream lineage
                </div>
                {!hasLineage ? (
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 7, background: C.panelHi, padding: "10px 12px", color: C.amber, fontFamily: C.mono, fontSize: 11, lineHeight: 1.5 }}>
                    No lineage yet
                    <div style={{ color: C.faint, fontSize: 10, marginTop: 4 }}>
                      null_reason: no_upstream_edges_in_catalog — this node has no cataloged source.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {laneGroups.map(({ lane, nodes: laneNodes }) => (
                      <div key={lane} style={{ border: `1px solid ${C.border}`, borderRadius: 7, background: C.panelHi, padding: "9px 10px" }}>
                        <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                          {LANE_LABEL[lane]}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {laneNodes.map((n) => (
                            <span key={n.id} title={n.object_name ?? n.label}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel, padding: "3px 8px", color: C.text, fontFamily: C.mono, fontSize: 10 }}>
                              <span style={{ width: 6, height: 6, borderRadius: 999, background: n.status === "fresh" ? C.green : n.status === "missing" ? C.red : C.amber }} />
                              {n.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, marginTop: 2 }}>
                      {trace.nodeIds.size - 1} upstream node(s) · {tracedEdges.length} relationship(s) ·
                      relationships: {[...new Set(tracedEdges.map((e) => humanize(e.relationship)))].join(", ")}
                    </div>
                  </div>
                )}
              </section>

              {/* Focus node detail (fail-closed fields) */}
              <section style={{ marginTop: 18 }} aria-label="Node detail">
                <div style={{ fontFamily: C.mono, color: C.faint, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                  Definition
                </div>
                {focusFields(node).map((f) => (
                  <Field key={f.label} label={f.label} value={f.value} />
                ))}
              </section>

              {/* Provenance stamp */}
              <div style={{ marginTop: 16, color: C.faint, fontFamily: C.mono, fontSize: 9, lineHeight: 1.6 }}>
                Source: telemetry metadata catalog + enrichment (/api/telemetry/metadata/graph).
                {generatedAt ? ` Generated ${generatedAt}.` : " Generated-at unavailable."}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
