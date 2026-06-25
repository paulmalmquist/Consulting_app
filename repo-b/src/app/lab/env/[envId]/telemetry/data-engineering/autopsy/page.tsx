import RunAutopsy from "@/components/telemetry/data-engineering/RunAutopsy";

export default async function DataEngineeringAutopsyPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <RunAutopsy envId={envId} />;
}
