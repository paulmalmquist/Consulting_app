"use client";

import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";

interface Props {
  businessId: string;
  environmentId: string;
  assetId: string;
}

export default function DocumentsSection({ businessId, environmentId, assetId }: Props) {
  return (
    <div data-testid="asset-documents-section">
      <RepeEntityDocuments
        businessId={businessId}
        envId={environmentId}
        entityType="asset"
        entityId={assetId}
      />
    </div>
  );
}
