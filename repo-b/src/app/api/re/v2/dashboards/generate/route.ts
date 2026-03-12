import { getPool } from "@/lib/server/db";
import { METRIC_CATALOG } from "@/lib/dashboards/metric-catalog";
import { LAYOUT_ARCHETYPES, SECTION_REGISTRY, ARCHETYPE_DEFAULT_SECTIONS } from "@/lib/dashboards/layout-archetypes";
import { validateDashboardSpec } from "@/lib/dashboards/spec-validator";
import { buildQueryManifest, deriveDataAvailability } from "@/lib/dashboards/query-manifest-builder";
import { parseMarkdownSpec } from "@/lib/dashboards/spec-from-markdown";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

/**
 * POST /api/re/v2/dashboards/generate
 * AI-powered dashboard generation from natural language prompt.
 *
 * Takes a user prompt + entity context and returns a structured dashboard spec.
 * Uses intent parsing + section-based composition rather than fixed archetypes
 * to ensure every explicit user request maps to a widget in the output.
 *
 * Optional: pass `spec_file` (relative path from repo root, e.g.
 * "docs/dashboard_requests/real_estate_fund_dashboard.md") to generate from a
 * structured markdown spec instead of a free-form prompt. The markdown file is
 * parsed into a synthesised prompt + entity params; generation proceeds normally.
 */
export async function POST(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const body = await request.json();
    let { prompt, entity_type, entity_ids, env_id, business_id, quarter } = body;
    const { spec_file } = body;

    // -- Markdown spec ingestion -------------------------------------------
    // If spec_file is provided, parse the markdown and derive prompt + params.
    // Values in the markdown take precedence over body params ONLY when the
    // body param is absent; explicit body params always win.
    if (spec_file) {
      const repoRoot = process.cwd(); // Next.js cwd is always the repo-b root
      // Allow paths relative to repo root or relative to the project monorepo root
      const candidates = [
        path.resolve(repoRoot, spec_file),
        path.resolve(repoRoot, "..", spec_file),
      ];
      const resolved = candidates.find((p) => fs.existsSync(p));
      if (!resolved) {
        return Response.json(
          { error: `spec_file not found: ${spec_file}` },
          { status: 404 },
        );
      }
      const markdown = fs.readFileSync(resolved, "utf-8");
      const parsed = parseMarkdownSpec(markdown);

      if (parsed.missing_required.length > 0) {
        return Response.json(
          {
            error: "Incomplete dashboard request spec",
            missing_sections: parsed.missing_required,
            hint: `Add these sections to ${spec_file}: ${parsed.missing_required.join(", ")}`,
          },
          { status: 422 },
        );
      }

      // Apply parsed values — body params take precedence
      if (!prompt) prompt = parsed.prompt;
      if (!entity_type) entity_type = parsed.entity_type;
      if (!quarter && parsed.quarter) quarter = parsed.quarter;
      console.log("[generate] spec_file parsed:", { file: spec_file, name: parsed.name, entity_type, quarter });
    }
    // -----------------------------------------------------------------------

    if (!prompt) {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }

    const promptLower = prompt.toLowerCase();

    // 1. Parse structured intent — try LLM first, fall back to regex
    const intent = await parseLLMIntent(prompt, entity_type || "asset");

    // 2. Detect entity scope
    const scope = detectScope(promptLower, entity_type, entity_ids);

    // 2b. Auto-populate entity_ids from DB when not provided
    if (!scope.entity_ids?.length && business_id) {
      try {
        let entRes;
        if (scope.entity_type === "fund") {
          entRes = await pool.query(
            `SELECT fund_id::text AS id FROM repe_fund WHERE business_id = $1::uuid LIMIT 10`,
            [business_id],
          );
        } else if (scope.entity_type === "investment") {
          entRes = await pool.query(
            `SELECT d.deal_id::text AS id FROM repe_deal d
             JOIN repe_fund f ON f.fund_id = d.fund_id
             WHERE f.business_id = $1::uuid LIMIT 10`,
            [business_id],
          );
        } else {
          entRes = await pool.query(
            `SELECT pa.asset_id::text AS id FROM repe_property_asset pa
             JOIN repe_asset a ON a.asset_id = pa.asset_id
             JOIN repe_deal d ON d.deal_id = a.deal_id
             JOIN repe_fund f ON f.fund_id = d.fund_id
             WHERE f.business_id = $1::uuid LIMIT 10`,
            [business_id],
          );
        }
        console.log("[generate] auto-populate:", { entity_type: scope.entity_type, rowCount: entRes.rows.length, ids: entRes.rows.slice(0, 3) });
        if (entRes.rows.length > 0) {
          scope.entity_ids = entRes.rows.map((r: { id: string }) => r.id);
        } else if (scope.entity_type === "asset") {
          scope.entity_ids = ["11689c58-7993-400e-89c9-b3f33e431553"];
        } else if (scope.entity_type === "fund") {
          scope.entity_ids = ["a1b2c3d4-0003-0030-0001-000000000001"];
        }
      } catch (err) {
        console.error("[generate] entity auto-populate failed:", err);
      }
    }

    // 3. Detect requested metrics
    const requestedMetrics = detectMetrics(promptLower, scope.entity_type);

    // 4. Compose dashboard from intent + sections
    const spec = composeFromIntent(intent, requestedMetrics, scope, quarter);

    // 5. Validate the generated spec
    const validation = validateDashboardSpec(spec);

    // 5b. Check intent coverage and surface warnings
    const coverageWarnings = validateIntentCoverage(intent as DashboardIntent, spec.widgets);
    if (coverageWarnings.length > 0) {
      validation.warnings.push(...coverageWarnings);
    }

    // 6. Build query manifest and data availability signal
    const effectiveQuarter = quarter || detectQuarter(promptLower) || undefined;
    const queryManifest = buildQueryManifest(spec.widgets, scope.entity_type, scope.entity_ids || [], effectiveQuarter);
    const dataAvailability = deriveDataAvailability(spec.widgets, scope.entity_ids, effectiveQuarter);

    // 7. Generate a dashboard name
    const name = generateName(promptLower, intent.archetype);

    // 8. Resolve entity names for display
    let entityNames: Record<string, string> = {};
    if (scope.entity_ids?.length && env_id) {
      entityNames = await resolveEntityNames(pool, scope.entity_type, scope.entity_ids);
    }

    const responsePayload = {
      name,
      description: prompt,
      layout_archetype: intent.archetype,
      spec: validation.sanitized || spec,
      entity_scope: scope,
      quarter: effectiveQuarter,
      validation: {
        valid: validation.valid,
        warnings: validation.warnings,
      },
      entity_names: entityNames,
      query_manifest: queryManifest,
      data_availability: dataAvailability,
      intent_source: (intent as TaggedIntent).source ?? "regex",
    };
    console.log("[dashboards/generate] Response:", JSON.stringify({ name: responsePayload.name, widgetCount: responsePayload.spec?.widgets?.length, entity_scope: responsePayload.entity_scope, quarter: responsePayload.quarter, archetype: intent.archetype, sections: intent.requested_sections }));
    return Response.json(responsePayload);
  } catch (err) {
    console.error("[dashboards/generate] Error:", err);
    return Response.json({ error: "Dashboard generation failed" }, { status: 500 });
  }
}

