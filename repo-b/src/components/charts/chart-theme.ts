/**
 * Winston Decision Engine — Chart Theme (Theme-Aware)
 *
 * All chart styling reads CSS variables at call time so charts
 * automatically reflect the current dark/light theme.
 *
 * Static exports (CHART_COLORS, TOOLTIP_STYLE, etc.) are kept
 * for backward compatibility and SSR. Use the getter functions
 * (getChartColors, getTooltipStyle, etc.) for theme-aware rendering.
 */

/** Resolve a CSS custom property at runtime (client only). */
function getCSSVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim() || fallback
  );
}

/* ── Theme-aware getters (call at render time) ─────────────────── */

export function getChartColors() {
  return {
    primary:   getCSSVar("--bm-accent-hex",  "#38bdf8"),
    secondary: getCSSVar("--bm-purple",      "#a78bfa"),
    tertiary:  getCSSVar("--bm-warning-hex", "#fbbf24"),

    success:   getCSSVar("--bm-success-hex", "#34d399"),
    danger:    getCSSVar("--bm-danger-hex",  "#f87171"),
    warning:   getCSSVar("--bm-warning-hex", "#fbbf24"),
    neutral:   getCSSVar("--bm-chart-axis",  "#64748b"),

    // Legacy compat
    revenue:   getCSSVar("--bm-accent-hex",  "#38bdf8"),
    noi:       getCSSVar("--bm-success-hex", "#34d399"),
    opex:      getCSSVar("--bm-danger-hex",  "#f87171"),

    scenario: [
      getCSSVar("--bm-accent-hex",  "#38bdf8"),
      getCSSVar("--bm-success-hex", "#34d399"),
      getCSSVar("--bm-warning-hex", "#fbbf24"),
      getCSSVar("--bm-danger-hex",  "#f87171"),
      getCSSVar("--bm-purple",      "#a78bfa"),
      getCSSVar("--bm-pink",        "#f472b6"),
    ] as readonly string[],

    waterfall: {
      positive:  getCSSVar("--bm-success-hex", "#34d399"),
      negative:  getCSSVar("--bm-danger-hex",  "#f87171"),
      total:     getCSSVar("--bm-accent-hex",  "#38bdf8"),
      invisible: "transparent",
    },

    loan: {
      healthy: getCSSVar("--bm-success-hex", "#34d399"),
      watch:   getCSSVar("--bm-warning-hex", "#fbbf24"),
      stress:  getCSSVar("--bm-danger-hex",  "#f87171"),
    },

    layers: {
      reality:     getCSSVar("--bm-layer-reality",     "#34d399"),
      data:        getCSSVar("--bm-layer-data",         "#38bdf8"),
      narrative:   getCSSVar("--bm-layer-narrative",    "#fbbf24"),
      positioning: getCSSVar("--bm-layer-positioning",  "#a78bfa"),
      meta:        getCSSVar("--bm-layer-meta",         "#f87171"),
    },

    grid:       getCSSVar("--bm-chart-grid",       "#1c263850"),
    axis:       getCSSVar("--bm-chart-axis",       "#475569"),
    background: getCSSVar("--bm-chart-tooltip-bg", "#0b0f16"),
  };
}

export function getTooltipStyle(): React.CSSProperties {
  return {
    backgroundColor: getCSSVar("--bm-chart-tooltip-bg", "#0b0f16"),
    border: `1px solid ${getCSSVar("--bm-chart-tooltip-border", "#283548")}`,
    borderRadius: "6px",
    fontSize: "11px",
    color: getCSSVar("--bm-text", "#e8ecf1"),
    padding: "8px 12px",
    boxShadow: getCSSVar("--bm-shadow-md", "0 4px 12px rgba(0,0,0,0.5)"),
  };
}

export function getAxisTickStyle() {
  return {
    fill: getCSSVar("--bm-chart-axis", "#475569"),
    fontSize: 10,
  };
}

export function getGridStyle() {
  return {
    strokeDasharray: "3 3",
    stroke: getCSSVar("--bm-chart-grid", "#1c263850"),
  };
}

export function getAxisLineStyle() {
  return { stroke: getCSSVar("--bm-chart-grid", "#1c263850") };
}

/* ── Static fallbacks (backward compat + SSR) ──────────────────── */

export const CHART_COLORS = {
  revenue: "#38BDF8",
  opex: "#F87171",
  noi: "#34D399",
  warning: "#FBBF24",
  muted: "hsl(215, 12%, 72%)",
  muted2: "hsl(215, 10%, 58%)",
  scenario: ["#38BDF8", "#34D399", "#F87171", "#FBBF24", "#A78BFA", "#F472B6"] as readonly string[],
  waterfall: { positive: "#34D399", negative: "#F87171", total: "#38BDF8", invisible: "transparent" },
  loan: { healthy: "#34D399", watch: "#FBBF24", stress: "#F87171" },
  grid: "hsl(215, 10%, 58%)",
  axis: "hsl(215, 12%, 72%)",
} as const;

export const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "hsl(217, 29%, 9%)",
  border: "1px solid hsl(215, 10%, 58%)",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 12,
  color: "hsl(210, 24%, 94%)",
};

export const AXIS_TICK_STYLE = { fontSize: 11, fill: "rgba(107,114,128,0.8)" } as const;
export const GRID_STYLE = { stroke: "rgba(107,114,128,0.2)", strokeDasharray: "3 3", strokeOpacity: 0.5 } as const;

/* ── Number formatting helpers ─────────────────────────────────── */

export function fmtCompact(value: number, prefix = "$"): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${prefix}${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}${(value / 1_000).toFixed(0)}K`;
  return `${prefix}${value.toFixed(0)}`;
}

export function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function fmtPctRaw(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function getChartTextColor(): string {
  return getCSSVar("--bm-text-muted", "hsl(215, 12%, 72%)");
}

export function getChartBgColor(): string {
  return getCSSVar("--bm-surface", "hsl(217, 29%, 9%)");
}
