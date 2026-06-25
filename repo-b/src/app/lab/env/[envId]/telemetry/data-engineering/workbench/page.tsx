import AgentWorkbench from "@/components/telemetry/data-engineering/AgentWorkbench";

export default async function DataEngineeringWorkbenchPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <AgentWorkbench envId={envId} />;
}
