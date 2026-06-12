"use client";

import type { CSSProperties, ReactNode } from "react";

// Option B "Lab Workbench" palette — ported verbatim from OptionB_DataBound_Overview.jsx.
// Self-contained inline-style tokens so the telemetry console is dark regardless of the global theme.
export const C = {
  bg: "#06090d", rail: "#0a0e14", panel: "#0e141d", panelHi: "#121a25",
  border: "rgba(110,150,190,0.12)", borderHi: "rgba(110,150,190,0.24)",
  text: "#e6edf4", dim: "#8a98aa", faint: "#56616f",
  cyan: "#3fb1e8", green: "#3ddc97", amber: "#f3b14a", red: "#ef7066",
  mono: "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace",
  sans: "'Söhne', 'Inter', -apple-system, system-ui, sans-serif",
};

// Verdict -> accent color (GO green, REVIEW amber, NO_GO red, else dim).
export function verdictColor(v?: string | null): string {
  if (v === "GO") return C.green;
  if (v === "REVIEW") return C.amber;
  if (v === "NO_GO" || v === "NO-GO") return C.red;
  return C.dim;
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
      <div style={{ fontFamily: C.sans, fontSize: 26, fontWeight: 600, color: accent || C.text, marginTop: 6, lineHeight: 1 }}>{value}</div>
      {sub != null && <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{ border: `1px dashed ${C.borderHi}`, borderRadius: 8, padding: "18px 16px", textAlign: "center" }}>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.amber }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>{hint}</div>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <Panel><span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{label}</span></Panel>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Panel style={{ borderColor: C.red + "55" }}>
      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.red }}>Could not load: {message}</span>
    </Panel>
  );
}

// Page heading (eyebrow + title + optional blurb), Option B style.
export function PageHeading({ eyebrow, title, blurb, right }: {
  eyebrow: string; title: string; blurb?: string; right?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", color: C.cyan, textTransform: "uppercase" }}>{eyebrow}</div>
          <h1 style={{ fontFamily: C.sans, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 6, color: C.text }}>{title}</h1>
        </div>
        {right}
      </div>
      {blurb && <p style={{ fontFamily: C.sans, fontSize: 14, color: C.dim, lineHeight: 1.55, marginTop: 12, maxWidth: 760 }}>{blurb}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Responsive layout primitives. Layout lives in literal Tailwind classes
// (never composed from props — the content scanner only sees literal strings);
// color/typography stay on the inline palette above. Content reflows at `sm`
// and `lg`; the shell's rail/drawer split is also at `lg`.
// ---------------------------------------------------------------------------

const STAT_GRID_COLS: Record<3 | 4 | 5, string> = {
  3: "grid grid-cols-2 gap-3 lg:grid-cols-3",
  4: "grid grid-cols-2 gap-3 lg:grid-cols-4",
  5: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5",
};

// Metric-card strip: 2-up on phones, full width count on desktop.
export function StatGrid({ cols = 4, style, children }: {
  cols?: 3 | 4 | 5; style?: CSSProperties; children: ReactNode;
}) {
  return <div className={STAT_GRID_COLS[cols]} style={style}>{children}</div>;
}

export type SplitVariant = "main-side" | "wide-main-side" | "halves" | "thirds";

const SPLIT_GRID_COLS: Record<SplitVariant, string> = {
  "main-side": "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]",
  "wide-main-side": "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]",
  halves: "grid grid-cols-1 gap-4 lg:grid-cols-2",
  thirds: "grid grid-cols-1 gap-4 sm:grid-cols-3",
};

// Two-panel (or three-panel) splits that stack vertically on phones.
export function SplitGrid({ variant, style, children }: {
  variant: SplitVariant; style?: CSSProperties; children: ReactNode;
}) {
  return <div className={SPLIT_GRID_COLS[variant]} style={style}>{children}</div>;
}

// Horizontal-scroll wrapper for numeric matrices that have no sane card form.
export function ScrollTable({ minWidth = 640, children }: { minWidth?: number; children: ReactNode }) {
  return (
    <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

// CSS-only mobile/desktop swap (no useIsMobile — zero hydration risk). Both
// branches render; keep row counts small where this wraps tables.
export function ResponsiveSwap({ mobile, desktop }: { mobile: ReactNode; desktop: ReactNode }) {
  return (
    <>
      <div className="sm:hidden">{mobile}</div>
      <div className="hidden sm:block">{desktop}</div>
    </>
  );
}

// Uniform mobile representation of a table row: title line, optional tags,
// then label/value pairs in a 2-col mono grid.
export function RowCard({ title, tags, fields, onClick, active }: {
  title: ReactNode;
  tags?: ReactNode;
  fields: { label: string; value: ReactNode }[];
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text, fontWeight: 600 }}>{title}</span>
        {tags && <span style={{ display: "flex", gap: 6, alignItems: "center" }}>{tags}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px", marginTop: 10 }}>
        {fields.map((f) => (
          <div key={f.label}>
            <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" }}>{f.label}</div>
            <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, marginTop: 3 }}>{f.value}</div>
          </div>
        ))}
      </div>
    </>
  );
  const style: CSSProperties = {
    background: active ? C.panelHi : C.panel,
    border: `1px solid ${active ? C.borderHi : C.border}`,
    borderRadius: 9, padding: 12, textAlign: "left", width: "100%",
  };
  if (onClick) {
    return <button type="button" onClick={onClick} style={{ ...style, cursor: "pointer", display: "block" }}>{body}</button>;
  }
  return <div style={style}>{body}</div>;
}

// Public-data + backfill disclosure (the UI never overclaims).
export function DisclosureFooter() {
  return (
    <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6,
      borderTop: `1px solid ${C.border}`, paddingTop: 18, marginTop: 18 }}>
      Built on public NASA aerospace analog datasets — C-MAPSS turbofan RUL (active), N-CMAPSS and IMS
      bearing (planned), SMAP/MSL telemanom (legacy anomaly baseline). Not proprietary data. SMAP/MSL
      has documented benchmark criticism and its point-adjusted F1 inflates; it is reported with the
      adjustment named, beside honest point-wise metrics. Operational history is a deterministic backfill
      from those public datasets (real champion outputs, real labeled windows, real PSI); live /score
      receipts continue from current time.
    </p>
  );
}
