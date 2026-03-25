/**
 * Deterministic mock data generators for asset cockpit panels.
 * Accept real data where available and augment with realistic placeholders.
 * Replace with real API calls as backend endpoints become available.
 */

import type {
  ReV2AssetDetail,
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
} from "@/lib/bos-api";

/* ------------------------------------------------------------------ */
/*  Tenant Profile                                                     */
/* ------------------------------------------------------------------ */

export interface MockTenant {
  name: string;
  gla_pct: number;
  lease_end: string;
}

export interface MockTenantProfile {
  tenants: MockTenant[];
  walt: number;
}

const OFFICE_TENANTS: MockTenant[] = [
  { name: "Amazon", gla_pct: 22, lease_end: "2031" },
  { name: "Microsoft", gla_pct: 14, lease_end: "2030" },
  { name: "Salesforce", gla_pct: 11, lease_end: "2029" },
  { name: "Deloitte", gla_pct: 8, lease_end: "2028" },
  { name: "Other", gla_pct: 45, lease_end: "—" },
];

const INDUSTRIAL_TENANTS: MockTenant[] = [
  { name: "FedEx Logistics", gla_pct: 35, lease_end: "2032" },
  { name: "Amazon Fulfillment", gla_pct: 28, lease_end: "2030" },
  { name: "XPO Logistics", gla_pct: 18, lease_end: "2029" },
  { name: "Other", gla_pct: 19, lease_end: "—" },
];

const MULTIFAMILY_TENANTS: MockTenant[] = [
  { name: "Market Rate", gla_pct: 72, lease_end: "Annual" },
  { name: "Affordable", gla_pct: 18, lease_end: "Annual" },
  { name: "Corporate Housing", gla_pct: 10, lease_end: "2027" },
];

const MOB_TENANTS: MockTenant[] = [
  { name: "HCA Healthcare", gla_pct: 30, lease_end: "2033" },
  { name: "Davita Kidney", gla_pct: 18, lease_end: "2031" },
  { name: "Fresenius Medical", gla_pct: 12, lease_end: "2029" },
  { name: "Other Practices", gla_pct: 40, lease_end: "—" },
];

export function getMockTenantProfile(detail: ReV2AssetDetail): MockTenantProfile {
  const pt = detail.property?.property_type ?? "office";
  let tenants: MockTenant[];
  let walt: number;
  switch (pt) {
    case "industrial":
      tenants = INDUSTRIAL_TENANTS;
      walt = 7.8;
      break;
    case "multifamily":
      tenants = MULTIFAMILY_TENANTS;
      walt = 1.2;
      break;
    case "mob":
    case "medical_office":
      tenants = MOB_TENANTS;
      walt = 8.4;
      break;
    default:
      tenants = OFFICE_TENANTS;
      walt = 6.3;
  }
  return { tenants, walt };
}

/* ------------------------------------------------------------------ */
/*  Lease Expiration Schedule                                          */
/* ------------------------------------------------------------------ */

export interface MockLeaseExpiration {
  year: string;
  pct_expiring: number;
}

export function getMockLeaseExpiration(): MockLeaseExpiration[] {
  const baseYear = new Date().getFullYear();
  return [
    { year: String(baseYear), pct_expiring: 4 },
    { year: String(baseYear + 1), pct_expiring: 8 },
    { year: String(baseYear + 2), pct_expiring: 12 },
    { year: String(baseYear + 3), pct_expiring: 24 },
    { year: `${baseYear + 4}+`, pct_expiring: 52 },
  ];
}

/* ------------------------------------------------------------------ */
/*  Rent Economics                                                     */
/* ------------------------------------------------------------------ */

export interface MockRentEconomics {
  avg_rent_psf: number;
  market_rent_psf: number;
  mark_to_market_pct: number;
}

export function getMockRentEconomics(detail: ReV2AssetDetail): MockRentEconomics {
  const pt = detail.property?.property_type ?? "office";
  switch (pt) {
    case "industrial":
      return { avg_rent_psf: 8.50, market_rent_psf: 9.75, mark_to_market_pct: 14.7 };
    case "multifamily":
      return { avg_rent_psf: 24.80, market_rent_psf: 26.40, mark_to_market_pct: 6.5 };
    case "mob":
    case "medical_office":
      return { avg_rent_psf: 28.50, market_rent_psf: 31.00, mark_to_market_pct: 8.8 };
    default:
      return { avg_rent_psf: 34.20, market_rent_psf: 38.10, mark_to_market_pct: 11.4 };
  }
}

/* ------------------------------------------------------------------ */
/*  Market Context                                                     */
/* ------------------------------------------------------------------ */

export interface MockMarketContext {
  market_vacancy: number;
  submarket_vacancy: number;
  rent_growth: number;
}

export function getMockMarketContext(): MockMarketContext {
  return {
    market_vacancy: 11.2,
    submarket_vacancy: 9.4,
    rent_growth: 3.1,
  };
}

/* ------------------------------------------------------------------ */
/*  Capital Expenditures                                               */
/* ------------------------------------------------------------------ */

export interface MockCapExProject {
  name: string;
  budget: number;
  spent: number;
  status: "completed" | "in_progress" | "planned";
  completion_pct: number;
}

