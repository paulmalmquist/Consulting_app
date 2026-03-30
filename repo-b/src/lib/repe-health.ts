/**
 * Deterministic health classification for REPE assets.
 *
 * Rules:
 *   RED    — DSCR < 1.1 OR LTV > 75%
 *   YELLOW — DSCR 1.1–1.25 OR LTV 65–75%
 *   GREEN  — all metrics within safe thresholds
 *
 * All inputs come from re_asset_quarter_state snapshots.
 */

export type HealthColor = "green" | "yellow" | "red";

export function computeHealthColor(
  dscr: number | null | undefined,
  ltv: number | null | undefined,
  occupancy?: number | null | undefined,
): HealthColor {
  const d = dscr != null ? Number(dscr) : null;
  const l = ltv != null ? Number(ltv) : null;

  // Red: any breach threshold
  if (d != null && d < 1.1) return "red";
  if (l != null && l > 0.75) return "red";

  // Yellow: watch range
  if (d != null && d < 1.25) return "yellow";
  if (l != null && l > 0.65) return "yellow";

  // Green: safe
  return "green";
}

export function healthLabel(color: HealthColor): string {
  switch (color) {
    case "red": return "Distressed";
    case "yellow": return "Watch";
    case "green": return "Healthy";
  }
}

export const HEALTH_DOT_CLASSES: Record<HealthColor, string> = {
  green: "bg-green-400",
  yellow: "bg-amber-400",
  red: "bg-red-400",
};

export const HEALTH_BADGE_CLASSES: Record<HealthColor, string> = {
  green: "bg-green-500/10 text-green-400",
  yellow: "bg-amber-500/10 text-amber-400",
  red: "bg-red-500/10 text-red-400",
};
