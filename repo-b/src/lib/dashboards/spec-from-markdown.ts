/**
 * spec-from-markdown.ts
 *
 * Parses a dashboard request markdown file (docs/dashboard_requests/*.md)
 * into a structured prompt + entity params that can be sent directly to
 * POST /api/re/v2/dashboards/generate.
 *
 * In addition to the base sections (Purpose, Key Metrics, Layout, Entity Scope),
 * the parser now extracts three advanced sections:
 *   ## Interactions        → parsed into ParsedInteractionRule[]
 *   ## Measure Intent      → analytical depth hint + explicit measure tiers
 *   ## Table Behavior      → explicit table visibility / type overrides
 *
 * No LLM is called here — the generate endpoint handles intent parsing.
 */

import { parseInteractionMarkdown, type ParsedInteractionRule } from "./interaction-engine";

export type AnalyticalDepthHint = "executive" | "operational" | "analytical";
export type TableVisibilityHint = "always" | "on_select" | "on_drill" | "expandable" | "none";

export interface MeasureIntentHint {
  required_metrics: string[];
  requested_metrics: string[];
  /** "suggest" → ask the engine for companions; "exact" → only what's listed */
  suggestion_mode: "suggest" | "exact";
  user_type: string | null;
  analytical_depth: AnalyticalDepthHint;
}

export interface TableBehaviorHint {
  include: boolean | "auto";
  visibility: TableVisibilityHint;
  type_hint: string | null;
  columns_hint: string[];
}

export interface DashboardRequestSpec {
  /** Dashboard title (H1 of the markdown file) */
  name: string;
  /** Synthesised prompt ready for the generate endpoint */
  prompt: string;
  /** Entity type extracted from Entity Scope section */
  entity_type: "asset" | "investment" | "fund" | "portfolio";
  /** Quarter string extracted from Entity Scope section (e.g. "2026Q1") */
  quarter: string | null;
  /** Raw section text map — keys are lowercased h2 headings */
  sections: Record<string, string>;
  /** Validation — list of missing required sections */
  missing_required: string[];
  /** Parsed interaction rules from ## Interactions section */
  interaction_rules: ParsedInteractionRule[];
  /** Measure intent hint from ## Measure Intent section */
  measure_intent: MeasureIntentHint;
  /** Table behavior hint from ## Table Behavior section */
  table_behavior: TableBehaviorHint;
  /** User type hint (from Primary Users or Measure Intent section) */
  user_type: string | null;
}

const REQUIRED_SECTIONS = ["purpose", "key metrics", "layout", "entity scope"];

/**
 * Parse a dashboard request markdown string into a DashboardRequestSpec.
 *
 * Usage:
 *   import { parseMarkdownSpec } from "@/lib/dashboards/spec-from-markdown";
 *   const spec = parseMarkdownSpec(markdownString);
 *   if (spec.missing_required.length) throw new Error("Incomplete spec");
 *   const res = await fetch("/api/re/v2/dashboards/generate", {
 *     method: "POST",
 *     body: JSON.stringify({ prompt: spec.prompt, entity_type: spec.entity_type, ... })
 *   });
 */
