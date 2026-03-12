/**
 * measure-suggestion-engine.ts
 *
 * Infers useful business measures from keywords, dashboard purpose, user type,
 * and data domain. Does NOT replace the metric catalog — it operates on top of
 * it to produce tiered measure recommendations.
 *
 * Three tiers:
 *   required   — must appear; dashboard is incomplete without them
 *   suggested  — should appear; common companion to what was explicitly requested
 *   optional   — advanced; include only when dashboard depth warrants it
 *
 * Architecture position:
 *   generate/route.ts → dashboard-intelligence.ts → measure-suggestion-engine.ts
 *   suggestMeasures() is called during spec composition. Its output is used to:
 *     (a) fill metrics_strip KPI cards
 *     (b) annotate trend_line / bar_chart widgets with comparison lines
 *     (c) decide when a variance chart is more useful than a raw value chart
 *     (d) recommend dimensional breakdowns
 */

/* --------------------------------------------------------------------------
 * Measure tiers
 * -------------------------------------------------------------------------- */
export type MeasureTier = "required" | "suggested" | "optional";

export type MeasureCategory =
  | "base"          // raw metric value (NOI, OCCUPANCY)
  | "derived"       // computed from base (NOI_MARGIN = NOI / EGI)
  | "comparative"   // current vs reference (actual vs budget, vs prior year)
  | "trend"         // value over time
  | "ratio"         // dimensionless ratio (DSCR, LTV, IRR)
  | "decomposition" // breakdown of a total into components (NOI bridge)
  | "ranking";      // rank within a set (asset ranked by NOI)

export interface MeasureSuggestion {
  metric_key: string;
  label: string;
  tier: MeasureTier;
  category: MeasureCategory;
  reason: string;
  /** If true, suggest adding a comparison line or variance column */
  suggest_comparison?: boolean;
  /** When a variance chart is more useful than a raw value chart */
  prefer_variance_chart?: boolean;
  /** Dimension to use for breakdown (e.g. "market", "property_type", "fund_id") */
  breakdown_dimensions?: string[];
}

export interface MeasureSuggestionResult {
  required: MeasureSuggestion[];
  suggested: MeasureSuggestion[];
  optional: MeasureSuggestion[];
  /** Whether a KPI strip is warranted */
  include_kpi_strip: boolean;
  /** Whether any measure warrants a benchmark/comparison line */
  include_benchmark: boolean;
  /** Primary dimensional breakdowns recommended for this dashboard */
  recommended_dimensions: string[];
  /** Analytical depth level inferred from context */
  depth: "executive" | "operational" | "analytical";
}

/* --------------------------------------------------------------------------
 * Keyword → measure map
 *
 * Grouped by domain keyword. Each entry specifies which metrics to suggest,
 * at which tier, and whether comparison or variance treatment applies.
 * -------------------------------------------------------------------------- */

interface KeywordRule {
  keywords: string[];
  required: Array<{ key: string; category: MeasureCategory; reason: string }>;
  suggested: Array<{ key: string; category: MeasureCategory; reason: string; suggest_comparison?: boolean; prefer_variance_chart?: boolean }>;
  optional: Array<{ key: string; category: MeasureCategory; reason: string }>;
  dimensions: string[];
}

