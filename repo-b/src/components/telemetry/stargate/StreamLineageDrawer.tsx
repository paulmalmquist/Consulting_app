"use client";

// Stream lineage drawer — the durable, persisted lineage chain for one anomaly, read from the
// Ticket-4 routes (/api/telemetry/stream/lineage/anomaly/{id}) over the 10034 serving slice.
//
// Distinct from AnomalyInspectionDrawer (which inspects a single in-memory SSE anomaly via the
// stargate bridge): this drawer proves the PERSISTED chain
//   Kafka detection -> AI triage -> Databricks lake (where mapped) -> Postgres serving row.
//
// Honest copy only: "deterministic anomaly event", "AI triage explanation", "Databricks mapping not
// configured", "serving slice row", "Kafka offset proof". Every layer is fail-closed — a missing
// layer renders its explicit status + null_reason, never a blank or a fabricated table/version.

import { useEffect, useState } from "react";
import { C, Tag } from "../primitives";
import { DrawerWrapper, DrawerHeader, FieldRow } from "../drawerPrimitives";
import {
  getAnomalyLineage,
  type AnomalyLineage,
  type AgentTriageLayer,
  type DatabricksLakeLayer,
  type KafkaDetectionLayer,
  type PostgresServingLayer,
} from "@/lib/telemetry/streamLineage";

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: AnomalyLineage };

function statusColor(status?: string | null) {
  return status === "available" ? C.green : C.amber;
}

/** A titled layer block with a status tag; renders rows or an explicit unavailable note. */
function LayerSection({
  title, status, nullReason, children,
}: {
  title: string;
  status?: string | null;
  nullReason?: string | null;
  children?: React.ReactNode;
}) {
  const available = status === "available";
  return (
    <section style={{ marginTop: 16 }} aria-label={title}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontFamily: C.mono, color: C.faint, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {title}
        </div>
        <Tag color={statusColor(status)}>{status ?? "unknown"}</Tag>
      </div>
      {available ? (
        children
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 7, background: C.panelHi,
          padding: "9px 11px", color: C.amber, fontFamily: C.mono, fontSize: 11, lineHeight: 1.5 }}>
          Not available
          <div style={{ color: C.faint, fontSize: 10, marginTop: 4 }}>
            null_reason: {nullReason ?? "unknown"}
          </div>
        </div>
      )}
    </section>
  );
}

function KafkaSection({ layer }: { layer: KafkaDetectionLayer }) {
  return (
    <LayerSection title="Kafka detection" status={layer.status} nullReason={layer.null_reason}>
      <FieldRow label="Topic" value={layer.topic} />
      <FieldRow label="Partition" value={layer.partition} />
      <FieldRow label="Offset" value={layer.offset} />
      <FieldRow label="Schema id" value={layer.schema_id} />
      <FieldRow label="Schema subject" value={layer.schema_subject} />
      <FieldRow label="Schema version" value={layer.schema_version} />
      <FieldRow label="Serving row id" value={layer.row_id} />
    </LayerSection>
  );
}

function TriageSection({ layer }: { layer: AgentTriageLayer }) {
  return (
    <LayerSection title="AI triage" status={layer.status} nullReason={layer.null_reason}>
      <FieldRow label="Severity" value={layer.severity} />
      <FieldRow label="Summary" value={layer.summary} />
      <FieldRow label="Recommended action" value={layer.recommended_action} />
      <FieldRow label="Requires human review" value={layer.requires_human_review} />
      <FieldRow label="Triage topic" value={layer.topic} />
      <FieldRow label="Partition" value={layer.partition} />
      <FieldRow label="Offset" value={layer.offset} />
      <FieldRow label="Triage id" value={layer.triage_id} />
    </LayerSection>
  );
}

function DatabricksSection({ layer }: { layer: DatabricksLakeLayer }) {
  // Never show fabricated table/version: when not available we render the explicit null_reason only.
  return (
    <LayerSection title="Databricks lake" status={layer.status} nullReason={layer.null_reason}>
      <FieldRow label="Catalog" value={layer.catalog} />
      <FieldRow label="Schema" value={layer.schema} />
      <FieldRow label="Table" value={layer.table} />
      <FieldRow label="Delta version" value={layer.delta_version} />
    </LayerSection>
  );
}

