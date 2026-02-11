/**
 * usePermissions hook — stub for department-scoped RBAC.
 *
 * Phase 1: Returns full permissions for all departments (no enforcement).
 * Phase 2: Will fetch from /api/businesses/{id}/permissions?dept={deptKey}.
 */

export interface Permissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canApprove: boolean;
  loading: boolean;
}

export function usePermissions(_deptKey: string): Permissions {
  return {
    canRead: true,
    canWrite: true,
    canDelete: true,
    canApprove: true,
    loading: false,
  };
}
