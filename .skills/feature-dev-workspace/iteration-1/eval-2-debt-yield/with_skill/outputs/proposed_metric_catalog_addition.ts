/**
 * Proposed addition to /repo-b/src/lib/dashboards/metric-catalog.ts
 *
 * STATUS: NO CHANGE REQUIRED — DEBT_YIELD ALREADY EXISTS
 *
 * The metric is already correctly defined in the CF_METRICS array at line 54:
 *
 *   { key: "DEBT_YIELD", label: "Debt Yield", description: "NOI / UPB", format: "percent", statement: "CF", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Metrics" },
 *
 * This file documents the existing definition for reference and confirms no addition is needed.
 */

import type { ChartFormat } from "./types";

/**
 * The DEBT_YIELD metric as it currently exists in CF_METRICS (line 54 of metric-catalog.ts)
 *
 * This metric is already in the catalog and ready for use:
 * - Key: "DEBT_YIELD" (unique identifier for widgets and validators)
 * - Label: "Debt Yield" (user-facing display name)
 * - Description: "NOI / UPB" (calculation: Net Operating Income divided by Unpaid Balance)
 * - Format: "percent" (displayed as percentage in dashboards)
 * - Statement: "CF" (Cash Flow statement context)
 * - Entity Levels: ["asset", "investment"] (available for asset and investment entity types)
 * - Polarity: "up_good" (higher values are better)
 * - Group: "Metrics" (grouped with DSCR_KPI in UI catalog)
 */

export const EXISTING_DEBT_YIELD_METRIC = {
  key: "DEBT_YIELD",
  label: "Debt Yield",
  description: "NOI / UPB",
  format: "percent" as ChartFormat,
  statement: "CF" as const,
  entity_levels: ["asset", "investment"] as const,
  polarity: "up_good" as const,
  group: "Metrics",
};

/**
 * Location in catalog:
 * - File: /repo-b/src/lib/dashboards/metric-catalog.ts
 * - Array: CF_METRICS (line 44, containing Cash Flow metrics)
 * - Position: Line 54
 * - Accessible via: METRIC_CATALOG (line 89) and METRIC_MAP (line 97)
 */

/**
 * Why no change to metric-catalog.ts is needed:
 *
 * 1. The metric is already correctly defined with all required fields
 * 2. The description "NOI / UPB" clearly identifies the calculation
 * 3. Entity levels are correct (asset and investment are the relevant scopes)
 * 4. Format is "percent" (debt yield is expressed as a percentage)
 * 5. Polarity is "up_good" (higher debt yield is desirable for lenders/investors)
 * 6. The metric is automatically exported via METRIC_CATALOG and METRIC_MAP
 * 7. The validator (spec-validator.ts) will recognize DEBT_YIELD through METRIC_MAP
 *
 * The problem is NOT in the catalog — it's in prompt detection (route.ts).
 */

/**
 * What IS needed:
 *
 * The route handler's detectMetrics() function must add keyword mappings so that
 * user prompts containing "debt yield" or "dy" trigger detection of DEBT_YIELD.
 *
 * See: proposed_route_keyword_addition.ts
 */
