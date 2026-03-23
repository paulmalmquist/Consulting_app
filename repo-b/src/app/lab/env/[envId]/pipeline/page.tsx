"use client";

import { useEffect } from "react";
import PipelineBoard from "@/components/lab/PipelineBoard";
import { useEnv } from "@/components/EnvProvider";

export default function EnvironmentPipelinePage({
  params,
}: {
  params: { envId: string };
}) {
  const { selectEnv } = useEnv();

  useEffect(() => {
    selectEnv(params.envId);
  }, [params.envId, selectEnv]);

  return (
    <PipelineBoard
      envId={params.envId}
      heading="Environment Pipeline"
      subheading="Internal pipeline for this client environment."
      showContext={false}
    />
  );
}
