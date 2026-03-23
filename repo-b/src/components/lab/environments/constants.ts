const MERIDIAN_INSTITUTIONAL_DEMO_ENV_ID = "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f101";

function normalizeKey(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

export function resolveEnvironmentTemplateKey(args: {
  workspaceTemplateKey?: string | null;
  industry?: string | null;
  industryType?: string | null;
}): string | null {
  const explicit = normalizeKey(args.workspaceTemplateKey);
  if (explicit) {
    return explicit;
  }

  const key = normalizeKey(args.industryType || args.industry);
  if (!key) return null;
  if (key === "repe" || key.includes("real_estate")) return "repe_workspace";
  if (key === "pds" || key === "pds_command") return "pds_enterprise";
  if (key === "ecc" || key === "executive_command_center") return "ecc_command";
  if (key === "credit" || key === "credit_risk_hub") return "credit_risk_hub";
  if (key === "legal" || key === "legal_ops" || key === "legal_ops_command") return "legal_ops_command";
  if (key === "medical" || key === "medical_office_backoffice") return "medical_office_backoffice";
  if (key === "consulting" || key === "consulting_revenue_os") return "consulting_revenue_os";
  if (key === "website" || key.includes("floyorker") || key.includes("digital_media")) return "website_workspace";
  if (key === "visual_resume" || key === "resume") return "visual_resume_workspace";
  if (key === "market_rotation" || key === "market intelligence") return "market_rotation_engine";
  return null;
}

export function isRepeEnvironment(industry?: string | null): boolean {
  const key = normalizeKey(industry);
  return key.includes("real_estate") || key.includes("repe");
}

export function isWebsiteEnvironment(industry?: string | null): boolean {
  const key = normalizeKey(industry);
  return key === "website" || key.includes("floyorker") || key.includes("digital_media");
}

export function isConsultingEnvironment(industry?: string | null): boolean {
  const key = normalizeKey(industry);
  return key === "consulting" || key === "consulting_revenue_os";
}

export function isPdsEnvironment(industry?: string | null): boolean {
  const key = normalizeKey(industry);
  return key === "pds" || key === "pds_command";
}

export function isCreditEnvironment(industry?: string | null): boolean {
  const key = normalizeKey(industry);
  return key === "credit" || key === "credit_risk_hub";
}

export function isLegalOpsEnvironment(industry?: string | null): boolean {
  const key = normalizeKey(industry);
  return key === "legal" || key === "legal_ops" || key === "legal_ops_command";
}

export function isMedicalBackofficeEnvironment(industry?: string | null): boolean {
  const key = normalizeKey(industry);
  return key === "medical" || key === "medical_office_backoffice";
}

export function isVisualResumeEnvironment(industry?: string | null): boolean {
  const key = normalizeKey(industry);
  return key === "visual_resume" || key === "resume";
}

export function isMarketRotationEnvironment(industry?: string | null): boolean {
  const key = normalizeKey(industry);
  return (
    key === "market_rotation" ||
    key === "market-rotation" ||
    key === "market_rotation_engine" ||
    key === "market intelligence" ||
    key === "market_intelligence"
  );
}

export function resolveEnvironmentOpenPath(args: {
  envId: string;
  industry?: string | null;
  industryType?: string | null;
  workspaceTemplateKey?: string | null;
}): string {
  if (args.envId === MERIDIAN_INSTITUTIONAL_DEMO_ENV_ID) {
    return `/lab/env/${args.envId}/demo`;
  }

  const templateKey = resolveEnvironmentTemplateKey(args);
  const industryKey = normalizeKey(args.industryType || args.industry);

  if (templateKey === "market_rotation_engine" || isMarketRotationEnvironment(industryKey)) {
    return `/lab/env/${args.envId}/markets`;
  }
  if (isRepeEnvironment(industryKey)) return `/lab/env/${args.envId}/re`;
  if (isConsultingEnvironment(industryKey)) return `/lab/env/${args.envId}/consulting`;
  if (isPdsEnvironment(industryKey)) return `/lab/env/${args.envId}/pds`;
  if (isCreditEnvironment(industryKey)) return `/lab/env/${args.envId}/credit`;
  if (isLegalOpsEnvironment(industryKey)) return `/lab/env/${args.envId}/legal`;
  if (isMedicalBackofficeEnvironment(industryKey)) return `/lab/env/${args.envId}/medical`;
  if (isWebsiteEnvironment(industryKey)) return `/lab/env/${args.envId}/content`;
  if (isVisualResumeEnvironment(industryKey)) return `/lab/env/${args.envId}/resume`;
  if (industryKey === "ecc" || industryKey === "executive_command_center") return `/lab/env/${args.envId}/ecc`;
  return `/lab/env/${args.envId}`;
}
