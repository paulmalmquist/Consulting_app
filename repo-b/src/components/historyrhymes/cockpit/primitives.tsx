"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Regime, FreshnessVerdict } from "@/lib/historyrhymes/client";

// History Rhymes "Regime Cockpit" palette. Copy-adapted from the telemetry
// environment's primitives (repo-b/src/components/telemetry/primitives.tsx),
// NOT imported from it — environments stay standalone, so a telemetry restyle
// never silently restyles History Rhymes. The status color family (green /
// amber / red / cyan) is shared by value with telemetry for lab-wide status
// literacy; the bronze accent is the HR identity color.
export const C = {
  bg: "#07090c", rail: "#0a0d12", panel: "#0f141c", panelHi: "#131a24",
  border: "rgba(140,150,170,0.12)", borderHi: "rgba(140,150,170,0.24)",
  text: "#e8ecf2", dim: "#94a0b0", faint: "#5b6573",
  accent: "#d4a85a",
  cyan: "#3fb1e8", green: "#3ddc97", amber: "#f3b14a", red: "#ef7066",
  stagflation: "#e08e45",
  mono: "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace",
  sans: "'Söhne', 'Inter', -apple-system, system-ui, sans-serif",
};

// Regime -> accent color. `unknown`/null stays dim: an unknown regime is a
// statement about missing inputs, not a fifth market state.
export function regimeColor(regime?: Regime | null): string {
  switch (regime) {
    case "expansion": return C.green;
    case "recovery": return C.cyan;
    case "late_cycle": return C.amber;
    case "stagflation": return C.stagflation;
    case "crisis": return C.red;
    default: return C.dim;
  }
}

export function freshnessVerdictColor(v?: FreshnessVerdict | null): string {
  if (v === "fresh") return C.green;
  if (v === "stale_snapshot" || v === "stale_brief") return C.amber;
  if (v === "no_brief" || v === "no_snapshot") return C.red;
  return C.dim;
}

export type SignalStatus = "fresh" | "stale" | "missing" | "degraded";

const STATUS_COLOR: Record<SignalStatus, string> = {
  fresh: C.green, stale: C.amber, missing: C.faint, degraded: C.red,
};

export function StatusChip({ status }: { status: SignalStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span data-testid="hr-status-chip" data-status={status}
      style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
        color, background: color + "16", border: `1px solid ${color}38`, borderRadius: 4, padding: "1px 6px" }}>
      {status}
    </span>
  );
}

// Freshness dot, porting PulseStrip's age mapping: fresh/0-1d green, 2-3d amber,
// 4d+/stale red, anything unrecognized dim.
export function FreshnessDot({ ageLabel }: { ageLabel?: string | null }) {
  let color = C.faint;
  if (ageLabel != null) {
    const v = String(ageLabel).toLowerCase();
    if (v === "fresh" || v === "0d" || v === "1d") color = C.green;
    else if (v === "2d" || v === "3d") color = C.amber;
    else if (v === "stale" || /^\d+d$/.test(v)) color = C.red;
  }
  return (
    <span data-testid="hr-freshness-dot"
      style={{ width: 7, height: 7, borderRadius: 999, background: color,
        boxShadow: color === C.faint ? "none" : `0 0 7px ${color}`, display: "inline-block", flexShrink: 0 }} />
  );
}

export function Tag({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
      color, background: color + "18", border: `1px solid ${color}40`, borderRadius: 5, padding: "2px 7px" }}>
      {children}
    </span>
  );
}

export function Panel({ title, right, children, pad = 18, style }: {
  title?: string; right?: ReactNode; children: ReactNode; pad?: number; style?: CSSProperties;
}) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.13em", color: C.faint, textTransform: "uppercase" }}>{title}</span>
          {right}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

export function MetricCard({ label, value, sub, accent }: {
  label: string; value: ReactNode; sub?: ReactNode; accent?: string;
}) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: 14 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: C.sans, fontSize: 24, fontWeight: 600, color: accent || C.text, marginTop: 6, lineHeight: 1 }}>{value}</div>
      {sub != null && <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <Panel><span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{label}</span></Panel>;
}

// The honesty primitives. Both require a concrete reason string by type —
// a zone can only render degraded/empty through these, so "friendly UI"
// passes cannot quietly drop the reason.

export function DegradedNote({ reason, refusal }: { reason: string; refusal?: string }) {
  return (
    <div data-testid="hr-degraded-note"
      style={{ border: `1px solid ${C.red}55`, background: C.red + "0d", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.red, letterSpacing: "0.04em" }}>
        degraded: {reason}
      </div>
      {refusal && (
        <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>{refusal}</div>
      )}
    </div>
  );
}

export function CockpitEmptyState({ zone, reason, hint }: { zone: string; reason: string; hint?: string }) {
  return (
    <div data-testid="hr-empty-state" data-zone={zone}
      style={{ border: `1px dashed ${C.borderHi}`, borderRadius: 8, padding: "18px 16px", textAlign: "center" }}>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.amber }}>{zone}: {reason}</div>
      {hint && <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

export function PageHeading({ eyebrow, title, blurb, right }: {
  eyebrow: string; title: string; blurb?: string; right?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", color: C.accent, textTransform: "uppercase" }}>{eyebrow}</div>
          <h1 style={{ fontFamily: C.sans, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 6, color: C.text }}>{title}</h1>
        </div>
        {right}
      </div>
      {blurb && <p style={{ fontFamily: C.sans, fontSize: 14, color: C.dim, lineHeight: 1.55, marginTop: 12, maxWidth: 760 }}>{blurb}</p>}
    </div>
  );
}

// Responsive layout helpers (telemetry mobile-refactor pattern): layout lives
// in literal Tailwind classes; color/typography stay on the inline palette.

const STAT_GRID_COLS: Record<3 | 4 | 5, string> = {
  3: "grid grid-cols-2 gap-3 lg:grid-cols-3",
  4: "grid grid-cols-2 gap-3 lg:grid-cols-4",
  5: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5",
};

export function StatGrid({ cols = 4, style, children }: {
  cols?: 3 | 4 | 5; style?: CSSProperties; children: ReactNode;
}) {
  return <div className={STAT_GRID_COLS[cols]} style={style}>{children}</div>;
}

export type SplitVariant = "main-side" | "two-one" | "halves";

const SPLIT_GRID_COLS: Record<SplitVariant, string> = {
  "main-side": "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]",
  "two-one": "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
  halves: "grid grid-cols-1 gap-4 lg:grid-cols-2",
};

export function SplitGrid({ variant, style, children }: {
  variant: SplitVariant; style?: CSSProperties; children: ReactNode;
}) {
  return <div className={SPLIT_GRID_COLS[variant]} style={style}>{children}</div>;
}
