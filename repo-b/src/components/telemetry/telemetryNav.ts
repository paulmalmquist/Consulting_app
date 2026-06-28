// Single source of truth for telemetry navigation. The desktop rail (TelemetrySidebar),
// the mobile drawer (same component), and the mobile bottom bar (TelemetryBottomNav) all
// consume this list, so adding a section means adding one entry here.
// Icon strings are 16x16 SVG path data, ported from the Option B reference.
//
// Sections follow the "Telemetry Experience Redesign" narrative order (ADO #692):
// Overview (launch-history context + live KPIs) -> Operations (live/historical) -> Models & Intelligence
// (how we know) -> Factory & Quality (what's broken) -> Evidence & Lineage (where it came
// from) -> Agent Operations (execution). Six sections keeps primary nav within the shared
// "<=7 primary items" rule. New pages (Program Control Tower, Metric Lineage Explorer,
// Governed Metric Registry, System Health, Agent Control Tower mockup) are added in later
// phases; this phase only regroups the existing surfaces and relabels four of them.

export type TelemetryNavGroup =
  | "Overview"
  | "Operations"
  | "Models & Intelligence"
  | "Factory & Quality"
  | "Evidence & Lineage"
  | "Agent Operations"
  | "Data Engineering"
  | "Relativity MES Sandbox";

export type TelemetryNavItem = {
  slug: string;
  label: string;
  icon: string;
  group: TelemetryNavGroup;
  /** Shown as a tab in the mobile bottom bar (max 4 + "More"). */
  mobilePrimary?: boolean;
};

export const TELEMETRY_NAV: TelemetryNavItem[] = [
  // Section 1 — Overview (launch-history context charts + live serving KPIs)
  { slug: "", label: "Overview", icon: "M2 9h3v5H2zM7 4h3v10H7zM12 7h3v7h-3z", group: "Overview", mobilePrimary: true },

  // Section 2 — Operations (live + historical telemetry)
  { slug: "stream", label: "Mission Control", icon: "M2 12c2-6 10-6 12 0M8 3v3M8 8l3 3", group: "Operations", mobilePrimary: true },
  { slug: "replay", label: "Replay", icon: "M4 3l9 6-9 6z", group: "Operations" },
  { slug: "stargate", label: "Stargate Live", icon: "M8 1l6 3.5v7L8 15l-6-3.5v-7zM8 8l6-3.5M8 8L2 4.5M8 8v7", group: "Operations" },
  { slug: "runs", label: "Test Runs", icon: "M2 4h13v2H2zM2 8h13v2H2zM2 12h9v2H2z", group: "Operations", mobilePrimary: true },
  // Section 3 — Models & Intelligence (how we know / can we trust it)
  { slug: "workbench", label: "Model Workbench", icon: "M6 2h4M7 2v3L3 13a1 1 0 001 1h8a1 1 0 001-1L9 5V2M5.5 9h5", group: "Models & Intelligence" },
  { slug: "model-performance", label: "Model Performance", icon: "M2 13l4-5 3 2 5-7", group: "Models & Intelligence" },
  { slug: "calibration", label: "RUL Calibration", icon: "M2 13h12M4 13V7m4 6V4m4 9V9", group: "Models & Intelligence" },
  { slug: "registry", label: "Model Registry", icon: "M3 2h10v3H3zM3 7h10v3H3zM3 12h6v2H3z", group: "Models & Intelligence" },
  // "Test Intelligence" (copilot) hidden from the nav (per owner). Its /telemetry/copilot route still resolves.

  // Section 4 — Factory & Quality (what's broken / needs intervention)
  { slug: "factory", label: "Factory · NCR", icon: "M2 13V7l4 3V7l4 3V4h4v9z", group: "Factory & Quality" },
  { slug: "factory-ml", label: "Flight Readiness", icon: "M2 14V7l3-2 3 2 3-5 3 2v10zM5 14v-4M8 14V8M11 14V6", group: "Factory & Quality" },

  // Section 5 — Evidence & Lineage (where did this number come from / why trust it)
  { slug: "metric-lineage", label: "Metric Lineage", icon: "M4 2v12M4 6h6M4 11h5M10 4v4M9 9v3", group: "Evidence & Lineage" },
  { slug: "metadata", label: "Metadata Explorer", icon: "M2 3h5v4H2zM9 3h5v4H9zM5 9h6v4H5zM4.5 7v2M11.5 7v2M7 11H5M11 11h-1", group: "Evidence & Lineage" },
  // Document-style "how it was built & how it is operated" reference. Visible here (the section that
  // owns "where it came from / why trust it"); the rail label stays short, the page title carries
  // the full "AI Build & Operations Reference". Static page — nothing fetches or executes.
  { slug: "ai-build-ops", label: "AI Build & Ops", icon: "M5 2h6l3 3v9H2V2zM9 2v4h4M4 9h7M4 12h5", group: "Evidence & Lineage" },
  // Hidden-before-delete (presentation declutter): "Trust Center" (governance), "How This Works"
  // (how-it-works), and "Resume Evidence" (evidence) are dropped from the nav. Their /telemetry/<slug>
  // routes still resolve for deep links; only the nav entries are removed. The How-This-Works framing
  // and the resume-evidence cards live on the Overview / per-page EvidenceContract fields.

  // Section 6 — Agent Operations (approved execution)
  { slug: "control-tower", label: "Agent Control Tower", icon: "M8 1l6 3v4c0 3-2.5 5.5-6 7-3.5-1.5-6-4-6-7V4zM8 5v6M5 8h6", group: "Agent Operations" },

  // The Data Engineering group is hidden from the nav (per owner). The
  // /telemetry/data-engineering[/grain|relationships|pipelines|workflows|workbench|autopsy|sources]
  // routes still resolve for deep links; only the nav entries are removed (hide-before-delete).

  // Section 8 — Relativity MES Sandbox (Phase 10). A SYNTHETIC build-to-flight MES/ERP/PLM facsimile
  // (shaped like Manufacturo + a generic ERP/PLM), kept visibly separate from the core telemetry
  // workbench. Reads the rel_* Lakebase serving tables through the same data-product patterns.
  { slug: "relativity-mes", label: "Build Overview", icon: "M2 13V6l4-3 4 3v7zM6 13V9M9 3h5v10h-5", group: "Relativity MES Sandbox" },
  { slug: "relativity-mes/genealogy", label: "Build Genealogy", icon: "M8 2v3M8 5L4 8M8 5l4 3M4 8v3M12 8v3M3 11h2v3H3zM7 11h2v3H7zM11 11h2v3h-2z", group: "Relativity MES Sandbox" },
  { slug: "relativity-mes/ncr", label: "NCR Traceability", icon: "M8 2l6 11H2zM8 6v3M8 11h.01", group: "Relativity MES Sandbox" },
  { slug: "relativity-mes/cost", label: "Cost Reconciliation", icon: "M3 13V8l3-2 4 3 3-4v8zM2 14h12", group: "Relativity MES Sandbox" },
  { slug: "relativity-mes/lineage", label: "Lineage & Source Tables", icon: "M4 2v12M4 6h6M4 11h5M10 4v4M9 9v3", group: "Relativity MES Sandbox" },
  { slug: "relativity-mes/analytics", label: "Build Analytics", icon: "M2 13l3-4 3 2 3-6 3 3M2 13h12", group: "Relativity MES Sandbox" },
];

