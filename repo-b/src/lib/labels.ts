/**
 * Mapping utilities for human-readable labels from database enum values.
 * Use these to display raw database values in a user-friendly way.
 */

export const RUN_TYPE_LABELS: Record<string, string> = {
  QUARTER_CLOSE: "Quarter Close",
  WATERFALL_SHADOW: "Waterfall Shadow",
  WATERFALL_SCENARIO: "Waterfall Scenario",
  COVENANT_TEST: "Covenant Test",
};

export const WATERFALL_TIER_LABELS: Record<string, string> = {
  return_of_capital: "Return of Capital",
  preferred_return: "Preferred Return",
  catch_up: "Catch-Up",
  carried_interest: "Carried Interest",
  tier_1_return_of_capital: "Return of Capital (Tier 1)",
  tier_2_preferred_return: "Preferred Return (Tier 2)",
  tier_3_catch_up: "Catch-Up (Tier 3)",
  tier_4_carried_interest: "Carried Interest (Tier 4)",
};

export const FEE_TYPE_LABELS: Record<string, string> = {
  MGMT_FEE_PROP: "Property Management Fee",
  MGMT_FEE_ASSET: "Asset Management Fee",
  ACQUISITION_FEE: "Acquisition Fee",
  EXIT_FEE: "Exit Fee",
  DISPOSITION_FEE: "Disposition Fee",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  archived: "Archived",
  pending: "Pending",
  active: "Active",
  inactive: "Inactive",
};

export const PAYOUT_TYPE_LABELS: Record<string, string> = {
  return_of_capital: "Return of Capital",
  preferred_return: "Preferred Return",
  catch_up: "Catch-Up",
  carried_interest: "Carried Interest",
  management_fee: "Management Fee",
  fund_expense: "Fund Expense",
};

export const SCENARIO_TYPE_LABELS: Record<string, string> = {
  base: "Base Case",
  sale: "Sale Scenario",
  refinance: "Refinance Scenario",
  stress: "Stress Test",
};

/**
 * Helper function to get a label from a mapping, with fallback to humanized enum value.
 * @param map The label mapping record
 * @param key The database value/enum key
 * @returns Human-readable label
 */
export function label(map: Record<string, string>, key: string): string {
  if (!key) return "";
  const mapped = map[key];
  if (mapped) return mapped;
  // Fallback: convert snake_case to Title Case
  return key
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
