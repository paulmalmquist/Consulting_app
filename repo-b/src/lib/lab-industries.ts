export type LabIndustryKey =
  | "legal"
  | "healthcare"
  | "dental"
  | "med_spa"
  | "real_estate"
  | "construction"
  | "accounting_firm"
  | "insurance"
  | "logistics"
  | "manufacturing"
  | "retail"
  | "restaurant"
  | "saas"
  | "marketing_agency"
  | "nonprofit"
  | "education"
  | "financial_services"
  | "wealth_management"
  | "home_services"
  | "it_msp"
  | "recruiting"
  | "media"
  | "website";

export type LabIndustryMeta = {
  key: LabIndustryKey;
  label: string;
  description: string;
  recommendedDepartments: string[];
};

export const LAB_INDUSTRIES: LabIndustryMeta[] = [
  {
    key: "legal",
    label: "Legal / Law Firm",
    description: "Matter intake, document workflows, and compliance review.",
    recommendedDepartments: ["Legal", "Documents", "Admin"],
  },
  {
    key: "healthcare",
    label: "Healthcare Provider",
    description: "Clinical ops, scheduling, billing, and compliance guardrails.",
    recommendedDepartments: ["Operations", "Documents", "HR"],
  },
  {
    key: "dental",
    label: "Dental Practice",
    description: "Patient flow, recalls, treatment plans, and insurance claims.",
    recommendedDepartments: ["Operations", "Accounting", "Admin"],
  },
  {
    key: "med_spa",
    label: "Med Spa",
    description: "Appointments, memberships, treatment notes, and packages.",
    recommendedDepartments: ["CRM", "Operations", "Accounting"],
  },
  {
    key: "real_estate",
    label: "Real Estate / Property Ops",
    description: "Leads, listings, contracts, and property task automation.",
    recommendedDepartments: ["CRM", "Legal", "Operations"],
  },
  {
    key: "construction",
    label: "Construction / Trades",
    description: "Project execution, field updates, and vendor coordination.",
    recommendedDepartments: ["Projects", "Operations", "Accounting"],
  },
  {
    key: "accounting_firm",
    label: "Accounting Firm",
    description: "Client bookkeeping, close cycles, and advisory workflows.",
    recommendedDepartments: ["Accounting", "Documents", "Admin"],
  },
  {
    key: "insurance",
    label: "Insurance Agency",
    description: "Policy lifecycle, renewals, claims intake, and servicing.",
    recommendedDepartments: ["CRM", "Operations", "Legal"],
  },
  {
    key: "logistics",
    label: "Logistics / Trucking",
    description: "Dispatch, route execution, shipment issues, and SLA tracking.",
    recommendedDepartments: ["Operations", "Projects", "Accounting"],
  },
  {
    key: "manufacturing",
    label: "Manufacturing",
    description: "Production planning, quality control, and supplier workflows.",
    recommendedDepartments: ["Operations", "Projects", "Accounting"],
  },
  {
    key: "retail",
    label: "Retail / eCommerce",
    description: "Catalog, fulfillment, support, and marketing performance.",
    recommendedDepartments: ["CRM", "Operations", "Accounting"],
  },
  {
    key: "restaurant",
    label: "Restaurant / Hospitality",
    description: "Staffing, inventory, scheduling, and location operations.",
    recommendedDepartments: ["Operations", "HR", "Accounting"],
  },
  {
    key: "saas",
    label: "SaaS / B2B Software",
    description: "Pipeline, customer success, support queue, and KPIs.",
    recommendedDepartments: ["CRM", "IT", "Executive"],
  },
  {
    key: "marketing_agency",
    label: "Marketing / Creative Agency",
    description: "Campaign workflow, client delivery, and utilization metrics.",
    recommendedDepartments: ["CRM", "Projects", "Executive"],
  },
  {
    key: "nonprofit",
    label: "Nonprofit",
    description: "Donor operations, programs, grants, and reporting cadence.",
    recommendedDepartments: ["CRM", "Projects", "Executive"],
  },
  {
    key: "education",
    label: "Education / Training",
    description: "Learner lifecycle, program ops, and content administration.",
    recommendedDepartments: ["Operations", "HR", "Documents"],
  },
  {
    key: "financial_services",
    label: "Financial Services",
    description: "Client servicing, controls, approvals, and audit trails.",
    recommendedDepartments: ["Accounting", "Legal", "Executive"],
  },
  {
    key: "wealth_management",
    label: "Wealth Management / RIA",
    description: "Household reviews, compliance tasks, and advisor workflows.",
    recommendedDepartments: ["CRM", "Legal", "Executive"],
  },
  {
    key: "home_services",
    label: "Home Services (HVAC/Plumbing/etc)",
    description: "Job scheduling, dispatch, billing, and technician workflows.",
    recommendedDepartments: ["Operations", "Accounting", "CRM"],
  },
  {
    key: "it_msp",
    label: "IT Managed Services (MSP)",
    description: "Ticket triage, SLA response, change control, and escalations.",
    recommendedDepartments: ["IT", "Operations", "Executive"],
  },
  {
    key: "recruiting",
    label: "Recruiting / Staffing",
    description: "Pipeline management, placements, and client coordination.",
    recommendedDepartments: ["CRM", "HR", "Operations"],
  },
  {
    key: "media",
    label: "Media / Publishing",
    description: "Editorial pipeline, ad ops, publishing cadence, and analytics.",
    recommendedDepartments: ["Projects", "CRM", "Executive"],
  },
  {
    key: "website",
    label: "Website / Simple Org",
    description: "Lightweight workflow testing for smaller team operations.",
    recommendedDepartments: ["Operations", "Documents", "Admin"],
  },
];

const LAB_INDUSTRY_MAP = new Map<string, LabIndustryMeta>(
  LAB_INDUSTRIES.map((industry) => [industry.key, industry])
);

export function getLabIndustryMeta(industryKey?: string | null): LabIndustryMeta | null {
  if (!industryKey) return null;
  return LAB_INDUSTRY_MAP.get(industryKey) || null;
}

