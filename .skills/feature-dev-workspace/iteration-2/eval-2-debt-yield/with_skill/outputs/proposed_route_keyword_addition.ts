/**
 * PROPOSED: Keyword Mapping Update for Dashboard Generation
 *
 * FILE: repo-b/src/app/api/re/v2/dashboards/generate/route.ts
 * FUNCTION: detectMetrics() - lines 123-177
 * CHANGE: Add keyword mappings for "debt yield" and "dy"
 *
 * CURRENT STATE (lines 127-152):
 * The keywordMap object maps user prompt keywords to metric keys.
 * DEBT_YIELD is NOT currently mapped.
 *
 * PROPOSED ADDITION to keywordMap:
 * Add these two lines after line 137 (after "debt service"):
 *
 *     "debt yield": ["DEBT_YIELD"],
 *     dy: ["DEBT_YIELD"],
 *
 * RATIONALE:
 * - Users may naturally type "debt yield" as two words
 * - Users may abbreviate as "dy" (common shorthand in real estate)
 * - Both keywords should map to the DEBT_YIELD metric
 * - DEBT_YIELD is already approved in the catalog for asset and investment levels
 */

// Complete updated keywordMap with debt yield additions:
export const updatedKeywordMap = {
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
  "debt yield": ["DEBT_YIELD"],  // NEW: Maps two-word phrase
  dy: ["DEBT_YIELD"],             // NEW: Maps abbreviation
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
};

/**
 * LOCATION IN CODE:
 * Replace the existing keywordMap at lines 127-152 in detectMetrics()
 * with the above updatedKeywordMap containing the two new entries.
 *
 * IMPACT:
 * - Prompts like "Show me debt yield" will now detect and include DEBT_YIELD
 * - Prompts like "What's the dy?" will now detect and include DEBT_YIELD
 * - No database changes needed
 * - No schema migrations needed
 * - Fully backward compatible
 */
