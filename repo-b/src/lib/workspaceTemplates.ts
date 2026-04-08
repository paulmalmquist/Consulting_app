export const workspaceTemplateRegistry = {
  generic: { label: "Generic Workspace", openPath: null },
  trading_platform: { label: "Trading Platform", openPath: "markets" },
  repe_workspace: { label: "REPE Workspace", openPath: "re" },
  pds_enterprise: { label: "PDS Enterprise OS", openPath: "pds" },
  ecc_command: { label: "Executive Command Center", openPath: "ecc" },
  credit_risk_hub: { label: "Credit Risk Hub", openPath: "credit" },
  legal_ops_command: { label: "Legal Ops Command", openPath: "legal" },
  medical_office_backoffice: { label: "Medical Office Backoffice", openPath: "medical" },
  consulting_revenue_os: { label: "Consulting Revenue OS", openPath: "consulting" },
  website_workspace: { label: "Website Workspace", openPath: "content" },
  discovery_lab: { label: "Execution Discovery Lab", openPath: "discovery" },
  data_studio: { label: "Data Ingestion & Mapping Studio", openPath: "data-studio" },
  workflow_intel: { label: "Workflow Intelligence Engine", openPath: "workflow-intel" },
  vendor_intel: { label: "Vendor Intelligence Engine", openPath: "vendor-intel" },
  metric_dict: { label: "Metric Dictionary Engine", openPath: "metric-dict" },
  data_chaos: { label: "Data Chaos Detector", openPath: "data-chaos" },
  exec_blueprint: { label: "Execution Blueprint Studio", openPath: "blueprint" },
  pilot_builder: { label: "Pilot Builder", openPath: "pilot" },
  impact_estimator: { label: "Economic Impact Estimator", openPath: "impact" },
  case_factory: { label: "Case Study Factory", openPath: "case-factory" },
  ai_copilot: { label: "AI Discovery Copilot", openPath: "copilot" },
  engagement_output: { label: "Engagement Output Center", openPath: "outputs" },
  visual_resume: { label: "Visual Resume", openPath: "resume" },
  multi_entity_operator: { label: "Multi-Entity Operator", openPath: "operator" },
} as const;

export type KnownWorkspaceTemplateKey = keyof typeof workspaceTemplateRegistry;

export type WorkspaceTemplateInput = {
  workspaceTemplateKey?: string | null;
  industry?: string | null;
  industryType?: string | null;
};

function normalizeKey(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

export function resolveWorkspaceTemplateKey(input: WorkspaceTemplateInput): string | null {
  const explicit = normalizeKey(input.workspaceTemplateKey);
  if (explicit) return explicit;

  const industryKey = normalizeKey(input.industryType || input.industry);
  if (!industryKey) return null;

  if (industryKey === "pds_command" || industryKey === "pds") return "pds_enterprise";
  if (industryKey === "repe" || industryKey === "real_estate" || industryKey === "real_estate_pe") return "repe_workspace";
  if (industryKey === "ecc" || industryKey === "executive_command_center") return "ecc_command";
  if (industryKey === "credit_risk_hub" || industryKey === "credit") return "credit_risk_hub";
  if (industryKey === "legal_ops_command" || industryKey === "legal_ops" || industryKey === "legal") return "legal_ops_command";
  if (industryKey === "medical_office_backoffice" || industryKey === "medical") return "medical_office_backoffice";
  if (industryKey === "consulting" || industryKey === "consulting_revenue_os") return "consulting_revenue_os";
  if (industryKey === "website" || industryKey.includes("floyorker") || industryKey.includes("digital_media")) return "website_workspace";
  if (industryKey === "discovery_lab" || industryKey === "discovery") return "discovery_lab";
  if (industryKey === "data_studio") return "data_studio";
  if (industryKey === "workflow_intel") return "workflow_intel";
  if (industryKey === "vendor_intel") return "vendor_intel";
  if (industryKey === "metric_dict") return "metric_dict";
  if (industryKey === "data_chaos") return "data_chaos";
  if (industryKey === "exec_blueprint") return "exec_blueprint";
  if (industryKey === "pilot_builder") return "pilot_builder";
  if (industryKey === "impact_estimator") return "impact_estimator";
  if (industryKey === "case_factory") return "case_factory";
  if (industryKey === "ai_copilot") return "ai_copilot";
  if (industryKey === "engagement_output") return "engagement_output";
  if (industryKey === "visual_resume" || industryKey === "resume") return "visual_resume";
  if (industryKey === "multi_entity_operator" || industryKey === "operator") return "multi_entity_operator";
  if (["trading_platform", "trading", "market_rotation", "market_intelligence", "msa_rotation", "financial_markets"].includes(industryKey)) return "trading_platform";
  return null;
}

export function getWorkspaceTemplateMeta(input: WorkspaceTemplateInput) {
  const templateKey = resolveWorkspaceTemplateKey(input);
  if (!templateKey) return workspaceTemplateRegistry.generic;
  return workspaceTemplateRegistry[templateKey as KnownWorkspaceTemplateKey] || workspaceTemplateRegistry.generic;
}

export function resolveWorkspaceOpenPath(envId: string, input: WorkspaceTemplateInput): string | null {
  const template = getWorkspaceTemplateMeta(input);
  if (!template.openPath) return null;
  return `/lab/env/${envId}/${template.openPath}`;
}
