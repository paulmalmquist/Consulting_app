"use client";

import { DomainPreviewState } from "@/components/domain/DomainPreviewState";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

export default function CommandCenterPage() {
  const { envId, businessId } = useDomainEnv();

  return <DomainPreviewState title="Workflow Intelligence Engine" description="Workflow bottlenecks, automation opportunities, and handoff diagnostics will have their own focused command surface here." envId={envId} businessId={businessId} />;
}