export const TELEMETRY_NAV_GROUPS: TelemetryNavGroup[] = [
  "Overview",
  "Operations",
  "Models & Intelligence",
  "Factory & Quality",
  "Evidence & Lineage",
  "Agent Operations",
  // "Data Engineering" stays in the TelemetryNavGroup union (the sidebar color map keys on it) but is
  // no longer a displayed group — its items are hidden from the nav (routes still resolve).
  "Relativity MES Sandbox",
];

// Per-group identity for the collapsible icon rail (Phase 9B): the group's own icon (a representative
// child glyph) + accent color. Accents mirror the telemetry `C` palette (cyan #67e8f9, amber #f5b452,
// green #6ee7a0) plus the cyberpunk purple/pink; kept as literals so this data module stays
// dependency-free. Single source of truth — TelemetrySidebar reads icon + accent from here.
export const TELEMETRY_NAV_GROUP_META: Record<TelemetryNavGroup, { icon: string; accent: string }> = {
  Overview:                { accent: "#67e8f9", icon: "M2 9h3v5H2zM7 4h3v10H7zM12 7h3v7h-3z" },
  Operations:              { accent: "#67e8f9", icon: "M2 12c2-6 10-6 12 0M8 3v3M8 8l3 3" },
  "Models & Intelligence": { accent: "#a855f7", icon: "M2 13l4-5 3 2 5-7" },
  "Factory & Quality":     { accent: "#f5b452", icon: "M2 13V7l4 3V7l4 3V4h4v9z" },
  "Evidence & Lineage":    { accent: "#6ee7a0", icon: "M4 2v12M4 6h6M4 11h5M10 4v4M9 9v3" },
  "Agent Operations":      { accent: "#f472b6", icon: "M8 1l6 3v4c0 3-2.5 5.5-6 7-3.5-1.5-6-4-6-7V4zM8 5v6M5 8h6" },
  "Data Engineering":      { accent: "#a855f7", icon: "M3 3h4v4H3zM9 9h4v4H9zM7 5h2M5 7v2M11 7V5M9 11H7" },
  // Distinct warm-orange accent so the synthetic Relativity MES Sandbox reads as its own space.
  "Relativity MES Sandbox": { accent: "#ff9e64", icon: "M8 2v3M8 5L4 8M8 5l4 3M4 8v3M12 8v3M3 11h2v3H3zM7 11h2v3H7zM11 11h2v3h-2z" },
};

