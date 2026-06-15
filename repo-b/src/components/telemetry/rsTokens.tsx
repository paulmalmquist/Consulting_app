"use client";

// RS Demo design language — shared tokens + primitives for the three RS surfaces
// (Mission Control stream, Model Registry console, Factory/NCR Intelligence), ported from the
// rs_jsx/ design templates. Existing telemetry pages keep primitives.tsx untouched.
import React from "react";

export const RS = {
  bg: "#0A0F16", panel: "#0F1622", panelAlt: "#121B2A", line: "#1D2A3B",
  text: "#D7E2EC", dim: "#7E93A8", faint: "#54677A",
  teal: "#4FD1C5", cyan: "#67E8F9", amber: "#F5B452", red: "#F4715F",
  green: "#6EE7A0", violet: "#A78BFA", blue: "#6CA8F0", gray: "#3D4D60",
  // Chart-scale tokens used by the Bottleneck Map context module.
  crosshair: "#3D567A", barFill: "#22324A", barFillHot: "#2E4A6E",
};
export const RS_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const RS_SANS = "Inter, 'Helvetica Neue', Arial, sans-serif";

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
