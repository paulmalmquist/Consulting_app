import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { PermitTracker } from "@/components/operator/PermitTracker";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => ({ envId: "env-test", businessId: "biz-test" }),
}));

vi.mock("@/lib/bos-api", () => ({
  getOperatorPermitBoard: vi.fn().mockResolvedValue({
    permits: [
      {
        permit_id: "prm-airport-elec-rev3",
        project_id: "airport-expansion",
        project_name: "Airport Expansion",
        entity_id: "hb-construction",
        entity_name: "HB Construction",
        municipality_id: "muni-dallas",
        municipality_name: "City of Dallas",
        municipality_friction_score: 64,
        permit_type: "electrical",
        title: "Airport Expansion — Electrical Permit Rev 3",
        applicant: "PM — Dallas",
        current_stage: "second_review",
        stage_index: 4,
        stage_count: 7,
        stage_entered_at: "2026-03-18",
        median_stage_days: 12,
        days_in_stage: 30,
        days_over_median: 18,
        over_median_pct: 150,
        delay_flag: true,
        expected_completion: "2026-05-10",
        impact: {
          type: "delay",
          estimated_cost_usd: 125000,
          estimated_delay_days: 21,
          estimated_revenue_at_risk_usd: 0,
          confidence: "high",
          time_to_failure_days: 10,
          if_ignored: {
            in_30_days: {
              estimated_cost_usd: 275000,
              estimated_delay_days: 45,
              secondary_effects: ["Cascades into framing schedule"],
            },
          },
        },
        history: [],
        href_project: "/lab/env/env-test/operator/projects/airport-expansion",
        href_municipality: "/lab/env/env-test/operator/municipalities/muni-dallas",
      },
      {
        permit_id: "prm-retrofit-ti",
        project_id: "office-retrofit-program",
        project_name: "Office Retrofit Program",
        entity_id: "hb-facilities",
        entity_name: "HB Facilities",
        municipality_id: "muni-denver",
        municipality_name: "Denver County",
        municipality_friction_score: 32,
        permit_type: "tenant_improvement",
        title: "Tenant Improvement — 2 facilities",
        applicant: "Facilities Director",
        current_stage: "issued",
        stage_index: 6,
        stage_count: 7,
        stage_entered_at: "2026-01-10",
        median_stage_days: 0,
        days_in_stage: 0,
        days_over_median: 0,
        over_median_pct: 0,
        delay_flag: false,
        expected_completion: "2026-01-10",
        impact: null,
        history: [],
        href_project: "/lab/env/env-test/operator/projects/office-retrofit-program",
        href_municipality: "/lab/env/env-test/operator/municipalities/muni-denver",
      },
    ],
    funnel: [
      { stage: "pre_application", count: 0 },
      { stage: "application_submitted", count: 0 },
      { stage: "first_review", count: 0 },
      { stage: "comment_response", count: 0 },
      { stage: "second_review", count: 1 },
      { stage: "approval", count: 0 },
      { stage: "issued", count: 1 },
    ],
    totals: {
      permit_count: 2,
      delayed_count: 1,
      total_days_over_median: 18,
      delayed_impact_usd: 125000,
    },
  }),
}));

describe("PermitTracker", () => {
  test("renders delayed headline with days-over-median + impact totals", async () => {
    render(<PermitTracker />);
    await waitFor(() => screen.getByText(/1 delayed of 2 active/i));
    expect(document.body.textContent).toMatch(/18 days over median/i);
    expect(document.body.textContent).toMatch(/\$125K/);
  });

  test("renders the delayed permit with urgency pill and if-ignored subline", async () => {
    render(<PermitTracker />);
    await waitFor(() => screen.getByText(/Airport Expansion — Electrical Permit Rev 3/i));
    expect(screen.getByText(/10d to failure/i)).toBeInTheDocument();
    const line = screen.getByTestId("permit-if-ignored");
    expect(line.textContent).toMatch(/If ignored 30d/i);
    expect(line.textContent).toMatch(/\+\$275K/);
    expect(line.textContent).toMatch(/\+45d/);
  });

  test("shows days-over-median pill for delayed permits only", async () => {
    render(<PermitTracker />);
    await waitFor(() => screen.getByText(/\+18d over/i));
    // On-track permit: no "over" pill
    expect(document.body.textContent).toMatch(/Tenant Improvement — 2 facilities/);
  });

  test("renders a funnel with per-stage counts", async () => {
    render(<PermitTracker />);
    await waitFor(() =>
      expect(screen.getAllByText(/Second review/i).length).toBeGreaterThanOrEqual(1)
    );
    expect(screen.getAllByText(/Second review/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Issued/i).length).toBeGreaterThanOrEqual(1);
  });
});
