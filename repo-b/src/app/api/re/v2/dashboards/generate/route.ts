import { getPool } from "@/lib/server/db";
import { METRIC_CATALOG } from "@/lib/dashboards/metric-catalog";
import { LAYOUT_ARCHETYPES } from "@/lib/dashboards/layout-archetypes";
import { validateDashboardSpec } from "@/lib/dashboards/spec-validator";

export const runtime = "nodejs";

/**
 * POST /api/re/v2/dashboards/generate
 * AI-powered dashboard generation from natural language prompt.
 *
 * Takes a user prompt + entity context and returns a structured dashboard spec.
 * Uses deterministic pattern matching + template composition rather than raw LLM
 * to ensure every metric is approved and every layout is composed.
 */
export async function POST(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const body = await request.json();
    const { prompt, entity_type, entity_ids, env_id, business_id, quarter } = body;

    if (!prompt) {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }

    const promptLower = prompt.toLowerCase();

    // 1. Detect layout archetype from prompt intent
    const archetype = detectArchetype(promptLower);

    // 2. Detect entity scope
    const scope = detectScope(promptLower, entity_type, entity_ids);

    // 3. Detect requested metrics
    const requestedMetrics = detectMetrics(promptLower, scope.entity_type);

    // 4. Compose dashboard spec from archetype + metrics
    const spec = composeDashboard(archetype, requestedMetrics, scope, quarter);

    // 5. Validate the generated spec
    const validation = validateDashboardSpec(spec);

    // 6. Generate a dashboard name
    const name = generateName(promptLower, archetype);

    // 7. Resolve entity names for display
    let entityNames: Record<string, string> = {};
    if (scope.entity_ids?.length && env_id) {
      entityNames = await resolveEntityNames(pool, scope.entity_type, scope.entity_ids);
    }

    return Response.json({
      name,
      description: prompt,
      layout_archetype: archetype,
      spec: validation.sanitized || spec,
      entity_scope: scope,
      quarter: quarter || detectQuarter(promptLower),
      validation: {
        valid: validation.valid,
        warnings: validation.warnings,
      },
      entity_names: entityNames,
    });
  } catch (err) {
    console.error("[dashboards/generate] Error:", err);
    return Response.json({ error: "Dashboard generation failed" }, { status: 500 });
  }
}

/* --------------------------------------------------------------------------
 * Intent detection helpers
 * -------------------------------------------------------------------------- */

function detectArchetype(prompt: string): string {
  if (/watchlist|underperform|surveillance|flag|monitor/i.test(prompt)) return "watchlist";
  if (/compar|vs\s|versus|benchmark|side.by.side|market\s/i.test(prompt)) return "market_comparison";
  if (/operat|detail|deep.dive|asset.manag|cash.flow|income.statement/i.test(prompt)) return "operating_review";
  return "executive_summary";
}

function detectScope(
  prompt: string,
  entityType?: string,
  entityIds?: string[],
): { entity_type: string; entity_ids?: string[] } {
  const type = entityType ||
    (/fund|portfolio|nav|tvpi|dpi/i.test(prompt) ? "fund" :
     /investment|deal|return|irr|moic/i.test(prompt) ? "investment" :
     "asset");

  return { entity_type: type, entity_ids: entityIds?.length ? entityIds : undefined };
}

function detectMetrics(prompt: string, entityType: string): string[] {
  const detected: string[] = [];

  // Match prompt keywords to catalog metrics
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
  };

  for (const [keyword, metrics] of Object.entries(keywordMap)) {
    if (prompt.includes(keyword)) {
      for (const m of metrics) {
        if (!detected.includes(m)) detected.push(m);
      }
    }
  }

  // Filter to entity-appropriate metrics
  const entityMetrics = METRIC_CATALOG
    .filter((m) => m.entity_levels.includes(entityType as "asset" | "investment" | "fund"))
    .map((m) => m.key);

  const filtered = detected.filter((k) => entityMetrics.includes(k));

  // If nothing specific detected, use sensible defaults
  if (filtered.length === 0) {
    if (entityType === "fund") return ["PORTFOLIO_NAV", "GROSS_IRR", "NET_TVPI", "DPI"];
    if (entityType === "investment") return ["NOI", "ASSET_VALUE", "EQUITY_VALUE", "DSCR_KPI"];
    return ["NOI", "OCCUPANCY", "DSCR_KPI", "ASSET_VALUE"];
  }

  return filtered;
}

function detectQuarter(prompt: string): string | null {
  const match = prompt.match(/(\d{4})q([1-4])/i);
  if (match) return `${match[1]}Q${match[2]}`;
  return null;
}

