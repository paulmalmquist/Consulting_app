export type ReportingLens =
  | "financial_reporting"
  | "operational_reporting"
  | "impact_reporting";

export type NCFExecutiveKpi = {
  key: string;
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
  trendNote: string;
  lens: ReportingLens;
  represents: string;
  sourcePath: string;
  sourceQueryHash: string;
  owner: string;
  lastRefreshed: string;
  scope: string;
  lineageNotes: string[];
};

export const ncfExecutiveKpis: NCFExecutiveKpi[] = [
  {
    key: "contributions_ytd",
    label: "Contributions YTD",
    value: "$1.42B",
    trend: "up",
    trendNote: "+6.8% vs prior YTD",
    lens: "financial_reporting",
    represents:
      "Cash + liquidated non-cash contributions received through the donor-advised fund structure, measured on the audited financial-reporting calendar.",
    sourcePath: "ncf_contribution WHERE status IN ('received','liquidated') AND reporting_lens = 'financial_reporting'",
    sourceQueryHash: "sha256:9f3e...c41a",
    owner: "Finance \u00b7 Consolidated Reporting",
    lastRefreshed: "placeholder",
    scope: "All offices \u00b7 YTD through current reporting close",
    lineageNotes: [
      "Complex gifts counted at realized charitable value, not at intake.",
      "Excludes recommended-only activity that has not converted.",
    ],
  },
  {
    key: "grants_recommended",
    label: "Grants Recommended",
    value: "24,318",
    trend: "up",
    trendNote: "+11% vs prior quarter",
    lens: "operational_reporting",
    represents:
      "Giver-initiated grant recommendations logged in the current period, regardless of qualification or approval status.",
    sourcePath: "ncf_grant WHERE stage = 'recommended' AND reporting_lens = 'operational_reporting'",
    sourceQueryHash: "sha256:4a21...88d7",
    owner: "Stewardship \u00b7 Operations",
    lastRefreshed: "placeholder",
    scope: "All offices \u00b7 quarter-to-date",
    lineageNotes: [
      "Includes recommendations still pending qualification review.",
      "Not reconciled to paid grants; see Grants Paid for realized movement.",
    ],
  },
  {
    key: "grants_paid",
    label: "Grants Paid",
    value: "$842M",
    trend: "flat",
    trendNote: "-0.4% vs prior quarter",
    lens: "financial_reporting",
    represents:
      "Grants distributed to qualified charities during the current period, measured on the audited financial-reporting calendar.",
    sourcePath: "ncf_grant WHERE stage = 'paid' AND reporting_lens = 'financial_reporting'",
    sourceQueryHash: "sha256:ba05...e230",
    owner: "Finance \u00b7 Consolidated Reporting",
    lastRefreshed: "placeholder",
    scope: "All offices \u00b7 quarter-to-date",
    lineageNotes: [
      "Does not include recommendations still in qualification or approval.",
      "Backlog drift between recommended and paid is surfaced in Data Health.",
    ],
  },
  {
    key: "assets_under_care",
    label: "Assets Under Care",
    value: "$18.7B",
    trend: "up",
    trendNote: "+3.1% QoQ",
    lens: "financial_reporting",
    represents:
      "Donor-advised fund balances plus complex assets held for future liquidation, measured at period close.",
    sourcePath: "ncf_fund.balance AS-OF period_end WHERE reporting_lens = 'financial_reporting'",
    sourceQueryHash: "sha256:1d77...4f09",
    owner: "Finance \u00b7 Asset Oversight",
    lastRefreshed: "placeholder",
    scope: "All offices \u00b7 as of last quarter-end",
    lineageNotes: [
      "Complex non-liquid assets held at most recent qualified valuation.",
      "Excludes grants that have been approved but not yet paid.",
    ],
  },
  {
    key: "active_offices",
    label: "Active Offices",
    value: "32",
    trend: "flat",
    trendNote: "No change in period",
    lens: "impact_reporting",
    represents:
      "Local offices with giver activity, grant movement, or stewardship engagement logged in the current reporting period.",
    sourcePath: "ncf_office WHERE activity_flag = true",
    sourceQueryHash: "sha256:73c8...a612",
    owner: "Stewardship \u00b7 Network",
    lastRefreshed: "placeholder",
    scope: "National network \u00b7 current reporting period",
    lineageNotes: [
      "Office is \u2018active\u2019 when any giver, grant, or asset record touched it in-period.",
      "Does not weight offices by scale; see Office Performance Rollup.",
    ],
  },
  {
    key: "grants_at_friction_risk",
    label: "Grants at Watch or Higher",
    value: "184",
    trend: "down",
    trendNote: "-8% vs prior 7 days",
    lens: "operational_reporting",
    represents:
      "Open grants predicted by the ncf_grant_friction model to be at elevated risk of manual exception, extra review cycles, or SLA miss before distribution. A queue-ordering signal, not a decision gate.",
    sourcePath: "ncf_grant_friction_prediction WHERE risk_band IN ('watch','high') AND null_reason IS NULL",
    sourceQueryHash: "sha256:0bc4...9a12",
    owner: "Stewardship \u00b7 Operations (model governance: Data & AI)",
    lastRefreshed: "placeholder (nightly sync from Databricks)",
    scope: "All offices \u00b7 open grants only",
    lineageNotes: [
      "Produced by the ncf_grant_friction MLflow model (Databricks: novendor_1.ncf_ml.gold_grant_friction_preds).",
      "Calibrated probabilities (isotonic). Bands: high \u2265 chosen threshold, watch \u2265 0.6\u00d7 threshold, else low.",
      "SHAP-derived top drivers accompany every prediction; click a grant to see them.",
      "Fail-closed: a grant with no prediction yet renders \u2018Not available in current context\u2019, never a fabricated score.",
    ],
  },
];
