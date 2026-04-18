import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BudgetDriftWatch } from "./BudgetDriftWatch";

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => ({ envId: "env-hb", businessId: "biz-hb" }),
}));

vi.mock("@/lib/bos-api", () => ({
  getOperatorBudgetDrift: vi.fn(),
}));

import { getOperatorBudgetDrift } from "@/lib/bos-api";

const MOCK_BOARD = {
  rows: [
    {
      project_id: "airport-expansion",
      project_name: "Airport Expansion",
      entity_id: "hb-construction",
      entity_name: "HB Construction",
      project_status: "at_risk",
      project_risk_level: "high",
      current_budget_usd: 2500000,
      actual_cost_usd: 2900000,
      current_drift_pct: 16.0,
      drift_trend_30d_pct: 4.8,
      drift_trend_60d_pct: 7.2,
      drift_risk_score: 82,
      drift_severity: "critical" as const,
      key_driver: "Steel package running 18% above February run-rate",
      trend_points_pct: [2.1, 5.3, 8.4, 11.2, 16.0],
      forecast_final_drift_pct: 22.5,
      forecast_cost_overrun_usd: 560000,
      days_to_next_threshold: 14,
      next_threshold_label: "20% overrun triggers lender review",
      confidence: "high",
      owner: "PM — Dallas",
      notes: "Drift accelerating",
      impact: {
        type: "cost",
        estimated_cost_usd: 560000,
        estimated_delay_days: 0,
        confidence: "high",
        time_to_failure_days: 14,
        if_ignored: {
          in_30_days: {
            estimated_cost_usd: 825000,
            estimated_delay_days: 7,
            secondary_effects: ["Triggers lender covenant review at 20% overrun"],
          },
        },
      },
      href: "/lab/env/env-hb/operator/projects/airport-expansion",
    },
    {
      project_id: "fleet-optimization",
      project_name: "Fleet Optimization",
      entity_id: "hb-logistics",
      entity_name: "HB Logistics",
      project_status: "watch",
      project_risk_level: "medium",
      current_budget_usd: 800000,
      actual_cost_usd: 820000,
      current_drift_pct: 2.5,
      drift_trend_30d_pct: 1.8,
      drift_trend_60d_pct: 2.1,
      drift_risk_score: 38,
      drift_severity: "elevated" as const,
      key_driver: "Emergency labor premium",
      trend_points_pct: [0.2, 0.7, 1.4, 1.9, 2.5],
      forecast_final_drift_pct: 4.2,
      forecast_cost_overrun_usd: 14000,
      days_to_next_threshold: null,
      next_threshold_label: null,
      confidence: "medium",
      owner: "PM — Logistics",
      notes: null,
      impact: null,
      href: "/lab/env/env-hb/operator/projects/fleet-optimization",
    },
  ],
  totals: {
    project_count: 2,
    critical_count: 1,
    watchlist_count: 2,
    total_forecast_overrun_usd: 574000,
    max_current_drift_pct: 16.0,
  },
};

describe("BudgetDriftWatch", () => {
  beforeEach(() => {
    (getOperatorBudgetDrift as ReturnType<typeof vi.fn>).mockReset();
  });

  it("headline reports critical count + forecast overrun", async () => {
    (getOperatorBudgetDrift as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_BOARD);
    render(<BudgetDriftWatch />);
    await waitFor(() => {
      const headline = screen.getByTestId("budget-drift-headline");
      expect(headline.textContent).toMatch(/1 project/i);
      expect(headline.textContent).toMatch(/\$574K/);
      expect(headline.textContent).toMatch(/14d/);
    });
  });

  it("renders severity pill with red tone for critical row", async () => {
    (getOperatorBudgetDrift as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_BOARD);
    render(<BudgetDriftWatch />);
    await waitFor(() => {
      const pill = screen.getByTestId("drift-severity-airport-expansion");
      expect(pill.textContent).toMatch(/critical/i);
      expect(pill.className).toContain("red");
    });
  });

  it("shows the if-ignored impact for the top critical project", async () => {
    (getOperatorBudgetDrift as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_BOARD);
    render(<BudgetDriftWatch />);
    await waitFor(() => {
      const block = screen.getByTestId("drift-if-ignored");
      expect(block.textContent).toMatch(/\$825K/);
      expect(block.textContent).toMatch(/Airport Expansion/);
      expect(block.textContent).toMatch(/lender covenant review/);
    });
  });

  it("does not show if-ignored block when no critical project", async () => {
    const safeBoard = {
      rows: [MOCK_BOARD.rows[1]],
      totals: { project_count: 1, critical_count: 0, watchlist_count: 1, total_forecast_overrun_usd: 14000, max_current_drift_pct: 2.5 },
    };
    (getOperatorBudgetDrift as ReturnType<typeof vi.fn>).mockResolvedValue(safeBoard);
    render(<BudgetDriftWatch />);
    await waitFor(() => {
      expect(screen.getByTestId("budget-drift-headline").textContent).toMatch(/No projects currently drifting/i);
    });
    expect(screen.queryByTestId("drift-if-ignored")).toBeNull();
  });

  it("renders a current-drift value per row", async () => {
    (getOperatorBudgetDrift as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_BOARD);
    render(<BudgetDriftWatch />);
    await waitFor(() => {
      expect(screen.getByTestId("drift-current-airport-expansion").textContent).toMatch(/\+16\.0%/);
      expect(screen.getByTestId("drift-current-fleet-optimization").textContent).toMatch(/\+2\.5%/);
    });
  });
});