function ServingSection({ layer }: { layer: PostgresServingLayer }) {
  return (
    <LayerSection title="Postgres serving slice" status={layer.status} nullReason={layer.null_reason}>
      <FieldRow label="Table" value={layer.table} />
      <FieldRow label="Serving row id" value={layer.row_id} />
      <FieldRow label="Triage id" value={layer.triage_id} />
      <FieldRow label="Ingested at" value={layer.ingested_at} />
    </LayerSection>
  );
}

export default function StreamLineageDrawer({
  anomalyId, servingEnvId, businessId, routeEnvId, onClose,
}: {
  /** When set, the drawer is open and fetches lineage for this anomaly. null = closed. */
  anomalyId: string | null;
  servingEnvId: string;
  businessId: string;
  routeEnvId: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  useEffect(() => {
    if (!anomalyId) return;
    setState({ phase: "loading" });
    getAnomalyLineage(anomalyId, servingEnvId, businessId, routeEnvId)
      .then((data) => setState({ phase: "ready", data }))
      .catch((err) => setState({ phase: "error", message: String(err?.message ?? err) }));
  }, [anomalyId, servingEnvId, businessId, routeEnvId]);

  return (
    <DrawerWrapper open={Boolean(anomalyId)} onClose={onClose}>
      {anomalyId && (
        <>
          <DrawerHeader
            title={`Lineage · ${anomalyId}`}
            description="Where this anomaly comes from — deterministic Kafka event → AI triage explanation → Databricks lake (where mapped) → Postgres serving slice."
            closeLabel="Close lineage"
          />

          {state.phase === "loading" && (
            <div style={{ marginTop: 18, color: C.dim, fontFamily: C.mono, fontSize: 11 }} aria-label="Loading lineage">
              Loading lineage…
            </div>
          )}

          {state.phase === "error" && (
            <div style={{ marginTop: 18, border: `1px solid ${C.border}`, borderRadius: 7, background: C.panelHi,
              padding: "10px 12px", color: C.red, fontFamily: C.mono, fontSize: 11, lineHeight: 1.5 }}
              aria-label="Lineage error">
              Could not load lineage.
              <div style={{ color: C.faint, fontSize: 10, marginTop: 4 }}>{state.message}</div>
            </div>
          )}

          {state.phase === "ready" && state.data.status !== "ok" && (
            // Top-level fail-closed: the anomaly is unknown to the serving slice (e.g. consumer off /
            // not emitted yet). Explain what hasn't happened rather than showing a blank drawer.
            <div style={{ marginTop: 18, border: `1px solid ${C.border}`, borderRadius: 7, background: C.panelHi,
              padding: "10px 12px", color: C.amber, fontFamily: C.mono, fontSize: 11, lineHeight: 1.5 }}
              aria-label="Lineage not available">
              No lineage recorded for this anomaly yet.
              <div style={{ color: C.faint, fontSize: 10, marginTop: 4 }}>
                null_reason: {state.data.null_reason ?? "kafka_provenance_unavailable"} — nothing has landed in
                the serving slice for this id (the durable consumer may be off, or it has not been emitted).
              </div>
            </div>
          )}

          {state.phase === "ready" && state.data.status === "ok" && (
            <>
              <KafkaSection layer={state.data.layers.kafka_detection} />
              <TriageSection layer={state.data.layers.agent_triage} />
              <DatabricksSection layer={state.data.layers.databricks_lake} />
              <ServingSection layer={state.data.layers.postgres_serving} />
            </>
          )}

          <div style={{ marginTop: 16, color: C.faint, fontFamily: C.mono, fontSize: 9, lineHeight: 1.6 }}>
            Source: durable serving slice (/api/telemetry/stream/lineage/anomaly). Deterministic synthetic
            replay through real Confluent infrastructure — not live physical telemetry. The Streaming Agent
            explains anomalies; it does not detect them.
          </div>
        </>
      )}
    </DrawerWrapper>
  );
}
