import BuildOverviewConsole from "@/components/telemetry/relativity-mes/BuildOverviewConsole";

export default async function RelativityMesOverviewPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <BuildOverviewConsole envId={envId} />;
}
