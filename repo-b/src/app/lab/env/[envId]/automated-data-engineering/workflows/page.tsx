"use client";

import { use } from "react";
import WorkflowCatalog from "@/components/automated-data-engineering/WorkflowCatalog";

export default function AdeWorkflowsPage({ params }: { params: Promise<{ envId: string }> }) {
  const { envId } = use(params);
  return <WorkflowCatalog envId={envId} />;
}
