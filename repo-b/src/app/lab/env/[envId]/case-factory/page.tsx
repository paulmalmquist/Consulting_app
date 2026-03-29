"use client";

import { DomainPreviewState } from "@/components/domain/DomainPreviewState";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

export default function CommandCenterPage() {
  const { envId, businessId } = useDomainEnv();

  return <DomainPreviewState title="Case Study Factory" description="Structured case narratives, reusable delivery patterns, and draft generation will consolidate here." envId={envId} businessId={businessId} />;
}
