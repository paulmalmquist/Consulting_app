"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
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

export default function LabDepartmentPage({
  params,
}: {
  params: { envId: string; deptKey: string };
}) {
  const { selectedEnv } = useEnv();
  const [role, setRole] = useState<LabRole>(() => getStoredLabRole());

  const deptKey = params.deptKey as LabDepartmentKey;
  const department = LAB_DEPARTMENT_BY_KEY[deptKey];

  const industry =
    selectedEnv?.env_id === params.envId ? selectedEnv.industry : undefined;

  const capabilities = useMemo(() => {
    if (!department) return [];
    const raw = getCapabilitiesForDepartment(deptKey, { industry });
    return filterCapabilitiesByRole(role, raw);
  }, [department, deptKey, industry, role]);

  useEffect(() => {
    const syncRole = () => setRole(getStoredLabRole());
    window.addEventListener("storage", syncRole);
    return () => window.removeEventListener("storage", syncRole);
  }, []);

  if (!department) return notFound();

  if (!isDepartmentAllowed(role, deptKey)) {
    return (
      <Card>
        <CardContent>
          <CardTitle className="text-xl">Access Restricted</CardTitle>
          <CardDescription>
            Your role does not have access to this department.
          </CardDescription>
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
            href={`/lab/env/${params.envId}/${deptKey}/capability/${cap.key}`}
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
