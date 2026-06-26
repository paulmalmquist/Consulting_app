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
  // faint was #6f7e90 (WCAG AA fail on panels: 4.37/3.96 < 4.5 for small text); bumped to #8392a4
  // (panel 5.71 / panelHi 5.18, still below dim so the hierarchy holds). Propagates to RS.faint.
  text: "#e9eff6", dim: "#9fb0c4", faint: "#8392a4",
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
  title?: ReactNode; right?: ReactNode; children: ReactNode; pad?: number; style?: CSSProperties;
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
// `nullReason` (when provided) surfaces the SPECIFIC fail-closed reason from the data contract
// (e.g. EvidenceContract.null_reason) on its own line — never invents a generic message.
export function EmptyState({ label, hint, nullReason }: { label: string; hint: string; nullReason?: string | null }) {
  return (
    <div style={{ border: `1px solid ${C.amber}33`, background: `${C.amber}0d`, borderRadius: 9, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: C.amber, boxShadow: `0 0 8px ${C.amber}99`, flexShrink: 0 }} />
        <span style={{ fontFamily: C.mono, fontSize: 13, color: C.amber, letterSpacing: "0.02em" }}>{label}</span>
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.dim, marginTop: 8, lineHeight: 1.55, paddingLeft: 17 }}>{hint}</div>
      {nullReason ? (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 8, paddingLeft: 17, overflowWrap: "anywhere" }}>
          <span style={{ color: C.dim }}>reason: </span>{nullReason}
        </div>
      ) : null}
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

// ===========================================================================
// Shared telemetry UI atoms (production-readiness refactor). These fold the
// repeated inline-C-token patterns that were copy-pasted across consoles and
// evidence cards. The dark look stays on the C palette (intentional env theme
// adapter); inline style is reserved for runtime/chart geometry only. Existing
// exports above are unchanged — these are purely additive.
//
// Aliases: prefer the Telemetry*-prefixed name at call sites where it reads as
// part of one system; never introduce a second IMPLEMENTATION of an existing
// primitive — alias it.
// ---------------------------------------------------------------------------

export const TelemetryPanel = Panel;
export const TelemetryPageHeading = PageHeading;
export const TelemetryNullState = EmptyState;

// The glowing status dot reused by every console/sidebar/empty/error state.
export function StatusDot({ color, size = 8, glow = true }: { color: string; size?: number; glow?: boolean }) {
  return (
    <span aria-hidden style={{ width: size, height: size, borderRadius: 999, background: color,
      boxShadow: glow ? `0 0 8px ${color}99` : undefined, flexShrink: 0, display: "inline-block" }} />
  );
}

// Mono label/value row (the most-duplicated card/console line). border-bottom
// optional so it composes into lists. When `onDrill` is set the row becomes a
// button with a subtle "›" drill affordance (use with MetricInspectorDrawer);
// without it the markup is unchanged (existing call sites are untouched).
export function MetricRow({ label, value, tone, divider = true, onDrill, drillLabel }: {
  label: ReactNode; value: ReactNode; tone?: string; divider?: boolean;
  onDrill?: () => void; drillLabel?: string;
}) {
  const rowStyle: CSSProperties = {
    display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
    padding: "7px 0", borderBottom: divider ? `1px solid ${C.border}` : undefined,
  };
  const labelEl = <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{label}</span>;
  const valueEl = (
    <span style={{ fontFamily: C.mono, fontSize: 12, color: tone || C.text, textAlign: "right",
      display: "inline-flex", alignItems: "center", gap: 6 }}>
      {value}
      {onDrill && <span aria-hidden style={{ color: C.faint, fontSize: 13, lineHeight: 1 }}>›</span>}
    </span>
  );
  if (onDrill) {
    return (
      <button type="button" onClick={onDrill} aria-label={drillLabel}
        style={{ ...rowStyle, width: "100%", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
        {labelEl}
        {valueEl}
      </button>
    );
  }
  return <div style={rowStyle}>{labelEl}{valueEl}</div>;
}

// Stacked label-over-value stat (used in metric blocks / strips). Optional
// `onDrill` makes it an inspectable button with a "›" affordance; otherwise the
// markup is unchanged.
export function Stat({ label, value, tone, onDrill, drillLabel }: {
  label: ReactNode; value: ReactNode; tone?: string; onDrill?: () => void; drillLabel?: string;
}) {
  const inner = (
    <>
      <span style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: tone || C.text,
        display: "inline-flex", alignItems: "center", gap: 6 }}>
        {value}
        {onDrill && <span aria-hidden style={{ color: C.faint, fontSize: 12, lineHeight: 1 }}>›</span>}
      </span>
    </>
  );
  const colStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 3 };
  if (onDrill) {
    return (
      <button type="button" onClick={onDrill} aria-label={drillLabel}
        style={{ ...colStyle, alignItems: "flex-start", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
        {inner}
      </button>
    );
  }
  return <div style={colStyle}>{inner}</div>;
}

// Mono inline code for ids / null_reason / formulas / version strings.
export function InlineCode({ children, color = C.dim }: { children: ReactNode; color?: string }) {
  return <span style={{ fontFamily: C.mono, fontSize: 11, color }}>{children}</span>;
}
export const TelemetryInlineCode = InlineCode;

type ButtonVariant = "primary" | "secondary" | "ghost";
const BTN_BASE: CSSProperties = { fontFamily: C.mono, fontSize: 13, borderRadius: 8, padding: "10px 16px", cursor: "pointer" };
function btnStyle(variant: ButtonVariant, disabled?: boolean): CSSProperties {
  const base: CSSProperties = { ...BTN_BASE, opacity: disabled ? 0.6 : 1, cursor: disabled ? "default" : "pointer" };
  if (variant === "primary") return { ...base, fontWeight: 600, color: C.bg, background: C.cyan, border: "none" };
  if (variant === "secondary") return { ...base, color: C.dim, background: "transparent", border: `1px solid ${C.border}` };
  return { ...base, color: C.dim, background: "transparent", border: "none" };
}

// Semantic action button with three console variants. Wraps a real <button>.
export function TelemetryActionButton({
  variant = "primary", disabled, onClick, children, type = "button", fullWidth, style, ...rest
}: {
  variant?: ButtonVariant; disabled?: boolean; onClick?: () => void; children: ReactNode;
  type?: "button" | "submit"; fullWidth?: boolean; style?: CSSProperties;
  "aria-label"?: string; "aria-pressed"?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...btnStyle(variant, disabled), width: fullWidth ? "100%" : undefined, ...style }} {...rest}>
      {children}
    </button>
  );
}

