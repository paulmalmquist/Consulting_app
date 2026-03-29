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
  "discovery_lab",
  "data_studio",
  "workflow_intel",
  "vendor_intel",
  "metric_dict",
  "data_chaos",
  "exec_blueprint",
  "pilot_builder",
  "impact_estimator",
  "case_factory",
  "ai_copilot",
  "engagement_output",
  "execution_pattern_intel",
  "visual_resume",
  "trading_platform",
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
  discovery_lab: "Execution Discovery Lab",
  data_studio: "Data Ingestion & Mapping Studio",
  workflow_intel: "Workflow Intelligence Engine",
  vendor_intel: "Vendor Intelligence Engine",
  metric_dict: "Metric Dictionary Engine",
  data_chaos: "Data Chaos Detector",
  exec_blueprint: "Execution Blueprint Studio",
  pilot_builder: "Pilot Builder",
  impact_estimator: "Economic Impact Estimator",
  case_factory: "Case Study Factory",
  ai_copilot: "AI Discovery Copilot",
  engagement_output: "Engagement Output Center",
  execution_pattern_intel: "Execution Pattern Intelligence",
  visual_resume: "Visual Resume",
  trading_platform: "Trading Platform",
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

export function isDiscoveryLabEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "discovery_lab" || key === "discovery";
}

export function isDataStudioEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "data_studio";
}

export function isWorkflowIntelEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "workflow_intel";
}

export function isVendorIntelEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "vendor_intel";
}

export function isMetricDictEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "metric_dict";
}

export function isDataChaosEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "data_chaos";
}

export function isExecBlueprintEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "exec_blueprint";
}

export function isPilotBuilderEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "pilot_builder";
}

export function isImpactEstimatorEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "impact_estimator";
}

export function isCaseFactoryEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "case_factory";
}

export function isAiCopilotEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "ai_copilot";
}

export function isEngagementOutputEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "engagement_output";
}

export function isExecutionPatternIntelEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "execution_pattern_intel" || key === "pattern_intel";
}

export function isVisualResumeEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return key === "visual_resume" || key === "resume";
}

export function isTradingPlatformEnvironment(industry?: string | null): boolean {
  const key = (industry || "").trim().toLowerCase();
  return ["trading_platform", "market_rotation", "market_intelligence", "msa_rotation", "markets"].includes(key);
}

/** @deprecated Use isTradingPlatformEnvironment */
export const isMarketRotationEnvironment = isTradingPlatformEnvironment;

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
  if (isDiscoveryLabEnvironment(args.industry)) return `/lab/env/${args.envId}/discovery`;
  if (isDataStudioEnvironment(args.industry)) return `/lab/env/${args.envId}/data-studio`;
  if (isWorkflowIntelEnvironment(args.industry)) return `/lab/env/${args.envId}/workflow-intel`;
  if (isVendorIntelEnvironment(args.industry)) return `/lab/env/${args.envId}/vendor-intel`;
  if (isMetricDictEnvironment(args.industry)) return `/lab/env/${args.envId}/metric-dict`;
  if (isDataChaosEnvironment(args.industry)) return `/lab/env/${args.envId}/data-chaos`;
  if (isExecBlueprintEnvironment(args.industry)) return `/lab/env/${args.envId}/blueprint`;
  if (isPilotBuilderEnvironment(args.industry)) return `/lab/env/${args.envId}/pilot`;
  if (isImpactEstimatorEnvironment(args.industry)) return `/lab/env/${args.envId}/impact`;
  if (isCaseFactoryEnvironment(args.industry)) return `/lab/env/${args.envId}/case-factory`;
  if (isAiCopilotEnvironment(args.industry)) return `/lab/env/${args.envId}/copilot`;
  if (isEngagementOutputEnvironment(args.industry)) return `/lab/env/${args.envId}/outputs`;
  if (isExecutionPatternIntelEnvironment(args.industry)) return `/lab/env/${args.envId}/pattern-intel`;
  if (isVisualResumeEnvironment(args.industry)) return `/lab/env/${args.envId}/resume`;
  if (isMarketRotationEnvironment(args.industry)) return `/lab/env/${args.envId}/markets`;
  return `/lab/env/${args.envId}`;
}

export function isPdsEnterpriseTemplate(args: {
  industry?: string | null;
  industryType?: string | null;
  workspaceTemplateKey?: string | null;
}): boolean {
  return resolveWorkspaceTemplateKey(args) === "pds_enterprise";
}
