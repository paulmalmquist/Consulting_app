import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import StreamContextStrip from "./StreamContextStrip";
import type { AggRow, BridgeHealth } from "@/lib/lab/stargateStream";

const HEALTH: BridgeHealth = {
  mode: "capture", aggregation_source: "flink", consumer_alive: true,
  msgs_in_total: 1200, msgs_in_per_sec: 40, last_message_age_ms: 800, dlq_count: 0, uptime_s: 125,
};
const AGG: AggRow = {
  printer_id: "printer-1", window_start_ms: 1_000_000, window_end_ms: 1_005_000,
  avg_temp_c: 1380, max_vibration_g: 0.094, n: 200,
};

describe("StreamContextStrip", () => {
  it("surfaces the real in-flight window + engine + freshness from bridge health", () => {
    render(<StreamContextStrip health={HEALTH} latestAgg={AGG} />);
    expect(screen.getByText("flink")).toBeInTheDocument();              // aggregation engine
    expect(screen.getByText("5.0s · 200 msg")).toBeInTheDocument();      // window span + msg count
    expect(screen.getByText("1380°C")).toBeInTheDocument();             // window avg temp (real value)
    expect(screen.getByText("0.094g")).toBeInTheDocument();             // window max vibration
    expect(screen.getByText("live (<1.5s)")).toBeInTheDocument();        // 800ms -> fresh
    expect(screen.getByText("alive")).toBeInTheDocument();              // consumer
  });

  it("fails closed with a reason when the bridge has not reported a frame (no fabricated zeros)", () => {
    render(<StreamContextStrip health={null} latestAgg={null} />);
    // several fields share each reason (engine/consumer/uptime; window/temp/vibration) -> getAllByText
    expect(screen.getAllByText(/not available — health not reported/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/not available — no aggregation window yet/).length).toBeGreaterThanOrEqual(1);
    // never a bare "0" standing in for missing data
    expect(screen.queryByText("0°C")).toBeNull();
  });

  it("ages the last message honestly when the stream goes quiet", () => {
    render(<StreamContextStrip health={{ ...HEALTH, last_message_age_ms: 45_000 }} latestAgg={AGG} />);
    expect(screen.getByText("45.0s ago")).toBeInTheDocument();
    expect(screen.queryByText("live (<1.5s)")).toBeNull();
  });
});
