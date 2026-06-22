import MetricLineageExplorer from "@/components/telemetry/metadata/MetricLineageExplorer";

export default async function TelemetryMetricLineagePage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <MetricLineageExplorer envId={envId} />;
}
