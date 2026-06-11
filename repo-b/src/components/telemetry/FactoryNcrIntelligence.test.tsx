import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import FactoryNcrIntelligence, { assembleBacklogSeries, clusterColor } from "./FactoryNcrIntelligence";
import type { NcrBacklogRow, NcrResponse } from "@/lib/telemetry/api";

const { getNcr } = vi.hoisted(() => ({ getNcr: vi.fn() }));

vi.mock("@/lib/telemetry/api", () => ({
  getNcr,
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "7e1eb000-0000-4000-a000-000000000001",
}));

const history: NcrBacklogRow[] = Array.from({ length: 10 }, (_, i) => ({
  week_start: `2026-0${Math.min(4 + Math.floor(i / 4), 6)}-0${(i % 4) + 1}`,
  kind: "history", opened: 8 + i, closed: 7 + i, backlog: 50 + i,
  fc: null, lo: null, hi: null,
}));
const forecast: NcrBacklogRow[] = [
  { week_start: "2026-06-15", kind: "forecast", opened: null, closed: null, backlog: null,
    fc: 61.5, lo: 58.0, hi: 65.0 },
  { week_start: "2026-06-22", kind: "forecast", opened: null, closed: null, backlog: null,
    fc: 63.0, lo: 58.1, hi: 67.9 },
];

describe("assembleBacklogSeries (cone via stacked lo + coneH)", () => {
  it("keeps trailing history, bridges the last actual, and assembles the cone heights", () => {
    const rows = assembleBacklogSeries(history, forecast, 8);
    expect(rows).toHaveLength(10);                      // 8 history + 2 forecast
    expect(rows[0].w).toBe("W-8");
    expect(rows[0].backlog).toBe(52);                   // trailing slice, not the full series
    const bridge = rows[7];
    expect(bridge.w).toBe("W-1");
    expect(bridge.fc).toBe(59);                         // forecast line starts at the last actual
    expect(bridge.lo).toBe(59);
    expect(bridge.coneH).toBe(0);                       // cone closed at the bridge
    expect(bridge.opened).toBeNull();                   // bars suppressed on the bridge row
    const f1 = rows[8];
    expect(f1.w).toBe("W+1");
    expect(f1.backlog).toBeNull();
    expect(f1.lo).toBe(58.0);
    expect(f1.coneH).toBeCloseTo(7.0);                  // hi - lo
  });

  it("returns empty for no history (fail-closed chart, nothing invented)", () => {
    expect(assembleBacklogSeries([], forecast)).toEqual([]);
  });
});

describe("clusterColor", () => {
  it("is stable per index and cycles", () => {
    expect(clusterColor(0)).toBe(clusterColor(7));
    expect(clusterColor(1)).not.toBe(clusterColor(0));
  });
});

