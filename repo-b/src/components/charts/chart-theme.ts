/**
 * Chart theme — shared colors, tooltip styles, and scenario palette
 * matching the bm-* design system.
 *
 * Uses CSS custom properties so charts adapt to light/dark mode.
 */

/** Resolve a CSS custom property at runtime (client only). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim() || fallback
  );
}

/* ── Static palette (works in SSR + client) ──────────────────────── */

export const CHART_COLORS = {
  /** Primary metric bars / lines — luminous accents (Bloomberg/terminal style) */
  revenue: "hsl(213, 94%, 62%)", // electric blue
  opex: "hsl(0, 84%, 58%)", // vivid red
  noi: "hsl(152, 72%, 48%)", // luminous green
  warning: "hsl(38, 92%, 55%)", // bright amber

  /** Muted / secondary */
  muted: "hsl(215, 12%, 72%)",
  muted2: "hsl(215, 10%, 58%)",

  /** Up to 5 scenario overlay colors */
  scenario: [
    "hsl(213, 94%, 62%)", // electric blue (base)
    "hsl(152, 72%, 48%)", // luminous green (upside)
    "hsl(38, 92%, 55%)", // bright amber (stress)
    "hsl(0, 84%, 58%)", // vivid red (downside)
    "hsl(275, 70%, 62%)", // bright purple (custom)
  ] as readonly string[],

  /** Waterfall special colors */
  waterfall: {
    positive: "hsl(152, 72%, 48%)",
    negative: "hsl(0, 84%, 58%)",
    total: "hsl(213, 94%, 62%)",
    invisible: "transparent",
  },

  /** Loan health indicator colors */
  loan: {
    healthy: "hsl(152, 72%, 48%)",
    watch: "hsl(38, 92%, 55%)",
    stress: "hsl(0, 84%, 58%)",
  },

  /** Grid & axis */
  grid: "hsl(215, 10%, 58%)",
  axis: "hsl(215, 12%, 72%)",
} as const;

/* ── Tooltip / label shared styles ───────────────────────────────── */

export const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "hsl(217, 29%, 9%)",
  border: "1px solid hsl(215, 10%, 58%)",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 12,
  color: "hsl(210, 24%, 94%)",
};

export const AXIS_TICK_STYLE = {
  fontSize: 11,
  fill: "hsl(215, 12%, 72%)",
} as const;

export const GRID_STYLE = {
  stroke: "hsl(215, 10%, 20%)",
  strokeDasharray: "3 3",
} as const;

/* ── Number formatting helpers ───────────────────────────────────── */

/** Format large numbers: 1234567 → "$1.23M" */
export function fmtCompact(value: number, prefix = "$"): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${prefix}${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}${(value / 1_000).toFixed(0)}K`;
  return `${prefix}${value.toFixed(0)}`;
}

/** Format as percentage: 0.93 → "93.0%" */
export function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Format as percentage when already in percent form: 5.2 → "5.20%" */
export function fmtPctRaw(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/* ── Runtime helpers (client only) ───────────────────────────────── */

export function getChartTextColor(): string {
  return cssVar("--bm-text-muted", "hsl(215, 12%, 72%)");
}

export function getChartBgColor(): string {
  return cssVar("--bm-surface", "hsl(217, 29%, 9%)");
}
