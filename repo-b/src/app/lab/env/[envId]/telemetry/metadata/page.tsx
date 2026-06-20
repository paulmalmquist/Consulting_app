import TelemetryMetadataExplorer from "@/components/telemetry/metadata/TelemetryMetadataExplorer";

export default async function TelemetryMetadataPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <TelemetryMetadataExplorer envId={envId} />;
}
