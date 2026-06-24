"use client";

import { useParams } from "next/navigation";
import WorkflowCatalog from "@/components/automated-data-engineering/WorkflowCatalog";

export default function AdeWorkflowsPage() {
  const { envId } = useParams<{ envId: string }>();
  return <WorkflowCatalog envId={envId} />;
}