export function telemetryHref(envId: string, slug: string): string {
  const base = `/lab/env/${envId}/telemetry`;
  return slug ? `${base}/${slug}` : base;
}

export function isTelemetryItemActive(pathname: string, envId: string, slug: string): boolean {
  const base = `/lab/env/${envId}/telemetry`;
  // A slug matches the path when it is the exact route or an ancestor segment of it.
  const matches = (s: string): boolean => {
    const href = s ? `${base}/${s}` : base;
    return pathname === href || (s !== "" && pathname.startsWith(`${href}/`));
  };
  if (!matches(slug)) return false;
  // Only the MOST specific (longest) matching slug is active, so an index route like "relativity-mes"
  // ("Build Overview") does not stay highlighted while a child route ("relativity-mes/ncr") is open.
  // Candidates are the declared nav slugs plus this slug (so deep-link-only routes still resolve).
  const best = [...TELEMETRY_NAV.map((n) => n.slug), slug]
    .filter(matches)
    .reduce((a, b) => (b.length > a.length ? b : a), "");
  return slug === best;
}

/** Label of the section owning the current pathname (for the mobile header). */
export function telemetrySectionLabel(pathname: string, envId: string): string {
  const match = TELEMETRY_NAV.find((n) => n.slug && isTelemetryItemActive(pathname, envId, n.slug));
  return match?.label ?? "Overview";
}

// Top-level slug -> owning group. Covers both visible nav slugs and the hide-before-delete routes
// (copilot / governance / how-it-works / evidence / data-engineering / monitoring / spike-inspector)
// that still resolve as deep links — so a page header can always recover its category color even when
// the route is no longer shown in the rail. Multi-segment groups (relativity-mes/*, data-engineering/*)
// are matched by prefix below, so they need no entry here.
const TELEMETRY_SLUG_GROUP: Record<string, TelemetryNavGroup> = {
  // Operations
  stream: "Operations", replay: "Operations", stargate: "Operations",
  runs: "Operations", monitoring: "Operations", "spike-inspector": "Operations",
  // Models & Intelligence
  workbench: "Models & Intelligence",
  "model-performance": "Models & Intelligence", calibration: "Models & Intelligence",
  registry: "Models & Intelligence", copilot: "Models & Intelligence",
  // Factory & Quality
  factory: "Factory & Quality", "factory-ml": "Factory & Quality",
  // Evidence & Lineage
  "metric-lineage": "Evidence & Lineage", metadata: "Evidence & Lineage",
  "ai-build-ops": "Evidence & Lineage",
  governance: "Evidence & Lineage", "how-it-works": "Evidence & Lineage", evidence: "Evidence & Lineage",
  // Agent Operations
  "control-tower": "Agent Operations",
};

/** Group owning a telemetry pathname (best-effort; defaults to Overview). */
export function telemetryGroupForPath(pathname: string): TelemetryNavGroup {
  // Match "/telemetry" only as a whole path segment (followed by "/" or end-of-path), NOT as a bare
  // substring — otherwise an env id that contains "telemetry" (e.g. /lab/env/telemetry-demo/…) matches
  // inside the env id, `rest` becomes "-demo/telemetry/…", and every page falls back to the Overview
  // accent. The `(?=\/|$)` lookahead skips "/telemetry-demo" and lands on the real section root.
  const marker = "/telemetry";
  const m = pathname.match(/\/telemetry(?=\/|$)/);
  if (!m || m.index === undefined) return "Overview";
  // Everything after "/telemetry/" — "" at the section root, else "factory", "relativity-mes/ncr", …
  const rest = pathname.slice(m.index + marker.length).replace(/^\/+/, "").replace(/[?#].*$/, "");
  if (rest === "") return "Overview";
  if (rest.startsWith("relativity-mes")) return "Relativity MES Sandbox";
  if (rest.startsWith("data-engineering")) return "Data Engineering";
  return TELEMETRY_SLUG_GROUP[rest.split("/")[0]] ?? "Overview";
}

/**
 * Category accent color for a telemetry pathname — the same per-group color the left rail (the
 * "selector") paints each section with. Page headers use it to tint the eyebrow + emphasize one
 * word in the title, so every page reads in its section's color. Defaults to the Overview cyan.
 */
export function telemetryAccentForPath(pathname: string): string {
  return TELEMETRY_NAV_GROUP_META[telemetryGroupForPath(pathname)].accent;
}
