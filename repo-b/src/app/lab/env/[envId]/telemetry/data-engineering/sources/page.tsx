import SourcePlatformMap from "@/components/telemetry/data-engineering/SourcePlatformMap";

export default async function DataEngineeringSourcesPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <SourcePlatformMap envId={envId} />;
}
