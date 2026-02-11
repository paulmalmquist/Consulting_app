"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import {
  LAB_DEPARTMENT_BY_KEY,
  getDefaultDepartmentForIndustry,
  getEnabledDepartmentsForIndustry,
  isLabDepartmentKey,
} from "@/lib/lab/DepartmentRegistry";
import { getAddedDepartments } from "@/lib/envData";
import { deptRoute, getStoredLastDept } from "@/lib/lab/deptRouting";
import { filterDepartmentsByRole, getStoredLabRole } from "@/lib/lab/rbac";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";

export default function LabEnvironmentHomePage({
  params,
}: {
  params: { envId: string };
}) {
  const router = useRouter();
  const { environments, selectEnv, loading } = useEnv();

  useEffect(() => {
    selectEnv(params.envId);
  }, [params.envId, selectEnv]);

  useEffect(() => {
    if (loading) return;

    const env = environments.find((item) => item.env_id === params.envId);
    if (!env) {
      if (environments.length > 0) {
        router.replace("/lab/environments");
      }
      return;
    }

    const industry = env?.industry;
    const defaultDept = getDefaultDepartmentForIndustry(industry);
    const storedLastDept = getStoredLastDept(params.envId);

    const templateKeys = getEnabledDepartmentsForIndustry(industry).map((d) => d.key);
    const addedKeys = getAddedDepartments(params.envId).filter(
      (k): k is keyof typeof LAB_DEPARTMENT_BY_KEY => k in LAB_DEPARTMENT_BY_KEY
    );
    const merged = [...templateKeys];
    for (const key of addedKeys) {
      if (!merged.includes(key)) merged.push(key);
    }

    const role = getStoredLabRole();
    const allowed = filterDepartmentsByRole(
      role,
      merged.map((k) => LAB_DEPARTMENT_BY_KEY[k]).filter(Boolean)
    ).map((d) => d.key);

    let resolved = defaultDept;
    if (storedLastDept && isLabDepartmentKey(storedLastDept) && allowed.includes(storedLastDept)) {
      resolved = storedLastDept;
    } else if (!allowed.includes(defaultDept) && allowed.length > 0) {
      resolved = allowed[0];
    }

    router.replace(deptRoute(params.envId, resolved));
  }, [params.envId, environments, loading, router]);

  return (
    <Card>
      <CardContent>
        <CardTitle>Loading environment homepage</CardTitle>
        <CardDescription>Preparing department workspace.</CardDescription>
      </CardContent>
    </Card>
  );
}
