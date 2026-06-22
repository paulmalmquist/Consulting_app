"use client";

// Metric Lineage Explorer — the first data-backed redesign surface. Lists the governed metrics
// from the live telemetry metadata catalog (/api/telemetry/metadata/graph) and opens the reusable
// LineageDrawer to trace each one to its source. Data-backed and fail-closed: real catalog values
// where present, explicit null states where not. Visual polish (RS language) is a later phase.

import { useEffect, useState } from "react";

import {
  TELEMETRY_DEMO_BUSINESS_ID,
  TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  getMetadataGraph,
  type TelemetryMetadataGraph,
  type TelemetryMetadataNode,
} from "@/lib/telemetry/metadata";
import {
  C,
  DisclosureFooter,
  EmptyState,
  Loading,
  MetricCard,
  PageHeading,
  Panel,
  StatGrid,
  Tag,
} from "../primitives";
import LineageDrawer from "./LineageDrawer";

function formatTs(value?: string | null) {
  if (!value) return "as-of unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

export default function MetricLineageExplorer({ envId }: { envId: string }) {
  const [graph, setGraph] = useState<TelemetryMetadataGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TelemetryMetadataNode | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getMetadataGraph(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID, envId)
      .then((g) => {
        if (active) setGraph(g);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [envId, reload]);

  const heading = (
    <PageHeading
      eyebrow="Evidence & Lineage"
      title="Metric Lineage Explorer"
      blurb="Every governed metric, traced to its source. Click a metric to see its full upstream chain (gold to silver to bronze to source) with freshness and owner. Lineage is read live from the telemetry metadata catalog; a metric with no cataloged source shows 'No lineage yet' rather than implying provenance."
    />
  );

  if (loading && !graph) return <>{heading}<Loading label="Loading metric catalog..." /></>;
  if (error || !graph) {
    // Fail closed gracefully: the metadata-graph endpoint did not return a catalog (e.g. the route
    // is not yet available on this deployment's backend). Show a dignified null state with a
    // null_reason + retry — never a raw error, and never a fabricated chain.
    return (
      <>
        {heading}
        <Panel title="Lineage index unavailable" right={<Tag color={C.amber}>fail-closed</Tag>}>
          <p style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, lineHeight: 1.6, margin: 0 }}>
            null_reason: metadata_graph_unreachable — the telemetry metadata-graph endpoint did not return a
            catalog in this deployment, so no lineage can be shown. This fails closed rather than rendering a
            fabricated chain.
          </p>
          {error && (
            <p style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.5, marginTop: 8 }}>
              Detail: {error}
            </p>
          )}
          <button type="button" onClick={() => setReload((r) => r + 1)}
            style={{ marginTop: 12, fontFamily: C.mono, fontSize: 12, color: C.cyan, background: "transparent",
              border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>
            Retry
          </button>
        </Panel>
        <DisclosureFooter />
      </>
    );
  }

  const metrics = graph.nodes
    .filter((n) => n.kind === "metric")
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      {heading}

      {graph.status !== "ok" && (
        <div
          role="status"
          style={{
            border: `1px solid ${C.amber}`,
            background: "rgba(243,177,74,0.10)",
            borderRadius: 8,
            padding: "10px 14px",
            margin: "0 0 16px",
            color: C.amber,
            fontFamily: C.mono,
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          Catalog status: {graph.status} — some enrichments are unavailable; affected nodes fail closed.
          {graph.warnings?.length ? ` (${graph.warnings.map((w) => w.message).join("; ")})` : ""}
        </div>
      )}

      <StatGrid cols={4}>
        <MetricCard label="Governed metrics" value={String(graph.stats.metric_count)} accent={C.cyan} />
        <MetricCard label="Gold tables" value={String(graph.stats.gold_count)} />
        <MetricCard label="Lineage edges" value={String(graph.stats.edge_count)} />
        <MetricCard
          label="Unavailable nodes"
          value={String(graph.stats.unavailable_count)}
          accent={graph.stats.unavailable_count > 0 ? C.amber : undefined}
        />
      </StatGrid>

      <Panel
        title="Governed metrics"
        right={<Tag color={C.cyan}>{metrics.length} metrics · {formatTs(graph.generated_at)}</Tag>}
        style={{ marginTop: 16 }}
      >
        {metrics.length === 0 ? (
          <EmptyState
            label="No governed metrics in the catalog yet"
            hint="Metric lineage appears once metric nodes are cataloged in metadata_catalog.json."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {metrics.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  textAlign: "left",
                  width: "100%",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  background: C.panelHi,
                  padding: "11px 13px",
                  cursor: "pointer",
                  color: C.text,
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 12.5, color: C.text }}>{m.label}</span>
                  {m.description && (
                    <span
                      style={{
                        display: "block",
                        fontFamily: C.mono,
                        fontSize: 10,
                        color: C.faint,
                        marginTop: 3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 460,
                      }}
                    >
                      {m.description}
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <Tag color={m.status === "fresh" ? C.green : m.status === "missing" ? C.red : C.amber}>
                    {m.status ?? "unknown"}
                  </Tag>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, letterSpacing: "0.03em",
                    border: `1px solid ${C.cyan}55`, background: `${C.cyan}14`, borderRadius: 6, padding: "5px 11px", whiteSpace: "nowrap" }}>
                    Trace source →
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>
          Source: telemetry metadata catalog + enrichment SQL over tel_* tables. Lineage is live; no values are
          seeded. A metric with no upstream edge renders the no-lineage-yet state instead of implying provenance.
        </div>
      </Panel>

      <LineageDrawer
        node={selected}
        nodes={graph.nodes}
        edges={graph.edges}
        generatedAt={graph.generated_at}
        onClose={() => setSelected(null)}
      />

      <DisclosureFooter />
    </>
  );
}
