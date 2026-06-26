import NcrTraceabilityConsole from "@/components/telemetry/relativity-mes/NcrTraceabilityConsole";

export default async function RelativityMesNcrPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <NcrTraceabilityConsole envId={envId} />;
}
