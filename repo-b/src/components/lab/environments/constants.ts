import { resolveWorkspaceOpenPath, resolveWorkspaceTemplateKey } from "@/lib/workspaceTemplates";

export const industries = [
  "ecc",
  "repe",
  "pds_command",
  "credit_risk_hub",
  "legal_ops_command",
  "medical_office_backoffice",
  "floyorker",
  "healthcare",
  "legal",
  "construction",
  "real_estate",
  "website",
  "consulting",
] as const;

export type Industry = (typeof industries)[number];

export type EnvironmentStatus = "active" | "provisioning" | "failed" | "archived";

export const statusLabel: Record<EnvironmentStatus, string> = {
  active: "Active",
  provisioning: "Provisioning",
  failed: "Failed",
  archived: "Archived",
};

export const MERIDIAN_INSTITUTIONAL_DEMO_ENV_ID = "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f101";

const INDUSTRY_DISPLAY_MAP: Record<string, string> = {
  ecc: "Executive Command Center",
  repe: "Real Estate Private Equity",
  pds_command: "PDS Command",
  credit_risk_hub: "Credit Risk Hub",
  legal_ops_command: "Legal Ops Command",
  medical_office_backoffice: "Medical Office Backoffice",
  floyorker: "Digital Media / Floyorker",
  healthcare: "Healthcare",
  legal: "Legal",
  construction: "Construction",
  real_estate: "Real Estate",
  website: "Website / General",
  consulting: "Consulting Revenue OS",
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

export function isEccEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "ecc" || key === "executive_command_center";
}

export function isFloyorkerEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key.includes("floyorker") || key.includes("digital_media");
}

export function isWebsiteEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "website" || key.includes("floyorker") || key.includes("digital_media");
}

export function isPdsEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "pds_command" || key === "pds";
}

export function isCreditEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "credit_risk_hub" || key === "credit";
}

export function isLegalOpsEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "legal_ops_command" || key === "legal_ops" || key === "legal";
}

export function isMedicalBackofficeEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "medical_office_backoffice" || key === "medical";
}

export function isConsultingEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "consulting" || key === "consulting_revenue_os";
}

export function resolveEnvironmentOpenPath(args: {
  envId: string;
  industry?: string | null;
  industryType?: string | null;
  workspaceTemplateKey?: string | null;
}): string {
  if (args.envId === MERIDIAN_INSTITUTIONAL_DEMO_ENV_ID) return `/lab/env/${args.envId}/demo`;
  const templatePath = resolveWorkspaceOpenPath(args.envId, {
    workspaceTemplateKey: args.workspaceTemplateKey,
    industry: args.industry,
    industryType: args.industryType,
  });
  if (templatePath) return templatePath;
  if (isEccEnvironment(args.industry)) return `/lab/env/${args.envId}/ecc`;
  if (isRepeEnvironment(args.industry)) return `/lab/env/${args.envId}/re`;
  if (isConsultingEnvironment(args.industry)) return `/lab/env/${args.envId}/consulting`;
  if (isPdsEnvironment(args.industry)) return `/lab/env/${args.envId}/pds`;
  if (isCreditEnvironment(args.industry)) return `/lab/env/${args.envId}/credit`;
  if (isLegalOpsEnvironment(args.industry)) return `/lab/env/${args.envId}/legal`;
  if (isMedicalBackofficeEnvironment(args.industry)) return `/lab/env/${args.envId}/medical`;
  if (isWebsiteEnvironment(args.industry)) return `/lab/env/${args.envId}/content`;
  return `/lab/env/${args.envId}`;
}

export function isPdsEnterpriseTemplate(args: {
  industry?: string | null;
  industryType?: string | null;
  workspaceTemplateKey?: string | null;
}): boolean {
  return resolveWorkspaceTemplateKey(args) === "pds_enterprise";
}
