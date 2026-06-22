"use client";

import type { CSSProperties, ReactNode } from "react";

// Self-contained dark palette for the ADE Ops console (own package; no imports
// from the deletable ADE/telemetry packages).
export const C = {
  bg: "#07090e", rail: "#0b0f15", panel: "#0f1520",
  border: "rgba(120,150,190,0.12)", borderHi: "rgba(120,150,190,0.24)",
  text: "#e7edf5", dim: "#8b98ab", faint: "#576372",
  accent: "#5fa8f5", green: "#3ddc97", amber: "#f3b14a", red: "#ef7066", violet: "#a78bfa",
  mono: "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace",
  sans: "'Söhne','Inter',-apple-system,system-ui,sans-serif",
};

export function statusColor(status: string): string {
  if (status === "ok") return C.green;
  if (status === "degraded") return C.amber;
  if (status === "blocked") return C.red;
  return C.dim;
}

export function tierColor(tier: number): string {
  if (tier <= 0) return C.green;
  if (tier === 1) return C.accent;
  return C.red; // tier >= 2 = write-capable, not available in PR 1
}

export function Tag({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
      color, background: color + "18", border: `1px solid ${color}40`, borderRadius: 5, padding: "2px 7px" }}>
      {children}
    </span>
  );
}

export function Panel({ title, right, children, style }: {
  title?: string; right?: ReactNode; children: ReactNode; style?: CSSProperties;
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
      <div style={{ padding: 16 }}>{children}</div>
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

export function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{ border: `1px dashed ${C.borderHi}`, borderRadius: 8, padding: "18px 16px", textAlign: "center" }}>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>{hint}</div>
    </div>
  );
}

// The backend declared the data unavailable; render the null_reason verbatim.
export function UnavailableState({ nullReason }: { nullReason: string }) {
  return (
    <div style={{ border: `1px dashed ${C.amber}55`, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.amber }}>Not available</div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 6 }}>null_reason: {nullReason}</div>
    </div>
  );
}

export function PageHeading({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", color: C.accent, textTransform: "uppercase" }}>{eyebrow}</div>
      <h1 style={{ fontFamily: C.sans, fontSize: 26, fontWeight: 700, marginTop: 6, color: C.text }}>{title}</h1>
      {blurb && <p style={{ fontFamily: C.sans, fontSize: 14, color: C.dim, lineHeight: 1.55, marginTop: 10, maxWidth: 780 }}>{blurb}</p>}
    </div>
  );
}
