"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useEnv } from "@/components/EnvProvider";
import { getDefaultDepartmentForIndustry } from "@/lib/lab/DepartmentRegistry";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/buttonVariants";

export default function LabEnvironmentHomePage({
  params,
}: {
  params: { envId: string };
}) {
  const { environments, selectEnv } = useEnv();
  useEffect(() => {
    selectEnv(params.envId);
  }, [params.envId, selectEnv]);
  const env = environments.find((item) => item.env_id === params.envId);
  const industry = env?.industry_type || env?.industry;
  const defaultDept = getDefaultDepartmentForIndustry(industry);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr,1fr]">
      <Card>
        <CardContent>
          <CardTitle className="text-xl">Environment Home</CardTitle>
          <CardDescription>
            Start in pipeline or jump to the default department workspace.
          </CardDescription>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/lab/env/${params.envId}/pipeline`}
              className={buttonVariants()}
            >
              Open Pipeline
            </Link>
            <Link
              href={`/lab/env/${params.envId}/${defaultDept}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Open {defaultDept} Workspace
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CardTitle>Environment Context</CardTitle>
          <CardDescription>
            {env
              ? `${env.client_name} · ${industry}`
              : "Loading current environment details."}
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
