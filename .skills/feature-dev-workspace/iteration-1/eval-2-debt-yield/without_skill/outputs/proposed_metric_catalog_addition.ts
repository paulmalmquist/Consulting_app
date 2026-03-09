/**
 * PROPOSED METRIC CATALOG ADDITION
 *
 * NOTE: DEBT_YIELD is already present in metric-catalog.ts at line 54.
 * This file documents its definition for reference.
 * NO CHANGES ARE NEEDED to the metric catalog itself.
 */

// ---- EXISTING DEFINITION (already in metric-catalog.ts, CF_METRICS array) ----

// { key: "DEBT_YIELD", label: "Debt Yield", description: "NOI / UPB", format: "percent", statement: "CF", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Metrics" }

/**
 * INTERPRETATION:
 * - "NOI / UPB" means NOI divided by Unpaid Balance (total outstanding debt)
 * - Also known as "Debt Yield" in real estate finance: the yield the debt generates
 * - Expressed as a percentage (format: "percent")
 * - Available at asset and investment entity levels
 * - Higher is better (polarity: "up_good") — better debt yield indicates stronger coverage
 * - Grouped with other Metrics (Metrics group)
 * - Statement: CF (part of cash flow analysis)
 *
 * COMPOSABILITY:
 * - Can be added to any widget that accepts metric arrays (metrics_strip, trend_line, etc.)
 * - Validator already knows DEBT_YIELD via METRIC_MAP
 * - No special handling needed in composeDashboard()
 */

// NO CHANGES REQUIRED — metric already has all necessary properties for dashboard generation
