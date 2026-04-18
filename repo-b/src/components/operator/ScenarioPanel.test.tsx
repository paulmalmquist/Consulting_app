import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ScenarioPanel from "./ScenarioPanel";
import { OperatorDevelopmentScenarios } from "@/lib/bos-api";

const MOCK_SCENARIOS: OperatorDevelopmentScenarios = {
  site_id: "site-brickell-18",
  presets: [
    {
      id: "conservative",
      label: "Conservative",
      assumptions: { density_units: 85, approval_delay_days: 45, cost_inflation_pct: 8.0 },
      outputs: { irr_pct: 11.2, profit_margin_pct: 16.8, timeline_days: 570, total_dev_cost_usd: 23400000 },
    },
    {
      id: "base",
      label: "Base Case",
      assumptions: { density_units: 110, approval_delay_days: 20, cost_inflation_pct: 3.5 },
      outputs: { irr_pct: 17.8, profit_margin_pct: 23.5, timeline_days: 450, total_dev_cost_usd: 21000000 },
    },
    {
      id: "aggressive",
      label: "Aggressive",
      assumptions: { density_units: 130, approval_delay_days: 0, cost_inflation_pct: 0.0 },
      outputs: { irr_pct: 23.4, profit_margin_pct: 28.7, timeline_days: 380, total_dev_cost_usd: 20100000 },
    },
  ],
  active_ordinance_impact: {
    ordinance_event_id: "evt-mia-parking-2026-04-01",
    description: "Miami-Dade T6 parking minimum increase forces variance request",
    event_effective_date: "2026-04-01",
    event_change_type: "amended",
    delta_vs_base: {
      approval_delay_days: 30,
      irr_pct: -4.1,
      profit_margin_pct: -5.3,
      timeline_days: 30,
      total_dev_cost_usd: 180000,
      confidence: "medium",
    },
  },
};

describe("ScenarioPanel", () => {
  it("renders preset toggle tabs and defaults to base case IRR", () => {
    render(<ScenarioPanel scenarios={MOCK_SCENARIOS} />);
    expect(screen.getByTestId("scenario-tab-base")).toBeTruthy();
    expect(screen.getByTestId("scenario-tab-conservative")).toBeTruthy();
    expect(screen.getByTestId("scenario-tab-aggressive")).toBeTruthy();
    const irrKpi = screen.getByTestId("scenario-kpi-irr");
    expect(irrKpi.textContent).toContain("17.8%");
  });

  it("switches to conservative preset on click", () => {
    render(<ScenarioPanel scenarios={MOCK_SCENARIOS} />);
    fireEvent.click(screen.getByTestId("scenario-tab-conservative"));
    const irrKpi = screen.getByTestId("scenario-kpi-irr");
    expect(irrKpi.textContent).toContain("11.2%");
  });

  it("shows ordinance-adjusted tab and applies delta to IRR", () => {
    render(<ScenarioPanel scenarios={MOCK_SCENARIOS} />);
    const ordinanceBtn = screen.getByTestId("scenario-tab-ordinance-adjusted");
    fireEvent.click(ordinanceBtn);

    // Base IRR 17.8 + ordinance delta -4.1 = 13.7
    const irrKpi = screen.getByTestId("scenario-kpi-irr");
    expect(irrKpi.textContent).toContain("13.7%");
  });

  it("shows ordinance impact callout and negative delta pill when adjusted", () => {
    render(<ScenarioPanel scenarios={MOCK_SCENARIOS} />);
    fireEvent.click(screen.getByTestId("scenario-tab-ordinance-adjusted"));

    expect(screen.getByTestId("ordinance-impact-callout")).toBeTruthy();
    const irrDelta = screen.getByTestId("scenario-delta-irr");
    expect(irrDelta.textContent).toContain("-4.1%");
    expect(irrDelta.className).toContain("red");
  });

  it("hides ordinance tab when no active_ordinance_impact", () => {
    const noImpact: OperatorDevelopmentScenarios = { ...MOCK_SCENARIOS, active_ordinance_impact: null };
    render(<ScenarioPanel scenarios={noImpact} />);
    expect(screen.queryByTestId("scenario-tab-ordinance-adjusted")).toBeNull();
  });
});
