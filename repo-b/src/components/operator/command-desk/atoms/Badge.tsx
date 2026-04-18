import type { ReactNode } from "react";

export type BadgeTone =
  | "live"
  | "up"
  | "down"
  | "error"
  | "warn"
  | "manual"
  | "stale"
  | "tag"
  | "route"
  | "lime"
  | "neutral"
  | "info";

type BadgeProps = {
  tone?: BadgeTone;
  children: ReactNode;
  glow?: boolean;
  size?: "sm" | "md";
};

type ToneStyle = { fg: string; bg: string; bd: string; dashed?: boolean };

const TONES: Record<BadgeTone, ToneStyle> = {
  live:    { fg: "var(--neon-cyan)",    bg: "rgba(0,229,255,.1)",   bd: "rgba(0,229,255,.3)" },
  info:    { fg: "var(--neon-cyan)",    bg: "rgba(0,229,255,.1)",   bd: "rgba(0,229,255,.3)" },
  up:      { fg: "var(--sem-up)",       bg: "rgba(0,229,160,.1)",   bd: "rgba(0,229,160,.3)" },
  down:    { fg: "var(--sem-down)",     bg: "rgba(255,59,92,.1)",   bd: "rgba(255,59,92,.3)" },
  error:   { fg: "var(--bg-void)",      bg: "var(--sem-error)",      bd: "var(--sem-error)" },
  warn:    { fg: "var(--neon-amber)",   bg: "rgba(255,176,32,.1)",  bd: "rgba(255,176,32,.35)" },
  manual:  { fg: "var(--neon-amber)",   bg: "rgba(255,176,32,.06)", bd: "rgba(255,176,32,.5)", dashed: true },
  stale:   { fg: "var(--fg-3)",         bg: "transparent",           bd: "var(--line-2)" },
  tag:     { fg: "var(--neon-violet)",  bg: "rgba(176,124,255,.08)", bd: "rgba(176,124,255,.3)" },
  route:   { fg: "var(--neon-magenta)", bg: "rgba(255,46,154,.08)",  bd: "rgba(255,46,154,.3)" },
  lime:    { fg: "var(--neon-lime)",    bg: "rgba(158,255,0,.08)",   bd: "rgba(158,255,0,.35)" },
  neutral: { fg: "var(--fg-2)",         bg: "var(--bg-panel-2)",     bd: "var(--line-2)" },
};

export function Badge({ tone = "neutral", children, glow = false, size = "md" }: BadgeProps) {
  const t = TONES[tone];
  const px = size === "sm" ? "2px 5px" : "3px 7px";
  const fs = size === "sm" ? 9 : 10;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: fs,
        fontWeight: 500,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        padding: px,
        borderRadius: 2,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        lineHeight: 1,
        color: t.fg,
        background: t.bg,
        border: `1px ${t.dashed ? "dashed" : "solid"} ${t.bd}`,
        boxShadow: glow ? `0 0 10px ${t.fg}55` : "none",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
