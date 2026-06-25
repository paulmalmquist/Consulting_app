// Deep-link behavior: ?inspect=<topic>:<partition>:<offset> reopens the inspection drawer when the
// event is in the live buffer, else shows a fail-closed "not in window" note. The bridge is mocked via
// a frame-dispatching EventSource; next/navigation is mocked (src/test/mocks/next-navigation.ts).

import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSearchParams } from "next/navigation";

import StargateConsole from "./StargateConsole";
import type { AnomalyRow } from "@/lib/lab/stargateStream";

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
  emit(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const anomaly: AnomalyRow = {
  printer_id: "stargate-v4-02", ts_us: 1_700_000_000_000_000, layer: 5, print_job_id: "JOB",
  melt_pool_temp_c: 1364, arm_vibration_g: 0.11,
  rule: { fired: true, predicate: "cold melt pool (<1400°C) AND high arm vibration (>0.08g)", temp_c: 1364, vib_g: 0.11 },
  scorer: { name: "baseline scorer (rolling-MAD residual)", version: "v", score: 2.3, verdict: "NO_GO",
    threshold: 0.135, model_not_configured: false, null_reason: null },
  feature_window: {},
  routing: { routed_to: "anomalies", reason: "cold_melt_pool_and_high_vibration" },
  provenance: { provenance_source: "recorded_capture", kafka_topic: "stargate.printer.telemetry.v1",
    kafka_partition: 1, kafka_offset: 519, schema_id: null, schema_null_reason: "capture_mode_synthetic_schema_id",
    capture_id: "cap-stargate-20260611", synthetic: true },
};

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubEnv("NEXT_PUBLIC_STARGATE_BRIDGE_URL", "https://bridge.example");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>);
});

describe("StargateConsole deep link", () => {
  it("reopens the inspection drawer from ?inspect=<topic>:<partition>:<offset>", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("inspect=stargate.printer.telemetry.v1:1:519") as unknown as ReturnType<typeof useSearchParams>,
    );
    render(<StargateConsole />);
    const es = MockEventSource.instances[0];
    act(() => es.emit({ type: "snapshot", anomalies: [anomaly], scored: [] }));
    expect(await screen.findByText("Anomaly inspection")).toBeInTheDocument();
  });

  it("shows a fail-closed note when the linked anomaly is not in the current window", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("inspect=stargate.printer.telemetry.v1:9:999") as unknown as ReturnType<typeof useSearchParams>,
    );
    render(<StargateConsole />);
    const es = MockEventSource.instances[0];
    act(() => es.emit({ type: "snapshot", anomalies: [anomaly], scored: [] }));
    await waitFor(() =>
      expect(screen.getByText(/not in the current window/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Anomaly inspection")).toBeNull();
  });
});
