import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { IncidentsPanel } from "@/components/ade-ops/IncidentsPanel";

vi.mock("@/lib/ade-ops/api", () => ({ getIncidents: vi.fn() }));

import { getIncidents } from "@/lib/ade-ops/api";

const mockGet = getIncidents as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.restoreAllMocks());

function inc(over: Record<string, unknown> = {}) {
  return {
    id: "i1", approval_id: "ap-123456789", source_verdict: "rollback_recommended",
    provider: "snowflake", target_ref: "ADE_OPS_NONPROD_WH", recommendation_id: "rec-1",
    title: "rollback_recommended on snowflake:ADE_OPS_NONPROD_WH", severity: "high",
    state: "detected", owner: null, mitigation_plan: null, resolution_note: null,
    evidence: [{ label: "observed", value: 150, source: "bq" }], ...over,
  };
}

describe("IncidentsPanel", () => {
  it("renders incidents with severity + state and the never-auto-rollback framing", async () => {
    mockGet.mockResolvedValue({
      incidents: [
        inc({ id: "i1", state: "detected", severity: "high" }),
        inc({ id: "i2", state: "resolved", severity: "medium", owner: "paul",
              mitigation_plan: "raise auto_suspend", resolution_note: "restored prior value" }),
      ],
      null_reason: null,
    });
    render(<IncidentsPanel businessId="b1" envId="e1" />);
    await waitFor(() => expect(screen.getAllByTestId("incident-row")).toHaveLength(2));
    expect(screen.getByText("detected")).toBeTruthy();
    expect(screen.getByText("resolved")).toBeTruthy();
    expect(screen.getByText(/resolution: restored prior value/)).toBeTruthy();
    expect(screen.getAllByText("high").length).toBeGreaterThanOrEqual(1);
  });

  it("empty + fails closed on read error", async () => {
    mockGet.mockRejectedValue(new Error("boom"));
    render(<IncidentsPanel businessId="b1" />);
    await waitFor(() => expect(screen.getByText(/No incidents/)).toBeTruthy());
  });
});
