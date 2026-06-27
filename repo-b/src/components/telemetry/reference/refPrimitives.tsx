"use client";

import type { CSSProperties, ReactNode } from "react";
import { C, InlineCode, ScrollTable, ResponsiveSwap, RowCard, Tag, TelemetryStatusBanner } from "../primitives";
import type { SourceRef, RowStatus } from "./manifest";

// Boring doc scaffolding for the AI Build & Operations Reference page. No animation, no new palette,
// no layout framework — everything stays on the telemetry `C` tokens and reuses existing primitives.
// If any helper here grows past ~80 lines or starts duplicating a primitive, inline it or reuse the
// primitive instead.

// In-page table of contents. Plain anchor links to each numbered section.
export function RefTOC({ sections, accent }: {
  sections: { id: string; n: number; title: string }[]; accent: string;
}) {
  return (
    <nav aria-label="On this page" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 26 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.faint, textTransform: "uppercase", marginBottom: 10 }}>On this page</div>
      <ol style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", listStyle: "none", margin: 0, padding: 0 }}>
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, textDecoration: "none", display: "flex", gap: 8 }}>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: accent, minWidth: 16 }}>{s.n}</span>
              <span>{s.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// One numbered section with an anchor id and scroll offset for the TOC jumps.
export function RefSection({ id, n, title, accent, children }: {
  id: string; n: number; title: string; accent: string; children: ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 88, marginTop: 38 }}>
      <h2 style={{ display: "flex", alignItems: "baseline", gap: 10, fontFamily: C.sans, fontSize: 21, fontWeight: 700, letterSpacing: "-0.01em", color: C.text, marginBottom: 6 }}>
        <span style={{ fontFamily: C.mono, fontSize: 15, color: accent }}>{n}</span>
        {title}
      </h2>
      <div style={{ height: 1, background: C.border, margin: "0 0 16px" }} />
      {children}
    </section>
  );
}

// Reading-column paragraph (docs measure, not full width).
export function RefProse({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <p style={{ fontFamily: C.sans, fontSize: 14.5, color: C.dim, lineHeight: 1.65, maxWidth: 820, margin: "0 0 12px", ...style }}>{children}</p>;
}

// Evidence cell — renders a row's sourceRefs as compact mono path chips (note → title attr).
export function EvidenceCell({ refs }: { refs: SourceRef[] }) {
  if (!refs.length) return <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>—</span>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px 8px" }}>
      {refs.map((r, i) => (
        <span key={i} title={r.note ? `${r.path} — ${r.note}` : r.path}>
          <InlineCode color={C.dim}>{r.label}</InlineCode>
        </span>
      ))}
    </span>
  );
}

const STATUS_COLOR: Record<RowStatus, string> = {
  real: C.green, fixture: C.cyan, synthetic: C.amber, cold: C.red, planned: C.faint, "not-present": C.faint,
};
export function StatusPill({ status }: { status: RowStatus }) {
  return <Tag color={STATUS_COLOR[status]}>{status}</Tag>;
}

// Generic compact reference table: a real <table> on desktop, RowCard list on mobile. The first
// column is the row title on mobile. Cell values are pre-rendered ReactNodes (the page builds them).
export type RefCol = { key: string; header: string; minWidth?: number };
export function RefTable({ columns, rows, minWidth = 820 }: {
  columns: RefCol[]; rows: Array<Record<string, ReactNode>>; minWidth?: number;
}) {
  const headCell: CSSProperties = { fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint, textAlign: "left", padding: "8px 12px", borderBottom: `1px solid ${C.borderHi}`, verticalAlign: "bottom" };
  const bodyCell: CSSProperties = { fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.5, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
  const desktop = (
    <ScrollTable minWidth={minWidth}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} style={{ ...headCell, minWidth: c.minWidth }}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map((c, j) => <td key={c.key} style={{ ...bodyCell, color: j === 0 ? C.text : C.dim }}>{r[c.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
  const mobile = (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((r, i) => (
        <RowCard key={i} title={r[columns[0].key]} fields={columns.slice(1).map((c) => ({ label: c.header, value: r[c.key] }))} />
      ))}
    </div>
  );
  return <ResponsiveSwap mobile={mobile} desktop={desktop} />;
}

// Mono command block (read-only; copy by selection). Lines are plain strings.
export function CommandBlock({ commands }: { commands: string[] }) {
  return (
    <pre style={{ fontFamily: C.mono, fontSize: 12, color: C.text, background: C.panelHi, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", overflowX: "auto", lineHeight: 1.6, margin: 0 }}>
      {commands.map((line, i) => (
        <div key={i} style={{ color: line.trim().startsWith("#") ? C.faint : C.text }}>{line || " "}</div>
      ))}
    </pre>
  );
}

// Thin callout over the shared status banner (info | warn | error).
export function Callout({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  return <TelemetryStatusBanner tone={tone}>{children}</TelemetryStatusBanner>;
}
