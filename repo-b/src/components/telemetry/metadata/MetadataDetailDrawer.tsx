"use client";

import { C, Tag } from "../primitives";
import { DrawerWrapper, DrawerHeader } from "../drawerPrimitives";
import type {
  TelemetryMetadataEdge,
  TelemetryMetadataNode,
} from "@/lib/telemetry/metadata";

type Relationship = {
  edge: TelemetryMetadataEdge;
  node?: TelemetryMetadataNode;
};

function isPresent(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

function displayValue(value: unknown): React.ReactNode {
  if (!isPresent(value)) return <span style={{ color: C.faint }}>Unavailable</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: C.faint }}>Unavailable</span>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {value.map((item, index) => (
          <div key={index} style={{ overflowWrap: "anywhere" }}>
            {typeof item === "object" && item !== null
              ? Object.entries(item as Record<string, unknown>)
                  .map(([key, entry]) => `${humanize(key)}: ${String(entry ?? "unavailable")}`)
                  .join(" | ")
              : String(item)}
          </div>
        ))}
      </div>
    );
  }
  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        margin: 0,
        fontFamily: C.mono,
        fontSize: 10,
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(100px, 0.8fr) minmax(0, 1.5fr)",
        gap: 12,
        padding: "9px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          color: C.faint,
          fontFamily: C.mono,
          fontSize: 9,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 11, lineHeight: 1.55 }}>
        {displayValue(value)}
      </div>
    </div>
  );
}

function detailFields(node: TelemetryMetadataNode): { label: string; value: unknown }[] {
  const metadata = node.metadata ?? {};
  if (node.kind === "table" || node.kind === "view") {
    return [
      { label: "Object name", value: node.object_name ?? node.label },
      { label: "Schema", value: node.schema },
      { label: "Row count estimate", value: metadata.row_count_estimate ?? metadata.row_count },
      { label: "Last refreshed", value: metadata.last_refreshed ?? metadata.last_updated_at ?? metadata.freshness_as_of },
      { label: "Primary key", value: metadata.primary_key },
      { label: "Foreign keys", value: metadata.foreign_keys },
      { label: "Important columns", value: metadata.columns },
      { label: "Quality checks", value: metadata.quality_checks },
      { label: "Unavailable reason", value: metadata.unavailable_reason ?? metadata.null_reason },
      { label: "Source references", value: metadata.source_references },
    ];
  }
  if (node.kind === "metric") {
    return [
      { label: "Definition", value: metadata.definition ?? node.description },
      { label: "Formula", value: metadata.formula },
      { label: "Owner", value: metadata.owner },
      { label: "Grain", value: metadata.grain },
      { label: "Source model/table", value: metadata.source_model ?? metadata.source_table },
      { label: "Downstream answers", value: metadata.downstream_consumers },
      { label: "Lineage query", value: metadata.lineage_sql_reference ?? metadata.query_reference },
      { label: "Freshness as of", value: metadata.freshness_as_of },
      { label: "Unavailable reason", value: metadata.unavailable_reason ?? metadata.null_reason },
    ];
  }
  if (node.kind === "pipeline" || node.kind === "stream" || node.kind === "source") {
    return [
      { label: "Feed type", value: metadata.feed_type },
      { label: "Schedule / frequency", value: metadata.schedule ?? metadata.frequency },
      { label: "Last run", value: metadata.last_run },
      { label: "Last status", value: metadata.last_status },
      { label: "Failure reason", value: metadata.failure_reason },
      { label: "Downstream tables", value: metadata.downstream_tables },
      { label: "Fail-closed behavior", value: metadata.fail_closed_behavior },
      { label: "Source references", value: metadata.source_references },
    ];
  }
  if (node.kind === "model") {
    return [
      { label: "Model version", value: metadata.model_version },
      { label: "Training data window", value: metadata.training_data_window },
      { label: "Input tables", value: metadata.input_tables },
      { label: "Features", value: metadata.features },
      { label: "Output destination", value: metadata.output_destination },
      { label: "Model card", value: metadata.model_card_link ?? metadata.model_card },
      { label: "Eval metrics", value: metadata.eval_metrics },
      { label: "Operational decision", value: metadata.downstream_operational_decision },
      { label: "Source references", value: metadata.source_references },
    ];
  }
  return [
    { label: "Description", value: node.description },
    { label: "Feed type", value: metadata.feed_type },
    { label: "Owner", value: metadata.owner },
    { label: "Consumers", value: metadata.downstream_consumers },
    { label: "Freshness as of", value: metadata.freshness_as_of },
    { label: "Unavailable reason", value: metadata.unavailable_reason ?? metadata.null_reason },
    { label: "Source references", value: metadata.source_references },
  ];
}

function RelationshipList({
  title,
  rows,
}: {
  title: string;
  rows: Relationship[];
}) {
  return (
    <section style={{ marginTop: 18 }}>
      <div
        style={{
          fontFamily: C.mono,
          color: C.faint,
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {rows.length === 0 ? (
        <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 11 }}>
          No cataloged relationships.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {rows.map(({ edge, node }) => (
            <div
              key={edge.id}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 7,
                background: C.panelHi,
                padding: "9px 10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>
                  {node?.label ?? "Unknown node"}
                </span>
                <Tag color={edge.confidence === "inferred" ? C.amber : C.cyan}>
                  {edge.confidence}
                </Tag>
              </div>
              <div
                style={{
                  color: C.faint,
                  fontFamily: C.mono,
                  fontSize: 9,
                  marginTop: 6,
                  textTransform: "uppercase",
                }}
              >
                {humanize(edge.relationship)}
              </div>
              {edge.description && (
                <div style={{ color: C.dim, fontSize: 11, marginTop: 6, lineHeight: 1.45 }}>
                  {edge.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function MetadataDetailDrawer({
  node,
  nodes,
  edges,
  onClose,
}: {
  node: TelemetryMetadataNode | null;
  nodes: TelemetryMetadataNode[];
  edges: TelemetryMetadataEdge[];
  onClose: () => void;
}) {
  const nodeMap = new Map(nodes.map((item) => [item.id, item]));
  const upstream = node
    ? edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => ({ edge, node: nodeMap.get(edge.source) }))
    : [];
  const downstream = node
    ? edges
        .filter((edge) => edge.source === node.id)
        .map((edge) => ({ edge, node: nodeMap.get(edge.target) }))
    : [];

  return (
    <DrawerWrapper open={Boolean(node)} onClose={onClose}>
      {node && (
        <>
          <DrawerHeader
            title={node.label}
            description={node.description ?? "Reviewed telemetry catalog object."}
            closeLabel="Close metadata details"
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
            <Tag color={C.cyan}>{node.kind}</Tag>
            <Tag color={C.amber}>{node.layer ?? "runtime"}</Tag>
            <Tag color={node.status === "fresh" ? C.green : node.status === "missing" ? C.red : C.amber}>
              {node.status ?? "unknown"}
            </Tag>
            <Tag color={node.confidence === "inferred" ? C.amber : C.cyan}>
              {node.confidence}
            </Tag>
          </div>

          <section style={{ marginTop: 18 }}>
            {detailFields(node).map((field) => (
              <DetailRow key={field.label} label={field.label} value={field.value} />
            ))}
          </section>

          <RelationshipList title="Upstream feeds" rows={upstream} />
          <RelationshipList title="Downstream consumers" rows={downstream} />
        </>
      )}
    </DrawerWrapper>
  );
}
