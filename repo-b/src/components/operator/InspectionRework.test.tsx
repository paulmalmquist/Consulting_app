import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { InspectionRework } from "./InspectionRework";

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => ({ envId: "env-hb", businessId: "biz-hb" }),
}));

vi.mock("@/lib/bos-api", () => ({
  getOperatorInspectionRework: vi.fn(),
}));

import { getOperatorInspectionRework } from "@/lib/bos-api";

const MOCK = {
  by_inspection_type: [
    {
      inspection_type: "electrical_rough",
      total: 2,
      failed: 2,
      fail_rate: 1.0,
      rework_hours: 63,
      rework_cost_usd: 13700,
    },
    {
      inspection_type: "structural",
      total: 2,
      failed: 2,
      fail_rate: 1.0,
      rework_hours: 58,
      rework_cost_usd: 12600,
    },
  ],
  by_vendor: [
    {
      vendor_id: "apex-electrical",
      vendor_name: "Apex Electrical",
      total: 3,
      failed: 2,
      fail_rate: 0.667,
      rework_hours: 63,
      rework_cost_usd: 13700,
    },
    {
      vendor_id: "delta-materials",
      vendor_name: "Delta Materials",
      total: 2,
      failed: 2,
      fail_rate: 1.0,
      rework_hours: 58,
      rework_cost_usd: 12600,
    },
  ],
  recent_failures: [
    {
      id: "ie-003",
      project_id: "airport-expansion",
      project_name: "Airport Expansion",
      inspection_type: "electrical_rough",
      inspection_date: "2026-04-08",
      vendor_id: "apex-electrical",
      vendor_name: "Apex Electrical",
      issue_summary: "Panel schedule mismatch",
      rework_hours: 35,
      rework_cost_usd: 7500,
      href: "/lab/env/env-hb/operator/projects/airport-expansion",
    },
  ],
  totals: {
    event_count: 10,
    fail_count: 6,
    overall_fail_rate: 0.6,
    total_rework_hours: 144,
    total_rework_cost_usd: 31000,
  },
};

describe("InspectionRework", () => {
  beforeEach(() => {
    (getOperatorInspectionRework as ReturnType<typeof vi.fn>).mockReset();
  });

  it("headline reports fail count, fail rate, and rework cost", async () => {
    (getOperatorInspectionRework as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<InspectionRework />);
    await waitFor(() => {
      const h = screen.getByTestId("inspection-rework-headline");
      expect(h.textContent).toMatch(/6 failures/);
      expect(h.textContent).toMatch(/60%/);
      expect(h.textContent).toMatch(/\$31K/);
    });
  });

  it("renders fail rate pill in red for 100% fail rate type", async () => {
    (getOperatorInspectionRework as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<InspectionRework />);
    await waitFor(() => {
      const row = screen.getByTestId("inspection-type-electrical_rough");
      expect(row.textContent).toMatch(/100%/);
      const pill = row.querySelector("span");
      expect(pill?.className).toContain("red");
    });
  });

  it("ranks vendors by rework cost", async () => {
    (getOperatorInspectionRework as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<InspectionRework />);
    await waitFor(() => {
      expect(screen.getByTestId("inspection-vendor-apex-electrical").textContent).toMatch(/\$14K/);
    });
  });

  it("lists recent failures with project link", async () => {
    (getOperatorInspectionRework as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<InspectionRework />);
    await waitFor(() => {
      const row = screen.getByTestId("inspection-failure-ie-003");
      expect(row.textContent).toMatch(/Airport Expansion/);
      expect(row.textContent).toMatch(/Panel schedule mismatch/);
    });
  });
});
