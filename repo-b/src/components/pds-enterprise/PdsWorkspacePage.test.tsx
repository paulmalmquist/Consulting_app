import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

const mockGetPdsCommandCenter = vi.fn();
const mockBuildPdsReportPacket = vi.fn();

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => ({
    envId: "env-1",
    businessId: "biz-1",
  }),
}));

vi.mock("@/lib/commandbar/appContextBridge", () => ({
  publishAssistantPageContext: vi.fn(),
  resetAssistantPageContext: vi.fn(),
}));

vi.mock("@/lib/bos-api", async () => {
  const actual = await vi.importActual("@/lib/bos-api");
  return {
    ...actual,
    getPdsCommandCenter: (...args: unknown[]) => mockGetPdsCommandCenter(...args),
    buildPdsReportPacket: (...args: unknown[]) => mockBuildPdsReportPacket(...args),
  };
});

vi.mock("@/components/pds-enterprise/PdsMarketMap", () => ({
  PdsMarketMap: ({ points, onMarketClick }: { points: Array<{ market_id: string; name: string }>; onMarketClick?: (marketId: string) => void }) => (
    <div data-testid="mock-pds-market-map">
      {points.map((point) => (
        <button key={point.market_id} type="button" onClick={() => onMarketClick?.(point.market_id)}>
          {point.name}
        </button>
      ))}
    </div>
  ),
}));

const payload = {
  env_id: "env-1",
  business_id: "biz-1",
  workspace_template_key: "pds_enterprise",
  lens: "market",
  horizon: "YTD",
  role_preset: "executive",
  generated_at: "2026-03-29T16:00:00Z",
  metrics_strip: [
    {
      key: "fee_vs_plan",
      label: "Fee Revenue vs Plan",
      value: 1200000,
      comparison_label: "Plan",
      comparison_value: 1250000,
      delta_value: -50000,
      tone: "danger",
      unit: "usd",
      driver_text: "Markets trailing fee plan.",
      trend_direction: "down",
      filter_key: "markets_below_plan",
      reason_codes: ["forecast_risk"],
    },
  ],
  performance_table: {
    lens: "market",
    horizon: "YTD",
    columns: [],
    rows: [
      {
        entity_id: "market-1",
        entity_label: "South Florida",
        owner_label: "Avery Cole",
        health_status: "yellow",
        fee_plan: 1250000,
        fee_actual: 1200000,
        fee_variance: -50000,
        gaap_plan: 1175000,
        gaap_actual: 1120000,
        gaap_variance: -55000,
        ci_plan: 225000,
        ci_actual: 195000,
        ci_variance: -30000,
        backlog: 4500000,
        forecast: 3800000,
        red_projects: 2,
        client_risk_accounts: 1,
        satisfaction_score: 4.2,
        utilization_pct: 0.91,
        timecard_compliance_pct: 0.88,
        reason_codes: ["FEE_PLAN_MISS"],
        href: "/lab/env/env-1/pds/markets",
      },
    ],
  },
  delivery_risk: [],
  resource_health: [],
  timecard_health: [],
  forecast_points: [],
  satisfaction: [],
  closeout: [],
  account_dashboard: null,
  briefing: {
    generated_at: "2026-03-29T16:00:00Z",
    lens: "market",
    horizon: "YTD",
    role_preset: "executive",
    headline: "Briefing",
    summary_lines: ["Line 1", "Line 2"],
    recommended_actions: ["Escalate schedule recovery review"],
  },
  operating_brief: {
    headline: "Current Operating Posture",
    summary: "South Florida is below plan.",
    trend_direction: "worsening",
    focus_label: "South Florida",
    lines: [
      { label: "Biggest Drag", text: "South Florida is missing plan.", severity: "critical" },
      { label: "Primary Driver", text: "Timecards are late.", severity: "warning" },
      { label: "Execution Pressure", text: "Two red projects.", severity: "warning" },
      { label: "Pipeline Watch", text: "One stale deal.", severity: "watch" },
      { label: "Highest-Leverage Action", text: "Escalate recovery plan.", severity: "critical" },
    ],
    recommended_actions: ["Escalate recovery plan"],
  },
  alert_filters: [
    {
      key: "markets_below_plan",
      label: "1 market below plan",
      count: 1,
      description: "Markets trailing fee revenue plan.",
      severity: "critical",
      tone: "danger",
      reason_codes: ["forecast_risk"],
      entity_ids: ["market-1"],
    },
  ],
  map_summary: {
    focus_market_id: "market-1",
    color_modes: ["revenue_variance"],
    points: [
      {
        market_id: "market-1",
        name: "South Florida",
        lat: 26.1,
        lng: -80.3,
        fee_actual: 1200000,
        fee_plan: 1250000,
        variance_pct: -0.04,
        backlog: 4500000,
        forecast: 3800000,
        staffing_pressure_count: 1,
        delinquent_timecards: 1,
        red_projects: 2,
        closeout_risk_count: 1,
        client_risk_accounts: 1,
        risk_score: 84,
        health_status: "yellow",
        reason_codes: ["forecast_risk"],
        top_accounts: ["Stone Healthcare Accounts"],
        owner_name: "Avery Cole",
      },
    ],
  },
  intervention_queue: [
    {
      intervention_id: "market-market-1",
      decision_code: "D19",
      entity_type: "market",
      entity_id: "market-1",
      entity_label: "South Florida",
      severity: "critical",
      tone: "danger",
      issue_summary: "South Florida is below plan.",
      cause_summary: "forecast risk",
      expected_impact: "Revenue continues to slip.",
      recommended_action: "Escalate recovery plan",
      owner_label: "Avery Cole",
      reason_codes: ["forecast_risk"],
      href: "/lab/env/env-1/pds/markets",
      queue_item_id: "queue-1",
      queue_status: "open",
    },
  ],
  insight_panel: {
    title: "Why this matters",
    focus_label: "South Florida",
    status: "critical",
    what: "South Florida is below plan.",
    why: "Forecast risk is concentrated here.",
    consequence: "Revenue continues to slip.",
    action: "Escalate recovery plan",
    owner: "Avery Cole",
    reason_codes: ["forecast_risk"],
  },
  pipeline_summary: {
    active_deals: 3,
    overdue_close_count: 1,
    stalled_count: 1,
    high_value_low_probability_count: 1,
    total_pipeline_value: 8100000,
    total_weighted_value: 4600000,
    top_deal_name: "Petron Refinery Controls Upgrade",
    top_issue: "Expected close is within 30 days.",
  },
};