export function parseMarkdownSpec(markdown: string): DashboardRequestSpec {
  const lines = markdown.split("\n");

  // Extract H1 title
  const h1 = lines.find((l) => l.startsWith("# "));
  const name = h1 ? h1.replace(/^#\s+/, "").trim() : "Dashboard";

  // Split into H2 sections
  const sections: Record<string, string> = {};
  let currentKey: string | null = null;
  const buffer: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentKey !== null) {
        sections[currentKey] = buffer.join("\n").trim();
      }
      currentKey = line.replace(/^##\s+/, "").trim().toLowerCase();
      buffer.length = 0;
    } else if (currentKey !== null) {
      buffer.push(line);
    }
  }
  if (currentKey !== null) {
    sections[currentKey] = buffer.join("\n").trim();
  }

  // Validate required sections
  const missing_required = REQUIRED_SECTIONS.filter((s) => !sections[s]);

  // Extract entity type from "entity scope" section
  const scopeText = (sections["entity scope"] || "").toLowerCase();
  let entity_type: DashboardRequestSpec["entity_type"] = "asset";
  if (scopeText.includes("fund")) entity_type = "fund";
  else if (scopeText.includes("investment") || scopeText.includes("deal")) entity_type = "investment";
  else if (scopeText.includes("portfolio")) entity_type = "portfolio";

  // Extract quarter (e.g. "Q1 2026", "2026Q1", "2026-Q1")
  const quarterMatch = (sections["entity scope"] || sections["purpose"] || "").match(
    /(?:Q([1-4])\s+(\d{4})|(\d{4})[-\s]?Q([1-4]))/i,
  );
  let quarter: string | null = null;
  if (quarterMatch) {
    if (quarterMatch[1] && quarterMatch[2]) {
      quarter = `${quarterMatch[2]}Q${quarterMatch[1]}`;
    } else if (quarterMatch[3] && quarterMatch[4]) {
      quarter = `${quarterMatch[3]}Q${quarterMatch[4]}`;
    }
  }

  // Extract key metrics list (bullet points)
  const metricsText = sections["key metrics"] || "";
  const metrics = metricsText
    .split("\n")
    .filter((l) => /^[-*]/.test(l.trim()))
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  // Extract layout section — strip markdown formatting for prompt
  const layoutText = (sections["layout"] || "")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Extract visualizations if present
  const vizText = sections["visualizations"] || "";
  const vizTypes = vizText
    .split("\n")
    .filter((l) => /^[-*`]/.test(l.trim()))
    .map((l) => l.replace(/^[-*`]\s*/, "").replace(/`/g, "").split("—")[0].trim())
    .filter(Boolean);

  // Extract filters if present
  const filtersText = sections["filters"] || "";
  const filters = filtersText
    .split("\n")
    .filter((l) => /^[-*]/.test(l.trim()))
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  // Synthesise prompt
  const purposeLine = (sections["purpose"] || "")
    .split("\n")
    .find((l) => l.trim().length > 0) || "";

  const parts: string[] = [name];
  if (purposeLine) parts.push(purposeLine.trim());
  if (metrics.length) parts.push(`Show: ${metrics.join(", ")}.`);
  if (layoutText) parts.push(`Layout: ${layoutText}`);
  if (vizTypes.length) parts.push(`Widget types: ${vizTypes.join(", ")}.`);
  if (filters.length) parts.push(`Filters: ${filters.join(", ")}.`);
  parts.push(`Entity scope: ${entity_type}.`);

  const prompt = parts.join(" ").replace(/\s+/g, " ").trim();

  // --- Parse ## Interactions section ---
  const interaction_rules = parseInteractionMarkdown(sections["interactions"] || "");

  // --- Parse ## Measure Intent section ---
  const measureText = sections["measure intent"] || sections["analytical depth"] || "";
  const measure_intent = parseMeasureIntent(measureText, sections["primary users"] || "");

  // --- Parse ## Table Behavior section ---
  const tableText = sections["table behavior"] || sections["table"] || "";
  const table_behavior = parseTableBehavior(tableText);

  // User type — from Primary Users section or Measure Intent
  const user_type = measure_intent.user_type ?? extractUserType(sections["primary users"] || "");

  return {
    name,
    prompt,
    entity_type,
    quarter,
    sections,
    missing_required,
    interaction_rules,
    measure_intent,
    table_behavior,
    user_type,
  };
}

/* --------------------------------------------------------------------------
 * Measure intent parser
 * -------------------------------------------------------------------------- */
function parseMeasureIntent(text: string, usersText: string): MeasureIntentHint {
  const lower = text.toLowerCase();

  // Analytical depth
  let analytical_depth: AnalyticalDepthHint = "analytical";
  if (/\b(executive|board|lp|investor|ic|presentation)\b/.test(lower)) analytical_depth = "executive";
  else if (/\b(operational|monitor|alert|exception|daily|weekly)\b/.test(lower)) analytical_depth = "operational";

  // Suggestion mode
  const suggestion_mode: "suggest" | "exact" = /\b(exact|only|no additional|do not suggest)\b/.test(lower) ? "exact" : "suggest";

  // Required metrics — lines with "required:" prefix or marked with (!)
  const required_metrics = text
    .split("\n")
    .filter((l) => /required|must have|\(!?\)/.test(l.toLowerCase()))
    .flatMap((l) => l.match(/\b[A-Z_]{2,}\b/g) ?? []);

  // Requested metrics — all uppercase tokens in the section (metric catalog keys)
  const requested_metrics = [...new Set(
    (text.match(/\b[A-Z_]{2,}\b/g) ?? []).filter((k) => !required_metrics.includes(k)),
  )];

  const user_type = extractUserType(usersText) ?? extractUserType(text);

  return { required_metrics, requested_metrics, suggestion_mode, user_type, analytical_depth };
}

function extractUserType(text: string): string | null {
  const lower = text.toLowerCase();
  if (/asset manager/.test(lower)) return "asset manager";
  if (/fund manager/.test(lower)) return "fund manager";
  if (/\b(investor|lp)\b/.test(lower)) return "investor";
  if (/\bic\b|investment committee/.test(lower)) return "ic";
  return null;
}

/* --------------------------------------------------------------------------
 * Table behavior parser
 * -------------------------------------------------------------------------- */
function parseTableBehavior(text: string): TableBehaviorHint {
  const lower = text.toLowerCase();

  if (/\bnone\b|\bno table\b|\bdo not include\b/.test(lower)) {
    return { include: false, visibility: "none", type_hint: null, columns_hint: [] };
  }

  // Include
  let include: boolean | "auto" = "auto";
  if (/\balways\b|\binclude\b|\byes\b/.test(lower)) include = true;

  // Visibility
  let visibility: TableVisibilityHint = "always";
  if (/on.select|on click|on selection/.test(lower)) visibility = "on_select";
  else if (/on.drill|drilldown|drill into/.test(lower)) visibility = "on_drill";
  else if (/expand|collaps|hidden/.test(lower)) visibility = "expandable";

  // Type hint
  let type_hint: string | null = null;
  if (/ranked|top.n|sort/.test(lower)) type_hint = "ranked_table";
  else if (/exception|watchlist|flag/.test(lower)) type_hint = "exceptions_table";
  else if (/summary|grouped|by segment|by market/.test(lower)) type_hint = "grouped_summary";
  else if (/detail|all.asset|all.item|transaction/.test(lower)) type_hint = "detail_grid";
  else if (/scorecard|comparison|vs /.test(lower)) type_hint = "comparison_scorecard";

  // Column hints — uppercase tokens
  const columns_hint = [...new Set(text.match(/\b[A-Z_]{2,}\b/g) ?? [])];

  return { include, visibility, type_hint, columns_hint };
}
