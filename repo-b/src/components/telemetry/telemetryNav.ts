// Single source of truth for telemetry navigation. The desktop rail (TelemetrySidebar),
// the mobile drawer (same component), and the mobile bottom bar (TelemetryBottomNav) all
// consume this list, so adding a section means adding one entry here.
// Icon strings are 16x16 SVG path data, ported from the Option B reference.
//
// Sections follow the "Telemetry Experience Redesign" narrative order (ADO #692):
// Mission Summary (conclusions) -> Operations (live/historical) -> Models & Intelligence
// (how we know) -> Factory & Quality (what's broken) -> Evidence & Lineage (where it came
// from) -> Agent Operations (execution). Six sections keeps primary nav within the shared
// "<=7 primary items" rule. New pages (Program Control Tower, Metric Lineage Explorer,
// Governed Metric Registry, System Health, Agent Control Tower mockup) are added in later
// phases; this phase only regroups the existing surfaces and relabels four of them.

export type TelemetryNavGroup =
  | "Mission Summary"
  | "Operations"
  | "Models & Intelligence"
  | "Factory & Quality"
  | "Evidence & Lineage"
  | "Agent Operations";

export type TelemetryNavItem = {
  slug: string;
  label: string;
  icon: string;
  group: TelemetryNavGroup;
  /** Shown as a tab in the mobile bottom bar (max 4 + "More"). */
  mobilePrimary?: boolean;
};

export const TELEMETRY_NAV: TelemetryNavItem[] = [
  // Section 1 — Mission Summary (executive conclusions)
  { slug: "", label: "Mission Summary", icon: "M2 9h3v5H2zM7 4h3v10H7zM12 7h3v7h-3z", group: "Mission Summary", mobilePrimary: true },

  // Section 2 — Operations (live + historical telemetry)
  { slug: "stream", label: "Mission Control", icon: "M2 12c2-6 10-6 12 0M8 3v3M8 8l3 3", group: "Operations", mobilePrimary: true },
  { slug: "replay", label: "Replay", icon: "M4 3l9 6-9 6z", group: "Operations" },
  { slug: "stargate", label: "Stargate Live", icon: "M8 1l6 3.5v7L8 15l-6-3.5v-7zM8 8l6-3.5M8 8L2 4.5M8 8v7", group: "Operations" },
  { slug: "runs", label: "Test Runs", icon: "M2 4h13v2H2zM2 8h13v2H2zM2 12h9v2H2z", group: "Operations", mobilePrimary: true },
  // System Health consolidates Monitoring + Spike Inspector. Their standalone routes still resolve
  // (no page deleted) — they are embedded here — but the nav presents one operational entry.
  { slug: "system-health", label: "System Health", icon: "M2 9h3l2-5 3 10 2-5h3", group: "Operations" },

  // Section 3 — Models & Intelligence (how we know / can we trust it)
  { slug: "model-performance", label: "Model Performance", icon: "M2 13l4-5 3 2 5-7", group: "Models & Intelligence" },
  { slug: "calibration", label: "RUL Calibration", icon: "M2 13h12M4 13V7m4 6V4m4 9V9", group: "Models & Intelligence" },
  { slug: "registry", label: "Model Registry", icon: "M3 2h10v3H3zM3 7h10v3H3zM3 12h6v2H3z", group: "Models & Intelligence" },
  { slug: "copilot", label: "Test Intelligence", icon: "M8 1l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z", group: "Models & Intelligence", mobilePrimary: true },

  // Section 4 — Factory & Quality (what's broken / needs intervention)
  { slug: "factory", label: "Factory · NCR", icon: "M2 13V7l4 3V7l4 3V4h4v9z", group: "Factory & Quality" },
  { slug: "factory-ml", label: "Flight Readiness", icon: "M2 14V7l3-2 3 2 3-5 3 2v10zM5 14v-4M8 14V8M11 14V6", group: "Factory & Quality" },

  // Section 5 — Evidence & Lineage (where did this number come from / why trust it)
  { slug: "metric-lineage", label: "Metric Lineage", icon: "M4 2v12M4 6h6M4 11h5M10 4v4M9 9v3", group: "Evidence & Lineage" },
  { slug: "metadata", label: "Metadata Explorer", icon: "M2 3h5v4H2zM9 3h5v4H9zM5 9h6v4H5zM4.5 7v2M11.5 7v2M7 11H5M11 11h-1", group: "Evidence & Lineage" },
  { slug: "governance", label: "Trust Center", icon: "M8 1l6 2v4c0 3.5-2.5 6-6 7-3.5-1-6-3.5-6-7V3z", group: "Evidence & Lineage" },
  { slug: "how-it-works", label: "How This Works", icon: "M2 4l4-2 4 2 4-2v10l-4 2-4-2-4 2zM6 2v10M10 4v10", group: "Evidence & Lineage" },

  // Section 6 — Agent Operations (approved execution)
  { slug: "control-tower", label: "Agent Control Tower", icon: "M8 1l6 3v4c0 3-2.5 5.5-6 7-3.5-1.5-6-4-6-7V4zM8 5v6M5 8h6", group: "Agent Operations" },
];

export const TELEMETRY_NAV_GROUPS: TelemetryNavGroup[] = [
  "Mission Summary",
  "Operations",
  "Models & Intelligence",
  "Factory & Quality",
  "Evidence & Lineage",
  "Agent Operations",
];

export function telemetryHref(envId: string, slug: string): string {
  const base = `/lab/env/${envId}/telemetry`;
  return slug ? `${base}/${slug}` : base;
}

export function isTelemetryItemActive(pathname: string, envId: string, slug: string): boolean {
  const base = `/lab/env/${envId}/telemetry`;
  if (!slug) return pathname === base;
  const href = `${base}/${slug}`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Label of the section owning the current pathname (for the mobile header). */
export function telemetrySectionLabel(pathname: string, envId: string): string {
  const match = TELEMETRY_NAV.find((n) => n.slug && isTelemetryItemActive(pathname, envId, n.slug));
  return match?.label ?? "Mission Summary";
}
