"use client";

import type { RoutingHealth } from "@/lib/cro-api";

const TONE_STYLES = {
  green: {
    bg: "rgba(0, 229, 160, 0.12)",
    border: "rgba(0, 229, 160, 0.45)",
    fg: "#00E5A0",
    label: "GREEN",
  },
  yellow: {
    bg: "rgba(255, 176, 32, 0.12)",
    border: "rgba(255, 176, 32, 0.45)",
    fg: "#FFB020",
    label: "YELLOW",
  },
  red: {
    bg: "rgba(255, 59, 92, 0.12)",
    border: "rgba(255, 59, 92, 0.45)",
    fg: "#FF3B5C",
    label: "RED",
  },
} as const;

export function RoutingHealthBadge({ health, size = "sm" }: { health: RoutingHealth; size?: "sm" | "md" }) {
  const tone = TONE_STYLES[health.routing_health_status];
  const padding = size === "md" ? "4px 10px" : "2px 8px";
  const fontSize = size === "md" ? 11 : 10;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.fg,
        fontFamily: "var(--font-jetbrains-mono)",
        fontSize,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        borderRadius: 2,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: tone.fg,
          boxShadow: `0 0 6px ${tone.fg}`,
        }}
      />
      {tone.label}
    </span>
  );
}

export function CompoundingBadge({ health }: { health: RoutingHealth }) {
  const compounding = health.novendor_compounding_status;
  const tone =
    compounding === "compounds"
      ? TONE_STYLES.green
      : compounding === "partial"
        ? TONE_STYLES.yellow
        : TONE_STYLES.red;
  const label =
    compounding === "compounds"
      ? "COMPOUNDS NOVENDOR"
      : compounding === "partial"
        ? "FIX ROUTING GAPS"
        : "PERSONAL DEAL / NON-COMPOUNDING";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.fg,
        fontFamily: "var(--font-jetbrains-mono)",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        borderRadius: 2,
      }}
    >
      {label}
    </span>
  );
}