function generateName(prompt: string, archetype: string): string {
  const archetypeLabels: Record<string, string> = {
    executive_summary: "Executive Summary",
    operating_review: "Operating Review",
    watchlist: "Watchlist",
    market_comparison: "Market Comparison",
    custom: "Dashboard",
  };

  // Extract key nouns from prompt for the name
  const propertyTypes = prompt.match(/multifamily|office|industrial|retail|hotel|medical/gi);
  const markets = prompt.match(/phoenix|denver|aurora|dallas|austin|atlanta|miami|nyc|chicago|boston/gi);

  const parts: string[] = [];
  if (propertyTypes?.length) parts.push(propertyTypes[0].charAt(0).toUpperCase() + propertyTypes[0].slice(1));
  if (markets?.length) parts.push(markets.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(" vs "));
  parts.push(archetypeLabels[archetype] || "Dashboard");

  return parts.join(" ");
}

/* --------------------------------------------------------------------------
 * Dashboard composition
 * -------------------------------------------------------------------------- */

interface WidgetSpec {
  id: string;
  type: string;
  config: Record<string, unknown>;
  layout: { x: number; y: number; w: number; h: number };
}

function composeDashboard(
  archetypeKey: string,
  metrics: string[],
  scope: { entity_type: string; entity_ids?: string[] },
  quarter?: string,
): { widgets: WidgetSpec[] } {
  const archetype = LAYOUT_ARCHETYPES[archetypeKey as keyof typeof LAYOUT_ARCHETYPES]
    || LAYOUT_ARCHETYPES.executive_summary;

  const widgets: WidgetSpec[] = [];

  for (const slot of archetype.slots) {
    const widget: WidgetSpec = {
      id: `${slot.id_prefix}_${widgets.length}`,
      type: slot.type,
      config: {
        title: slot.default_config.title,
        entity_type: scope.entity_type,
        entity_ids: scope.entity_ids,
        quarter,
        scenario: "actual",
        metrics: [] as Array<{ key: string }>,
      },
      layout: { ...slot.layout },
    };

    switch (slot.type) {
      case "metrics_strip": {
        const count = slot.default_config.metric_count || 4;
        widget.config.metrics = metrics.slice(0, count).map((k) => ({ key: k }));
        break;
      }
      case "trend_line": {
        // Pick 1-3 metrics for trend lines
        const trendMetrics = metrics.filter((k) =>
          ["NOI", "OCCUPANCY", "DSCR_KPI", "ASSET_VALUE", "PORTFOLIO_NAV", "NET_CASH_FLOW"].includes(k),
        ).slice(0, 3);
        widget.config.metrics = trendMetrics.length > 0
          ? trendMetrics.map((k) => ({ key: k }))
          : [{ key: metrics[0] || "NOI" }];
        widget.config.format = slot.default_config.format || "dollar";
        widget.config.period_type = "quarterly";
        break;
      }
      case "bar_chart": {
        const barMetrics = metrics.filter((k) =>
          ["RENT", "TOTAL_OPEX", "EGI", "NOI", "CAPEX"].includes(k),
        ).slice(0, 3);
        widget.config.metrics = barMetrics.length > 0
          ? barMetrics.map((k) => ({ key: k }))
          : [{ key: "NOI" }, { key: "TOTAL_OPEX" }];
        widget.config.format = slot.default_config.format || "dollar";
        break;
      }
      case "waterfall": {
        widget.config.metrics = [{ key: "EGI" }, { key: "TOTAL_OPEX" }, { key: "NOI" }];
        break;
      }
      case "statement_table": {
        widget.config.statement = slot.default_config.statement || "IS";
        widget.config.period_type = "quarterly";
        widget.config.comparison = "none";
        break;
      }
      case "comparison_table": {
        widget.config.comparison = "budget";
        break;
      }
      case "text_block": {
        widget.config.title = slot.default_config.title || "Notes";
        widget.config.metrics = [];
        break;
      }
      default: {
        widget.config.metrics = metrics.slice(0, 2).map((k) => ({ key: k }));
      }
    }

    widgets.push(widget);
  }

  return { widgets };
}

/* --------------------------------------------------------------------------
 * Entity name resolution
 * -------------------------------------------------------------------------- */

async function resolveEntityNames(
  pool: ReturnType<typeof getPool>,
  entityType: string,
  entityIds: string[],
): Promise<Record<string, string>> {
  if (!pool || entityIds.length === 0) return {};

  const table = entityType === "fund" ? "repe_fund"
    : entityType === "investment" ? "repe_deal"
    : "repe_property_asset";

  const idCol = entityType === "fund" ? "fund_id"
    : entityType === "investment" ? "deal_id"
    : "id";

  try {
    const res = await pool.query(
      `SELECT ${idCol}::text AS id, name FROM ${table} WHERE ${idCol} = ANY($1::uuid[])`,
      [entityIds],
    );
    const map: Record<string, string> = {};
    for (const row of res.rows) map[row.id] = row.name;
    return map;
  } catch {
    return {};
  }
}
