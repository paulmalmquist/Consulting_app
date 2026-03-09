/**
 * PROPOSED CHANGES to: /repo-b/src/app/api/re/v2/dashboards/generate/route.ts
 *
 * Location: In the detectMetrics() function, within the keywordMap object (around line 127-152)
 *
 * CHANGE TYPE: Addition (no removals or modifications to existing entries)
 */

// ---- LOCATION: detectMetrics() function, keywordMap object ----

// EXISTING CODE (lines 127-152):
const keywordMap: Record<string, string[]> = {
  noi: ["NOI"],
  "net operating": ["NOI"],
  revenue: ["RENT", "OTHER_INCOME", "EGI"],
  rent: ["RENT"],
  income: ["EGI"],
  opex: ["TOTAL_OPEX"],
  expense: ["TOTAL_OPEX"],
  occupancy: ["OCCUPANCY"],
  dscr: ["DSCR_KPI"],
  "debt service": ["TOTAL_DEBT_SERVICE", "DSCR_KPI"],
  "debt maturity": ["TOTAL_DEBT_SERVICE"],
  ltv: ["LTV"],
  "loan to value": ["LTV"],
  "cap rate": ["ASSET_VALUE", "NOI"],
  "cash flow": ["NET_CASH_FLOW"],
  capex: ["CAPEX"],
  margin: ["NOI_MARGIN_KPI"],
  value: ["ASSET_VALUE"],
  equity: ["EQUITY_VALUE"],
  irr: ["GROSS_IRR", "NET_IRR"],
  tvpi: ["GROSS_TVPI", "NET_TVPI"],
  dpi: ["DPI"],
  nav: ["PORTFOLIO_NAV"],
  "unit economics": ["AVG_RENT", "NOI_PER_UNIT"],

  // ---- ADD THESE TWO LINES ----
  "debt yield": ["DEBT_YIELD"],
  "dy": ["DEBT_YIELD"],
  // ---- END ADDITIONS ----
};

/**
 * RATIONALE FOR THESE ADDITIONS:
 *
 * 1. "debt yield" → ["DEBT_YIELD"]
 *    - Matches user prompts containing the full phrase "debt yield"
 *    - Example: "build a dashboard with debt yield metrics"
 *    - This is the primary keyword users will search for
 *
 * 2. "dy" → ["DEBT_YIELD"]
 *    - Matches the common abbreviation used in real estate finance
 *    - Example: "show me the dy for this asset"
 *    - Follows convention of other short keywords like "ltv", "irr", "dpi"
 *
 * FILTERING:
 * - After keyword detection, detectMetrics() filters results through entity_levels
 * - DEBT_YIELD supports ["asset", "investment"] entity levels
 * - Fund-level requests will not include DEBT_YIELD (by design, fund entities have fund-level metrics)
 * - This filtering happens at line 163-167 (existing code, no change needed)
 *
 * COMPOSABILITY:
 * - No changes needed to composeDashboard() function
 * - The function already handles metric composition generically
 * - DEBT_YIELD is formatted as "percent" in the metric catalog
 * - Widgets will render it appropriately based on its format property
 *
 * VALIDATION:
 * - No changes needed to spec-validator.ts
 * - DEBT_YIELD is already in METRIC_MAP (derived from METRIC_CATALOG)
 * - Validator will approve any dashboard spec containing DEBT_YIELD
 */