const KEYWORD_RULES: KeywordRule[] = [
  // --- Performance / returns ---
  {
    keywords: ["performance", "return", "irr", "tvpi", "dpi", "multiple", "yield"],
    required: [
      { key: "GROSS_IRR", category: "ratio", reason: "Core return metric for any performance dashboard" },
      { key: "NET_TVPI", category: "ratio", reason: "Investor-facing total value multiple" },
    ],
    suggested: [
      { key: "NET_IRR", category: "ratio", reason: "Net IRR companion to gross — always show both", suggest_comparison: true },
      { key: "DPI", category: "ratio", reason: "Distributions measure realized return component" },
      { key: "PORTFOLIO_NAV", category: "base", reason: "NAV contextualises IRR magnitude" },
    ],
    optional: [
      { key: "RVPI", category: "ratio", reason: "Residual value — useful for funds with unrealised NAV" },
      { key: "GROSS_TVPI", category: "ratio", reason: "Gross TVPI comparison to net shows fee drag" },
    ],
    dimensions: ["fund_id", "vintage_year", "property_type"],
  },
  // --- NOI / operating income ---
  {
    keywords: ["noi", "net operating income", "operating income", "income"],
    required: [
      { key: "NOI", category: "base", reason: "Primary operating income metric" },
    ],
    suggested: [
      { key: "NOI_MARGIN", category: "derived", reason: "NOI margin shows operational efficiency", suggest_comparison: true },
      { key: "EGI", category: "base", reason: "EGI is the revenue line from which NOI is derived" },
      { key: "TOTAL_OPEX", category: "base", reason: "OpEx required to understand NOI bridge", prefer_variance_chart: true },
    ],
    optional: [
      { key: "NOI_PER_UNIT", category: "derived", reason: "Per-unit normalises across different asset sizes" },
    ],
    dimensions: ["asset_id", "property_type", "quarter"],
  },
  // --- Occupancy / leasing ---
  {
    keywords: ["occupancy", "vacancy", "lease", "leasing", "rent", "tenant"],
    required: [
      { key: "OCCUPANCY", category: "base", reason: "Occupancy is the primary leasing health metric" },
    ],
    suggested: [
      { key: "AVG_RENT", category: "base", reason: "Rent per unit contextualises occupancy revenue quality", suggest_comparison: true },
      { key: "RENT", category: "base", reason: "Total rental revenue follows from occupancy × rent" },
      { key: "EGI", category: "derived", reason: "EGI = occupancy + rent combined effect" },
    ],
    optional: [
      { key: "NOI_MARGIN", category: "derived", reason: "Margin shows whether revenue translates to income" },
      { key: "LEASING_COMMISSIONS", category: "base", reason: "Leasing cost as a share of new revenue" },
    ],
    dimensions: ["asset_id", "property_type", "market"],
  },
  // --- Debt / leverage ---
  {
    keywords: ["debt", "leverage", "loan", "ltv", "dscr", "coverage", "maturity"],
    required: [
      { key: "DSCR_KPI", category: "ratio", reason: "DSCR is the primary debt coverage metric" },
      { key: "LTV", category: "ratio", reason: "LTV measures leverage risk" },
    ],
    suggested: [
      { key: "TOTAL_DEBT_SERVICE", category: "base", reason: "Absolute debt service cost", suggest_comparison: true },
      { key: "DEBT_YIELD", category: "ratio", reason: "Debt yield complements DSCR for coverage analysis" },
      { key: "NET_CASH_FLOW", category: "base", reason: "Net cash flow after debt service" },
    ],
    optional: [
      { key: "DEBT_SERVICE_INT", category: "base", reason: "Interest component alone shows rate exposure" },
      { key: "WEIGHTED_LTV", category: "ratio", reason: "Portfolio-weighted LTV for fund-level dashboards" },
      { key: "WEIGHTED_DSCR", category: "ratio", reason: "Portfolio-weighted DSCR for fund-level dashboards" },
    ],
    dimensions: ["asset_id", "maturity_year", "lender"],
  },
  // --- Cash flow ---
  {
    keywords: ["cash flow", "cashflow", "distributions", "capital", "capex"],
    required: [
      { key: "NET_CASH_FLOW", category: "base", reason: "Net cash flow is the bottom line" },
    ],
    suggested: [
      { key: "NOI", category: "base", reason: "NOI is the starting point for cash flow" },
      { key: "CAPEX", category: "base", reason: "CapEx is typically the largest below-NOI item", prefer_variance_chart: true },
      { key: "TOTAL_DEBT_SERVICE", category: "base", reason: "Debt service reduces cash flow to equity" },
    ],
    optional: [
      { key: "REPLACEMENT_RESERVES", category: "base", reason: "Reserves affect distributable cash" },
      { key: "TENANT_IMPROVEMENTS", category: "base", reason: "TI is lumpy — worth surfacing separately" },
    ],
    dimensions: ["asset_id", "quarter", "scenario"],
  },
  // --- Budget / variance ---
  {
    keywords: ["budget", "variance", "plan", "actual vs", "vs budget", "vs plan", "forecast"],
    required: [
      { key: "NOI", category: "comparative", reason: "NOI variance is the primary budget measure" },
    ],
    suggested: [
      { key: "EGI", category: "comparative", reason: "Revenue variance explains NOI shortfalls", suggest_comparison: true, prefer_variance_chart: true },
      { key: "TOTAL_OPEX", category: "comparative", reason: "Expense variance is the other side of NOI", prefer_variance_chart: true },
      { key: "OCCUPANCY", category: "comparative", reason: "Occupancy variance drives revenue misses", suggest_comparison: true },
    ],
    optional: [
      { key: "NOI_MARGIN", category: "derived", reason: "Margin variance combines revenue and expense effects" },
    ],
    dimensions: ["asset_id", "quarter", "expense_category"],
  },
  // --- Fund / portfolio ---
  {
    keywords: ["fund", "portfolio", "allocation", "nav", "committed capital"],
    required: [
      { key: "PORTFOLIO_NAV", category: "base", reason: "NAV is the anchor metric for fund dashboards" },
    ],
    suggested: [
      { key: "GROSS_IRR", category: "ratio", reason: "IRR shows absolute return alongside NAV" },
      { key: "NET_TVPI", category: "ratio", reason: "TVPI is the LP-facing return metric" },
      { key: "WEIGHTED_LTV", category: "ratio", reason: "Portfolio LTV quantifies aggregate leverage", suggest_comparison: true },
    ],
    optional: [
      { key: "DPI", category: "ratio", reason: "DPI tells LPs how much cash they have received" },
      { key: "WEIGHTED_DSCR", category: "ratio", reason: "Coverage ratio for fund lender covenants" },
    ],
    dimensions: ["fund_id", "property_type", "vintage_year", "market"],
  },
  // --- Watchlist / underperformance ---
  {
    keywords: ["watchlist", "underperform", "at risk", "flag", "exception", "below"],
    required: [
      { key: "NOI", category: "comparative", reason: "NOI vs budget is the primary underperformance signal" },
      { key: "OCCUPANCY", category: "comparative", reason: "Occupancy shortfall often precedes NOI miss" },
    ],
    suggested: [
      { key: "DSCR_KPI", category: "ratio", reason: "DSCR below 1.0x is a hard risk flag", suggest_comparison: true },
      { key: "NOI_MARGIN", category: "derived", reason: "Margin compression signals cost problems" },
    ],
    optional: [
      { key: "LTV", category: "ratio", reason: "High LTV assets are more exposed when income falls" },
      { key: "NET_CASH_FLOW", category: "base", reason: "Negative NCF means asset is drawing equity" },
    ],
    dimensions: ["asset_id", "fund_id", "quarter"],
  },
];

