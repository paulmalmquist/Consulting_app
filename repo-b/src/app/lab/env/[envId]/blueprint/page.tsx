"use client";

import { DomainPreviewState } from "@/components/domain/DomainPreviewState";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { EnvironmentContractCard } from "@/components/lab/environments/EnvironmentContractCard";

export default function CommandCenterPage() {
  const { envId, businessId } = useDomainEnv();

  return (
    <div className="space-y-6 p-6">
      <EnvironmentContractCard envId={envId} />
      <DomainPreviewState
        title="Execution Blueprint Studio"
        description="Future-state architectures, phased replacement plans, and rollout governance will be orchestrated here."
        envId={envId}
        businessId={businessId}
      />
    </div>
  );
}
