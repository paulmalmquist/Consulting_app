/**
 * PROPOSED: Metric Catalog Update for Debt Yield
 *
 * FINDING: The DEBT_YIELD metric already exists in metric-catalog.ts (line 54)
 *
 * CURRENT STATE:
 * { key: "DEBT_YIELD", label: "Debt Yield", description: "NOI / UPB", format: "percent", statement: "CF", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Metrics" }
 *
 * PROPOSED CHANGE: Clarify the description from "NOI / UPB" to "NOI / Total Debt"
 *
 * REASON: UPB (Unpaid Balance) IS total debt, but the task specifically asks for
 * "NOI divided by total debt". Clarifying the description makes it more discoverable
 * and understandable to users.
 *
 * UPDATED DEFINITION:
 * { key: "DEBT_YIELD", label: "Debt Yield", description: "NOI divided by total debt", format: "percent", statement: "CF", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Metrics" },
 *
 * FILE: repo-b/src/lib/dashboards/metric-catalog.ts (line 54)
 *
 * NO SCHEMA CHANGE REQUIRED - This is a catalog definition only.
 */

// The metric definition with improved description:
export const DEBT_YIELD_DEFINITION = {
  key: "DEBT_YIELD",
  label: "Debt Yield",
  description: "NOI divided by total debt",
  format: "percent",
  statement: "CF" as const,
  entity_levels: ["asset", "investment"] as const[],
  polarity: "up_good" as const,
  group: "Metrics",
};