/* --------------------------------------------------------------------------
 * User-type modifiers
 * -------------------------------------------------------------------------- */
const USER_TYPE_MODIFIERS: Record<string, {
  promote_optional_to_suggested: string[];
  demote_suggested: string[];
  add_suggested: Array<{ key: string; category: MeasureCategory; reason: string }>;
}> = {
  "asset manager": {
    promote_optional_to_suggested: ["NOI_PER_UNIT", "CAPEX", "REPLACEMENT_RESERVES"],
    demote_suggested: ["GROSS_IRR", "NET_TVPI"],
    add_suggested: [
      { key: "AVG_RENT", category: "base", reason: "Asset managers track rent per unit as a leasing KPI" },
    ],
  },
  "fund manager": {
    promote_optional_to_suggested: ["WEIGHTED_LTV", "WEIGHTED_DSCR", "DPI"],
    demote_suggested: ["NOI_PER_UNIT", "AVG_RENT"],
    add_suggested: [
      { key: "RVPI", category: "ratio", reason: "Residual value tells fund manager remaining upside" },
    ],
  },
  "investor": {
    promote_optional_to_suggested: ["DPI", "RVPI"],
    demote_suggested: ["CAPEX", "TOTAL_OPEX", "PAYROLL"],
    add_suggested: [],
  },
  "ic": {
    promote_optional_to_suggested: ["GROSS_TVPI", "GROSS_IRR"],
    demote_suggested: [],
    add_suggested: [
      { key: "NET_IRR", category: "ratio", reason: "IC always needs gross and net side by side" },
    ],
  },
};

/* --------------------------------------------------------------------------
 * Depth detection — how analytically deep should this dashboard be?
 * -------------------------------------------------------------------------- */
function detectDepth(text: string): "executive" | "operational" | "analytical" {
  const lower = text.toLowerCase();
  if (/\b(board|ic memo|investor|lp|executive summary|quarterly update|present)\b/.test(lower)) return "executive";
  if (/\b(monitor|watchlist|exception|alert|daily|weekly|operational|asset manager)\b/.test(lower)) return "operational";
  return "analytical";
}

/* --------------------------------------------------------------------------
 * Main function
 * -------------------------------------------------------------------------- */
