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
  icon: string;
  order: number;
  description: string;
};

export const LAB_DEPARTMENTS: LabDepartmentMeta[] = [
  { key: "crm", label: "CRM", icon: "users", order: 10, description: "Pipeline, contacts, and client activity" },
  { key: "accounting", label: "Accounting", icon: "calculator", order: 20, description: "Books, AP/AR, and controls" },
  { key: "operations", label: "Operations", icon: "settings", order: 30, description: "Workflows, SOPs, and daily execution" },
  { key: "projects", label: "Projects", icon: "clipboard", order: 40, description: "Milestones, budget, and delivery" },
  { key: "it", label: "IT Tickets", icon: "cpu", order: 50, description: "Requests, queue, and SLA" },
  { key: "legal", label: "Legal", icon: "shield", order: 60, description: "Contracts, obligations, and policy" },
  { key: "hr", label: "HR", icon: "heart", order: 70, description: "People operations and staffing" },
  { key: "executive", label: "Executive", icon: "gauge", order: 80, description: "Company-level KPIs and risk" },
  { key: "documents", label: "Documents", icon: "folder", order: 90, description: "Files, versions, and access" },
  { key: "admin", label: "Admin", icon: "lock", order: 100, description: "Users, settings, and audit controls" },
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

export function isLabDepartmentKey(value: string): value is LabDepartmentKey {
  return value in LAB_DEPARTMENT_BY_KEY;
}
