"use client";

import { DomainPreviewState } from "@/components/domain/DomainPreviewState";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

export default function CommandCenterPage() {
  const { envId, businessId } = useDomainEnv();

  return <DomainPreviewState title="Metric Dictionary Engine" description="Canonical metric definitions, source conflicts, and downstream reporting alignment will converge here." envId={envId} businessId={businessId} />;
}