export function suggestMeasures(
  promptText: string,
  entityType: "asset" | "investment" | "fund" | "portfolio",
  userType?: string,
): MeasureSuggestionResult {
  const lower = promptText.toLowerCase();
  const depth = detectDepth(lower);

  const requiredMap = new Map<string, MeasureSuggestion>();
  const suggestedMap = new Map<string, MeasureSuggestion>();
  const optionalMap = new Map<string, MeasureSuggestion>();
  const allDimensions = new Set<string>();

  // Match keyword rules
  for (const rule of KEYWORD_RULES) {
    const matched = rule.keywords.some((kw) => lower.includes(kw));
    if (!matched) continue;

    rule.dimensions.forEach((d) => allDimensions.add(d));

    for (const m of rule.required) {
      if (!requiredMap.has(m.key)) {
        requiredMap.set(m.key, { metric_key: m.key, label: m.key, tier: "required", category: m.category, reason: m.reason });
      }
    }
    for (const m of rule.suggested) {
      if (!requiredMap.has(m.key) && !suggestedMap.has(m.key)) {
        suggestedMap.set(m.key, {
          metric_key: m.key,
          label: m.key,
          tier: "suggested",
          category: m.category,
          reason: m.reason,
          suggest_comparison: m.suggest_comparison,
          prefer_variance_chart: m.prefer_variance_chart,
        });
      }
    }
    for (const m of rule.optional) {
      if (!requiredMap.has(m.key) && !suggestedMap.has(m.key) && !optionalMap.has(m.key)) {
        optionalMap.set(m.key, { metric_key: m.key, label: m.key, tier: "optional", category: m.category, reason: m.reason });
      }
    }
  }

  // Apply user-type modifiers
  if (userType) {
    const userLower = userType.toLowerCase();
    const modifier = Object.entries(USER_TYPE_MODIFIERS).find(([k]) => userLower.includes(k))?.[1];
    if (modifier) {
      for (const key of modifier.promote_optional_to_suggested) {
        const entry = optionalMap.get(key);
        if (entry) {
          optionalMap.delete(key);
          suggestedMap.set(key, { ...entry, tier: "suggested", reason: `${entry.reason} (promoted for ${userType})` });
        }
      }
      for (const key of modifier.demote_suggested) {
        suggestedMap.delete(key);
      }
      for (const m of modifier.add_suggested) {
        if (!requiredMap.has(m.key) && !suggestedMap.has(m.key)) {
          suggestedMap.set(m.key, { metric_key: m.key, label: m.key, tier: "suggested", category: m.category, reason: m.reason });
        }
      }
    }
  }

  // Filter to entity-appropriate metrics (drop fund metrics from asset dashboards etc.)
  const entityFilter = (key: string): boolean => {
    const FUND_ONLY = new Set(["GROSS_IRR", "NET_IRR", "GROSS_TVPI", "NET_TVPI", "DPI", "RVPI", "PORTFOLIO_NAV", "WEIGHTED_LTV", "WEIGHTED_DSCR"]);
    const ASSET_ONLY = new Set(["AVG_RENT", "NOI_PER_UNIT", "RENT", "PAYROLL", "REPAIRS_MAINT", "UTILITIES", "TAXES", "INSURANCE", "MGMT_FEES", "CAPEX", "TENANT_IMPROVEMENTS", "LEASING_COMMISSIONS", "REPLACEMENT_RESERVES"]);
    if (entityType === "fund" && ASSET_ONLY.has(key)) return false;
    if (entityType === "asset" && FUND_ONLY.has(key)) return false;
    return true;
  };

  const required = [...requiredMap.values()].filter((m) => entityFilter(m.metric_key));
  const suggested = [...suggestedMap.values()].filter((m) => entityFilter(m.metric_key));
  const optional = [...optionalMap.values()].filter((m) => entityFilter(m.metric_key));

  // If no required measures were found, fall back to entity defaults
  if (required.length === 0) {
    const defaults: Record<string, string[]> = {
      asset: ["NOI", "OCCUPANCY", "DSCR_KPI", "ASSET_VALUE"],
      investment: ["NOI", "ASSET_VALUE", "EQUITY_VALUE", "DSCR_KPI"],
      fund: ["PORTFOLIO_NAV", "GROSS_IRR", "NET_TVPI", "DPI"],
      portfolio: ["PORTFOLIO_NAV", "GROSS_IRR", "NET_TVPI", "OCCUPANCY"],
    };
    for (const key of (defaults[entityType] ?? [])) {
      required.push({ metric_key: key, label: key, tier: "required", category: "base", reason: "Default metric for entity type" });
    }
  }

  const include_benchmark = suggested.some((m) => m.suggest_comparison) || required.some((m) => m.suggest_comparison);
  const include_kpi_strip = required.length > 0 || depth !== "analytical";

  return {
    required,
    suggested,
    optional,
    include_kpi_strip,
    include_benchmark,
    recommended_dimensions: [...allDimensions].slice(0, 4),
    depth,
  };
}
