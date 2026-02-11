"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import {
  LAB_DEPARTMENT_BY_KEY,
  type LabDepartmentKey,
} from "@/lib/lab/DepartmentRegistry";
import { getCapabilitiesForDepartment } from "@/lib/lab/CapabilityRegistry";
import {
  filterCapabilitiesByRole,
  getStoredLabRole,
  isDepartmentAllowed,
  type LabRole,
} from "@/lib/lab/rbac";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { deptRoute, capabilityRoute, resolveDepartmentForEnv, setStoredLastDept } from "@/lib/lab/deptRouting";

export default function LabDepartmentPage({
  params,
}: {
  params: { envId: string; deptKey: string };
}) {
  const router = useRouter();
  const { selectedEnv } = useEnv();
  const [role, setRole] = useState<LabRole>(() => getStoredLabRole());

  const deptKey = params.deptKey as LabDepartmentKey;
  const department = LAB_DEPARTMENT_BY_KEY[deptKey];

  const industry =
    selectedEnv?.env_id === params.envId ? selectedEnv.industry : undefined;
  const resolvedDept = useMemo(
    () => resolveDepartmentForEnv(params.envId, industry, role),
    [params.envId, industry, role]
  );

  const departmentAllowed = !!department && isDepartmentAllowed(role, deptKey);

  const capabilities = useMemo(() => {
    if (!departmentAllowed) return [];
    const raw = getCapabilitiesForDepartment(deptKey, { industry });
    return filterCapabilitiesByRole(role, raw);
  }, [departmentAllowed, deptKey, industry, role]);

  useEffect(() => {
    const syncRole = () => setRole(getStoredLabRole());
    window.addEventListener("storage", syncRole);
    return () => window.removeEventListener("storage", syncRole);
  }, []);

  useEffect(() => {
    if (departmentAllowed) {
      setStoredLastDept(params.envId, deptKey);
      return;
    }
    router.replace(deptRoute(params.envId, resolvedDept));
  }, [departmentAllowed, params.envId, deptKey, resolvedDept, router]);

  if (!departmentAllowed) {
    return (
      <Card>
        <CardContent>
          <CardTitle className="text-xl">Loading department</CardTitle>
          <CardDescription>Redirecting to the environment default department.</CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <CardTitle className="text-xl">{department.label}</CardTitle>
          <CardDescription>{department.description}</CardDescription>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {capabilities.map((cap) => (
          <Link
            key={cap.key}
            href={capabilityRoute(params.envId, deptKey, cap.key)}
            data-testid={`cap-link-${cap.key}`}
            className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-4 transition hover:bg-bm-surface/50"
          >
            <p className="text-sm font-semibold text-bm-text">{cap.label}</p>
            <p className="mt-1 text-xs text-bm-muted">{cap.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
