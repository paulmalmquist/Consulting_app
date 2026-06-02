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

// Public-data + backfill disclosure (the UI never overclaims).
export function DisclosureFooter() {
  return (
    <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6,
      borderTop: `1px solid ${C.border}`, paddingTop: 18, marginTop: 18 }}>
      Built on public NASA aerospace analog datasets (C-MAPSS turbofan, SMAP/MSL telemanom, IMS
      bearing). Not proprietary data. Operational history is a deterministic backfill from those public
      datasets (real champion outputs, real labeled windows, real PSI); live /score receipts continue
      from current time.
    </p>
  );
}
