// Flatten the Stargate SSE buffer rows (AnomalyRow / DlqRow) into flat CSV rows for the 8C export
// affordances. These are REAL rows pushed over the SSE bridge during a recorded-capture replay — not
// fixtures and not live printer hardware. The nested enrichment (rule / scorer / routing / provenance)
// is flattened to the most useful scalar columns; missing enrichment → null (never fabricated).
import type { AnomalyRow, DlqRow, TelemetryPoint } from "@/lib/lab/stargateStream";

export const ANOMALY_EXPORT_COLUMNS = [
  "printer_id", "ts_us", "layer", "print_job_id", "melt_pool_temp_c", "arm_vibration_g",
  "rule_fired", "scorer_verdict", "scorer_score", "routing_routed_to",
  "provenance_source", "kafka_topic", "kafka_partition", "kafka_offset", "synthetic",
];

export function anomalyExportRows(anomalies: AnomalyRow[]): Array<Record<string, unknown>> {
  return anomalies.map((a) => ({
    printer_id: a.printer_id,
    ts_us: a.ts_us,
    layer: a.layer,
    print_job_id: a.print_job_id,
    melt_pool_temp_c: a.melt_pool_temp_c,
    arm_vibration_g: a.arm_vibration_g,
    rule_fired: a.rule?.fired ?? null,
    scorer_verdict: a.scorer?.verdict ?? null,
    scorer_score: a.scorer?.score ?? null,
    routing_routed_to: a.routing?.routed_to ?? null,
    provenance_source: a.provenance?.provenance_source ?? null,
    kafka_topic: a.provenance?.kafka_topic ?? null,
    kafka_partition: a.provenance?.kafka_partition ?? null,
    kafka_offset: a.provenance?.kafka_offset ?? null,
    synthetic: a.provenance?.synthetic ?? null,
  }));
}

export const DLQ_EXPORT_COLUMNS = ["ts_ms", "topic", "reason", "raw_preview", "raw_bytes"];

export function dlqExportRows(dlq: DlqRow[]): Array<Record<string, unknown>> {
  return dlq.map((d) => ({
    ts_ms: d.ts_ms, topic: d.topic, reason: d.reason, raw_preview: d.raw_preview, raw_bytes: d.raw_bytes,
  }));
}

// The underlying telemetry window series (the temp/vibration chart data) — the raw decoded points, so the
// chart is exportable, not just the anomalies routed off it.
export const SERIES_EXPORT_COLUMNS = ["printer_id", "ts_us", "layer", "print_job_id", "melt_pool_temp_c", "arm_vibration_g"];

export function seriesExportRows(points: TelemetryPoint[]): Array<Record<string, unknown>> {
  return points.map((p) => ({
    printer_id: p.printer_id,
    ts_us: p.ts_us,
    layer: p.layer,
    print_job_id: p.print_job_id,
    melt_pool_temp_c: p.melt_pool_temp_c,
    arm_vibration_g: p.arm_vibration_g,
  }));
}