/* --------------------------------------------------------------------------
 * Intent parsing
 * -------------------------------------------------------------------------- */

interface DashboardIntent {
  archetype: string;
  requested_sections: string[];
  measures: string[];
  comparisons: string[];
  time_view: string;
}

interface TaggedIntent extends DashboardIntent {
  source: "llm" | "regex";
}

const BOS_BASE = (
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

async function parseLLMIntent(prompt: string, entityType: string): Promise<TaggedIntent> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${BOS_BASE}/api/ai/intent/dashboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, entity_type: entityType }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const data = await res.json();
    const elapsed = Date.now() - start;
    console.log(`[generate] LLM intent: archetype=${data.archetype}, sections=${JSON.stringify(data.requested_sections)}, confidence=${data.confidence} (${elapsed}ms)`);

    return {
      archetype: data.archetype || "executive_summary",
      requested_sections: Array.isArray(data.requested_sections) ? data.requested_sections : [],
      measures: [],
      comparisons: Array.isArray(data.comparisons) ? data.comparisons : [],
      time_view: data.time_view || "quarterly",
      source: "llm",
    };
  } catch (err) {
    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    console.warn(`[generate] LLM intent failed after ${elapsed}ms, using regex:`, (err as Error).message);
    return { ...parseIntent(prompt.toLowerCase()), source: "regex" };
  }
}

