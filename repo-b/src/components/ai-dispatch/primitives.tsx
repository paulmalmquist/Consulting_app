"use client";

import type { CSSProperties, ReactNode } from "react";

// Self-contained dark palette for the AI Provider Dispatch admin panel. Own copy
// (no imports from the ade-ops or telemetry packages) so this surface stays
// independent of those modules.
export const C = {
  bg: "#07090e", rail: "#0b0f15", panel: "#0f1520",
  border: "rgba(120,150,190,0.12)", borderHi: "rgba(120,150,190,0.24)",
  text: "#e7edf5", dim: "#8b98ab", faint: "#576372",
  accent: "#5fa8f5", green: "#3ddc97", amber: "#f3b14a", red: "#ef7066", violet: "#a78bfa",
  mono: "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace",
  sans: "'Söhne','Inter',-apple-system,system-ui,sans-serif",
};

export function dispatchStatusColor(status: string | null | undefined): string {
  if (status === "success") return C.green;
  if (status === "degraded") return C.amber;
  if (status === "blocked") return C.red;
  if (status === "unavailable") return C.faint;
  return C.dim;
}

export function Tag({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
      color, background: color + "18", border: `1px solid ${color}40`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
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
  return <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{label}</span>;
}

export function ErrorState({ message }: { message: string }) {
  return <span style={{ fontFamily: C.mono, fontSize: 12, color: C.red }}>Could not load: {message}</span>;
}

export function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{ border: `1px dashed ${C.borderHi}`, borderRadius: 8, padding: "18px 16px", textAlign: "center" }}>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>{hint}</div>
    </div>
  );
}

export function PageHeading({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", color: C.accent, textTransform: "uppercase" }}>{eyebrow}</div>
      <h1 style={{ fontFamily: C.sans, fontSize: 26, fontWeight: 700, marginTop: 6, color: C.text }}>{title}</h1>
      {blurb && <p style={{ fontFamily: C.sans, fontSize: 14, color: C.dim, lineHeight: 1.55, marginTop: 10, maxWidth: 820 }}>{blurb}</p>}
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th style={{ textAlign: "left", fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
      color: C.faint, fontWeight: 500, padding: "8px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}

export function Td({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <td style={{ fontFamily: C.mono, fontSize: 12, color: C.text, padding: "9px 10px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top", ...style }}>
      {children}
    </td>
  );
}
