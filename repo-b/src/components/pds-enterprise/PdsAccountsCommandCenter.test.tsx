import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PdsAccountsCommandCenter } from "@/components/pds-enterprise/PdsAccountsCommandCenter";

const mockGetPdsCommandCenter = vi.fn();
const mockGetPdsAccountPreview = vi.fn();
let currentSearchParams = new URLSearchParams();

const mockRouterReplace = vi.fn((href: string) => {
  const query = href.includes("?") ? href.split("?")[1] : "";
  currentSearchParams = new URLSearchParams(query);
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/lab/env/env-1/pds/accounts",
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => currentSearchParams,
}));

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => ({
    envId: "env-1",
    businessId: "biz-1",
  }),
}));

vi.mock("@/lib/bos-api", async () => {
  const actual = await vi.importActual("@/lib/bos-api");
  return {
    ...actual,
    getPdsCommandCenter: (...args: unknown[]) => mockGetPdsCommandCenter(...args),
    getPdsAccountPreview: (...args: unknown[]) => mockGetPdsAccountPreview(...args),
  };
});

const commandCenterPayload = {
  env_id: "env-1",
  business_id: "biz-1",
  workspace_template_key: "pds_enterprise",
  lens: "account",
  horizon: "YTD",
  role_preset: "account_director",
  generated_at: "2026-03-23T12:00:00Z",
  metrics_strip: [
    { key: "fee_revenue", label: "Total Revenue (YTD)", value: 265000, comparison_label: "Plan", comparison_value: 300000, tone: "neutral", unit: "usd" },
    { key: "vs_plan", label: "% vs Plan", value: -11.7, comparison_label: "Target", comparison_value: 0, tone: "danger", unit: "percent_raw" },
    { key: "at_risk_accounts", label: "At Risk Accounts", value: 1, comparison_label: "Prior", comparison_value: 2, tone: "warn" },
    { key: "avg_health", label: "Avg Account Health Score", value: 63, comparison_label: "Prior", comparison_value: 60, tone: "positive" },
  ],
  performance_table: {
    lens: "account",
    horizon: "YTD",
    columns: [],
    rows: [],
  },
  delivery_risk: [],
  resource_health: [],
  timecard_health: [],
  forecast_points: [],
  satisfaction: [],
  closeout: [],
  account_dashboard: {
    alerts: [
      { key: "at_risk", label: "Accounts At Risk", count: 1, description: "Health score below 55", tone: "danger" },
      { key: "missing_plan", label: "Missing Plan >10%", count: 2, description: "Fee actual more than 10% below plan", tone: "warn" },
      { key: "staffing_issues", label: "Staffing Issues", count: 2, description: "Staffing pressure or late timecards", tone: "warn" },
    ],
    distribution: {
      healthy: 1,
      watch: 1,
      at_risk: 1,
    },
    accounts: [
      {
        account_id: "acct-healthy",
        account_name: "Healthy Account",
        owner_name: "Alex North",
        health_score: 88,
        health_band: "healthy",
        trend: "improving",
        fee_plan: 100000,
        fee_actual: 108000,
        plan_variance_pct: 8,
        ytd_revenue: 108000,
        staffing_score: 92,
        team_utilization_pct: 86,
        overloaded_resources: 0,
        staffing_gap_resources: 0,
        timecard_compliance_pct: 99,
        satisfaction_score: 4.6,
        satisfaction_trend_delta: 0.4,
        red_projects: 0,
        collections_lag: 0,
        writeoff_leakage: 0,
        reason_codes: [],
        primary_issue_code: null,
        impact_label: "Stable",
        recommended_action: "Monitor weekly",
        recommended_owner: "Alex North",
      },
      {
        account_id: "acct-watch",
        account_name: "Watch Account",
        owner_name: "Morgan Lee",
        health_score: 61,
        health_band: "watch",
        trend: "stable",
        fee_plan: 100000,
        fee_actual: 85000,
        plan_variance_pct: -15,
        ytd_revenue: 85000,
        staffing_score: 58,
        team_utilization_pct: null,
        overloaded_resources: 1,
        staffing_gap_resources: 1,
        timecard_compliance_pct: null,
        satisfaction_score: null,
        satisfaction_trend_delta: null,
        red_projects: 1,
        collections_lag: 12000,
        writeoff_leakage: 4000,
        reason_codes: ["STAFFING_PRESSURE", "TIMECARD_LATE"],
        primary_issue_code: "STAFFING_PRESSURE",
        impact_label: "93% utilization, 1 overloaded / 1 gap",
        recommended_action: "Reset staffing plan",
        recommended_owner: "Morgan Lee",
      },
      {
        account_id: "acct-risk",
        account_name: "Risk Account",
        owner_name: "Dana Hart",
        health_score: 42,
        health_band: "at_risk",
        trend: "deteriorating",
        fee_plan: 100000,
        fee_actual: 72000,
        plan_variance_pct: -28,
        ytd_revenue: 72000,
        staffing_score: 49,
        team_utilization_pct: 97,
        overloaded_resources: 2,
        staffing_gap_resources: 1,
        timecard_compliance_pct: 82,
        satisfaction_score: 3.3,
        satisfaction_trend_delta: -0.5,
        red_projects: 2,
        collections_lag: 22000,
        writeoff_leakage: 7000,
        reason_codes: ["FEE_VARIANCE", "SATISFACTION_DECLINE"],
        primary_issue_code: "FEE_VARIANCE",
        impact_label: "$28k below plan",
        recommended_action: "Escalate recovery plan",
        recommended_owner: "Dana Hart",
      },
    ],
    actions: [
      {
        account_id: "acct-watch",
        account_name: "Watch Account",
        owner_name: "Morgan Lee",
        health_score: 61,
        health_band: "watch",
        issue: "Staffing Pressure",
        impact_label: "93% utilization, 1 overloaded / 1 gap",
        recommended_action: "Reset staffing plan",
        recommended_owner: "Morgan Lee",
        severity_rank: 92,
      },
      {
        account_id: "acct-risk",
        account_name: "Risk Account",
        owner_name: "Dana Hart",
        health_score: 42,
        health_band: "at_risk",
        issue: "Fee Variance",
        impact_label: "$28k below plan",
        recommended_action: "Escalate recovery plan",
        recommended_owner: "Dana Hart",
        severity_rank: 88,
      },
    ],
  },
  briefing: {
    generated_at: "2026-03-23T12:00:00Z",
    lens: "account",
    horizon: "YTD",
    role_preset: "account_director",
    headline: "Account view shows two interventions.",
    summary_lines: ["Watch staffing pressure", "Recover fee misses"],
    recommended_actions: ["Reset staffing plan", "Escalate recovery plan"],
  },
};

