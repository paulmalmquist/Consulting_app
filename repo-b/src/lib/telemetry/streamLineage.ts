"use client";

// Client contract for the Ticket-4 stream lineage routes (backend
// backend/app/services/telemetry_stream_lineage.py). Proves a displayed anomaly's chain:
// Kafka detection -> AI triage -> Databricks lake (where mapped) -> Postgres serving row.
// Every layer is fail-closed: a missing layer carries an explicit status + null_reason; the UI
// renders that honestly instead of a blank or a fabricated value.

import { apiFetch } from "@/lib/api";

export type LayerStatus = "available" | "not_available";

export interface KafkaDetectionLayer {
  status: LayerStatus;
  topic?: string;
  partition?: number | null;
  offset?: number | null;
  schema_id?: number | null;
  schema_subject?: string | null;
  schema_version?: number | null;
  row_id?: string;
  null_reason?: string | null;
}

export interface AgentTriageLayer {
  status: LayerStatus;
  topic?: string;
  partition?: number | null;
  offset?: number | null;
  triage_id?: string;
  severity?: string | null;
  summary?: string | null;
  recommended_action?: string | null;
  requires_human_review?: boolean | null;
  null_reason?: string | null;
}

export interface DatabricksLakeLayer {
  status: LayerStatus;
  catalog?: string | null;
  schema?: string | null;
  table?: string | null;
  delta_version?: number | null;
  null_reason?: string | null;
}

export interface PostgresServingLayer {
  status: LayerStatus;
  table?: string;
  row_id?: string;
  triage_id?: string;
  ingested_at?: string;
  null_reason?: string | null;
}

export interface AnomalyLineage {
  /** Top-level: "ok" when the kafka detection row exists, else "not_available". */
  status: "ok" | "not_available";
  anomaly_id: string;
  null_reason?: string | null;
  layers: {
    kafka_detection: KafkaDetectionLayer;
    agent_triage: AgentTriageLayer;
    databricks_lake: DatabricksLakeLayer;
    postgres_serving: PostgresServingLayer;
  };
}

/** Combined lineage for one anomaly. */
export function getAnomalyLineage(
  anomalyId: string,
  servingEnvId: string,
  businessId: string,
  routeEnvId: string,
) {
  return apiFetch<AnomalyLineage>(
    `/api/telemetry/stream/lineage/anomaly/${encodeURIComponent(anomalyId)}`,
    {
      params: { env_id: servingEnvId, business_id: businessId },
      headers: { "x-telemetry-route-env-id": routeEnvId },
    },
  );
}
