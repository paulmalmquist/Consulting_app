import type { PdsV2AccountActionItem, PdsV2AccountDashboardRow } from "@/lib/bos-api";
import {
  buildAccountsQueryString,
  defaultSelectedAccountId,
  filterAccounts,
  sortAccounts,
} from "@/components/pds-enterprise/pdsAccounts";

const accounts: PdsV2AccountDashboardRow[] = [
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
    team_utilization_pct: 93,
    overloaded_resources: 1,
    staffing_gap_resources: 1,
    timecard_compliance_pct: 88,
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
];

const actions: PdsV2AccountActionItem[] = [
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
];

describe("pdsAccounts helpers", () => {
  it("filters accounts by alert and health band", () => {
    expect(filterAccounts(accounts, { alert: "at_risk" }).map((row) => row.account_id)).toEqual(["acct-risk"]);
    expect(
      filterAccounts(accounts, { alert: "staffing_issues", healthBand: "watch" }).map((row) => row.account_id),
    ).toEqual(["acct-watch"]);
    expect(filterAccounts(accounts, { alert: "missing_plan" }).map((row) => row.account_id)).toEqual([
      "acct-watch",
      "acct-risk",
    ]);
  });

  it("prefers the highest-priority visible action item for default selection", () => {
    expect(defaultSelectedAccountId(accounts, actions)).toBe("acct-watch");

    const atRiskOnly = filterAccounts(accounts, { alert: "at_risk" });
    expect(defaultSelectedAccountId(atRiskOnly, actions)).toBe("acct-risk");
  });

  it("preserves existing filter context when updating URL state", () => {
    const next = new URLSearchParams(
      buildAccountsQueryString("alert=at_risk&health_band=watch&sort=health", {
        selected_account: "acct-risk",
      }),
    );

    expect(next.get("alert")).toBe("at_risk");
    expect(next.get("health_band")).toBe("watch");
    expect(next.get("sort")).toBe("health");
    expect(next.get("selected_account")).toBe("acct-risk");
  });

  it("sorts revenue in descending order without producing unstable NaN behavior", () => {
    expect(sortAccounts(accounts, "revenue", actions).map((row) => row.account_id)).toEqual([
      "acct-healthy",
      "acct-watch",
      "acct-risk",
    ]);
  });
});
