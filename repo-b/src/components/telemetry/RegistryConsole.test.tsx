import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import RegistryConsole, { mapGateRows } from "./RegistryConsole";
import type { RegistryModel, RegistryResponse } from "@/lib/telemetry/api";

const { getRegistry } = vi.hoisted(() => ({ getRegistry: vi.fn() }));

vi.mock("@/lib/telemetry/api", () => ({
  getRegistry,
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "7e1eb000-0000-4000-a000-000000000001",
}));

const champion: RegistryModel = {
  model_name: "tel_anomaly_detector", model_kind: "anomaly", model_version: "1",
  model_alias: "champion", mlflow_run_id: "4a48cb6a", experiment_id: "374",
  promotion_state: "promoted", created_at: "2026-05-21T00:00:00Z",
  metrics: {
    f1: 0.6387, f1_pointwise: 0.312953, event_recall: 0.769231,
    alarm_precision: 0.3279, affiliation_f1: 0.474634,
    vus_status: "pending: import failed",
    honest_gate: {
      thresholds: { f1_pointwise: 0.10, affiliation_f1: 0.25 },
      values: { f1_pointwise: 0.312953, affiliation_f1: 0.474634 },
      checks: { f1_pointwise: true, affiliation_f1: false },   // one failing check for the test
    },
  },
  gate: { metric: "f1", threshold: 0.30, decision: "promoted", selected_over: "pca" },
};

describe("mapGateRows (real Track A honest_gate jsonb → checklist)", () => {
  it("maps thresholds/values/checks and appends the legacy gate as reference", () => {
    const rows = mapGateRows(champion);
    expect(rows).toHaveLength(3);
    const f1pw = rows.find((r) => r.rule.startsWith("f1_pointwise"))!;
    expect(f1pw.rule).toBe("f1_pointwise >= 0.1");
    expect(f1pw.observed).toBe("0.312953");
    expect(f1pw.pass).toBe(true);
    const aff = rows.find((r) => r.rule.startsWith("affiliation_f1"))!;
    expect(aff.pass).toBe(false);                              // the failing check surfaces
    const legacy = rows.find((r) => r.rule.includes("legacy"))!;
    expect(legacy.rule).toContain("reference only");
    expect(legacy.pass).toBe(true);
  });

  it("returns only the legacy row when no honest_gate exists (older rows render honestly)", () => {
    const rows = mapGateRows({ ...champion, metrics: { f1: 0.42 } });
    expect(rows).toHaveLength(1);
    expect(rows[0].rule).toContain("legacy");
  });
});

describe("RegistryConsole rendering", () => {
  it("renders honestly with no data — explicit not-available, no fake charts", async () => {
    getRegistry.mockResolvedValueOnce({
      models: [], drift: {}, lifecycle: [], null_reason: "model_not_promoted",
    } satisfies RegistryResponse);
    render(<RegistryConsole />);
    await waitFor(() =>
      expect(screen.getByText(/Not available — model_not_promoted/)).toBeInTheDocument());
  });

  it("renders the champion with disabled promote/rollback (display-only)", async () => {
    getRegistry.mockResolvedValueOnce({
      models: [champion], drift: {}, lifecycle: [
        { ts: "2026-05-21T00:00:00Z", text: "tel_anomaly_detector v1 promoted to champion", model_kind: "anomaly" },
      ], null_reason: null,
    } satisfies RegistryResponse);
    render(<RegistryConsole />);
    await waitFor(() => expect(screen.getByText(/CHAMPION v1/)).toBeInTheDocument());
    const promote = screen.getByRole("button", { name: /Promote — requires reviewer approval/ });
    expect(promote).toBeDisabled();
    expect(screen.getByText(/none registered/)).toBeInTheDocument();                 // challenger absent → explicit
    expect(screen.getByText(/null_reason: no non-promoted run/)).toBeInTheDocument();
    expect(screen.getByText(/pending: import failed/)).toBeInTheDocument();   // honest VUS status
  });

  it("links the run, fails closed on the UC model link, marks absent metadata, and exports (8D-2)", async () => {
    getRegistry.mockResolvedValueOnce({
      models: [champion],
      drift: {
        USLAB000058: [
          { psi: 0.08, window_label: "w1", computed_at: "2026-05-21T00:00:00Z" },
          { psi: 0.12, window_label: "w2", computed_at: "2026-05-22T00:00:00Z" },
        ],
      },
      lifecycle: [], null_reason: null,
    } satisfies RegistryResponse);
    render(<RegistryConsole />);
    await waitFor(() => expect(screen.getByText(/CHAMPION v1/)).toBeInTheDocument());
    // The run id is now a live MLflow link, not raw text.
    const runLink = screen.getByRole("link", { name: /Open MLflow Run/i });
    expect(runLink.getAttribute("href")).toContain("4a48cb6a");
    // The UC model link fails closed for the seed registry name.
    expect(screen.getAllByText(/Unavailable —/i).length).toBeGreaterThan(0);
    // Absent lifecycle metadata renders an explicit null_reason, not a blank cell.
    expect(screen.getByText("Training window")).toBeInTheDocument();
    expect(screen.getAllByText(/not recorded in tel_model_runs/i).length).toBeGreaterThan(0);
    // Registry rows + drift are exportable; source-kind is labeled live rows.
    expect(screen.getByRole("button", { name: /Models CSV/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Drift CSV/i })).not.toBeDisabled();
  });
});
