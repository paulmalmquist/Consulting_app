import type { LabDepartmentKey } from "./DepartmentRegistry";
import type { LabCapabilityMeta } from "./CapabilityRegistry";

export type LabRole = "admin" | "operator" | "viewer";

export const LAB_ROLE_STORAGE_KEY = "lab_user_role";

const ROLE_DEPARTMENT_DENY: Record<LabRole, LabDepartmentKey[]> = {
  admin: [],
  operator: ["admin"],
  viewer: ["admin"],
};

const ROLE_CAPABILITY_CATEGORY_DENY: Record<LabRole, string[]> = {
  admin: [],
  operator: ["Admin"],
  viewer: ["Admin", "Workflows"],
};

export function getStoredLabRole(): LabRole {
  if (typeof window === "undefined") return "operator";
  const value = window.localStorage.getItem(LAB_ROLE_STORAGE_KEY);
  if (value === "admin" || value === "operator" || value === "viewer") {
    return value;
  }
  return "operator";
}

export function setStoredLabRole(role: LabRole) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAB_ROLE_STORAGE_KEY, role);
}

export function isDepartmentAllowed(role: LabRole, deptKey: LabDepartmentKey): boolean {
  return !ROLE_DEPARTMENT_DENY[role].includes(deptKey);
}

export function filterDepartmentsByRole<T extends { key: LabDepartmentKey }>(
  role: LabRole,
  departments: T[]
): T[] {
  return departments.filter((dept) => isDepartmentAllowed(role, dept.key));
}

export function isCapabilityAllowed(role: LabRole, capability: LabCapabilityMeta): boolean {
  return !ROLE_CAPABILITY_CATEGORY_DENY[role].includes(capability.category);
}

export function filterCapabilitiesByRole(role: LabRole, caps: LabCapabilityMeta[]): LabCapabilityMeta[] {
  return caps.filter((cap) => isCapabilityAllowed(role, cap));
}
