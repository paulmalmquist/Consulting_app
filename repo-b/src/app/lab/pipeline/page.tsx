"use client";

import EnvGate from "@/components/EnvGate";
import { useEnv } from "@/components/EnvProvider";
import PipelineBoard from "@/components/lab/PipelineBoard";

export default function PipelinePage() {
  const { selectedEnv } = useEnv();

  return (
    <EnvGate>
      {selectedEnv ? (
        <PipelineBoard
          envId={selectedEnv.env_id}
          heading="Pipeline"
          subheading="Drag deals between stages. Changes are applied optimistically."
          showContext
        />
      ) : null}
    </EnvGate>
  );
}
