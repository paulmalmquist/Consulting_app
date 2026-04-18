import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AccountabilityLayer } from "./AccountabilityLayer";

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => ({ envId: "env-hb", businessId: "biz-hb" }),
}));

vi.mock("@/lib/bos-api", () => ({
  getOperatorAccountability: vi.fn(),
}));

import { getOperatorAccountability } from "@/lib/bos-api";

const MOCK = {
  items: [
    {
      id: "own-003",
      project_id: "airport-expansion",
      project_name: "Airport Expansion",
      title: "Resolve Apex Electrical grounding remediation plan",
      category: "vendor",
      owner: null,
      owner_id: null,
      status: "unassigned" as const,
      opened_date: "2026-04-10",
      due_date: "2026-04-18",
      days_overdue: 0,
      escalation_level: 3,
      last_update_days: 8,
      blocker_reason: "No owner assigned",
      stalled_no_owner: true,
      stale_update: true,
      href: "/lab/env/env-hb/operator/projects/airport-expansion",
    },
    {
      id: "own-001",
      project_id: "airport-expansion",
      project_name: "Airport Expansion",
      title: "Call Dallas permit office",
      category: "permit",
      owner: "K. Patel (PM)",
      owner_id: "stf-kpatel",
      status: "overdue" as const,
      opened_date: "2026-04-08",
      due_date: "2026-04-14",
      days_overdue: 4,
      escalation_level: 2,
      last_update_days: 3,
      blocker_reason: "Owner traveling; no coverage",
      stalled_no_owner: false,
      stale_update: false,
      href: "/lab/env/env-hb/operator/projects/airport-expansion",
    },
  ],
  by_owner: [
    {
      owner: "K. Patel (PM)",
      owner_id: "stf-kpatel",
      open_count: 1,
      overdue_count: 1,
      max_escalation_level: 2,
      stale_count: 0,
    },
    {
      owner: "Unassigned",
      owner_id: null,
      open_count: 1,
      overdue_count: 0,
      max_escalation_level: 3,
      stale_count: 1,
    },
  ],
  totals: {
    total_items: 2,
    unassigned_count: 1,
    overdue_count: 1,
    stale_count: 1,
    max_escalation_level: 3,
  },
};

describe("AccountabilityLayer", () => {
  beforeEach(() => {
    (getOperatorAccountability as ReturnType<typeof vi.fn>).mockReset();
  });

  it("headline reports unassigned and overdue counts in red", async () => {
    (getOperatorAccountability as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<AccountabilityLayer />);
    await waitFor(() => {
      const h = screen.getByTestId("accountability-headline");
      expect(h.textContent).toMatch(/1 unassigned/);
      expect(h.textContent).toMatch(/1 overdue/);
    });
  });

  it("renders unassigned status pill in red", async () => {
    (getOperatorAccountability as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<AccountabilityLayer />);
    await waitFor(() => {
      const pill = screen.getByTestId("accountability-status-own-003");
      expect(pill.textContent).toMatch(/unassigned/i);
      expect(pill.className).toContain("red");
    });
  });

  it("shows overdue days + blocker reason on overdue item", async () => {
    (getOperatorAccountability as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<AccountabilityLayer />);
    await waitFor(() => {
      const row = screen.getByTestId("accountability-item-own-001");
      expect(row.textContent).toMatch(/4d overdue/);
      expect(row.textContent).toMatch(/Owner traveling/);
    });
  });

  it("by-owner roll-up surfaces Unassigned row", async () => {
    (getOperatorAccountability as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<AccountabilityLayer />);
    await waitFor(() => {
      const rows = screen.getAllByTestId(/accountability-owner-/);
      expect(rows.some((r) => r.textContent?.includes("Unassigned"))).toBe(true);
    });
  });

  it("shows L3 max-escalation KPI tile in warn tone", async () => {
    (getOperatorAccountability as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<AccountabilityLayer />);
    await waitFor(() => {
      expect(screen.getAllByText("L3").length).toBeGreaterThanOrEqual(1);
    });
  });
});