const FULL: NcrResponse = {
  kpis: { open_now: 59, open_weeks_ago: 51, median_ttc_days: 11, reopen_rate: 0.062,
    clusters_rising: 1, rising_labels: ["seal · thermal cycle · witness mark"], n_records: 124 },
  clusters: [
    { cluster_id: 0, label: "seal · thermal cycle · witness mark",
      keywords: ["seal", "thermal cycle"], exemplars: [
        { ncr_key: "ncr_2026_00018", workcell: "assembly_wc_12", severity: "major",
          summary: "Seal witness mark out of tolerance after thermal cycle." }],
      n_records: 31, status: "rising", trend: [1, 1, 2, 2, 2, 3, 3, 4],
      median_ttc_days: 11, reopen_rate: 0.08, mlflow_run_id: "abc12345", provenance: "databricks" },
    { cluster_id: 1, label: "porosity · channel wall · ct",
      keywords: ["porosity"], exemplars: [], n_records: 21, status: "flat",
      trend: [1, 2, 1, 1, 2, 1, 1, 2], median_ttc_days: 16, reopen_rate: 0.05,
      mlflow_run_id: "abc12345", provenance: "databricks" },
  ],
  points: [
    { ncr_key: "ncr_2026_00018", x: -4.2, y: 2.8, cluster_id: 0, severity: "major" },
    { ncr_key: "ncr_2026_00033", x: 2.6, y: 3.4, cluster_id: 1, severity: "minor" },
    { ncr_key: "ncr_2026_00050", x: 0.1, y: 0.2, cluster_id: -1, severity: "minor" },
  ],
  pareto: [
    { family: "seal · thermal cycle · witness mark", cluster_id: 0, n: 31, cum_pct: 56.4 },
    { family: "porosity · channel wall · ct", cluster_id: 1, n: 21, cum_pct: 94.5 },
    { family: "noise / unclustered", cluster_id: -1, n: 3, cum_pct: 100 },
  ],
  backlog: { history, forecast, backtest: {
    mae: 1.9, mae_naive: 2.4, mape_pct: 3.1, mape_naive_pct: 3.9,
    skill_vs_naive: 0.208, backtest_folds: 8 } },
  provenance: { provenance: "databricks", batch_id: "ncr-pipeline-v1",
    cluster_mlflow_run_id: "abc12345def", forecast_mlflow_run_id: "fed54321",
    experiment_id: "3740651530987773" },
  null_reason: null,
};

describe("FactoryNcrIntelligence rendering", () => {
  it("fail-closed: data_not_ingested renders an explicit empty state, no charts", async () => {
    getNcr.mockResolvedValueOnce({
      kpis: null, clusters: [], points: [], pareto: [],
      backlog: { history: [], forecast: [], backtest: null },
      provenance: null, null_reason: "data_not_ingested",
    } satisfies NcrResponse);
    render(<FactoryNcrIntelligence />);
    await waitFor(() =>
      expect(screen.getByTestId("ncr-empty").textContent).toContain("data_not_ingested"));
    expect(screen.queryByText(/Open NCRs/)).toBeNull();
  });

  it("renders real pipeline data with provenance chip and backtest MAE beside MAPE", async () => {
    getNcr.mockResolvedValueOnce(FULL);
    render(<FactoryNcrIntelligence />);
    await waitFor(() => expect(screen.getByText(/DATABRICKS · mlflow abc12345/)).toBeInTheDocument());
    expect(screen.getByText("59")).toBeInTheDocument();                       // open backlog KPI
    expect(screen.getByText(/backtest MAE 1.9 \(naive 2.4\)/)).toBeInTheDocument();
    expect(screen.getByText(/skill 21%/)).toBeInTheDocument();
    expect(screen.getByText(/Synthetic NCR corpus/)).toBeInTheDocument();     // honesty footnote
  });

  it("cluster selection drives the detail drawer (dim-others interaction)", async () => {
    getNcr.mockResolvedValueOnce(FULL);
    render(<FactoryNcrIntelligence />);
    // largest cluster auto-selected
    await waitFor(() =>
      expect(screen.getByTestId("cluster-detail").textContent).toContain("seal · thermal cycle"));
    expect(screen.getByText("RISING")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cluster_1 · 21/ }));
    await waitFor(() =>
      expect(screen.getByTestId("cluster-detail").textContent).toContain("porosity · channel wall"));
    expect(screen.getByText("FLAT")).toBeInTheDocument();
  });

  it("local_fallback provenance is labeled, never passed off as a Databricks run", async () => {
    getNcr.mockResolvedValueOnce({
      ...FULL,
      provenance: { provenance: "local_fallback", batch_id: "ncr-pipeline-v1",
        cluster_mlflow_run_id: null, forecast_mlflow_run_id: null, experiment_id: null },
    } satisfies NcrResponse);
    render(<FactoryNcrIntelligence />);
    await waitFor(() =>
      expect(screen.getByText(/LOCAL FALLBACK — not a Databricks run/)).toBeInTheDocument());
  });
});
