"use client";

import { DomainPreviewState } from "@/components/domain/DomainPreviewState";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

export default function CommandCenterPage() {
  const { envId, businessId } = useDomainEnv();

  return <DomainPreviewState title="Economic Impact Estimator" description="Scenario-based impact modeling will live here once the dedicated estimator surface is ready." envId={envId} businessId={businessId} />;
}
