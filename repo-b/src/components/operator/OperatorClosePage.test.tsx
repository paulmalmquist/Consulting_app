import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { OperatorClosePage } from "@/components/operator/OperatorPages";

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

vi.mock("@/components/winston-companion/WinstonCompanionProvider", () => ({
  useWinstonCompanion: () => ({
    openDrawer: vi.fn(),
    setDraft: vi.fn(),
    sendPrompt: vi.fn(),
  }),
}));

vi.mock("@/components/ui/WinstonLoader", () => ({
  WorkspaceContextLoader: ({ label }: { label: string }) => (
    <div data-testid="loader">{label}</div>
  ),
}));

vi.mock("@/lib/bos-api", () => ({
  getOperatorCloseoutBoard: vi.fn().mockResolvedValue({
    packages: [
      {
        project_id: "new-development-site-a",
        project_name: "New Development Site A",
        entity_id: "hb-development",
        entity_name: "HB Development",
        target_close_date: "2026-05-15",
        days_to_close: 28,
        completion_pct: 0.62,
        missing_count: 4,
        blocking_count: 3,
        impact_total_usd: 640000,
        earliest_due_date: "2026-04-25",
        missing_by_type: [
          { type: "lien_waiver", count: 2 },
          { type: "inspection", count: 1 },
          { type: "as_built", count: 1 },
        ],
        missing_items: [
          {
            id: "item-1",
            type: "lien_waiver",
            title: "Final lien waiver — primary GC",
            owner: "Legal",
            blocking: true,
            due_date: "2026-04-25",
            note: "Primary GC has not countersigned.",
            impact: {
              type: "cost",
              estimated_cost_usd: 360000,
              estimated_delay_days: 14,
              estimated_revenue_at_risk_usd: 0,
              confidence: "high",
              time_to_failure_days: 8,
              if_ignored: {
                in_30_days: {
                  estimated_cost_usd: 420000,
                  estimated_delay_days: 30,
                  secondary_effects: ["Retention release slips"],
                },
              },
            },
          },
          {
            id: "item-2",
            type: "as_built",
            title: "As-built drawings",
            owner: "Architect",
            blocking: false,
            due_date: "2026-05-10",
            note: "Required for warranty transfer.",
            impact: null,
          },
        ],
        href: "/lab/env/env-test/operator/projects/new-development-site-a",
      },
    ],
    totals: {
      package_count: 1,
      missing_item_count: 4,
      blocking_missing_count: 3,
      impact_total_usd: 640000,
      earliest_due_date: "2026-04-25",
      cash_at_risk_usd: 1800000,
      cash_at_risk_project_count: 4,
    },
    cash_at_risk: {
      total_amount_usd: 1800000,
      project_count: 4,
      rows: [],
    },
  }),
  listOperatorCloseTasks: vi.fn().mockResolvedValue([]),
  getOperatorCommandCenter: vi.fn(),
  getOperatorProjectDetail: vi.fn(),
  listDocuments: vi.fn(),
  listOperatorProjects: vi.fn(),
  listOperatorVendors: vi.fn(),
  initUpload: vi.fn(),
  completeUpload: vi.fn(),
  initExtraction: vi.fn(),
  runExtraction: vi.fn(),
  computeSha256: vi.fn(),
}));

vi.mock("@/lib/commandbar/appContextBridge", () => ({
  publishAssistantPageContext: vi.fn(),
}));

describe("OperatorClosePage", () => {
  test("renders the cash-stuck KPI from totals", async () => {
    render(<OperatorClosePage />);
    await waitFor(() => screen.getByTestId("closeout-summary"));
    expect(document.body.textContent).toMatch(/\$1\.8M/);
    expect(screen.getByText(/Cash stuck/i)).toBeInTheDocument();
  });

  test("renders a readiness card with completion bar and blocking section", async () => {
    render(<OperatorClosePage />);
    await waitFor(() => screen.getByText(/New Development Site A/i));
    expect(screen.getByText(/62% complete/i)).toBeInTheDocument();
    expect(screen.getByText(/3 blocking \/ 4 missing/i)).toBeInTheDocument();
  });

  test("renders if-ignored subline on blocking missing items", async () => {
    render(<OperatorClosePage />);
    await waitFor(() => screen.getByTestId("closeout-if-ignored"));
    const line = screen.getByTestId("closeout-if-ignored");
    expect(line.textContent).toMatch(/if ignored in 30d/i);
    expect(line.textContent).toMatch(/\+\$420K/);
  });

  test("folds non-blocking items behind a disclosure", async () => {
    render(<OperatorClosePage />);
    await waitFor(() => screen.getByText(/1 non-blocking item/i));
    // Disclosure label present but child content not rendered without open
    expect(screen.getByText(/1 non-blocking item/i)).toBeInTheDocument();
  });
});
