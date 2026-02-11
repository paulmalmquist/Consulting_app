import { LAB_HOMEPAGE_VERSION } from "./homepageContract";
import {
  getDefaultDepartmentForIndustry,
  getEnabledDepartmentsForIndustry,
} from "./DepartmentRegistry";
import { LAB_CAPABILITIES_BY_DEPARTMENT } from "./CapabilityRegistry";

export type LabHomepageHealth = {
  version: string;
  hasRoutes: boolean;
  hasDeptRegistry: boolean;
  hasCapabilityRegistry: boolean;
  openButtonTargetsHomepage: boolean;
  canRenderShell: boolean;
  defaultDeptKey: string;
  departmentCount: number;
  capabilityCount: number;
  openTargetRoute: string;
  suggestedFixes: string[];
};

export function getLabHomepageHealth(envId: string, industry?: string | null): LabHomepageHealth {
  const departments = getEnabledDepartmentsForIndustry(industry);
  const defaultDept = getDefaultDepartmentForIndustry(industry);
  const capabilityCount = departments.reduce((sum, dept) => {
    const entries = LAB_CAPABILITIES_BY_DEPARTMENT[dept.key] || [];
    return sum + entries.length;
  }, 0);

  const hasDeptRegistry = departments.length > 0;
  const hasCapabilityRegistry = capabilityCount > 0;
  const canRenderShell = hasDeptRegistry && hasCapabilityRegistry;

  const suggestedFixes: string[] = [];
  if (!hasDeptRegistry) suggestedFixes.push("Department registry returned zero departments.");
  if (!hasCapabilityRegistry)
    suggestedFixes.push("Capability registry has no capabilities for enabled departments.");
  if (!canRenderShell) suggestedFixes.push("Shell cannot render without department/capability metadata.");

  return {
    version: LAB_HOMEPAGE_VERSION,
    hasRoutes: true,
    hasDeptRegistry,
    hasCapabilityRegistry,
    openButtonTargetsHomepage: true,
    canRenderShell,
    defaultDeptKey: defaultDept,
    departmentCount: departments.length,
    capabilityCount,
    openTargetRoute: `/lab/env/${envId}`,
    suggestedFixes,
  };
}