const previewByAccountId = {
  "acct-watch": {
    account_id: "acct-watch",
    account_name: "Watch Account",
    owner_name: "Morgan Lee",
    health_score: 61,
    health_band: "watch",
    trend: "stable",
    fee_plan: 100000,
    fee_actual: 85000,
    plan_variance_pct: -15,
    ytd_revenue: 85000,
    score_breakdown: {
      revenue_score: 85,
      staffing_score: 58,
      timecard_score: 50,
      client_score: 50,
    },
    team_utilization_pct: null,
    staffing_score: 58,
    overloaded_resources: 1,
    staffing_gap_resources: 1,
    timecard_compliance_pct: null,
    satisfaction_score: null,
    satisfaction_trend_delta: null,
    red_projects: 1,
    collections_lag: 12000,
    writeoff_leakage: 4000,
    primary_issue_code: "STAFFING_PRESSURE",
    impact_label: "93% utilization, 1 overloaded / 1 gap",
    recommended_action: "Reset staffing plan",
    recommended_owner: "Morgan Lee",
    reason_codes: ["STAFFING_PRESSURE", "TIMECARD_LATE"],
    top_project_risks: [],
  },
  "acct-risk": {
    account_id: "acct-risk",
    account_name: "Risk Account",
    owner_name: "Dana Hart",
    health_score: 42,
    health_band: "at_risk",
    trend: "deteriorating",
    fee_plan: 100000,
    fee_actual: 72000,
    plan_variance_pct: -28,
    ytd_revenue: 72000,
    score_breakdown: {
      revenue_score: 72,
      staffing_score: 49,
      timecard_score: 82,
      client_score: 20,
    },
    team_utilization_pct: 97,
    staffing_score: 49,
    overloaded_resources: 2,
    staffing_gap_resources: 1,
    timecard_compliance_pct: 82,
    satisfaction_score: 3.3,
    satisfaction_trend_delta: -0.5,
    red_projects: 2,
    collections_lag: 22000,
    writeoff_leakage: 7000,
    primary_issue_code: "FEE_VARIANCE",
    impact_label: "$28k below plan",
    recommended_action: "Escalate recovery plan",
    recommended_owner: "Dana Hart",
    reason_codes: ["FEE_VARIANCE", "SATISFACTION_DECLINE"],
    top_project_risks: [
      {
        project_id: "proj-1",
        project_name: "North Campus Upgrade",
        severity: "red",
        risk_score: 84,
        issue_summary: "Schedule slip, fee variance",
        recommended_action: "Recover schedule baseline",
        href: "/lab/env/env-1/pds/projects/proj-1",
      },
    ],
  },
};

