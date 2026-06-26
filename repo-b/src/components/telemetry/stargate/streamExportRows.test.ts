import { describe, expect, it } from "vitest";

import type { AnomalyRow, DlqRow } from "@/lib/lab/stargateStream";
import type { TelemetryPoint } from "@/lib/lab/stargateStream";
import {
  ANOMALY_EXPORT_COLUMNS, DLQ_EXPORT_COLUMNS, SERIES_EXPORT_COLUMNS,
  anomalyExportRows, dlqExportRows, seriesExportRows,
} from "./streamExportRows";

const base: AnomalyRow = {
  printer_id: "P1", ts_us: 1_700_000_000_000_000, layer: 42, print_job_id: "job-9",
  melt_pool_temp_c: 1450, arm_vibration_g: 0.12,
};

describe("anomalyExportRows", () => {
  it("flattens core fields and nulls absent enrichment (no fabrication)", () => {
    const [row] = anomalyExportRows([base]);
    expect(row.printer_id).toBe("P1");
    expect(row.melt_pool_temp_c).toBe(1450);
    expect(row.rule_fired).toBeNull();
    expect(row.scorer_verdict).toBeNull();
    expect(row.kafka_offset).toBeNull();
    expect(row.synthetic).toBeNull();
  });

  it("flattens nested enrichment to scalar columns", () => {
    const enriched: AnomalyRow = {
      ...base,
      rule: { fired: true, predicate: "t>1400", temp_c: 1450, vib_g: 0.12 },
      scorer: { name: "mad", version: "1", score: 0.9, verdict: "NO_GO", threshold: 0.8, model_not_configured: false, null_reason: null },
      routing: { routed_to: "anomalies.v1", reason: "rule+scorer" },
      provenance: { provenance_source: "recorded_capture", kafka_topic: "t", kafka_partition: 0, kafka_offset: 5, schema_id: 1, schema_null_reason: null, capture_id: "c1", synthetic: true },
    };
    const [row] = anomalyExportRows([enriched]);
    expect(row.rule_fired).toBe(true);
    expect(row.scorer_verdict).toBe("NO_GO");
    expect(row.routing_routed_to).toBe("anomalies.v1");
    expect(row.kafka_offset).toBe(5);
    expect(row.synthetic).toBe(true);
  });

  it("every declared column is present on a flattened row", () => {
    const [row] = anomalyExportRows([base]);
    for (const c of ANOMALY_EXPORT_COLUMNS) expect(c in row).toBe(true);
  });
});

describe("dlqExportRows", () => {
  it("passes the flat DLQ fields through unchanged", () => {
    const dlq: DlqRow = { ts_ms: 1700, topic: "x", reason: "decode_error", raw_preview: "ab", raw_bytes: 12 };
    const [row] = dlqExportRows([dlq]);
    expect(row).toEqual(dlq);
    expect(DLQ_EXPORT_COLUMNS).toContain("raw_bytes");
  });
});

describe("seriesExportRows", () => {
  it("flattens the raw telemetry window points (the chart data is exportable)", () => {
    const pt: TelemetryPoint = {
      printer_id: "P1", ts_us: 1_700_000_000_000_000, layer: 7, print_job_id: "job-3",
      melt_pool_temp_c: 1500, arm_vibration_g: 0.05, x_mm: 1, y_mm: 2, z_mm: 3,
    } as TelemetryPoint;
    const [row] = seriesExportRows([pt]);
    expect(row.printer_id).toBe("P1");
    expect(row.melt_pool_temp_c).toBe(1500);
    expect(row.arm_vibration_g).toBe(0.05);
    for (const c of SERIES_EXPORT_COLUMNS) expect(c in row).toBe(true);
  });
});
