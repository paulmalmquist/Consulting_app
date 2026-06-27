"use client";

import type { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { C } from "./primitives";
import { telemetryAccentForPath } from "./telemetryNav";

// ===========================================================================
// Telemetry page header system. One header family for every telemetry route so
// the pages scan as a typographic system. Every page title now shares one editorial
// font and one size (see TITLE_STYLE); the variant only drives layout:
//   - hero      → Overview: title + the Big Numbers metric row.
//   - evidence  → evidence/lineage pages: wider measure.
//   - standard  → models/factory consoles.
//   - compact   → operational consoles: tighter margin + live chips/actions.
//
// Fonts come from the global next/font CSS vars (set on <html> in app/layout.tsx):
//   --font-editorial (Cormorant Garamond) for titles, --font-mono (JetBrains Mono)
//   for data labels/IDs/values. Colors stay on the telemetry `C` palette.
//
// No fetching, no state, no invented metadata — callers pass existing values into
// the metadata/actions/metrics slots. Nested section headings keep using PageHeading.
// ---------------------------------------------------------------------------

export type HeaderVariant = "hero" | "compact" | "standard" | "evidence";

/** A title is plain text or typed segments; a `gradient` segment is emphasized in the category color. */
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

// One unified page-title treatment across every variant (owner decision, Phase 9A): the same editorial
// face and the same size on every telemetry page, so the headlines read as one product. Overview is no
// longer the oversized outlier and the operational consoles are no longer the small ones. The clamp() keeps
// it wrapping cleanly from 390px to desktop. Variant still drives layout (margin, hero metric strip) and the
// emphasized word still carries the category color, but the title font and size are shared.
//
// Casing is normalized to sentence case in CSS (`lowercase` + a `first-letter:uppercase` cap), so every
// title reads "First letter capitalized, the rest lowercase" regardless of how it is authored — no per-page
// copy edits, and source-system acronyms can't reintroduce SHOUTING. text-transform is purely visual, so the
// h1's textContent (and the header tests) are unchanged.
const TITLE_STYLE: CSSProperties = {
  fontFamily: FONT_EDITORIAL, fontWeight: 600,
  fontSize: "clamp(1.85rem, 3.4vw, 2.3rem)", lineHeight: 1.12, letterSpacing: "0.003em",
};
const TITLE_CASE_CLASS = "lowercase first-letter:uppercase";

const MARGIN_BOTTOM: Record<HeaderVariant, number> = { hero: 26, evidence: 24, standard: 22, compact: 18 };

// One emphasized word per title, painted in the page's category color (the same color the left rail
// gives this section). For a typed-segment title, the authored `gradient` segments are the emphasis;
// for a plain string we emphasize the leading word (letters/digits + internal hyphens/apostrophes),
// leaving any trailing "·"/punctuation un-tinted.
function accentSpan(text: string, accent: string, key?: number): ReactNode {
  return <span key={key} style={{ color: accent, textShadow: `0 0 18px ${accent}99` }}>{text}</span>;
}

function renderTitle(title: HeaderTitle, accent: string): ReactNode {
  if (typeof title !== "string") {
    return title.map((seg, i) => (seg.gradient ? accentSpan(seg.text, accent, i) : <span key={i}>{seg.text}</span>));
  }
  const m = title.match(/^(\s*)([\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*)([\s\S]*)$/u);
  if (!m) return <span>{title}</span>;
  const [, lead, firstWord, rest] = m;
  return (
    <>
      {lead}
      {accentSpan(firstWord, accent)}
      {rest}
    </>
  );
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
  accent,
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
  /** Category color override; defaults to the section color of the current route (the rail color). */
  accent?: string;
}) {
  const isWide = variant === "hero" || variant === "evidence";
  // The page's section color — same as the left rail's. Resolved from the route so no page has to pass
  // it; `usePathname` is null outside the app router (e.g. unit tests), where we fall back to cyan.
  const pathname = usePathname();
  const sectionAccent = accent ?? telemetryAccentForPath(pathname ?? "");
  return (
    <header style={{ marginBottom: MARGIN_BOTTOM[variant], maxWidth: isWide ? 880 : undefined }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden style={{ width: variant === "hero" ? 18 : 16, height: 2, borderRadius: 2, background: sectionAccent, boxShadow: `0 0 8px ${sectionAccent}aa` }} />
            <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.16em", color: sectionAccent, textTransform: "uppercase" }}>{eyebrow}</span>
          </div>
          <h1 className={TITLE_CASE_CLASS} style={{ ...TITLE_STYLE, color: C.text, marginTop: variant === "hero" ? 12 : 9 }}>
            {renderTitle(title, sectionAccent)}
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
