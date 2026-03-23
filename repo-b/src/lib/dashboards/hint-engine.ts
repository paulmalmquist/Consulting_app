/**
 * Hint Engine — generates context-aware suggestion chips for the dashboard prompt.
 *
 * Reads app context (current page entity, visible data, scope) and generates
 * relevant hint chips that guide the user toward useful dashboard configurations.
 */

import type { HintChip } from "./types";

export interface HintContext {
  entity_type?: "asset" | "investment" | "fund" | "portfolio" | null;
  entity_id?: string | null;
  entity_name?: string | null;
  property_type?: string | null;
  market?: string | null;
  quarter?: string | null;
  has_prompt?: boolean;
  prompt_text?: string;
}

/* --------------------------------------------------------------------------
 * Hint generators by context
 * -------------------------------------------------------------------------- */

function baseHints(): HintChip[] {
  return [
    { label: "Add NOI trend", action: "append", text: " with NOI trend over time", category: "metric" },
    { label: "Compare to budget", action: "append", text: " comparing actual vs budget", category: "comparison" },
    { label: "Show top underperformers", action: "append", text: " highlighting underperforming assets", category: "filter" },
    { label: "Add export table", action: "append", text: " with a downloadable summary table", category: "export" },
    { label: "Convert to monthly report", action: "append", text: " formatted as a monthly operating report", category: "layout" },
  ];
}

function assetHints(ctx: HintContext): HintChip[] {
  const hints: HintChip[] = [
    { label: "NOI bridge", action: "append", text: " with NOI waterfall bridge", category: "metric" },
    { label: "Occupancy trend", action: "append", text: " showing occupancy over time", category: "metric" },
    { label: "Cash flow detail", action: "append", text: " with cash flow statement including debt service", category: "metric" },
    { label: "DSCR monitoring", action: "append", text: " with DSCR trend and 1.25x covenant line", category: "metric" },
  ];
  if (ctx.property_type) {
    hints.push({
      label: `${ctx.property_type} benchmarks`,
      action: "append",
      text: ` benchmarked against ${ctx.property_type} sector averages`,
      category: "comparison",
    });
  }
  return hints;
}

function investmentHints(): HintChip[] {
  return [
    { label: "Return metrics", action: "append", text: " with IRR, MOIC, and equity multiple", category: "metric" },
    { label: "Capital structure", action: "append", text: " showing debt/equity composition and LTV", category: "metric" },
    { label: "Asset contribution", action: "append", text: " breaking down contribution by asset", category: "scope" },
    { label: "UW vs actual", action: "append", text: " comparing underwritten vs realized performance", category: "comparison" },
  ];
}

function fundHints(): HintChip[] {
  return [
    { label: "Portfolio NAV", action: "append", text: " with portfolio NAV rollforward", category: "metric" },
    { label: "TVPI / DPI waterfall", action: "append", text: " showing TVPI and DPI over time", category: "metric" },
    { label: "Sector exposure", action: "append", text: " with sector and geographic allocation breakdown", category: "scope" },
    { label: "LP capital activity", action: "append", text: " tracking contributions and distributions", category: "metric" },
    { label: "Watchlist view", action: "replace", text: "Build an IC watchlist for underperforming investments with NOI variance, DSCR, and occupancy flags", category: "layout" },
  ];
}

function emptyPromptHints(): HintChip[] {
  return [
    {
      label: "Multifamily operating review",
      action: "replace",
      text: "Build a dashboard for multifamily assets with NOI, occupancy, DSCR, and debt maturity",
      category: "layout",
    },
    {
      label: "Fund quarterly summary",
      action: "replace",
      text: "Create a fund quarterly report with NAV, TVPI, DPI, capital activity, and sector exposure",
      category: "layout",
    },
    {
      label: "Market comparison",
      action: "replace",
      text: "Compare Phoenix vs Denver performance across NOI, occupancy, and cap rates",
      category: "layout",
    },
    {
      label: "IC watchlist",
      action: "replace",
      text: "Make an IC-ready watchlist for underperforming investments with variance analysis",
      category: "layout",
    },
  ];
}

/* --------------------------------------------------------------------------
 * Main hint generator
 * -------------------------------------------------------------------------- */

export function generateHints(ctx: HintContext): HintChip[] {
  // If no prompt yet, show starter suggestions
  if (!ctx.has_prompt || !ctx.prompt_text?.trim()) {
    return emptyPromptHints();
  }

  // Context-aware hints
  const hints: HintChip[] = [];

  switch (ctx.entity_type) {
    case "asset":
      hints.push(...assetHints(ctx));
      break;
    case "investment":
      hints.push(...investmentHints());
      break;
    case "fund":
    case "portfolio":
      hints.push(...fundHints());
      break;
    default:
      hints.push(...baseHints());
  }

  // Filter out hints that are already in the prompt
  const promptLower = (ctx.prompt_text || "").toLowerCase();
  return hints.filter((h) => {
    const keywords = h.text.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const alreadyPresent = keywords.filter((k) => promptLower.includes(k)).length;
    return alreadyPresent < keywords.length * 0.5;
  }).slice(0, 6);
}
