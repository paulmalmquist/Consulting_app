/**
 * Vertical taxonomy for the consulting pipeline.
 *
 * "Verticals" are high-level business sectors (REPE, Legal, Finance, …).
 * Each vertical maps to a set of specific industry tag strings that may appear
 * on ExecutionCard.industry.  industryToVertical() collapses a raw tag to its
 * parent vertical so the chart can group bar segments by sector.
 */

export const VERTICAL_MAP: Record<string, string[]> = {
  REPE: [
    "REPE",
    "Real Estate",
    "Real Estate Private Equity",
    "REAL_ESTATE",
    "RE",
    "Commercial Real Estate",
    "CRE",
  ],
  Legal: ["Legal", "Law", "LEGAL", "Legal Services", "LAW"],
  Healthcare: [
    "Healthcare",
    "Health",
    "Medical",
    "HEALTHCARE",
    "Health Services",
  ],
  Finance: [
    "Finance",
    "Financial",
    "Banking",
    "BANKING",
    "Financial Services",
    "FinTech",
    "Private Equity",
    "PE_BACKOFFICE",
    "PE Backoffice",
  ],
  PDS: [
    "PDS",
    "Construction",
    "Professional Services",
    "CONSTRUCTION",
    "Engineering",
    "Architecture",
    "Consulting",
    "Advisory",
  ],
  Technology: [
    "Technology",
    "Tech",
    "TECHNOLOGY",
    "SaaS",
    "Software",
    "IT",
    "Cloud",
  ],
};

export const VERTICAL_COLORS: Record<string, string> = {
  REPE: "#22D3EE",
  Legal: "#E879F9",
  Healthcare: "#34D399",
  Finance: "#A78BFA",
  PDS: "#F59E0B",
  Technology: "#818CF8",
  Other: "#6B7280",
};

export const VERTICAL_ORDER = [
  "REPE",
  "Legal",
  "Healthcare",
  "Finance",
  "PDS",
  "Technology",
  "Other",
] as const;

export type Vertical = (typeof VERTICAL_ORDER)[number];
export type ColorMode = "vertical" | "industry";

/** Map a raw industry tag to its parent vertical, falling back to "Other". */
export function industryToVertical(industry: string): string {
  const normalized = industry.trim().toLowerCase();
  for (const [vert, aliases] of Object.entries(VERTICAL_MAP)) {
    if (aliases.some((a) => a.toLowerCase() === normalized)) return vert;
  }
  return "Other";
}
