"use client";

import type { CSSProperties, ReactNode } from "react";
import { C, Panel, EmptyState } from "./primitives";

// ===========================================================================
// Chart chrome primitives. These own the *frame* around a chart — title, legend,
// caption, accessible label, and the empty state — so the chart body (recharts
// container or raw SVG) only carries geometry. Geometry/coordinates stay inline
// in the chart body; the chrome stops being copy-pasted.
// ---------------------------------------------------------------------------

export type LegendItem = { label: string; color: string; dashed?: boolean };

// Swatch + label legend. A dashed item renders a line instead of a filled chip.
export function TelemetryLegend({ items, style }: { items: LegendItem[]; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 16px", ...style }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          {it.dashed ? (
            <span aria-hidden style={{ width: 16, height: 0, borderTop: `2px dashed ${it.color}` }} />
          ) : (
            <span aria-hidden style={{ width: 11, height: 11, borderRadius: 3, background: it.color }} />
          )}
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{it.label}</span>
        </span>
      ))}
    </div>
  );
}

// Framed chart. Pass recharts ResponsiveContainer or an <svg> as children.
// When `empty` is true, renders the designed fail-closed EmptyState instead of a
// broken/blank chart (per the Charts component contract).
export function TelemetryChartFrame({
  title, right, legend, caption, ariaLabel, empty, emptyLabel = "No data to plot",
  emptyHint = "evidence unavailable", pad = 12, children,
}: {
  title?: string;
  right?: ReactNode;
  legend?: LegendItem[];
  caption?: ReactNode;
  ariaLabel?: string;
  empty?: boolean;
  emptyLabel?: string;
  emptyHint?: string;
  pad?: number;
  children: ReactNode;
}) {
  return (
    <Panel title={title} right={right} pad={pad}>
      {legend && legend.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <TelemetryLegend items={legend} />
        </div>
      )}
      {empty ? (
        <EmptyState label={emptyLabel} hint={emptyHint} />
      ) : (
        <figure style={{ margin: 0 }} role="group" aria-label={ariaLabel}>
          {children}
          {caption && (
            <figcaption style={{ textAlign: "center", fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 6 }}>
              {caption}
            </figcaption>
          )}
        </figure>
      )}
    </Panel>
  );
}