const ARCHETYPE_PHRASES: Record<string, string[]> = {
  monthly_operating_report: ["monthly operating", "operating report", "monthly report", "asset management report"],
  executive_summary: ["executive summary", "board summary", "ic memo", "quarterly update", "overview"],
  watchlist: ["watchlist", "underperform", "surveillance", "at risk"],
  fund_quarterly_review: ["quarterly review", "fund review", "qbr", "fund performance"],
  market_comparison: ["compar", "vs ", "versus", "benchmark", "side by side"],
  underwriting_dashboard: ["underwriting", "uw dashboard", "deal screen"],
};

const SECTION_PHRASES: Record<string, string[]> = {
  noi_trend: ["noi trend", "trend over time", "operating trend", "noi over"],
  actual_vs_budget: ["actual vs budget", "budget variance", "budget comparison", "avb", "vs budget"],
  underperformer_watchlist: ["underperforming", "underperformer", "watchlist", "at risk", "flag", "highlight"],
  debt_maturity: ["debt maturity", "loan maturity", "maturity schedule", "maturity timeline"],
  downloadable_table: ["downloadable", "download", "export", "summary table"],
  income_statement: ["income statement", "p&l", "profit and loss"],
  cash_flow: ["cash flow", "cf statement"],
  occupancy_trend: ["occupancy trend", "occupancy over time", "occupancy rate"],
  dscr_monitoring: ["dscr", "debt service coverage", "coverage ratio"],
  noi_bridge: ["noi bridge", "waterfall", "bridge analysis"],
};

function parseIntent(prompt: string): DashboardIntent {
  // Detect archetype — first phrase match wins
  let archetype = "executive_summary";
  for (const [key, phrases] of Object.entries(ARCHETYPE_PHRASES)) {
    if (phrases.some((p) => prompt.includes(p))) {
      archetype = key;
      break;
    }
  }

  // Detect ALL matching sections (not just one)
  const requested_sections: string[] = [];
  for (const [key, phrases] of Object.entries(SECTION_PHRASES)) {
    if (phrases.some((p) => prompt.includes(p))) {
      requested_sections.push(key);
    }
  }

  const comparisons: string[] = [];
  if (/budget/i.test(prompt)) comparisons.push("budget");
  if (/prior.year|year.over.year|yoy/i.test(prompt)) comparisons.push("prior_year");

  const time_view = /trailing|ttm/i.test(prompt) ? "ttm"
    : /ytd|year.to.date/i.test(prompt) ? "ytd"
    : /monthly/i.test(prompt) ? "monthly"
    : "quarterly";

  return { archetype, requested_sections, measures: [], comparisons, time_view };
}

/* --------------------------------------------------------------------------
 * Section-based composition
 * -------------------------------------------------------------------------- */

interface WidgetSpec {
  id: string;
  type: string;
  config: Record<string, unknown>;
  layout: { x: number; y: number; w: number; h: number };
}

function composeFromIntent(
  intent: DashboardIntent,
  metrics: string[],
  scope: { entity_type: string; entity_ids?: string[] },
  quarter?: string,
): { widgets: WidgetSpec[] } {
  // Use explicit sections from prompt, or fall back to archetype defaults
  let sections = intent.requested_sections.length > 0
    ? intent.requested_sections
    : (ARCHETYPE_DEFAULT_SECTIONS[intent.archetype] ?? ARCHETYPE_DEFAULT_SECTIONS.executive_summary);

  // kpi_summary always first, no duplicates
  sections = ["kpi_summary", ...sections.filter((s) => s !== "kpi_summary")];

  const widgets: WidgetSpec[] = [];
  let currentY = 0;
  const compact = sections.length >= 6; // reduce heights to prevent excessive scroll

  for (const sectionKey of sections) {
    const section = SECTION_REGISTRY[sectionKey];
    if (!section) continue;

    let currentX = 0;
    let sectionH = 0;

    for (const def of section.widgets) {
      const h = compact && def.h > 2 ? Math.max(3, def.h - 1) : def.h;

      if (currentX + def.w > 12) {
        currentY += sectionH;
        currentX = 0;
        sectionH = 0;
      }
      sectionH = Math.max(sectionH, h);

      widgets.push({
        id: `${sectionKey}_${widgets.length}`,
        type: def.type,
        config: {
          ...def.config_overrides,
          entity_type: scope.entity_type,
          entity_ids: scope.entity_ids,
          quarter,
          scenario: "actual",
          metrics: selectMetricsForWidget(def.type, metrics, scope.entity_type),
        },
        layout: { x: currentX, y: currentY, w: def.w, h },
      });
      currentX += def.w;
    }
    currentY += sectionH;
  }

  // If section registry produced nothing useful, fall back to archetype slots
  if (widgets.length <= 1) {
    return composeDashboard(intent.archetype, metrics, scope, quarter);
  }

  return { widgets };
}

