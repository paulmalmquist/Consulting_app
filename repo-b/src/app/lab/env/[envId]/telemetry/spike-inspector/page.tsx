import SpikeInspector from "@/components/telemetry/SpikeInspector";

export default async function TelemetrySpikeInspectorPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <SpikeInspector envId={envId} />;
}
