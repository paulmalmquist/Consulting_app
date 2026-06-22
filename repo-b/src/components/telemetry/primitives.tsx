"use client";

import type { CSSProperties, ReactNode } from "react";

// Telemetry workbench palette, aligned to the Mission Control / RS visual language (brighter text,
// brighter accents, deeper blue-black panels) for a polished aerospace operating feel. Self-contained
// inline-style tokens so the console is dark regardless of the global theme. Token NAMES are stable —
// every telemetry surface consumes these, so only the values move (toward RS) here.
export const C = {
  bg: "#070b11", rail: "#0a0f16", panel: "#0f1622", panelHi: "#14202f",
  border: "rgba(120,162,205,0.16)", borderHi: "rgba(120,162,205,0.30)",
  // text brighter; "dim" (secondary) and "faint" (labels) raised so important facts read clearly.
  text: "#e9eff6", dim: "#9fb0c4", faint: "#6f7e90",
  // RS signal accents (match Mission Control): high-contrast cyan/green/amber/red.
  cyan: "#67e8f9", green: "#6ee7a0", amber: "#f5b452", red: "#f4715f",
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "11px 16px", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.018)" }}>
          {/* Panel titles read as labels but stay legible — brighter than the old faint gray. */}
          <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", color: C.dim, textTransform: "uppercase" }}>{title}</span>
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
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: 15 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.11em", color: C.dim, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: C.sans, fontSize: 30, fontWeight: 600, color: accent || C.text, marginTop: 8, lineHeight: 1 }}>{value}</div>
      {sub != null && <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 7 }}>{sub}</div>}
    </div>
  );
}

// Intentional "fail-closed / nothing here yet" state — a designed card with an amber status dot,
// NOT a broken-looking dashed box. Used wherever a real value is honestly unavailable.
export function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{ border: `1px solid ${C.amber}33`, background: `${C.amber}0d`, borderRadius: 9, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: C.amber, boxShadow: `0 0 8px ${C.amber}99`, flexShrink: 0 }} />
        <span style={{ fontFamily: C.mono, fontSize: 13, color: C.amber, letterSpacing: "0.02em" }}>{label}</span>
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.dim, marginTop: 8, lineHeight: 1.55, paddingLeft: 17 }}>{hint}</div>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <Panel>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontFamily: C.mono, fontSize: 12.5, color: C.dim }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: C.cyan, boxShadow: `0 0 8px ${C.cyan}99` }} />
        {label}
      </span>
    </Panel>
  );
}

// Intentional unavailable/error state — composed card with a red status dot, reads as a deliberate
// fail-closed posture rather than a crash.
export function ErrorState({ message }: { message: string }) {
  return (
    <Panel style={{ borderColor: C.red + "55" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: C.red, boxShadow: `0 0 8px ${C.red}99`, flexShrink: 0 }} />
        <span style={{ fontFamily: C.mono, fontSize: 12.5, color: C.red }}>Could not load: {message}</span>
      </div>
    </Panel>
  );
}

// Page heading (accent eyebrow bar + large title + brighter blurb), Mission Control style.
export function PageHeading({ eyebrow, title, blurb, right }: {
  eyebrow: string; title: string; blurb?: string; right?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden style={{ width: 16, height: 2, borderRadius: 2, background: C.cyan, boxShadow: `0 0 8px ${C.cyan}aa` }} />
            <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.16em", color: C.cyan, textTransform: "uppercase" }}>{eyebrow}</span>
          </div>
          <h1 style={{ fontFamily: C.sans, fontSize: 30, fontWeight: 700, letterSpacing: "-0.012em", marginTop: 9, color: C.text }}>{title}</h1>
        </div>
        {right}
      </div>
      {blurb && <p style={{ fontFamily: C.sans, fontSize: 14.5, color: C.dim, lineHeight: 1.6, marginTop: 13, maxWidth: 780 }}>{blurb}</p>}
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

export type SplitVariant = "main-side" | "two-one" | "wide-main-side" | "five-seven" | "halves" | "thirds";

const SPLIT_GRID_COLS: Record<SplitVariant, string> = {
  "main-side": "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]",
  "two-one": "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
  "wide-main-side": "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]",
  "five-seven": "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
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
