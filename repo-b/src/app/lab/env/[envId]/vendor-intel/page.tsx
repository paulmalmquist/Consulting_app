"use client";

import { DomainPreviewState } from "@/components/domain/DomainPreviewState";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

export default function CommandCenterPage() {
  const { envId, businessId } = useDomainEnv();

  return <DomainPreviewState title="Vendor Intelligence Engine" description="Capability comparisons, replacement paths, and vendor lock-in analysis will be promoted into this module." envId={envId} businessId={businessId} />;
}