describe("PdsWorkspacePage", () => {
  beforeEach(() => {
    mockGetPdsCommandCenter.mockResolvedValue(payload);
    mockBuildPdsReportPacket.mockReset();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
  });

  it("propagates homepage focus between filters, map, and intervention queue", async () => {
    const user = userEvent.setup();
    render(
      <PdsWorkspacePage
        title="Home"
        sections={["signals", "performance", "interventionQueue", "varianceChart", "leaderboard", "briefing"]}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("pds-operating-brief")).toBeInTheDocument());

    expect(screen.getByTestId("pds-active-state")).toHaveTextContent("Focus: South Florida");

    await user.click(screen.getByRole("button", { name: "1 market below plan" }));
    expect(screen.getByTestId("pds-active-state")).toHaveTextContent("Source: chip");
    expect(screen.getByTestId("pds-insight-panel")).toHaveTextContent("1 market below plan");

    await user.click(screen.getByRole("button", { name: /Fee Revenue vs Plan/i }));
    expect(screen.getByTestId("pds-active-state")).toHaveTextContent("Source: kpi");

    await user.click(within(screen.getByTestId("mock-pds-market-map")).getByRole("button", { name: "South Florida" }));
    expect(screen.getByTestId("pds-active-state")).toHaveTextContent("Source: map");

    await user.click(within(screen.getByTestId("pds-intervention-queue")).getByRole("button", { name: /South Florida/i }));
    expect(screen.getByTestId("pds-active-state")).toHaveTextContent("Source: queue");
  });
});
