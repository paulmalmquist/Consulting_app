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
  /** Primary metric bars / lines — accent palette */
  revenue: "#38BDF8", // sky-400
  opex: "#F87171", // red-400
  noi: "#34D399", // emerald-400
  warning: "#FBBF24", // amber-400

  /** Muted / secondary */
  muted: "hsl(215, 12%, 72%)",
  muted2: "hsl(215, 10%, 58%)",

  /** Up to 5 scenario overlay colors */
  scenario: [
    "#38BDF8", // sky-400 — primary / base
    "#34D399", // emerald-400 — upside
    "#F87171", // red-400 — downside
    "#FBBF24", // amber-400 — neutral
    "#A78BFA", // violet-400 — scenario 5
  ] as readonly string[],

  /** Waterfall special colors */
  waterfall: {
    positive: "#34D399", // emerald-400
    negative: "#F87171", // red-400
    total: "#38BDF8", // sky-400
    invisible: "transparent",
  },

  /** Loan health indicator colors */
  loan: {
    healthy: "#34D399",
    watch: "#FBBF24",
    stress: "#F87171",
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
  fill: "rgba(107,114,128,0.8)",
} as const;

export const GRID_STYLE = {
  stroke: "rgba(107,114,128,0.2)",
  strokeDasharray: "3 3",
  strokeOpacity: 0.5,
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
