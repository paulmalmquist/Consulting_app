"use client";

import { DomainPreviewState } from "@/components/domain/DomainPreviewState";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

export default function CommandCenterPage() {
  const { envId, businessId } = useDomainEnv();

  return <DomainPreviewState title="Data Chaos Detector" description="Anomaly detection, duplicates, drift, and data reliability triage will surface here when this focused module ships." envId={envId} businessId={businessId} />;
}
