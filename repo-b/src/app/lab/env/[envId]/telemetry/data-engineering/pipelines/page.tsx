import PipelinesQuality from "@/components/telemetry/data-engineering/PipelinesQuality";

export default async function DataEngineeringPipelinesPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <PipelinesQuality envId={envId} />;
}
