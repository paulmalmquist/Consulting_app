import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StaffingLoad } from "./StaffingLoad";

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => ({ envId: "env-hb", businessId: "biz-hb" }),
}));

vi.mock("@/lib/bos-api", () => ({
  getOperatorStaffingLoad: vi.fn(),
}));

import { getOperatorStaffingLoad } from "@/lib/bos-api";

const MOCK = {
  staff: [
    {
      staff_id: "stf-kpatel",
      name: "K. Patel",
      role: "Project Manager",
      entity_id: "hb-construction",
      entity_name: "HB Construction",
      seniority: "senior",
      cost_loaded_per_hour: 185,
      allocation_total_pct: 120,
      hours_per_week_total: 48,
      project_count: 2,
      overloaded: true,
      projects: [
        {
          project_id: "airport-expansion",
          project_name: "Airport Expansion",
          allocation_pct: 85,
          role_on_project: "PM",
          hours_per_week: 34,
          stretch: true,
          notes: "Carrying remediation",
          href: "/lab/env/env-hb/operator/projects/airport-expansion",
        },
      ],
    },
    {
      staff_id: "stf-rsingh",
      name: "R. Singh",
      role: "Project Manager",
      entity_id: "hb-logistics",
      entity_name: "HB Logistics",
      seniority: "mid",
      cost_loaded_per_hour: 145,
      allocation_total_pct: 100,
      hours_per_week_total: 40,
      project_count: 1,
      overloaded: false,
      projects: [
        {
          project_id: "fleet-optimization",
          project_name: "Fleet Optimization",
          allocation_pct: 100,
          role_on_project: "PM",
          hours_per_week: 40,
          stretch: false,
          notes: null,
          href: "/lab/env/env-hb/operator/projects/fleet-optimization",
        },
      ],
    },
  ],
  project_coverage: [
    {
      project_id: "office-retrofit-program",
      project_name: "Office Retrofit Program",
      total_allocation_pct: 75,
      staff_count: 1,
      stretch_count: 0,
      href: "/lab/env/env-hb/operator/projects/office-retrofit-program",
    },
  ],
  totals: {
    staff_count: 2,
    overloaded_count: 1,
    avg_allocation_pct: 110,
    projects_covered: 3,
  },
};

describe("StaffingLoad", () => {
  beforeEach(() => {
    (getOperatorStaffingLoad as ReturnType<typeof vi.fn>).mockReset();
  });

  it("headline names the top overloaded staffer", async () => {
    (getOperatorStaffingLoad as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<StaffingLoad />);
    await waitFor(() => {
      const h = screen.getByTestId("staffing-load-headline");
      expect(h.textContent).toMatch(/K\. Patel/);
      expect(h.textContent).toMatch(/120%/);
      expect(h.textContent).toMatch(/1 overloaded/);
    });
  });

  it("highlights overloaded staff with red pill", async () => {
    (getOperatorStaffingLoad as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<StaffingLoad />);
    await waitFor(() => {
      const pill = screen.getByTestId("staff-allocation-stf-kpatel");
      expect(pill.textContent).toMatch(/120%/);
      expect(pill.className).toContain("red");
    });
  });

  it("renders a staff row per team member", async () => {
    (getOperatorStaffingLoad as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<StaffingLoad />);
    await waitFor(() => {
      expect(screen.getByTestId("staff-row-stf-kpatel")).toBeTruthy();
      expect(screen.getByTestId("staff-row-stf-rsingh")).toBeTruthy();
    });
  });

  it("shows project coverage with amber when under 100%", async () => {
    (getOperatorStaffingLoad as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK);
    render(<StaffingLoad />);
    await waitFor(() => {
      const row = screen.getByTestId("project-coverage-office-retrofit-program");
      expect(row.textContent).toMatch(/75%/);
    });
  });
});