// Styled <select> matching the console panel chrome.
export function SelectField({ value, onChange, children, ariaLabel, style }: {
  value: string; onChange: (v: string) => void; children: ReactNode; ariaLabel?: string; style?: CSSProperties;
}) {
  return (
    <select value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}
      style={{ fontFamily: C.mono, fontSize: 12, color: C.text, background: C.panelHi,
        border: `1px solid ${C.borderHi}`, borderRadius: 7, padding: "8px 10px", minHeight: 38, ...style }}>
      {children}
    </select>
  );
}

// Section divider: accent dot + uppercase label + optional right slot.
export function TelemetrySection({ label, right, children, accent = C.cyan }: {
  label?: string; right?: ReactNode; children: ReactNode; accent?: string;
}) {
  return (
    <section style={{ marginTop: 8 }}>
      {label && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusDot color={accent} size={6} />
            <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", color: C.dim, textTransform: "uppercase" }}>{label}</span>
          </span>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

type BannerTone = "info" | "warn" | "error";
const BANNER_COLOR: Record<BannerTone, string> = { info: C.cyan, warn: C.amber, error: C.red };

// Inline status/info banner (source/freshness/"stage unavailable"). Carries an
// aria-live region so changing status is announced.
export function TelemetryStatusBanner({ tone = "info", children, live }: {
  tone?: BannerTone; children: ReactNode; live?: boolean;
}) {
  const color = BANNER_COLOR[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} aria-live={live ? "polite" : undefined}
      style={{ border: `1px solid ${color}33`, background: `${color}0d`, borderRadius: 8,
        padding: "9px 12px", display: "flex", alignItems: "center", gap: 9,
        fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
      <StatusDot color={color} size={7} />
      <span>{children}</span>
    </div>
  );
}

// Provenance footer panel — the recurring "Provenance. …" disclosure.
export function TelemetryProvenancePanel({ label = "Provenance", children, style }: {
  label?: string; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <Panel pad={14} style={style}>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
        <span style={{ color: C.dim, fontWeight: 600 }}>{label}. </span>
        {children}
      </span>
    </Panel>
  );
}

// Verdict chip — GO/REVIEW/NO_GO via the shared verdictColor(); NO_GO renders as
// "NO-GO" to match existing copy. Thin wrapper over Tag (no new color logic).
export function VerdictChip({ verdict }: { verdict?: string | null }) {
  const display = verdict === "NO_GO" || verdict === "NO-GO" ? "NO-GO" : (verdict ?? "—");
  return <Tag color={verdictColor(verdict)}>{display}</Tag>;
}

// Tab button with active fill — the section-tab pattern across map/factory/bottleneck.
export function SectionTabButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: "0.04em", cursor: "pointer",
        color: active ? C.text : C.dim, background: active ? C.panelHi : "transparent",
        border: `1px solid ${active ? C.borderHi : C.border}`, borderRadius: 7, padding: "7px 13px" }}>
      {children}
    </button>
  );
}

// Editorial thesis hero (the larger Overview/Evidence header). Distinct from
// PageHeading (the standard console heading) by scale; title accepts a node so
// brand-accented spans survive. Big Numbers / supporting content go in children.
export function TelemetryThesisHeading({ eyebrow, title, blurb, size = 34, children }: {
  eyebrow: string; title: ReactNode; blurb?: ReactNode; size?: number; children?: ReactNode;
}) {
  return (
    <header style={{ marginBottom: 26, maxWidth: 880 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span aria-hidden style={{ width: 18, height: 2, borderRadius: 2, background: C.cyan, boxShadow: `0 0 8px ${C.cyan}aa` }} />
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.16em", color: C.cyan, textTransform: "uppercase" }}>{eyebrow}</span>
      </div>
      <h1 style={{ fontFamily: size >= 44 ? C.mono : C.sans, fontSize: size, fontWeight: 800,
        letterSpacing: "-0.015em", lineHeight: 1.08, color: C.text, marginTop: 12 }}>{title}</h1>
      {blurb && <p style={{ fontFamily: C.sans, fontSize: 15, color: C.dim, lineHeight: 1.65, marginTop: 14 }}>{blurb}</p>}
      {children}
    </header>
  );
}

// Thesis-first page wrapper: heading first, content, then the public-data
// disclosure footer (the consistent page rhythm).
export function TelemetryPageShell({ heading, children, disclosure = true }: {
  heading: ReactNode; children: ReactNode; disclosure?: boolean;
}) {
  return (
    <>
      {heading}
      {children}
      {disclosure && <DisclosureFooter />}
    </>
  );
}
