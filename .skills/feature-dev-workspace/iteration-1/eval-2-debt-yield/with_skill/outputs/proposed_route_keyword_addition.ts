/**
 * Proposed changes to /repo-b/src/app/api/re/v2/dashboards/generate/route.ts
 *
 * This file shows the exact keyword map additions needed to enable debt yield detection.
 * Apply these changes to the detectMetrics() function (currently around line 123).
 */

/**
 * CURRENT STATE (lines 123-152):
 *
 * The detectMetrics() function contains a keywordMap that maps user prompt keywords
 * to metric keys. Currently, there are NO entries for "debt yield" or "dy":
 *
 * const keywordMap: Record<string, string[]> = {
 *   noi: ["NOI"],
 *   "net operating": ["NOI"],
 *   revenue: ["RENT", "OTHER_INCOME", "EGI"],
 *   rent: ["RENT"],
 *   income: ["EGI"],
 *   opex: ["TOTAL_OPEX"],
 *   expense: ["TOTAL_OPEX"],
 *   occupancy: ["OCCUPANCY"],
 *   dscr: ["DSCR_KPI"],
 *   "debt service": ["TOTAL_DEBT_SERVICE", "DSCR_KPI"],
 *   "debt maturity": ["TOTAL_DEBT_SERVICE"],
 *   ltv: ["LTV"],
 *   "loan to value": ["LTV"],
 *   "cap rate": ["ASSET_VALUE", "NOI"],
 *   "cash flow": ["NET_CASH_FLOW"],
 *   capex: ["CAPEX"],
 *   margin: ["NOI_MARGIN_KPI"],
 *   value: ["ASSET_VALUE"],
 *   equity: ["EQUITY_VALUE"],
 *   irr: ["GROSS_IRR", "NET_IRR"],
 *   tvpi: ["GROSS_TVPI", "NET_TVPI"],
 *   dpi: ["DPI"],
 *   nav: ["PORTFOLIO_NAV"],
 *   "unit economics": ["AVG_RENT", "NOI_PER_UNIT"],
 * };
 */

/**
 * PROPOSED ADDITION:
 *
 * Add these two lines to the keywordMap (alphabetical order, after "debt maturity" and before "dpi"):
 *
 *   "debt yield": ["DEBT_YIELD"],
 *   "dy": ["DEBT_YIELD"],
 *
 * These lines enable the detectMetrics() function to recognize both:
 * - Full phrase "debt yield" in prompts
 * - Short alias "dy" in prompts
 */

// ============================================================================
// EXACT DIFF TO APPLY
// ============================================================================

/**
 * In /repo-b/src/app/api/re/v2/dashboards/generate/route.ts,
 * within the detectMetrics() function, in the keywordMap definition:
 *
 * BEFORE:
 * ```
 * const keywordMap: Record<string, string[]> = {
 *   noi: ["NOI"],
 *   "net operating": ["NOI"],
 *   revenue: ["RENT", "OTHER_INCOME", "EGI"],
 *   rent: ["RENT"],
 *   income: ["EGI"],
 *   opex: ["TOTAL_OPEX"],
 *   expense: ["TOTAL_OPEX"],
 *   occupancy: ["OCCUPANCY"],
 *   dscr: ["DSCR_KPI"],
 *   "debt service": ["TOTAL_DEBT_SERVICE", "DSCR_KPI"],
 *   "debt maturity": ["TOTAL_DEBT_SERVICE"],
 *   ltv: ["LTV"],
 *   "loan to value": ["LTV"],
 *   "cap rate": ["ASSET_VALUE", "NOI"],
 *   "cash flow": ["NET_CASH_FLOW"],
 *   capex: ["CAPEX"],
 *   margin: ["NOI_MARGIN_KPI"],
 *   value: ["ASSET_VALUE"],
 *   equity: ["EQUITY_VALUE"],
 *   irr: ["GROSS_IRR", "NET_IRR"],
 *   tvpi: ["GROSS_TVPI", "NET_TVPI"],
 *   dpi: ["DPI"],
 *   nav: ["PORTFOLIO_NAV"],
 *   "unit economics": ["AVG_RENT", "NOI_PER_UNIT"],
 * };
 * ```
 *
 * AFTER:
 * ```
 * const keywordMap: Record<string, string[]> = {
 *   noi: ["NOI"],
 *   "net operating": ["NOI"],
 *   revenue: ["RENT", "OTHER_INCOME", "EGI"],
 *   rent: ["RENT"],
 *   income: ["EGI"],
 *   opex: ["TOTAL_OPEX"],
 *   expense: ["TOTAL_OPEX"],
 *   occupancy: ["OCCUPANCY"],
 *   dscr: ["DSCR_KPI"],
 *   "debt service": ["TOTAL_DEBT_SERVICE", "DSCR_KPI"],
 *   "debt maturity": ["TOTAL_DEBT_SERVICE"],
 *   "debt yield": ["DEBT_YIELD"],  // ← NEW LINE
 *   dpi: ["DPI"],
 *   "dy": ["DEBT_YIELD"],           // ← NEW LINE
 *   ltv: ["LTV"],
 *   "loan to value": ["LTV"],
 *   "cap rate": ["ASSET_VALUE", "NOI"],
 *   "cash flow": ["NET_CASH_FLOW"],
 *   capex: ["CAPEX"],
 *   margin: ["NOI_MARGIN_KPI"],
 *   value: ["ASSET_VALUE"],
 *   equity: ["EQUITY_VALUE"],
 *   irr: ["GROSS_IRR", "NET_IRR"],
 *   tvpi: ["GROSS_TVPI", "NET_TVPI"],
 *   nav: ["PORTFOLIO_NAV"],
 *   "unit economics": ["AVG_RENT", "NOI_PER_UNIT"],
 * };
 * ```
 */

