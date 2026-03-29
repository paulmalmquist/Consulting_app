"use client";

import { DomainPreviewState } from "@/components/domain/DomainPreviewState";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

export default function CommandCenterPage() {
  const { envId, businessId } = useDomainEnv();

  return <DomainPreviewState title="Engagement Output Center" description="Delivery artifacts, exports, and presentation-ready outputs will collect in this workspace." envId={envId} businessId={businessId} />;
}
