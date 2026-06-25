import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AnomalyInspectionDrawer from "./AnomalyInspectionDrawer";
import type { AnomalyRow } from "@/lib/lab/stargateStream";

const TS = 1_700_000_000_000_000;

function anomaly(over: Partial<AnomalyRow> = {}): AnomalyRow {
  return {
    printer_id: "stargate-v4-02",
    ts_us: TS,
    layer: 5,
    print_job_id: "JOB-01-0001-COUPLED_DRIFT",
    melt_pool_temp_c: 1364,
    arm_vibration_g: 0.11,
    rule: { fired: true, predicate: "cold melt pool (<1400°C) AND high arm vibration (>0.08g)", temp_c: 1364, vib_g: 0.11 },
    scorer: { name: "baseline scorer (rolling-MAD residual)", version: "mad-k4.0-gscale0.0339",
      score: 2.3, verdict: "NO_GO", threshold: 0.135, model_not_configured: false, null_reason: null },
    feature_window: {
      w5s: { n: 50, avg_temp_c: 1370, max_vib_g: 0.12, temp_slope_c_per_s: -2, vib_slope_g_per_s: 0.001 },
      w60s: { n: 520, avg_temp_c: 1450, max_vib_g: 0.12, temp_slope_c_per_s: -2, vib_slope_g_per_s: 0.001 },
    },
    routing: { routed_to: "anomalies", reason: "cold_melt_pool_and_high_vibration" },
    provenance: { provenance_source: "recorded_capture", kafka_topic: "stargate.printer.telemetry.v1",
      kafka_partition: 1, kafka_offset: 519, schema_id: null,
      schema_null_reason: "capture_mode_synthetic_schema_id", capture_id: "cap-stargate-20260611", synthetic: true },
    ...over,
  };
}

function renderDrawer(a: AnomalyRow | null, props: Partial<React.ComponentProps<typeof AnomalyInspectionDrawer>> = {}) {
  return render(
    <AnomalyInspectionDrawer anomaly={a} envId="telemetry-demo" businessId="biz" onClose={() => {}} {...props} />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnomalyInspectionDrawer", () => {
  it("renders the synthetic recorded-capture provenance banner and coordinates", () => {
    renderDrawer(anomaly());
    expect(screen.getByText("Anomaly inspection")).toBeInTheDocument();
    expect(screen.getByText(/Recorded capture — synthetic coordinates/i)).toBeInTheDocument();
    expect(screen.getByText("capture_mode_synthetic_schema_id")).toBeInTheDocument();
    expect(screen.getByText("cap-stargate-20260611")).toBeInTheDocument();
  });

  it("labels the scorer as a baseline (never claims LSTM as the model)", () => {
    renderDrawer(anomaly());
    expect(screen.getByText("baseline scorer (rolling-MAD residual)")).toBeInTheDocument();
  });

  it("shows 'Not available — model_not_configured' instead of a fabricated score", () => {
    renderDrawer(anomaly({
      scorer: { name: "baseline scorer (rolling-MAD residual)", version: "v", score: null, verdict: null,
        threshold: 0.135, model_not_configured: true, null_reason: "insufficient_window" },
    }));
    expect(screen.getByText(/Not available — insufficient_window/i)).toBeInTheDocument();
  });

  it("renders distinct copy for durable_sink_not_enabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200, json: async () => ({ row: null, null_reason: "durable_sink_not_enabled" }),
    }));
    renderDrawer(anomaly());
    fireEvent.click(screen.getByRole("button", { name: /open durable serving row/i }));
    expect(await screen.findByText(/Durable sink not enabled in this deployment/i)).toBeInTheDocument();
  });

  it("renders distinct copy for provenance_not_found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 404, json: async () => ({ row: null, null_reason: "provenance_not_found" }),
    }));
    renderDrawer(anomaly());
    fireEvent.click(screen.getByRole("button", { name: /open durable serving row/i }));
    expect(await screen.findByText(/No durable serving row for these coordinates yet/i)).toBeInTheDocument();
  });

  it("exposes copy buttons for event id, coordinates, and raw payload", () => {
    renderDrawer(anomaly());
    expect(screen.getByRole("button", { name: /copy event id/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy topic\/partition\/offset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy raw payload/i })).toBeInTheDocument();
  });

  it("'View surrounding 60 seconds' calls back with the event timestamp", () => {
    const onViewWindow = vi.fn();
    renderDrawer(anomaly(), { onViewWindow });
    fireEvent.click(screen.getByRole("button", { name: /view surrounding 60 seconds/i }));
    expect(onViewWindow).toHaveBeenCalledWith(TS);
  });
});