export function getMockCapExProjects(): MockCapExProject[] {
  return [
    { name: "Lobby Renovation", budget: 3_200_000, spent: 3_200_000, status: "completed", completion_pct: 100 },
    { name: "HVAC Modernization", budget: 1_100_000, spent: 660_000, status: "in_progress", completion_pct: 60 },
    { name: "Roof Replacement", budget: 850_000, spent: 0, status: "planned", completion_pct: 0 },
    { name: "Elevator Upgrade", budget: 1_400_000, spent: 280_000, status: "in_progress", completion_pct: 20 },
  ];
}

/* ------------------------------------------------------------------ */
/*  Value Drivers                                                      */
/* ------------------------------------------------------------------ */

export interface MockValueDrivers {
  noi_growth: number;
  cap_rate_change: number;
  capex_impact: number;
  total: number;
}

export function getMockValueDrivers(
  financialState: ReV2AssetQuarterState | null,
  periods: ReV2AssetPeriod[],
): MockValueDrivers {
  // Derive NOI growth from real data when available
  let noiGrowth = 3.2;
  if (periods.length >= 2) {
    const current = Number(periods[periods.length - 1]?.noi ?? 0);
    const prior = Number(periods[periods.length - 2]?.noi ?? 0);
    if (prior > 0 && current > 0) {
      noiGrowth = ((current - prior) / prior) * 100;
    }
  }

  const capRateChange = -1.8;
  const capexImpact = 2.1;
  return {
    noi_growth: Number(noiGrowth.toFixed(1)),
    cap_rate_change: capRateChange,
    capex_impact: capexImpact,
    total: Number((noiGrowth + capRateChange + capexImpact).toFixed(1)),
  };
}

/* ------------------------------------------------------------------ */
/*  Investment Thesis                                                  */
/* ------------------------------------------------------------------ */

export interface MockInvestmentThesis {
  thesis: string;
  key_drivers: string[];
}

export function getMockInvestmentThesis(): MockInvestmentThesis {
  return {
    thesis:
      "Acquire under-leased CBD office asset with strong tenant demand fundamentals. Execute capital improvement program to reposition common areas and amenities, driving occupancy from 84% to 95% over 24 months. Target disposition in Year 5 at stabilized cap rate.",
    key_drivers: [
      "Below-market rents with 11% mark-to-market upside",
      "Lobby and amenity renovation to attract Class A tenants",
      "Increase occupancy from 84% to 95%",
      "Favorable submarket vacancy trends",
      "Disposition at stabilized value in Year 5",
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Risk Indicators                                                    */
/* ------------------------------------------------------------------ */

export type RiskSeverity = "high" | "medium" | "low";

export interface MockRiskIndicator {
  label: string;
  severity: RiskSeverity;
  description: string;
}

export function getMockRiskIndicators(
  financialState: ReV2AssetQuarterState | null,
): MockRiskIndicator[] {
  const risks: MockRiskIndicator[] = [];

  // Derive real signals
  if (financialState?.dscr && Number(financialState.dscr) < 1.25) {
    risks.push({
      label: "DSCR Watch",
      severity: Number(financialState.dscr) < 1.0 ? "high" : "medium",
      description: `DSCR at ${Number(financialState.dscr).toFixed(2)}x is below 1.25x covenant threshold`,
    });
  }
  if (financialState?.ltv && Number(financialState.ltv) > 0.70) {
    risks.push({
      label: "Leverage Elevated",
      severity: Number(financialState.ltv) > 0.80 ? "high" : "medium",
      description: `LTV at ${(Number(financialState.ltv) * 100).toFixed(1)}% exceeds 70% target`,
    });
  }
  if (financialState?.occupancy && Number(financialState.occupancy) < 0.90) {
    risks.push({
      label: "Occupancy Below Target",
      severity: Number(financialState.occupancy) < 0.80 ? "high" : "medium",
      description: `Occupancy at ${(Number(financialState.occupancy) * 100).toFixed(1)}% is below 90% stabilized target`,
    });
  }

  // Supplement with mock data for items without real signals
  risks.push(
    {
      label: "Lease Rollover Concentration",
      severity: "medium",
      description: "24% of GLA expires in 2029 — concentration risk in single year",
    },
    {
      label: "Office Sector Headwinds",
      severity: "low",
      description: "CBD office fundamentals under pressure from hybrid work trends",
    },
    {
      label: "Refinance Risk",
      severity: "low",
      description: "Loan maturity in 2029 — monitor rate environment for refinance planning",
    },
  );

  return risks;
}

/* ------------------------------------------------------------------ */
/*  IC Review                                                          */
/* ------------------------------------------------------------------ */

export interface MockICReview {
  status: "approved" | "pending" | "conditional";
  date: string;
  notes: string;
  members: string[];
}

export function getMockICReview(): MockICReview {
  return {
    status: "approved",
    date: "2025-09-15",
    notes:
      "Committee approved acquisition at $42M with condition that lobby renovation begins within 90 days of closing. Annual hold review scheduled for Q3 2026.",
    members: [
      "M. Richardson (Chair)",
      "S. Nakamura",
      "D. Okonkwo",
      "L. Petrov",
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Loan Details                                                       */
/* ------------------------------------------------------------------ */

export interface MockLoanDetails {
  lender: string;
  rate: number;
  maturity: string;
  amortization: string;
  loan_type: string;
}

export function getMockLoanDetails(): MockLoanDetails {
  return {
    lender: "JPMorgan Chase",
    rate: 4.85,
    maturity: "2029-06-15",
    amortization: "30-year",
    loan_type: "Fixed Rate",
  };
}
