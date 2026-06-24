"use client";

// RS Demo design language — shared tokens + primitives for the three RS surfaces
// (Mission Control stream, Model Registry console, Factory/NCR Intelligence) + the Bottleneck Map.
//
// Palette unification (telemetry refactor): the base/accent tokens now source from the canonical
// telemetry `C` palette so RS surfaces share ONE token system. The RS accent hexes were already
// byte-identical to C (cyan/amber/red/green); base tones snap to C with no layout change. Only the
// RS-specific chart-scale colors (teal/violet/blue + bottleneck bar/crosshair fills), which have no
// `C` equivalent, keep their literal hexes. Component shapes (RsPanel/RsChip/RsKpi) are unchanged —
// this is a recolor, not a restructure. Folding RsPanel/RsChip/RsKpi into the C primitives is a later
// screenshot-gated pass.
import React from "react";
import { C } from "./primitives";

export const RS = {
  bg: C.bg, panel: C.panel, panelAlt: C.panelHi, line: C.border,
  text: C.text, dim: C.dim, faint: C.faint,
  teal: "#4FD1C5", cyan: C.cyan, amber: C.amber, red: C.red,
  green: C.green, violet: "#A78BFA", blue: "#6CA8F0", gray: "#3D4D60",
  // RS-specific chart-scale tokens (no C equivalent) used by the Bottleneck Map context module.
  crosshair: "#3D567A", barFill: "#22324A", barFillHot: "#2E4A6E",
};
export const RS_MONO = C.mono;
export const RS_SANS = C.sans;

export function RsPanel({ title, right, children, style }: {
  title?: string; right?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={{ background: RS.panel, border: `1px solid ${RS.line}`, borderRadius: 6,
      overflow: "hidden", display: "flex", flexDirection: "column", ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderBottom: `1px solid ${RS.line}` }}>
          <span style={{ color: RS.dim, fontFamily: RS_SANS, fontSize: 11, letterSpacing: "0.12em" }}>
            {title}
          </span>
          {right}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

export function RsChip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ color, border: `1px solid ${color}55`, background: `${color}14`,
      fontFamily: RS_MONO, fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>
      {children}
    </span>
  );
}

export function RsKpi({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{ background: RS.panel, border: `1px solid ${RS.line}`, borderRadius: 6,
      padding: "10px 12px", flex: 1 }}>
      <div style={{ color: RS.faint, fontSize: 11, marginBottom: 2, fontFamily: RS_SANS }}>{label}</div>
      <div style={{ fontFamily: RS_MONO, fontSize: 20, color: color || RS.text }}>{value}</div>
      {sub && <div style={{ color: RS.dim, fontSize: 10, fontFamily: RS_SANS }}>{sub}</div>}
    </div>
  );
}
