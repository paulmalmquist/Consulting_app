import DataMapGrain from "@/components/telemetry/data-engineering/DataMapGrain";

export default async function DataEngineeringGrainPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <DataMapGrain envId={envId} />;
}
