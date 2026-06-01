import TelemetryOverview from "@/components/telemetry/TelemetryOverview";

export default async function TelemetryHomePage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <TelemetryOverview envId={envId} />;
}
