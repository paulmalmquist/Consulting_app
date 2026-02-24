export const industries = [
  "repe",
  "floyorker",
  "healthcare",
  "legal",
  "construction",
  "real_estate",
  "website",
] as const;

export type Industry = (typeof industries)[number];

export type EnvironmentStatus = "active" | "provisioning" | "failed" | "archived";

export const statusLabel: Record<EnvironmentStatus, string> = {
  active: "Active",
  provisioning: "Provisioning",
  failed: "Failed",
  archived: "Archived",
};

const INDUSTRY_DISPLAY_MAP: Record<string, string> = {
  repe: "Real Estate Private Equity",
  floyorker: "Digital Media / Floyorker",
  healthcare: "Healthcare",
  legal: "Legal",
  construction: "Construction",
  real_estate: "Real Estate",
  website: "Website / General",
};

export function statusFromFlags(isActive: boolean): EnvironmentStatus {
  return isActive ? "active" : "archived";
}

export function humanIndustry(value?: string | null): string {
  if (!value) return "General";
  return (
    INDUSTRY_DISPLAY_MAP[value.toLowerCase()] ||
    value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
  );
}

export function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function isRepeEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key.includes("real_estate") || key.includes("repe") || key.includes("real estate");
}

export function isFloyorkerEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key.includes("floyorker") || key.includes("digital_media");
}

export function isWebsiteEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "website" || key.includes("floyorker") || key.includes("digital_media");
}

export function resolveEnvironmentOpenPath(args: { envId: string; industry?: string | null }): string {
  if (isRepeEnvironment(args.industry)) return `/lab/env/${args.envId}/re`;
  if (isWebsiteEnvironment(args.industry)) return `/lab/env/${args.envId}/content`;
  return `/lab/env/${args.envId}`;
}