function selectMetricsForWidget(
  widgetType: string,
  metrics: string[],
  _entityType: string,
): Array<{ key: string }> {
  switch (widgetType) {
    case "metrics_strip":
      return metrics.slice(0, 4).map((k) => ({ key: k }));
    case "trend_line": {
      const trendMetrics = metrics.filter((k) =>
        ["NOI", "OCCUPANCY", "DSCR_KPI", "ASSET_VALUE", "PORTFOLIO_NAV", "NET_CASH_FLOW"].includes(k),
      ).slice(0, 3);
      return trendMetrics.length > 0 ? trendMetrics.map((k) => ({ key: k })) : [{ key: metrics[0] || "NOI" }];
    }
    case "bar_chart": {
      const barMetrics = metrics.filter((k) =>
        ["RENT", "TOTAL_OPEX", "EGI", "NOI", "CAPEX", "TOTAL_DEBT_SERVICE"].includes(k),
      ).slice(0, 3);
      return barMetrics.length > 0 ? barMetrics.map((k) => ({ key: k })) : [{ key: "NOI" }, { key: "TOTAL_OPEX" }];
    }
    case "waterfall":
      return [{ key: "EGI" }, { key: "TOTAL_OPEX" }, { key: "NOI" }];
    case "statement_table":
    case "comparison_table":
    case "text_block":
      return [];
    default:
      return metrics.slice(0, 2).map((k) => ({ key: k }));
  }
}

/* --------------------------------------------------------------------------
 * Fallback: archetype-slot composition (original behavior, kept for backward compat)
 * -------------------------------------------------------------------------- */

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
 * Intent coverage validation
 * -------------------------------------------------------------------------- */

function validateIntentCoverage(intent: DashboardIntent, widgets: WidgetSpec[]): string[] {
  const warnings: string[] = [];
  const widgetTypes = new Set(widgets.map((w) => w.type));
  const widgetTitles = widgets.map((w) => (w.config.title as string | undefined)?.toLowerCase() || "");

  for (const section of intent.requested_sections) {
    const sectionDef = SECTION_REGISTRY[section];
    if (!sectionDef) continue;
    const found = sectionDef.widgets.some((def) => widgetTypes.has(def.type));
    if (!found) {
      warnings.push(`Requested "${section}" but no matching widget was generated`);
    }
  }

  if (
    intent.comparisons.includes("budget") &&
    !widgetTitles.some((t) => t.includes("budget") || t.includes("variance"))
  ) {
    warnings.push("Prompt requested budget comparison but no variance widget was generated");
  }

  return warnings;
}

/* --------------------------------------------------------------------------
 * Other helpers
 * -------------------------------------------------------------------------- */

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
    "debt yield": ["DEBT_YIELD"],
    dy: ["DEBT_YIELD"],
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

  const entityMetrics = METRIC_CATALOG
    .filter((m) => m.entity_levels.includes(entityType as "asset" | "investment" | "fund"))
    .map((m) => m.key);

  const filtered = detected.filter((k) => entityMetrics.includes(k));

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
    monthly_operating_report: "Monthly Operating Report",
    watchlist: "Watchlist",
    fund_quarterly_review: "Fund Quarterly Review",
    market_comparison: "Market Comparison",
    underwriting_dashboard: "Underwriting Dashboard",
    custom: "Dashboard",
  };

  const propertyTypes = prompt.match(/multifamily|office|industrial|retail|hotel|medical/gi);
  const markets = prompt.match(/phoenix|denver|aurora|dallas|austin|atlanta|miami|nyc|chicago|boston/gi);

  const parts: string[] = [];
  if (propertyTypes?.length) parts.push(propertyTypes[0].charAt(0).toUpperCase() + propertyTypes[0].slice(1));
  if (markets?.length) parts.push(markets.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(" vs "));
  parts.push(archetypeLabels[archetype] || "Dashboard");

  return parts.join(" ");
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
