import { getAddedDepartments } from "@/lib/envData";
import {
  LAB_DEPARTMENT_BY_KEY,
  getDefaultDepartmentForIndustry,
  getEnabledDepartmentsForIndustry,
  isLabDepartmentKey,
  type LabDepartmentKey,
} from "@/lib/lab/DepartmentRegistry";
import {
  filterDepartmentsByRole,
  getStoredLabRole,
  type LabRole,
} from "@/lib/lab/rbac";

export function deptRoute(envId: string, deptKey: string): string {
  return `/lab/env/${envId}/dept/${deptKey}`;
}

export function capabilityRoute(envId: string, deptKey: string, capKey: string): string {
  return `${deptRoute(envId, deptKey)}/capability/${capKey}`;
}

function lastDeptStorageKey(envId: string): string {
  return `lab:lastDept:${envId}`;
}

export function getStoredLastDept(envId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(lastDeptStorageKey(envId));
}

export function setStoredLastDept(envId: string, deptKey: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(lastDeptStorageKey(envId), deptKey);
}

export function getAllowedDepartmentKeysForEnv(
  envId: string,
  industry?: string | null,
  role?: LabRole
): LabDepartmentKey[] {
  const base = getEnabledDepartmentsForIndustry(industry).map((d) => d.key);
  const extra = getAddedDepartments(envId).filter(isLabDepartmentKey);
  const merged = [...base];
  for (const key of extra) {
    if (!merged.includes(key)) merged.push(key);
  }
  const resolvedRole = role ?? getStoredLabRole();
  return filterDepartmentsByRole(
    resolvedRole,
    merged.map((k) => LAB_DEPARTMENT_BY_KEY[k]).filter(Boolean)
  ).map((d) => d.key);
}

export function resolveDepartmentForEnv(
  envId: string,
  industry?: string | null,
  role?: LabRole
): LabDepartmentKey {
  const allowed = getAllowedDepartmentKeysForEnv(envId, industry, role);
  const defaultDept = getDefaultDepartmentForIndustry(industry);
  const stored = getStoredLastDept(envId);

  if (stored && isLabDepartmentKey(stored) && allowed.includes(stored)) {
    return stored;
  }
  if (allowed.includes(defaultDept)) return defaultDept;
  return allowed[0] ?? defaultDept;
}
