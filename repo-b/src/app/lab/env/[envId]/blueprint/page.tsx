"use client";

import { DomainPreviewState } from "@/components/domain/DomainPreviewState";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

export default function CommandCenterPage() {
  const { envId, businessId } = useDomainEnv();

  return <DomainPreviewState title="Execution Blueprint Studio" description="Future-state architectures, phased replacement plans, and rollout governance will be orchestrated here." envId={envId} businessId={businessId} />;
}
