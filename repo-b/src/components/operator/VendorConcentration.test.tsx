import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import VendorConcentration from "./VendorConcentration";

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => ({ envId: "env-hb", businessId: "biz-hb" }),
}));

vi.mock("@/lib/bos-api", () => ({
  getOperatorVendorConcentration: vi.fn(),
}));

import { getOperatorVendorConcentration } from "@/lib/bos-api";

const MOCK_BOARD = {
  vendors: [
    {
      vendor_id: "apex-electrical",
      vendor_name: "Apex Electrical",
      category: "Electrical",
      concentration_pct: 42.0,
      concentration_severity: "high" as const,
      active_project_count: 5,
      total_active_jobs_denominator: 12,
      on_time_rate: 0.68,
      on_time_warn: true,
      budget_adherence_pct: 89.4,
      avg_delay_days: 9,
      rework_rate: 0.14,
      at_risk_project_count: 2,
      trend: "declining" as const,
      confidence: "high",
      flag: "concentration",
      spend_share_of_active_pct: 38.6,
      delay_correlation: "60% of recent electrical delays",
      notes: "Single-point-of-failure risk",
      impact: {
        type: "delay",
        estimated_cost_usd: 180000,
        estimated_delay_days: 14,
        confidence: "medium",
        time_to_failure_days: 21,
        if_ignored: {
          in_30_days: {
            estimated_cost_usd: 420000,
            estimated_delay_days: 45,
            secondary_effects: ["Extended dependency across 5 entities"],
          },
        },
      },
      linked_projects: [
        {
          project_id: "airport-expansion",
          project_name: "Airport Expansion",
          risk_level: "high",
          status: "at_risk",
          share_pct: 24.8,
          amount: 720000,
          line_status: "over_contract",
          href: "/lab/env/env-hb/operator/projects/airport-expansion",
        },
      ],
    },
    {
      vendor_id: "prime-staffing",
      vendor_name: "Prime Staffing",
      category: "Labor",
      concentration_pct: 25.0,
      concentration_severity: "medium" as const,
      active_project_count: 3,
      total_active_jobs_denominator: 12,
      on_time_rate: 0.81,
      on_time_warn: false,
      budget_adherence_pct: 76.2,
      avg_delay_days: 4,
      rework_rate: 0.06,
      at_risk_project_count: 1,
      trend: "stable" as const,
      confidence: "medium",
      flag: "budget_overrun",
      spend_share_of_active_pct: 18.9,
      delay_correlation: null,
      notes: null,
      impact: null,
      linked_projects: [],
    },
  ],
  totals: {
    vendor_count: 2,
    flagged_count: 1,
    max_concentration_pct: 42.0,
    portfolio_on_time_rate: 0.745,
  },
};

describe("VendorConcentration", () => {
  beforeEach(() => {
    (getOperatorVendorConcentration as ReturnType<typeof vi.fn>).mockReset();
  });

  it("headline names the flagged vendor and the concentration percent", async () => {
    (getOperatorVendorConcentration as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_BOARD);
    render(<VendorConcentration />);
    await waitFor(() => {
      const headline = screen.getByTestId("vendor-concentration-headline");
      expect(headline.textContent).toMatch(/Apex Electrical/);
      expect(headline.textContent).toMatch(/42%/);
    });
  });

  it("renders a red concentration pill for high-severity vendors", async () => {
    (getOperatorVendorConcentration as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_BOARD);
    render(<VendorConcentration />);
    await waitFor(() => {
      const pill = screen.getByTestId("vendor-concentration-pill-apex-electrical");
      expect(pill.textContent).toMatch(/42%/);
      expect(pill.className).toContain("red");
    });
  });

  it("shows the if-ignored impact for flagged vendors", async () => {
    (getOperatorVendorConcentration as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_BOARD);
    render(<VendorConcentration />);
    await waitFor(() => {
      const block = screen.getByTestId("vendor-if-ignored");
      expect(block.textContent).toMatch(/\$420K/);
      expect(block.textContent).toMatch(/45d/);
    });
  });

  it("does not show if-ignored block when no vendor is flagged", async () => {
    const safeBoard = {
      vendors: [MOCK_BOARD.vendors[1]],
      totals: { vendor_count: 1, flagged_count: 0, max_concentration_pct: 25.0, portfolio_on_time_rate: 0.81 },
    };
    (getOperatorVendorConcentration as ReturnType<typeof vi.fn>).mockResolvedValue(safeBoard);
    render(<VendorConcentration />);
    await waitFor(() => {
      expect(screen.getByTestId("vendor-concentration-headline").textContent).toMatch(/No single vendor/);
    });
    expect(screen.queryByTestId("vendor-if-ignored")).toBeNull();
  });

  it("shows KPI tiles with max concentration in warn tone when >= 40%", async () => {
    (getOperatorVendorConcentration as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_BOARD);
    render(<VendorConcentration />);
    await waitFor(() => {
      expect(screen.getAllByText(/42%/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Flagged ≥40%")).toBeTruthy();
    });
  });
});
