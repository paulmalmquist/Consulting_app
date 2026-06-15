"use client";

// Shared panel wrapper for the three chart panels. Mirrors RsPanel's visual language (title bar,
// radius 6, RS.line border) and adds the presenter-mode focus/dim treatment the prototype's
// spotlight relies on.
import React from "react";

import { RS, RS_MONO, RS_SANS } from "../../rsTokens";

export default function PanelShell({ title, sub, focused, dimmed, accent, children }: {
  title: string;
  sub?: string;
  focused?: boolean;
  dimmed?: boolean;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: RS.panel,
      border: `1px solid ${focused ? `${accent}66` : RS.line}`,
      boxShadow: focused ? `0 0 0 1px ${accent}40, 0 8px 30px rgba(0,0,0,0.35)` : "none",
      borderRadius: 6, overflow: "hidden",
      opacity: dimmed ? 0.45 : 1,
      transition: "opacity 600ms ease, border-color 600ms ease, box-shadow 600ms ease",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
        padding: "8px 12px", borderBottom: `1px solid ${RS.line}` }}>
        <span style={{ color: RS.dim, fontFamily: RS_SANS, fontSize: 11, letterSpacing: "0.12em",
          textTransform: "uppercase" }}>{title}</span>
        {sub && <span style={{ color: RS.faint, fontFamily: RS_MONO, fontSize: 9 }}>{sub}</span>}
      </div>
      <div style={{ padding: "8px 4px 0" }}>{children}</div>
    </div>
  );
}

// Coerce a recharts chart-state activeLabel (string | number | undefined) to a year, shared by the
// three panels' hover handlers.
export function yearFromChartState(state: { activeLabel?: unknown } | null | undefined): number | null {
  const v = state?.activeLabel;
  const y = typeof v === "number" ? v : v != null ? Number(v) : NaN;
  return Number.isFinite(y) ? y : null;
}
