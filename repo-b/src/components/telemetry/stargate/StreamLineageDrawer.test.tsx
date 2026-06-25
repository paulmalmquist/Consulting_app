import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import StreamLineageDrawer from "./StreamLineageDrawer";
import type { AnomalyLineage } from "@/lib/telemetry/streamLineage";

// Mock the fetch helper so the drawer's load states are driven deterministically (no real network).
vi.mock("@/lib/telemetry/streamLineage", () => ({ getAnomalyLineage: vi.fn() }));
import { getAnomalyLineage as _getAnomalyLineage } from "@/lib/telemetry/streamLineage";
const getAnomalyLineage = vi.mocked(_getAnomalyLineage);

const PROPS = {
  servingEnvId: "telemetry-demo",
  businessId: "7e1eb000-0000-4000-a000-000000000001",
  routeEnvId: "telemetry-demo",
  onClose: () => {},
};

function fullLineage(): AnomalyLineage {
  return {
    status: "ok",
    anomaly_id: "anom_1",
    layers: {
      kafka_detection: {
        status: "available", topic: "stargate.printer.anomalies.v1", partition: 0, offset: 123,
        schema_id: 100005, schema_subject: "stargate.printer.anomalies.v1-value", schema_version: 1,
        row_id: "row-1",
      },
      agent_triage: {
        status: "available", topic: "stargate.printer.anomaly.triage.v1", partition: 0, offset: 77,
        triage_id: "tri_1", severity: "high", summary: "cold melt pool",
        recommended_action: "pause job", requires_human_review: true,
      },
      databricks_lake: {
        status: "not_available", catalog: null, schema: null, table: null, delta_version: null,
        null_reason: "databricks_table_mapping_not_configured",
      },
      postgres_serving: {
        status: "available", table: "tel_stream_kafka_rows", row_id: "row-1",
        ingested_at: "2026-06-25T00:00:00Z",
      },
    },
  };
}

describe("StreamLineageDrawer", () => {
  beforeEach(() => getAnomalyLineage.mockReset());

  it("renders Kafka detection provenance when available", async () => {
    getAnomalyLineage.mockResolvedValue(fullLineage());
    render(<StreamLineageDrawer anomalyId="anom_1" {...PROPS} />);
    await waitFor(() => expect(screen.getByText("stargate.printer.anomalies.v1")).toBeInTheDocument());
    expect(screen.getByText("123")).toBeInTheDocument();           // offset
    expect(screen.getByText("100005")).toBeInTheDocument();        // schema id
  });

  it("renders AI triage when available", async () => {
    getAnomalyLineage.mockResolvedValue(fullLineage());
    render(<StreamLineageDrawer anomalyId="anom_1" {...PROPS} />);
    await waitFor(() => expect(screen.getByText("cold melt pool")).toBeInTheDocument());
    expect(screen.getByText("pause job")).toBeInTheDocument();
  });

  it("renders Databricks not_available without fabricating table/version", async () => {
    getAnomalyLineage.mockResolvedValue(fullLineage());
    render(<StreamLineageDrawer anomalyId="anom_1" {...PROPS} />);
    await waitFor(() =>
      expect(screen.getByText(/databricks_table_mapping_not_configured/)).toBeInTheDocument());
    // the Databricks section must not show a real table/version
    expect(screen.queryByText(/novendor_1/)).not.toBeInTheDocument();
  });

  it("renders triage_not_emitted when triage layer is unavailable", async () => {
    const data = fullLineage();
    data.layers.agent_triage = { status: "not_available", null_reason: "triage_not_emitted" };
    getAnomalyLineage.mockResolvedValue(data);
    render(<StreamLineageDrawer anomalyId="anom_1" {...PROPS} />);
    await waitFor(() => expect(screen.getByText(/triage_not_emitted/)).toBeInTheDocument());
  });

  it("renders a top-level fail-closed note when the anomaly is unknown to the serving slice", async () => {
    getAnomalyLineage.mockResolvedValue({
      status: "not_available", anomaly_id: "nope", null_reason: "kafka_provenance_unavailable",
      layers: {
        kafka_detection: { status: "not_available", null_reason: "kafka_provenance_unavailable" },
        agent_triage: { status: "not_available", null_reason: "triage_not_emitted" },
        databricks_lake: { status: "not_available", null_reason: "databricks_table_mapping_not_configured" },
        postgres_serving: { status: "not_available", null_reason: "kafka_provenance_unavailable" },
      },
    } as AnomalyLineage);
    render(<StreamLineageDrawer anomalyId="nope" {...PROPS} />);
    await waitFor(() =>
      expect(screen.getByText(/No lineage recorded for this anomaly yet/)).toBeInTheDocument());
    expect(screen.getByText(/kafka_provenance_unavailable/)).toBeInTheDocument();
  });

  it("handles API error", async () => {
    getAnomalyLineage.mockRejectedValueOnce(new Error("boom"));
    render(<StreamLineageDrawer anomalyId="anom_1" {...PROPS} />);
    await waitFor(() => expect(screen.getByText(/Could not load lineage/)).toBeInTheDocument());
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("does not fetch or render when closed (anomalyId null)", () => {
    render(<StreamLineageDrawer anomalyId={null} {...PROPS} />);
    expect(getAnomalyLineage).not.toHaveBeenCalled();
  });
});
