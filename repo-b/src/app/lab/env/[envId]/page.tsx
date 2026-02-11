"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import { getDefaultDepartmentForIndustry } from "@/lib/lab/DepartmentRegistry";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";

export default function LabEnvironmentHomePage({
  params,
}: {
  params: { envId: string };
}) {
  const router = useRouter();
  const { environments, selectEnv } = useEnv();

  useEffect(() => {
    selectEnv(params.envId);
    const env = environments.find((item) => item.env_id === params.envId);
    const defaultDept = getDefaultDepartmentForIndustry(env?.industry);
    router.replace(`/lab/env/${params.envId}/${defaultDept}`);
  }, [params.envId, environments, router, selectEnv]);

  return (
    <Card>
      <CardContent>
        <CardTitle>Loading environment homepage</CardTitle>
        <CardDescription>Preparing department workspace.</CardDescription>
      </CardContent>
    </Card>
  );
}
