import WorkflowTemplates from "@/components/telemetry/data-engineering/WorkflowTemplates";

export default async function DataEngineeringWorkflowsPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <WorkflowTemplates envId={envId} />;
}
