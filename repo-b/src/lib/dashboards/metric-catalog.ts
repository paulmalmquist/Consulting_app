/**
 * Metric Catalog — the approved set of metrics that dashboards can reference.
 *
 * Mirrors the canonical definitions in acct_statement_line_def (324 schema)
 * plus fund-level metrics from re_fund_metrics_qtr.
 * AI generation must only select from this catalog.
 */

import type { ChartFormat } from "./types";

export interface MetricDefinition {
  key: string;
  label: string;
  description: string;
  format: ChartFormat;
  statement?: "IS" | "CF" | "BS" | "KPI";
  entity_levels: Array<"asset" | "investment" | "fund" | "portfolio">;
  polarity: "up_good" | "down_good" | "neutral";
  group: string;
  default_color?: string;
}

/* --------------------------------------------------------------------------
 * Income Statement metrics
 * -------------------------------------------------------------------------- */
const IS_METRICS: MetricDefinition[] = [
  { key: "RENT", label: "Rental Revenue", description: "Gross rental income", format: "dollar", statement: "IS", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Revenue" },
  { key: "OTHER_INCOME", label: "Other Income", description: "Ancillary and fee income", format: "dollar", statement: "IS", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Revenue" },
  { key: "EGI", label: "Effective Gross Income", description: "Total revenue after vacancy", format: "dollar", statement: "IS", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Revenue" },
  { key: "PAYROLL", label: "Payroll & Benefits", description: "Staff compensation", format: "dollar", statement: "IS", entity_levels: ["asset", "investment"], polarity: "down_good", group: "Operating Expenses" },
  { key: "REPAIRS_MAINT", label: "Repairs & Maintenance", description: "Property maintenance costs", format: "dollar", statement: "IS", entity_levels: ["asset", "investment"], polarity: "down_good", group: "Operating Expenses" },
  { key: "UTILITIES", label: "Utilities", description: "Electric, gas, water", format: "dollar", statement: "IS", entity_levels: ["asset", "investment"], polarity: "down_good", group: "Operating Expenses" },
  { key: "TAXES", label: "Real Estate Taxes", description: "Property tax expense", format: "dollar", statement: "IS", entity_levels: ["asset", "investment"], polarity: "down_good", group: "Operating Expenses" },
  { key: "INSURANCE", label: "Insurance", description: "Property insurance", format: "dollar", statement: "IS", entity_levels: ["asset", "investment"], polarity: "down_good", group: "Operating Expenses" },
  { key: "MGMT_FEES", label: "Management Fees", description: "Property management fees", format: "dollar", statement: "IS", entity_levels: ["asset", "investment"], polarity: "down_good", group: "Operating Expenses" },
  { key: "TOTAL_OPEX", label: "Total Operating Expenses", description: "Sum of all operating expenses", format: "dollar", statement: "IS", entity_levels: ["asset", "investment"], polarity: "down_good", group: "Operating Expenses" },
  { key: "NOI", label: "Net Operating Income", description: "EGI minus operating expenses", format: "dollar", statement: "IS", entity_levels: ["asset", "investment", "fund"], polarity: "up_good", group: "NOI", default_color: "#2EB67D" },
  { key: "NOI_MARGIN", label: "NOI Margin", description: "NOI as percentage of EGI", format: "percent", statement: "IS", entity_levels: ["asset", "investment"], polarity: "up_good", group: "NOI" },
];

/* --------------------------------------------------------------------------
 * Cash Flow metrics
 * -------------------------------------------------------------------------- */
const CF_METRICS: MetricDefinition[] = [
  { key: "CAPEX", label: "Capital Expenditures", description: "Property improvements", format: "dollar", statement: "CF", entity_levels: ["asset", "investment"], polarity: "neutral", group: "Below the Line" },
  { key: "TENANT_IMPROVEMENTS", label: "Tenant Improvements", description: "TI spend", format: "dollar", statement: "CF", entity_levels: ["asset", "investment"], polarity: "neutral", group: "Below the Line" },
  { key: "LEASING_COMMISSIONS", label: "Leasing Commissions", description: "Broker commissions", format: "dollar", statement: "CF", entity_levels: ["asset", "investment"], polarity: "neutral", group: "Below the Line" },
  { key: "REPLACEMENT_RESERVES", label: "Replacement Reserves", description: "Capital reserve accrual", format: "dollar", statement: "CF", entity_levels: ["asset", "investment"], polarity: "neutral", group: "Below the Line" },
  { key: "DEBT_SERVICE_INT", label: "Interest Expense", description: "Loan interest", format: "dollar", statement: "CF", entity_levels: ["asset", "investment"], polarity: "down_good", group: "Debt Service" },
  { key: "DEBT_SERVICE_PRIN", label: "Principal Amortization", description: "Loan paydown", format: "dollar", statement: "CF", entity_levels: ["asset", "investment"], polarity: "neutral", group: "Debt Service" },
  { key: "TOTAL_DEBT_SERVICE", label: "Total Debt Service", description: "Interest + principal", format: "dollar", statement: "CF", entity_levels: ["asset", "investment"], polarity: "down_good", group: "Debt Service" },
  { key: "NET_CASH_FLOW", label: "Net Cash Flow", description: "NOI minus all below-NOI items", format: "dollar", statement: "CF", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Net", default_color: "#2563EB" },
  { key: "DSCR", label: "Debt Service Coverage", description: "NOI / Total Debt Service", format: "ratio", statement: "CF", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Metrics" },
  { key: "DEBT_YIELD", label: "Debt Yield", description: "NOI / UPB", format: "percent", statement: "CF", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Metrics" },
];

/* --------------------------------------------------------------------------
 * KPI metrics
 * -------------------------------------------------------------------------- */
const KPI_METRICS: MetricDefinition[] = [
  { key: "OCCUPANCY", label: "Occupancy", description: "Physical occupancy rate", format: "percent", statement: "KPI", entity_levels: ["asset", "investment", "fund"], polarity: "up_good", group: "Operations" },
  { key: "AVG_RENT", label: "Avg Rent / Unit", description: "Average monthly rent per unit", format: "dollar", statement: "KPI", entity_levels: ["asset"], polarity: "up_good", group: "Operations" },
  { key: "NOI_PER_UNIT", label: "NOI / Unit", description: "NOI per physical unit", format: "dollar", statement: "KPI", entity_levels: ["asset"], polarity: "up_good", group: "Operations" },
  { key: "NOI_MARGIN_KPI", label: "NOI Margin", description: "Operating margin", format: "percent", statement: "KPI", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Performance" },
  { key: "DSCR_KPI", label: "DSCR", description: "Debt service coverage ratio", format: "ratio", statement: "KPI", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Performance" },
  { key: "LTV", label: "Loan-to-Value", description: "Debt / asset value", format: "percent", statement: "KPI", entity_levels: ["asset", "investment"], polarity: "down_good", group: "Leverage" },
  { key: "ASSET_VALUE", label: "Asset Value", description: "Current appraised or modeled value", format: "dollar", statement: "KPI", entity_levels: ["asset", "investment", "fund"], polarity: "up_good", group: "Valuation" },
  { key: "EQUITY_VALUE", label: "Equity Value", description: "Value minus debt", format: "dollar", statement: "KPI", entity_levels: ["asset", "investment", "fund"], polarity: "up_good", group: "Valuation" },
];

/* --------------------------------------------------------------------------
 * Fund-level metrics (from re_fund_metrics_qtr, not statement lines)
 * -------------------------------------------------------------------------- */
const FUND_METRICS: MetricDefinition[] = [
  { key: "GROSS_IRR", label: "Gross IRR", description: "Fund gross internal rate of return", format: "percent", entity_levels: ["fund"], polarity: "up_good", group: "Returns" },
  { key: "NET_IRR", label: "Net IRR", description: "Fund net IRR after fees", format: "percent", entity_levels: ["fund"], polarity: "up_good", group: "Returns" },
  { key: "GROSS_TVPI", label: "Gross TVPI", description: "Total value to paid-in capital", format: "ratio", entity_levels: ["fund"], polarity: "up_good", group: "Returns" },
  { key: "NET_TVPI", label: "Net TVPI", description: "Net TVPI after fees", format: "ratio", entity_levels: ["fund"], polarity: "up_good", group: "Returns" },
  { key: "DPI", label: "DPI", description: "Distributions to paid-in", format: "ratio", entity_levels: ["fund"], polarity: "up_good", group: "Returns" },
  { key: "RVPI", label: "RVPI", description: "Residual value to paid-in", format: "ratio", entity_levels: ["fund"], polarity: "up_good", group: "Returns" },
  { key: "PORTFOLIO_NAV", label: "Portfolio NAV", description: "Net asset value", format: "dollar", entity_levels: ["fund"], polarity: "up_good", group: "Valuation" },
  { key: "WEIGHTED_LTV", label: "Weighted LTV", description: "Portfolio weighted loan-to-value", format: "percent", entity_levels: ["fund"], polarity: "down_good", group: "Leverage" },
  { key: "WEIGHTED_DSCR", label: "Weighted DSCR", description: "Portfolio weighted DSCR", format: "ratio", entity_levels: ["fund"], polarity: "up_good", group: "Coverage" },
];

/* --------------------------------------------------------------------------
 * Full catalog
 * -------------------------------------------------------------------------- */
export const METRIC_CATALOG: MetricDefinition[] = [
  ...IS_METRICS,
  ...CF_METRICS,
  ...KPI_METRICS,
  ...FUND_METRICS,
];

/** Lookup by key */
export const METRIC_MAP = new Map(METRIC_CATALOG.map((m) => [m.key, m]));

/** Get metrics available for an entity level */
export function getMetricsForEntity(
  entityLevel: "asset" | "investment" | "fund" | "portfolio",
): MetricDefinition[] {
  return METRIC_CATALOG.filter((m) => m.entity_levels.includes(entityLevel));
}

/** Get all unique groups */
export function getMetricGroups(): string[] {
  return [...new Set(METRIC_CATALOG.map((m) => m.group))];
}

/** Validate that a set of metric keys are all approved */
export function validateMetricKeys(keys: string[]): { valid: boolean; invalid: string[] } {
  const invalid = keys.filter((k) => !METRIC_MAP.has(k));
  return { valid: invalid.length === 0, invalid };
}
