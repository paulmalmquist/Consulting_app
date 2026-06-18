import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { ApprovalsPanel, ExecutionDisabledBanner } from "@/components/ade-ops/ApprovalsPanel";

vi.mock("@/lib/ade-ops/api", () => ({
  listApprovals: vi.fn(),
}));

import { listApprovals } from "@/lib/ade-ops/api";

const mockList = listApprovals as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.restoreAllMocks());

function approval(over: Record<string, unknown> = {}) {
  return {
    approval_id: "a1", recommendation_id: "aderec-compute-x",
    command_name: "ade.compute.recommend_rightsize", category: "compute",
    provider: "databricks", target_ref: "cl-1", target_type: "compute_resource",
    risk_tier: 2, approval_token: "tok", state: "pending", requested_by: null,
    approver: null, approved_at: null, requested_at: "2026-06-18T12:00:00Z",
    expires_at: "2026-06-18T13:00:00Z", rollback_plan: "snapshot", observation_window: "14-day",
    evidence: [], preflight: null, executed: false, execution_mode: null, executed_at: null,
    observation_window_opened_at: null, rolled_back: false, rolled_back_at: null,
    null_reason: null, ...over,
  };
}

describe("ApprovalsPanel", () => {
  it("shows that only simulated execution runs (real writes impossible)", () => {
    render(<ExecutionDisabledBanner />);
    const text = screen.getByTestId("execution-disabled-banner").textContent ?? "";
    expect(text).toContain("simulated");
    expect(text).toContain("impossible");
  });

  it("renders the four states honestly", async () => {
    mockList.mockResolvedValue({
      approvals: [
        approval({ approval_id: "a1", state: "pending" }),
        approval({ approval_id: "a2", state: "approved", approver: "paul" }),
        approval({ approval_id: "a3", state: "expired", null_reason: "approval_expired" }),
        approval({ approval_id: "a4", state: "blocked", null_reason: "recommendation_blocked" }),
      ],
      null_reason: null,
    });
    render(<ApprovalsPanel businessId="b1" envId="e1" />);
    await waitFor(() => expect(screen.getAllByTestId("approval-row")).toHaveLength(4));
    expect(screen.getByText("Pending approval")).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("Blocked")).toBeTruthy();
  });

  it("shows executed:true only as a simulation, with the mode visible", async () => {
    mockList.mockResolvedValue({
      approvals: [approval({
        state: "approved", approver: "paul", executed: true, execution_mode: "simulation",
        executed_at: "2026-06-18T12:05:00Z", observation_window_opened_at: "2026-06-18T12:05:00Z",
      })],
      null_reason: null,
    });
    render(<ApprovalsPanel businessId="b1" />);
    await waitFor(() => expect(screen.getByTestId("approval-row")).toBeTruthy());
    expect(screen.getByText("Simulated")).toBeTruthy();
    expect(screen.getByText(/executed: true · mode: simulation/)).toBeTruthy();
  });

  it("a non-executed request shows executed:false", async () => {
    mockList.mockResolvedValue({ approvals: [approval()], null_reason: null });
    render(<ApprovalsPanel businessId="b1" />);
    await waitFor(() => expect(screen.getByTestId("approval-row")).toBeTruthy());
    expect(screen.getByText("executed: false")).toBeTruthy();
  });

  it("fails closed to empty on read error", async () => {
    mockList.mockRejectedValue(new Error("boom"));
    render(<ApprovalsPanel businessId="b1" />);
    await waitFor(() => expect(screen.getByText(/No approval requests yet/)).toBeTruthy());
  });
});