// ============================================================================
// WHY THESE SPECIFIC ENTRIES
// ============================================================================

/**
 * Key: "debt yield"
 * - Full phrase that users will naturally type
 * - Matches METRIC_CATALOG entry: { key: "DEBT_YIELD", label: "Debt Yield", ... }
 * - Consistent with existing pattern: "debt service", "debt maturity", "loan to value"
 *
 * Key: "dy"
 * - Short form / abbreviation used in finance
 * - Example: "show me the dy for each property"
 * - Consistent with existing pattern: "ltv", "dpi", "nav"
 * - No conflicts with existing keywords
 *
 * Both map to: ["DEBT_YIELD"]
 * - Single metric, since debt yield is a specific calculated metric
 * - Follows existing pattern (most keywords map to 1-3 metrics)
 * - DEBT_YIELD is in METRIC_CATALOG as a single approved metric
 */

// ============================================================================
// IMPACT ANALYSIS
// ============================================================================

/**
 * Flow when a user prompts: "build a dashboard with debt yield"
 *
 * 1. POST /api/re/v2/dashboards/generate receives prompt
 * 2. detectMetrics(promptLower, entityType) called with:
 *    - promptLower = "build a dashboard with debt yield"
 *    - entityType = "asset" (or whatever is detected)
 * 3. Loop through keywordMap entries:
 *    - keyword "debt yield" found in prompt → add "DEBT_YIELD" to detected array
 * 4. Filter by entity_levels:
 *    - DEBT_YIELD supports ["asset", "investment"]
 *    - For asset entity: DEBT_YIELD passes filter ✓
 *    - For fund entity: DEBT_YIELD filtered out (not in entity_levels) ✓
 * 5. Return detected metrics including DEBT_YIELD
 * 6. composeDashboard() receives DEBT_YIELD in metrics list
 * 7. Widgets created with DEBT_YIELD in their config.metrics
 * 8. Validator passes (DEBT_YIELD is in METRIC_MAP)
 * 9. Response includes DEBT_YIELD in dashboard spec
 *
 * Result: Dashboard generated with debt yield metric visible in widgets
 */

/**
 * Edge cases handled correctly:
 *
 * Case 1: "show me dy for assets"
 * - "dy" matches keywordMap → DEBT_YIELD detected
 * - "assets" triggers entity_type = "asset"
 * - DEBT_YIELD valid for asset → included
 *
 * Case 2: "dy for the fund"
 * - "dy" matches keywordMap → DEBT_YIELD detected
 * - "fund" triggers entity_type = "fund"
 * - DEBT_YIELD NOT in fund entity_levels → filtered out
 * - Fallback to defaults → sensible default metrics
 *
 * Case 3: "debt yield and dscr comparison"
 * - "debt yield" matches → DEBT_YIELD detected
 * - "dscr" matches → DSCR_KPI detected
 * - Both passed through → both included in dashboard
 *
 * Case 4: "debt service and debt yield"
 * - "debt service" matches → ["TOTAL_DEBT_SERVICE", "DSCR_KPI"]
 * - "debt yield" matches → ["DEBT_YIELD"]
 * - Deduplicated and returned: [TOTAL_DEBT_SERVICE, DSCR_KPI, DEBT_YIELD]
 */

// ============================================================================
// NO OTHER CHANGES NEEDED
// ============================================================================

/**
 * The following are NOT affected by this change and need NO updates:
 *
 * ✓ detectArchetype() — selects layout independently of metrics
 * ✓ detectScope() — selects entity type independently of metrics
 * ✓ composeDashboard() — composes widgets from any detected metrics
 * ✓ validateDashboardSpec() — validates DEBT_YIELD via METRIC_MAP lookup
 * ✓ metric-catalog.ts — DEBT_YIELD already present
 * ✓ spec-validator.ts — no changes needed
 * ✓ layout-archetypes.ts — no changes needed
 * ✓ Database schema — no changes needed (debt yield is a calculation, not new data)
 *
 * This is a purely additive change to the keyword detection map.
 */

// ============================================================================
// CODE LOCATION
// ============================================================================

/**
 * File: /repo-b/src/app/api/re/v2/dashboards/generate/route.ts
 * Function: detectMetrics() (line 123)
 * Variable: keywordMap (line 127)
 * Action: Add two entries in alphabetical position
 */
