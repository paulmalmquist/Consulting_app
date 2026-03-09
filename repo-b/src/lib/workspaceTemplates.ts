export const workspaceTemplateRegistry = {
  generic: { label: "Generic Workspace", openPath: null },
  repe_workspace: { label: "REPE Workspace", openPath: "re" },
  pds_enterprise: { label: "PDS Enterprise OS", openPath: "pds" },
  ecc_command: { label: "Executive Command Center", openPath: "ecc" },
  credit_risk_hub: { label: "Credit Risk Hub", openPath: "credit" },
  legal_ops_command: { label: "Legal Ops Command", openPath: "legal" },
  medical_office_backoffice: { label: "Medical Office Backoffice", openPath: "medical" },
  consulting_revenue_os: { label: "Consulting Revenue OS", openPath: "consulting" },
  website_workspace: { label: "Website Workspace", openPath: "content" },
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
