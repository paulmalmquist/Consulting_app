"use client";

import type { CSSProperties, ReactNode } from "react";
import { C } from "./primitives";

// ===========================================================================
// Telemetry page header system. One header family for every telemetry route so
// the pages scan as a typographic system:
//   - hero      → Overview only: editorial (Cormorant) display title + metric row.
//   - evidence  → evidence/lineage pages: editorial title, restrained.
//   - standard  → models/factory consoles: Inter Tight title.
//   - compact   → operational consoles: tighter Inter Tight title + live chips/actions.
//
// Fonts come from the global next/font CSS vars (set on <html> in app/layout.tsx):
//   --font-editorial (Cormorant Garamond), --font-display (Inter Tight),
//   --font-mono (JetBrains Mono). Colors stay on the telemetry `C` palette.
//
// No fetching, no state, no invented metadata — callers pass existing values into
// the metadata/actions/metrics slots. Nested section headings keep using PageHeading.
// ---------------------------------------------------------------------------

// Brand fluorescent purple — gradient emphasis is limited to a meaningful phrase
// (Overview's "Launch"/"Data", and at most one phrase on selected evidence headers).
const NV_PURPLE = "#B040FF";

export type HeaderVariant = "hero" | "compact" | "standard" | "evidence";

/** A title is plain text or typed segments; a segment may be gradient-emphasized. */
export type TitleSegment = { text: string; gradient?: boolean };
export type HeaderTitle = string | TitleSegment[];

export interface HeaderMetric {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Accent for the value (e.g. C.green / C.amber). Defaults to C.text. */
  accent?: string;
}

const FONT_EDITORIAL = "var(--font-editorial), Georgia, serif";
const FONT_DISPLAY = "var(--font-display), 'Inter Tight', Inter, system-ui, sans-serif";

// Per-variant title typography. Sizes use clamp() so titles wrap cleanly from
// 390px → desktop without overflow.
const TITLE_STYLE: Record<HeaderVariant, CSSProperties> = {
  hero: {
    fontFamily: FONT_EDITORIAL, fontWeight: 600,
    fontSize: "clamp(2.4rem, 5.2vw, 3.25rem)", lineHeight: 1.05, letterSpacing: "0.002em",
  },
  evidence: {
    fontFamily: FONT_EDITORIAL, fontWeight: 600,
    fontSize: "clamp(1.7rem, 3.4vw, 2.15rem)", lineHeight: 1.1, letterSpacing: "0.004em",
  },
  standard: {
    fontFamily: FONT_DISPLAY, fontWeight: 700,
    fontSize: "clamp(1.45rem, 2.6vw, 1.9rem)", lineHeight: 1.12, letterSpacing: "-0.012em",
  },
  compact: {
    fontFamily: FONT_DISPLAY, fontWeight: 700,
    fontSize: "clamp(1.25rem, 2vw, 1.45rem)", lineHeight: 1.15, letterSpacing: "-0.01em",
  },
};

const MARGIN_BOTTOM: Record<HeaderVariant, number> = { hero: 26, evidence: 24, standard: 22, compact: 18 };

function renderTitle(title: HeaderTitle): ReactNode {
  const segments: TitleSegment[] = typeof title === "string" ? [{ text: title }] : title;
  return segments.map((seg, i) => {
    if (!seg.gradient) return <span key={i}>{seg.text}</span>;
    return (
      <span key={i} style={{ color: NV_PURPLE, textShadow: `0 0 18px ${NV_PURPLE}99` }}>{seg.text}</span>
    );
  });
}

// Hero metric row — inline editorial stats under the thesis (not a card dashboard).
function MetricRowStrip({ metrics }: { metrics: HeaderMetric[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "24px 48px", marginTop: 24 }}>
      {metrics.map((m) => (
        <div key={m.label}>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: C.faint, marginBottom: 5 }}>
            {m.label}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 25, fontWeight: 700, letterSpacing: "-0.01em", color: m.accent || C.text }}>
            {m.value}
          </div>
          {m.sub != null && <div style={{ fontFamily: C.sans, fontSize: 11.5, color: C.dim, marginTop: 3 }}>{m.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function TelemetryPageHeader({
  variant = "standard",
  eyebrow,
  title,
  description,
  metadata,
  actions,
  metrics,
}: {
  variant?: HeaderVariant;
  eyebrow: string;
  title: HeaderTitle;
  description?: ReactNode;
  /** Source/freshness strip, ids, timestamps, status chips — caller-provided. */
  metadata?: ReactNode;
  /** Right-aligned actions/controls/live chips. */
  actions?: ReactNode;
  /** Hero metric row (e.g. Overview Big Numbers). */
  metrics?: HeaderMetric[];
}) {
  const isWide = variant === "hero" || variant === "evidence";
  return (
    <header style={{ marginBottom: MARGIN_BOTTOM[variant], maxWidth: isWide ? 880 : undefined }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden style={{ width: variant === "hero" ? 18 : 16, height: 2, borderRadius: 2, background: C.cyan, boxShadow: `0 0 8px ${C.cyan}aa` }} />
            <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.16em", color: C.cyan, textTransform: "uppercase" }}>{eyebrow}</span>
          </div>
          <h1 style={{ ...TITLE_STYLE[variant], color: C.text, marginTop: variant === "hero" ? 12 : 9 }}>
            {renderTitle(title)}
          </h1>
        </div>
        {actions && <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>{actions}</div>}
      </div>

      {description && (
        <p style={{ fontFamily: C.sans, fontSize: variant === "hero" ? 16 : 14.5, color: C.dim, lineHeight: 1.6, marginTop: variant === "hero" ? 16 : 13, maxWidth: 820 }}>
          {description}
        </p>
      )}

      {metadata && <div style={{ marginTop: 12 }}>{metadata}</div>}

      {metrics && metrics.length > 0 && <MetricRowStrip metrics={metrics} />}
    </header>
  );
}
