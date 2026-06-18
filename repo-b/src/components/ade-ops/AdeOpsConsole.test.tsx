import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import AdeOpsConsole from "@/components/ade-ops/AdeOpsConsole";

vi.mock("@/lib/ade-ops/api", () => ({
  getSkills: vi.fn(),
  getRuns: vi.fn(),
  runSkill: vi.fn(),
}));

import { getSkills, getRuns } from "@/lib/ade-ops/api";

const mockSkills = getSkills as unknown as ReturnType<typeof vi.fn>;
const mockRuns = getRuns as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.restoreAllMocks());

const SKILLS = {
  skills: [
    { name: "ade.inventory.scan_pipelines", family: "inventory", description: "Inventory governed ops.", risk_tier: 0, risk_tier_name: "inventory", mode: "read_only", executable: true, approval_required: false, permission_required: "read", lane: "reliability", input_fields: [] },
    { name: "ade.execution.apply_approved_sql", family: "execution", description: "Apply approved SQL.", risk_tier: 4, risk_tier_name: "prod_write", mode: "write_gated", executable: false, approval_required: true, permission_required: "write_confirmed", lane: "changes", input_fields: [] },
  ],
  risk_tiers: {}, executable_max_tier: 1, null_reason: null,
};

describe("AdeOpsConsole", () => {
  it("renders the catalog, marks tier>=2 unavailable, shows the honesty banner", async () => {
    mockSkills.mockResolvedValue(SKILLS);
    mockRuns.mockResolvedValue({ runs: [], null_reason: null });
    render(<AdeOpsConsole envId="telemetry-demo" />);

    await waitFor(() => expect(screen.getByText("ade.inventory.scan_pipelines")).toBeInTheDocument());
    expect(screen.getByText("Run (read-only)")).toBeInTheDocument();
    expect(screen.getByText(/write capability not enabled/i)).toBeInTheDocument();
    expect(screen.getByText(/Not configured yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No receipts yet/i)).toBeInTheDocument();
  });

  it("renders the receipts unavailable state with its null_reason", async () => {
    mockSkills.mockResolvedValue(SKILLS);
    mockRuns.mockResolvedValue({ runs: [], null_reason: "runs_read_unavailable" });
    render(<AdeOpsConsole envId="telemetry-demo" />);
    await waitFor(() => expect(screen.getByText(/null_reason: runs_read_unavailable/i)).toBeInTheDocument());
  });
});
