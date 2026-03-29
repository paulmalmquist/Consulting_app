"use client";

import { DomainPreviewState } from "@/components/domain/DomainPreviewState";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

export default function CommandCenterPage() {
  const { envId, businessId } = useDomainEnv();

  return <DomainPreviewState title="Pilot Builder" description="Pilot milestones, success metrics, and delivery checkpoints will move into this focused module." envId={envId} businessId={businessId} />;
}
