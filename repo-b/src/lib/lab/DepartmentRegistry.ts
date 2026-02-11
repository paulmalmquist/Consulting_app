import { getIndustryTemplate } from "./IndustryTemplateRegistry";

export type LabDepartmentKey =
  | "crm"
  | "accounting"
  | "operations"
  | "projects"
  | "it"
  | "legal"
  | "hr"
  | "executive"
  | "documents"
  | "admin";

export type LabDepartmentMeta = {
  key: LabDepartmentKey;
  label: string;
  description: string;
};

export const LAB_DEPARTMENTS: LabDepartmentMeta[] = [
  { key: "crm", label: "CRM", description: "Pipeline, contacts, and client activity" },
  { key: "accounting", label: "Accounting", description: "Books, AP/AR, and controls" },
  { key: "operations", label: "Operations", description: "Workflows, SOPs, and daily execution" },
  { key: "projects", label: "Projects", description: "Milestones, budget, and delivery" },
  { key: "it", label: "IT Tickets", description: "Requests, queue, and SLA" },
  { key: "legal", label: "Legal", description: "Contracts, obligations, and policy" },
  { key: "hr", label: "HR", description: "People operations and staffing" },
  { key: "executive", label: "Executive", description: "Company-level KPIs and risk" },
  { key: "documents", label: "Documents", description: "Files, versions, and access" },
  { key: "admin", label: "Admin", description: "Users, settings, and audit controls" },
];

export const LAB_DEPARTMENT_BY_KEY: Record<LabDepartmentKey, LabDepartmentMeta> =
  LAB_DEPARTMENTS.reduce((acc, dept) => {
    acc[dept.key] = dept;
    return acc;
  }, {} as Record<LabDepartmentKey, LabDepartmentMeta>);

export function getEnabledDepartmentsForIndustry(industry?: string | null): LabDepartmentMeta[] {
  const template = getIndustryTemplate(industry);
  return template.enabledDepartments
    .map((key) => LAB_DEPARTMENT_BY_KEY[key])
    .filter(Boolean);
}

export function getDefaultDepartmentForIndustry(industry?: string | null): LabDepartmentKey {
  return getIndustryTemplate(industry).defaultDeptKey;
}
