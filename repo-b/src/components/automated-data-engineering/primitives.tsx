"use client";

import type { CSSProperties, ReactNode } from "react";

// Self-contained dark workbench palette for the ADE control room. Inline-style
// tokens so the surface renders the same regardless of the global theme. The
// package is platform core: no environment branding, no domain imports.
export const C = {
  bg: "#07090e", rail: "#0b0f15", panel: "#0f1520", panelHi: "#131b28",
  border: "rgba(120,150,190,0.12)", borderHi: "rgba(120,150,190,0.24)",
  text: "#e7edf5", dim: "#8b98ab", faint: "#576372",
  accent: "#5fa8f5", green: "#3ddc97", amber: "#f3b14a", red: "#ef7066",
  violet: "#a78bfa",
  mono: "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace",
  sans: "'Söhne', 'Inter', -apple-system, system-ui, sans-serif",
};

// Declared connector statuses map to fixed accents. Vocabulary is exactly
// live|stub|script|missing — never softened.
export function statusColor(status: string): string {
  if (status === "live") return C.green;
  if (status === "script") return C.amber;
  if (status === "stub") return C.violet;
  return C.red; // missing
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

// No rows came back and the backend gave no null_reason — an honest empty set.
export function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{ border: `1px dashed ${C.borderHi}`, borderRadius: 8, padding: "18px 16px", textAlign: "center" }}>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>{hint}</div>
    </div>
  );
}

// The backend declared the data unavailable; we render the reason verbatim.
export function UnavailableState({ nullReason }: { nullReason: string }) {
  return (
    <div style={{ border: `1px dashed ${C.amber}55`, borderRadius: 8, padding: "18px 16px", textAlign: "center" }}>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.amber }}>Not available</div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
        null_reason: {nullReason}
      </div>
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

// Right-side evidence drawer (fixed overlay, full height). Caller owns the
// open/close state and the body content.
export function Drawer({ title, eyebrow, onClose, children }: {
  title: string; eyebrow: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      <button type="button" aria-label="Close" onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", border: "none", cursor: "pointer" }} />
      <div className="max-w-[92vw]"
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 440, background: C.rail,
          borderLeft: `1px solid ${C.borderHi}`, display: "flex", flexDirection: "column",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.55)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.14em", color: C.accent, textTransform: "uppercase" }}>{eyebrow}</div>
            <div style={{ fontFamily: C.sans, fontSize: 15, fontWeight: 600, color: C.text, marginTop: 3 }}>{title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close drawer"
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 2l8 8M10 2l-8 8" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

// Label/value row inside the drawer.
export function DrawerRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
      padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase", flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text, textAlign: "right", wordBreak: "break-word" }}>
        {value ?? <span style={{ color: C.faint }}>—</span>}
      </span>
    </div>
  );
}
