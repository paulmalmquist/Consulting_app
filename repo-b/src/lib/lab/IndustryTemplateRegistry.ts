import type { LabDepartmentKey } from "./DepartmentRegistry";

export type IndustryTemplate = {
  key: string;
  enabledDepartments: LabDepartmentKey[];
  defaultDeptKey: LabDepartmentKey;
  hiddenCapabilities?: Partial<Record<LabDepartmentKey, string[]>>;
};

const GENERAL_TEMPLATE: IndustryTemplate = {
  key: "general",
  enabledDepartments: ["executive", "operations", "crm", "accounting", "documents", "admin"],
  defaultDeptKey: "executive",
  hiddenCapabilities: {},
};

const TEMPLATES: Record<string, IndustryTemplate> = {
  legal: {
    key: "legal",
    enabledDepartments: ["legal", "accounting", "documents", "admin"],
    defaultDeptKey: "legal",
  },
  healthcare: {
    key: "healthcare",
    enabledDepartments: ["operations", "documents", "hr", "accounting", "it", "executive"],
    defaultDeptKey: "operations",
    hiddenCapabilities: { it: ["changes"] },
  },
  dental: {
    key: "dental",
    enabledDepartments: ["operations", "documents", "hr", "accounting", "it", "executive"],
    defaultDeptKey: "operations",
  },
  med_spa: {
    key: "med_spa",
    enabledDepartments: ["operations", "documents", "crm", "accounting", "it", "executive"],
    defaultDeptKey: "operations",
  },
  real_estate: {
    key: "real_estate",
    enabledDepartments: ["crm", "operations", "projects", "accounting", "legal", "documents"],
    defaultDeptKey: "crm",
  },
  construction: {
    key: "construction",
    enabledDepartments: ["projects", "operations", "accounting", "legal", "documents"],
    defaultDeptKey: "projects",
  },
  accounting_firm: {
    key: "accounting_firm",
    enabledDepartments: ["accounting", "documents", "admin", "crm"],
    defaultDeptKey: "accounting",
  },
  insurance: {
    key: "insurance",
    enabledDepartments: ["crm", "operations", "legal", "accounting", "documents"],
    defaultDeptKey: "crm",
  },
  logistics: {
    key: "logistics",
    enabledDepartments: ["operations", "projects", "accounting", "it"],
    defaultDeptKey: "operations",
  },
  manufacturing: {
    key: "manufacturing",
    enabledDepartments: ["operations", "projects", "accounting", "it"],
    defaultDeptKey: "operations",
  },
  retail: {
    key: "retail",
    enabledDepartments: ["crm", "operations", "accounting", "projects"],
    defaultDeptKey: "crm",
  },
  restaurant: {
    key: "restaurant",
    enabledDepartments: ["operations", "hr", "accounting", "documents"],
    defaultDeptKey: "operations",
  },
  saas: {
    key: "saas",
    enabledDepartments: ["crm", "it", "projects", "executive", "accounting"],
    defaultDeptKey: "executive",
  },
  marketing_agency: {
    key: "marketing_agency",
    enabledDepartments: ["crm", "projects", "executive", "accounting"],
    defaultDeptKey: "crm",
  },
  nonprofit: {
    key: "nonprofit",
    enabledDepartments: ["operations", "hr", "accounting", "documents", "executive"],
    defaultDeptKey: "operations",
  },
  education: {
    key: "education",
    enabledDepartments: ["operations", "hr", "accounting", "documents", "crm"],
    defaultDeptKey: "operations",
  },
  financial_services: {
    key: "financial_services",
    enabledDepartments: ["accounting", "legal", "executive", "crm"],
    defaultDeptKey: "executive",
  },
  wealth_management: {
    key: "wealth_management",
    enabledDepartments: ["crm", "legal", "accounting", "executive", "documents"],
    defaultDeptKey: "executive",
  },
  home_services: {
    key: "home_services",
    enabledDepartments: ["operations", "accounting", "crm", "projects"],
    defaultDeptKey: "operations",
  },
  it_msp: {
    key: "it_msp",
    enabledDepartments: ["it", "operations", "executive", "crm", "accounting"],
    defaultDeptKey: "it",
  },
  recruiting: {
    key: "recruiting",
    enabledDepartments: ["crm", "hr", "operations", "accounting", "documents"],
    defaultDeptKey: "hr",
  },
  media: {
    key: "media",
    enabledDepartments: ["projects", "crm", "executive", "accounting", "documents"],
    defaultDeptKey: "projects",
  },
  website: {
    key: "website",
    enabledDepartments: ["operations", "documents", "admin", "executive", "accounting"],
    defaultDeptKey: "operations",
  },
};

export function getIndustryTemplate(industry?: string | null): IndustryTemplate {
  if (!industry) return GENERAL_TEMPLATE;
  return TEMPLATES[industry] || GENERAL_TEMPLATE;
}
