import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/telemetry/api", () => ({
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "biz-1",
}));

const getReceipts = vi.fn(() => Promise.resolve({ runs: [], null_reason: null }));
const getGovernanceStats = vi.fn(() => Promise.resolve({
  total_decisions: 0, successful: 0, failed: 0, success_rate: null, avg_latency_ms: null,
  avg_grounding_score: null, high_grounding: 0, mixed_grounding: 0, low_grounding: 0,
  top_tools: [], warehouse_export_configured: false, null_reason: null,
}));
vi.mock("@/lib/automated-data-engineering/api", () => ({
  getReceipts: () => getReceipts(),
  getGovernanceStats: () => getGovernanceStats(),
}));

const profileMetadataGraph = vi.fn();
const getDeReceipts = vi.fn();
vi.mock("@/lib/telemetry/dataEngineeringReceipts", () => ({
  profileMetadataGraph: (...a: unknown[]) => profileMetadataGraph(...a),
  getDeReceipts: (...a: unknown[]) => getDeReceipts(...a),
}));

import RunAutopsy from "./RunAutopsy";

describe("RunAutopsy (Phase 2D — real receipt)", () => {
  beforeEach(() => {
    profileMetadataGraph.mockReset();
    getDeReceipts.mockReset();
  });

  it("shows the honest empty state before any action is run (no seeded receipts)", async () => {
    getDeReceipts.mockResolvedValue({ runs: [], null_reason: null });
    render(<RunAutopsy envId="env-1" />);
    expect(await screen.findByText("No receipts yet")).toBeInTheDocument();
    expect(screen.getByText(/Run the read-only profiling action above/)).toBeInTheDocument();
  });

  it("runs the read-only action and surfaces the real recorded receipt", async () => {
    // Empty first, then one real receipt after the action.
    getDeReceipts
      .mockResolvedValueOnce({ runs: [], null_reason: null })
      .mockResolvedValueOnce({
        runs: [{
          tool_name: "ade.profile_metadata_graph", action: "ade.de.profile_metadata", status: "success",
          permission_mode: "read", actor: "reviewer@example.com", latency_ms: 12,
          created_at: "2026-06-25T00:00:00Z", input_summary: { env_id: "telemetry-demo" },
          result_summary: { nodes: 2, edges: 1 }, null_reason: null,
        }],
        null_reason: null,
      });
    profileMetadataGraph.mockResolvedValue({
      receipt_id: "abcd1234ef", actor: "reviewer@example.com", action: "ade.de.profile_metadata",
      tool_name: "ade.profile_metadata_graph", permission_mode: "read", status: "success",
      input_summary: { env_id: "telemetry-demo" }, result_summary: { nodes: 2, edges: 1 },
      created_at: "2026-06-25T00:00:00Z", null_reason: null,
    });

    render(<RunAutopsy envId="env-1" />);
    await screen.findByText("No receipts yet");
    await userEvent.click(screen.getByRole("button", { name: /Run profiling action/ }));

    expect(profileMetadataGraph).toHaveBeenCalled();
    // The recorded receipt now appears with actor + action.
    expect(await screen.findByText("ade.profile_metadata_graph")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("reviewer@example.com")).toBeInTheDocument());
    expect(screen.getByText(/Recorded receipt abcd1234/)).toBeInTheDocument();
  });

  it("fails closed when the receipts read is unavailable", async () => {
    getDeReceipts.mockResolvedValue({ runs: [], null_reason: "audit_read_unavailable" });
    render(<RunAutopsy envId="env-1" />);
    expect(await screen.findByText("Audit read unavailable")).toBeInTheDocument();
  });
});
