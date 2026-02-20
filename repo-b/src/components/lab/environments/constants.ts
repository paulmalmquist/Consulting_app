export const industries = ["healthcare", "legal", "construction", "real_estate", "website"] as const;

export type Industry = (typeof industries)[number];

export type EnvironmentStatus = "active" | "provisioning" | "failed" | "archived";

export const statusLabel: Record<EnvironmentStatus, string> = {
  active: "Active",
  provisioning: "Provisioning",
  failed: "Failed",
  archived: "Archived",
};

export function statusFromFlags(isActive: boolean): EnvironmentStatus {
  return isActive ? "active" : "archived";
}

export function humanIndustry(value?: string | null): string {
  if (!value) return "General";
  return value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
