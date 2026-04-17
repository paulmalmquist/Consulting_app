import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { PipelineIntegrityLandingPage } from "@/components/operator/PipelineIntegrityPages";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => ({
    envId: "env-test",
    businessId: "biz-test",
  }),
}));

vi.mock("@/lib/bos-api", () => ({
  getOperatorPipelineIntegrity: vi.fn().mockResolvedValue({
    premature_projects: [
      {
        anomaly_class: "premature_project",
        site_id: "site-x",
        site_name: "Bishop Arts Block",
        project_id: "proj-x",
        project_name: "Bishop Arts Tower",
        feasibility_score: 0.44,
        risk_level: "high_risk",
        summary: "Feasibility below threshold but project is linked.",
        recommended_action: "Re-evaluate before committing further spend.",
        href: "/lab/env/env-test/operator/site-risk/site-x",
        project_href: "/lab/env/env-test/operator/projects/proj-x",
      },
    ],
    active_before_ready: [
      {
        anomaly_class: "active_before_ready",
        project_id: "new-development-site-a",
        project_name: "New Development Site A",
        entity_id: "hb-development",
        overall_pct: 0.58,
        blocking_gate: "utility_coordination",
        incomplete_gate_count: 2,
        at_risk_gate_count: 2,
        gates: [
          { key: "land_control", label: "Land control", status: "complete" },
          {
            key: "utility_coordination",
            label: "Utility coordination",
            status: "incomplete",
            blocker_reason: "Denver Water has not scheduled tap installation.",
          },
        ],
        next_action: "Resolve utility tap scheduling with Denver Water.",
        owner: "Dir of Development",
        href: "/lab/env/env-test/operator/projects/new-development-site-a",
      },
    ],
    assumption_drift: [
      {
        anomaly_class: "assumption_drift",
        project_id: "airport-expansion",
        project_name: "Airport Expansion",
        site_id: "site-airport-expansion",
        site_name: "Dallas Airport Expansion Parcel",
        captured_at_pursuit: "2025-07-10",
        top_variance_label: "Entitlement timeline (days)",
        top_variance_note: null,
        top_variance_impact: null,
        variance_count: 2,
        total_impact_usd: 305000,
        variance_items: [
          {
            key: "entitlement_timeline_days",
            label: "Entitlement timeline (days)",
            pursuit: 110,
            current: 158,
            diff: 48,
            severity: "high",
            note: "Dallas permit office added review rounds.",
            impact: {
              type: "delay",
              estimated_cost_usd: 125000,
              estimated_delay_days: 48,
              estimated_revenue_at_risk_usd: 0,
              confidence: "high",
              time_to_failure_days: 10,
              if_ignored: {
                in_30_days: {
                  estimated_cost_usd: 260000,
                  estimated_delay_days: 75,
                  secondary_effects: ["Framing slips past Q2"],
                },
              },
            },
          },
        ],
        href: "/lab/env/env-test/operator/projects/airport-expansion",
      },
    ],
    totals: {
      premature_count: 1,
      active_before_ready_count: 1,
      drift_count: 1,
      total_drift_impact_usd: 305000,
    },
  }),
}));

vi.mock("@/components/ui/WinstonLoader", () => ({
  WorkspaceContextLoader: () => <div data-testid="loader" />,
}));

describe("PipelineIntegrityLandingPage", () => {
  test("renders the three anomaly sections with headline totals", async () => {
    render(<PipelineIntegrityLandingPage />);
    await waitFor(() =>
      expect(screen.getByTestId("pipeline-integrity-summary")).toBeInTheDocument()
    );
    expect(screen.getAllByText(/Premature projects/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Active before ready/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Assumption drift/i).length).toBeGreaterThanOrEqual(1);
  });

  test("renders the premature project card with feasibility pill", async () => {
    render(<PipelineIntegrityLandingPage />);
    await waitFor(() => screen.getByText("Bishop Arts Tower"));
    expect(screen.getByText(/Feasibility 44%/i)).toBeInTheDocument();
  });

  test("renders readiness gates and blocker copy for active-before-ready", async () => {
    render(<PipelineIntegrityLandingPage />);
    await waitFor(() => screen.getByText(/New Development Site A/i));
    expect(screen.getByText(/58% ready/i)).toBeInTheDocument();
    expect(screen.getByText(/Utility coordination/i)).toBeInTheDocument();
  });

  test("renders assumption drift with if-ignored consequence", async () => {
    render(<PipelineIntegrityLandingPage />);
    await waitFor(() => screen.getByText("Airport Expansion"));
    expect(document.body.textContent).toMatch(/if ignored in 30d/i);
    expect(document.body.textContent).toMatch(/\+\$260/);
  });
});