describe("PdsAccountsCommandCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearchParams = new URLSearchParams();
    mockGetPdsCommandCenter.mockResolvedValue(commandCenterPayload);
    mockGetPdsAccountPreview.mockImplementation(async (_envId: string, accountId: keyof typeof previewByAccountId) => previewByAccountId[accountId]);
  });

  it("auto-selects the highest-priority action item and swaps preview content", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PdsAccountsCommandCenter />);

    await waitFor(() => {
      expect(mockGetPdsCommandCenter).toHaveBeenCalledWith(
        "env-1",
        expect.objectContaining({ lens: "account", horizon: "YTD", role_preset: "account_director" }),
      );
    });

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        expect.stringContaining("selected_account=acct-watch"),
        { scroll: false },
      );
    });

    rerender(<PdsAccountsCommandCenter />);

    await waitFor(() => {
      expect(mockGetPdsAccountPreview).toHaveBeenCalledWith(
        "env-1",
        "acct-watch",
        expect.objectContaining({ business_id: "biz-1", horizon: "YTD" }),
      );
    });

    expect(within(screen.getByTestId("pds-account-preview-desktop")).getByText("Watch Account")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();

    await user.click(within(screen.getByTestId("pds-account-action-required")).getByRole("button", { name: /Risk Account/i }));
    rerender(<PdsAccountsCommandCenter />);

    await waitFor(() => {
      expect(mockGetPdsAccountPreview).toHaveBeenCalledWith(
        "env-1",
        "acct-risk",
        expect.objectContaining({ business_id: "biz-1", horizon: "YTD" }),
      );
    });

    const preview = within(screen.getByTestId("pds-account-preview-desktop"));
    expect(preview.getByText("Risk Account")).toBeInTheDocument();
    expect(preview.getByText("Escalate recovery plan")).toBeInTheDocument();
    expect(preview.getByText("North Campus Upgrade")).toBeInTheDocument();
  });

  it("keeps the ranking, tables, and preview aligned when a filter removes the selected account", async () => {
    currentSearchParams = new URLSearchParams("alert=at_risk&selected_account=acct-healthy");
    const { rerender } = render(<PdsAccountsCommandCenter />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        expect.stringContaining("selected_account=acct-risk"),
        { scroll: false },
      );
    });

    rerender(<PdsAccountsCommandCenter />);

    await waitFor(() => {
      expect(mockGetPdsAccountPreview).toHaveBeenCalledWith(
        "env-1",
        "acct-risk",
        expect.objectContaining({ business_id: "biz-1", horizon: "YTD" }),
      );
    });

    expect(within(screen.getByTestId("pds-account-health-overview")).queryByText("Healthy Account")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("pds-account-health-overview")).getByText("Risk Account")).toBeInTheDocument();
    expect(within(screen.getByTestId("pds-top-performing-accounts")).queryByText("Healthy Account")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("pds-account-preview-desktop")).getByText("Risk Account")).toBeInTheDocument();
  });
});
